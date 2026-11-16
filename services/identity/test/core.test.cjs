const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  Identity,
  IdentitySessions,
  MembershipOverview,
  requireControlPermission,
} = require("../dist/compatibility/identity-core/identity");
const {
  MemoryIdentity,
} = require("../dist/compatibility/identity-core/memory");
const {
  SYSTEM_CONTROL_PERMISSIONS,
} = require("../dist/compatibility/identity-core/domain");
const id = "11111111-1111-4111-8111-111111111111";
function fixture() {
  const store = new MemoryIdentity();
  const user = {
    id,
    name: "Synthetic",
    email: "synthetic@example.invalid",
    passwordHash: "synthetic-hash",
    active: true,
    authVersion: 0,
  };
  store.accounts.set(id, user);
  store.dni.set("12345678", id);
  const claims = { sub: id, ver: 0, exp: 200 };
  let comparisons = 0;
  const core = new Identity({
    accounts: store,
    grants: store,
    revocations: store,
    clock: { nowSeconds: () => 100 },
    dummyPasswordHash: async () => "dummy-hash",
    passwords: {
      compare: async (password, hash) => {
        comparisons++;
        return password === "fixture" && hash === "synthetic-hash";
      },
    },
    tokens: {
      sign: async (c) => JSON.stringify(c),
      verify: async () => claims,
    },
  });
  return { store, user, claims, core, comparisons: () => comparisons };
}
const rejects = (promise, code) =>
  assert.rejects(promise, (e) => e.code === code);

test("login normalizes email, accepts DNI, preserves response and omits password", async () => {
  const { core } = fixture();
  const result = await core.login({
    email: "  SYNTHETIC@EXAMPLE.INVALID ",
    password: "fixture",
  });
  assert.deepEqual(result, {
    accessToken: JSON.stringify({ sub: id, ver: 0 }),
    tokenType: "Bearer",
    expiresIn: 3600,
    user: { id, name: "Synthetic", email: "synthetic@example.invalid" },
  });
  assert.deepEqual(
    await core.login({ identifier: "12345678", password: "fixture" }),
    result,
  );
});
test("ambiguous input, wrong password, missing and inactive accounts fail", async () => {
  const f = fixture();
  await rejects(
    f.core.login({ email: "x", identifier: "x", password: "fixture" }),
    "invalid-input",
  );
  await rejects(
    f.core.login({ email: f.user.email, password: "wrong" }),
    "unauthorized",
  );
  await rejects(
    f.core.login({ email: "missing", password: "fixture" }),
    "unauthorized",
  );
  f.user.active = false;
  await rejects(
    f.core.login({ email: f.user.email, password: "fixture" }),
    "unauthorized",
  );
  assert.equal(f.comparisons(), 3); // Missing accounts still compare against the dummy hash.
});
test("actor metadata is separate; missing legacy ver means zero", async () => {
  const f = fixture();
  delete f.claims.ver;
  assert.deepEqual(await f.core.authenticate("fixture"), {
    contractVersion: 1,
    actor: { kind: "member", userId: id },
    authVersion: 0,
    expiresAt: 200,
  });
});
test("expired, malformed and revoked JWT claims cannot authenticate", async () => {
  for (const patch of [
    { exp: 100 },
    { exp: NaN },
    { sub: "admin" },
    { ver: 1 },
  ]) {
    const f = fixture();
    Object.assign(f.claims, patch);
    await rejects(f.core.authenticate("fixture"), "unauthorized");
  }
});
test("revokeAll invalidates existing JWT and subsequent login uses new version", async () => {
  const f = fixture();
  await f.core.revokeAll(id);
  await rejects(f.core.authenticate("fixture"), "unauthorized");
  assert.equal(
    JSON.parse(
      (await f.core.login({ email: f.user.email, password: "fixture" }))
        .accessToken,
    ).ver,
    1,
  );
});
test("inactive accounts denied with legacy member/control classifications", async () => {
  const f = fixture();
  f.user.active = false;
  await rejects(f.core.authenticate("fixture"), "forbidden");
  await rejects(f.core.authenticate("fixture", "control"), "unauthorized");
});
test("Control requires approval, verification and live access grant regardless of role", async () => {
  const f = fixture();
  const grant = {
    systemAdmin: false,
    approved: true,
    emailVerified: true,
    role: "ADMIN",
    permissions: ["ADMIN_CONTROL_ACCESS", "ADMIN_INVENTORY_VIEW"],
    stationIds: ["A"],
  };
  f.store.grants.set(id, grant);
  for (const property of ["approved", "emailVerified"]) {
    grant[property] = false;
    await rejects(f.core.authenticate("fixture", "control"), "forbidden");
    grant[property] = true;
  }
  const actor = (await f.core.authenticate("fixture", "control")).actor;
  requireControlPermission(actor, "ADMIN_INVENTORY_VIEW", "A");
  assert.throws(() =>
    requireControlPermission(actor, "ADMIN_INVENTORY_VIEW", "B"),
  );
  assert.throws(() =>
    requireControlPermission(actor, "ADMIN_USER_MANAGE", "A"),
  );
  grant.permissions = ["ADMIN_INVENTORY_VIEW"];
  await rejects(f.core.authenticate("fixture", "control"), "forbidden");
});
test("no stations authenticates as before but scoped authorization fails", async () => {
  const f = fixture();
  f.store.grants.set(id, {
    systemAdmin: false,
    approved: true,
    emailVerified: true,
    role: "ENCARGADO",
    permissions: ["ADMIN_CONTROL_ACCESS"],
    stationIds: [],
  });
  const actor = (await f.core.authenticate("fixture", "control")).actor;
  assert.throws(() => requireControlPermission(actor, "ADMIN_CONTROL_ACCESS"));
});
test("SYSTEM_ADMIN preserves exact global permission contract", async () => {
  const f = fixture();
  f.store.grants.set(id, {
    systemAdmin: true,
    approved: false,
    emailVerified: false,
    role: "",
    permissions: [],
    stationIds: ["A"],
  });
  const actor = (await f.core.authenticate("fixture", "control")).actor;
  assert.equal(actor.role, "SUPER_ADMIN");
  assert.equal(actor.global, true);
  assert.deepEqual(actor.permissions, [...SYSTEM_CONTROL_PERMISSIONS]);
  assert.deepEqual(actor.stationIds, []);
  requireControlPermission(actor, "ADMIN_INVENTORY_VIEW", "B");
  assert.throws(() =>
    requireControlPermission(
      { kind: "kiosk", stationId: "A" },
      "ADMIN_CONTROL_ACCESS",
    ),
  );
});
test("session resolves station, expiry boundary and revocation fail closed", async () => {
  const f = fixture();
  const sessions = new IdentitySessions(f.store, { nowSeconds: () => 100 });
  f.store.sessions.set("opaque", { stationId: "A", expiresAt: 101 });
  assert.deepEqual(await sessions.resolveVerifiedKioskSession("opaque"), {
    kind: "kiosk",
    stationId: "A",
  });
  await sessions.revoke("opaque");
  await rejects(sessions.resolveVerifiedKioskSession("opaque"), "unauthorized");
  f.store.sessions.set("opaque", { stationId: "A", expiresAt: 100 });
  await rejects(sessions.resolveVerifiedKioskSession("opaque"), "unauthorized");
});
test("unavailable accounts, grants and sessions never yield an actor", async () => {
  const f = fixture();
  f.store.byId = async () => {
    throw Error("synthetic unavailable");
  };
  await assert.rejects(f.core.authenticate("fixture"), /unavailable/);
  const g = fixture();
  g.store.forUser = async () => {
    throw Error("synthetic unavailable");
  };
  await assert.rejects(
    g.core.authenticate("fixture", "control"),
    /unavailable/,
  );
  const sessions = new IdentitySessions(
    {
      find: async () => {
        throw Error("synthetic unavailable");
      },
    },
    { nowSeconds: () => 100 },
  );
  await assert.rejects(
    sessions.resolveVerifiedKioskSession("opaque"),
    /unavailable/,
  );
});
test("membership profile stays separate from read-only Commerce values", async () => {
  const f = fixture();
  let calls = 0;
  const finance = {
    balance: "1.00",
    reserved: "2.00",
    available: "1.00",
    total: "3.00",
    pendingBalance: "0.00",
    points: 5,
  };
  const overview = new MembershipOverview(f.store.membershipProfiles, {
    summary: async (membershipId) => {
      assert.equal(membershipId, "membership");
      calls++;
      return finance;
    },
  });
  await rejects(overview.forUser(id), "not-found");
  assert.equal(calls, 0);
  const profile = {
    id: "membership",
    userId: id,
    number: "SYNTHETIC",
    status: "ACTIVE",
    name: f.user.name,
    email: f.user.email,
  };
  f.store.memberships.set(id, profile);
  assert.deepEqual(await overview.forUser(id), { profile, finance });
});

const { test } = require("node:test"), assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { PrivateCompatibleMembershipReads } = require("./membership-a4-compatible-read.ts");
const { PrivateMembershipReads, SyntheticIdentityBindings, MembershipReadError } = require("./membership-a4-read.ts");
const { LegacyA4ReadProvider } = require("./membership-a4-legacy-read-provider.cjs");
const core = require("../src/membership-codes/core.ts");
const rejects = (promise, code) => assert.rejects(promise, e => e.code === code && e.message === code);
function fixture() {
  const a = { userId: randomUUID(), accountId: randomUUID(), membershipId: randomUUID() };
  const b = { userId: randomUUID(), accountId: randomUUID(), membershipId: randomUUID() };
  const none = { userId: randomUUID(), accountId: randomUUID(), membershipId: null };
  const rows = [a, b].map((x, i) => ({ membershipId: x.membershipId, accountId: x.accountId,
    canonicalNumber: i ? "PRIME-AA001" : "PRIME-A001", legacyNumbers: [i ? "PRIM001AA" : "PRIM001A"] }));
  const identity = new PrivateMembershipReads({ snapshot: async work => work({
    byAccountId: async id => rows.find(x => x.accountId === id) ?? null,
    byMembershipId: async id => rows.find(x => x.membershipId === id) ?? null,
    resolveCode: async code => { const x = rows.find(x => x.canonicalNumber === code || x.legacyNumbers.includes(code));
      return x ? { ...x, matchedCode: code, matchedBy: x.canonicalNumber === code ? "CANONICAL" : "ALIAS" } : null; },
  }) }, new SyntheticIdentityBindings([a, b, none]), core, { synthetic: true, sourceDatasetId: "a4-3b-unit" });
  const vehicle = { id: randomUUID(), membershipId: a.membershipId, plate: "ABC123", label: "Synthetic", createdAt: "2026-11-16T00:00:00.000Z" };
  const body = { id: a.membershipId, userId: a.userId, number: rows[0].canonicalNumber, status: "SUSPENDED",
    vehicles: [vehicle], balance: "91.25", pendingBalance: "12.50", reserved: "8.00", available: "91.25", total: "99.25", points: 17,
    user: { name: "Synthetic", email: "synthetic@example.invalid" }, passport: null, welcomeAvailable: true };
  const calls = [];
  const provider = {
    async anchor(userId) { calls.push(["anchor", userId]); return { id: body.id, userId: body.userId, number: body.number }; },
    async me(userId) { calls.push(["me", userId]); return body; },
    async vehicles(userId, query) { calls.push(["vehicles", userId, query]); return body.vehicles; },
  };
  return { a, b, none, rows, body, calls, provider, actor: { kind: "member", userId: a.userId },
    service: new PrivateCompatibleMembershipReads(identity, provider, { synthetic: true }) };
}
for (const kind of ["user", "membership", "canonical", "alias"]) test(`3B full legacy body preserved through ${kind}`, async () => {
  const f = fixture(), before = structuredClone(f.body);
  const selector = kind === "user" ? { kind } : kind === "membership" ? { kind, membershipId: f.a.membershipId } :
    { kind: "code", code: kind === "alias" ? "PRIM001A" : "PRIME-A001", normalization: "exact" };
  const view = await f.service.me(f.actor, selector);
  assert.deepEqual(view.body, before); assert.equal(view.identity.membershipId, f.a.membershipId);
  assert.deepEqual(f.body, before); assert.notEqual(view.body, f.body); assert.ok(Object.isFrozen(view.body.vehicles[0]));
});
test("3B vehicles preserve UUIDs, fields, caller pagination and provider order", async () => {
  const f = fixture(), page = { page: 2, limit: 1 };
  assert.deepEqual((await f.service.vehicles(f.actor, page)).body, f.body.vehicles);
  assert.deepEqual(f.calls.at(-1), ["vehicles", f.a.userId, page]);
});
for (const kind of ["user", "membership", "alias"]) test(`3B foreign ${kind} never calls legacy provider`, async () => {
  const f = fixture(); const selector = kind === "user" ? { kind, userId: f.b.userId } : kind === "membership" ?
    { kind, membershipId: f.b.membershipId } : { kind: "code", code: "PRIM001AA", normalization: "exact" };
  await rejects(f.service.me(f.actor, selector), kind === "user" ? "DENIED" : "NOT_FOUND"); assert.equal(f.calls.length, 0);
});
test("3B absent memberships and unauthorized actors never reach the provider", async () => {
  const f = fixture();
  await rejects(f.service.me({ kind: "member", userId: f.none.userId }), "NOT_FOUND");
  await rejects(f.service.me({ kind: "control", userId: f.a.userId }), "DENIED");
  await rejects(f.service.me(f.actor, { kind: "membership", membershipId: randomUUID() }), "NOT_FOUND");
  await rejects(f.service.me(f.actor, { kind: "code", code: "UNKNOWN", normalization: "exact" }), "NOT_FOUND");
  assert.equal(f.calls.length, 0);
});
test("3B missing legacy provisioning is explicit; no fallback or financial call", async () => {
  const f = fixture(); f.provider.anchor = async () => null;
  await rejects(f.service.me(f.actor), "NOT_PROVISIONED"); assert.equal(f.calls.length, 0);
});
test("3B wrong anchor blocks composition before financial provider", async () => {
  const f = fixture(); f.provider.anchor = async () => ({ id: f.b.membershipId, userId: f.b.userId, number: f.body.number });
  await rejects(f.service.me(f.actor), "BINDING_MISMATCH"); assert.equal(f.calls.length, 0);
});
test("3B detects changed canonical number instead of silently rewriting it", async () => {
  const f = fixture(); f.provider.me = async () => ({ ...f.body, number: "PRIME-002" });
  await rejects(f.service.me(f.actor), "BINDING_MISMATCH");
});
test("3B rejects vehicles belonging to another membership", async () => {
  const f = fixture(); f.body.vehicles[0].membershipId = f.b.membershipId;
  await rejects(f.service.me(f.actor), "BINDING_MISMATCH");
  await rejects(f.service.vehicles(f.actor, { page: 1, limit: 20 }), "BINDING_MISMATCH");
});
for (const key of ["balance", "pendingBalance", "points", "status"]) test(`3B missing ${key} never becomes a default`, async () => {
  const f = fixture(); delete f.body[key]; await rejects(f.service.me(f.actor), "INVALID_UPSTREAM_RESPONSE");
});
for (const method of ["anchor", "me", "vehicles"]) test(`3B ${method} unavailable is sanitized and recovers without retries`, async () => {
  const f = fixture(), saved = f.provider[method]; let attempts = 0;
  f.provider[method] = async () => { attempts++; throw Error("synthetic-provider-failure"); };
  const operation = () => method === "vehicles" ? f.service.vehicles(f.actor, { page: 1, limit: 20 }) : f.service.me(f.actor);
  await rejects(operation(), "UNAVAILABLE"); assert.equal(attempts, 1);
  f.provider[method] = saved; await operation();
});
test("3B explicit provider denial stays distinct from absence and availability", async () => {
  const f = fixture(); f.provider.me = async () => { throw new MembershipReadError("DENIED"); };
  await rejects(f.service.me(f.actor), "DENIED");
});
test("3B invalid pages, oversized results and duplicate vehicle IDs are rejected", async () => {
  const f = fixture();
  for (const page of [{ page: 0, limit: 20 }, { page: 1, limit: 101 }, { page: "1", limit: 20 }])
    await rejects(f.service.vehicles(f.actor, page), "INVALID_INPUT");
  assert.equal(f.calls.length, 0);
  f.body.vehicles.push({ ...f.body.vehicles[0], id: randomUUID() });
  await rejects(f.service.vehicles(f.actor, { page: 1, limit: 1 }), "INVALID_UPSTREAM_RESPONSE");
  f.body.vehicles.pop();
  f.body.vehicles.push({ ...f.body.vehicles[0] });
  await rejects(f.service.vehicles(f.actor, { page: 1, limit: 20 }), "INVALID_UPSTREAM_RESPONSE");
});
test("3B injected legacy adapter serializes Date and sanitizes service errors", async () => {
  const f = fixture();
  const adapter = new LegacyA4ReadProvider({ synthetic: true, readError: MembershipReadError,
    membershipsRepository: { findForUser: async () => f.body },
    membershipsService: { me: async () => ({ ...f.body, date: new Date("2026-11-16T00:00:00.000Z") }) },
    vehiclesService: { list: async () => { throw { getStatus: () => 404 }; } } });
  assert.equal((await adapter.me(f.a.userId)).date, "2026-11-16T00:00:00.000Z");
  await rejects(adapter.vehicles(f.a.userId, { page: 1, limit: 20 }), "NOT_FOUND");
  assert.equal(typeof adapter.provision, "undefined"); assert.equal(typeof adapter.update, "undefined");
});

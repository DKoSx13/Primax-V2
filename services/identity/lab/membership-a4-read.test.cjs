const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const core = require("../src/membership-codes/core.ts");
const { PrivateMembershipReads, SyntheticIdentityBindings, legacyMembershipCodes } = require("./membership-a4-read.ts");
const a = { userId: randomUUID(), accountId: randomUUID(), membershipId: randomUUID() };
const b = { userId: randomUUID(), accountId: randomUUID(), membershipId: randomUUID() };
const empty = { userId: randomUUID(), accountId: randomUUID(), membershipId: null };
const actor = (binding) => ({ kind: "member", userId: binding.userId });
const aRow = { membershipId: a.membershipId, accountId: a.accountId, canonicalNumber: "PRIME-A001", legacyNumbers: ["PRIM001A"] };
const bRow = { membershipId: b.membershipId, accountId: b.accountId, canonicalNumber: "PRIME-AA001", legacyNumbers: ["PRIM001AA"] };
const rejects = (promise, code) => assert.rejects(promise, (e) => e.code === code && e.message === code);
function fixture() {
  let calls = 0;
  const rows = [structuredClone(aRow), structuredClone(bRow)];
  const session = {
    async byMembershipId(id) { return rows.find((r) => r.membershipId === id) ?? null; },
    async byAccountId(id) { return rows.find((r) => r.accountId === id) ?? null; },
    async resolveCode(code) {
      const row = rows.find((r) => r.canonicalNumber === code || r.legacyNumbers.includes(code));
      return row ? { ...row, matchedBy: row.canonicalNumber === code ? "CANONICAL" : "ALIAS", matchedCode: code } : null;
    },
  };
  const repository = { async snapshot(work) { calls++; return work(session); } };
  const bindings = new SyntheticIdentityBindings([a, b, empty]);
  const service = new PrivateMembershipReads(repository, bindings, core, {
    synthetic: true, sourceDatasetId: "a4-unit-fixture", clock: () => "2026-11-16T00:00:00.000Z",
  });
  return { service, repository, rows, session, calls: () => calls };
}
test("3A preserves distinct user/account/member UUID bindings and legacy identity field types", async () => {
  const { service } = fixture();
  const view = await service.forUser(actor(a));
  assert.equal(view.membershipId, a.membershipId);
  assert.equal(view.accountId, a.accountId);
  assert.notEqual(view.accountId, a.userId);
  assert.equal(view.contractVersion, 1);
  assert.equal(view.provenance.source, "A4");
  assert.deepEqual(legacyMembershipCodes(view), { id: a.membershipId, number: "PRIME-A001", legacyNumbers: ["PRIM001A"] });
  assert.deepEqual(await service.byMembershipId(actor(a), a.membershipId), view);
});
test("3A resolves canonical and historical aliases using explicit normalization", async () => {
  const { service } = fixture();
  const canonical = await service.resolveCode(actor(a), "PRIME-A001", "exact");
  const alias = await service.resolveCode(actor(a), " prim001a ", "trim-uppercase");
  assert.equal(canonical.matchedBy, "CANONICAL"); assert.equal(alias.matchedBy, "ALIAS");
  assert.equal(alias.matchedCode, "PRIM001A");
  assert.equal(alias.canonicalNumber, canonical.canonicalNumber);
  assert.equal(alias.membershipId, canonical.membershipId);
});
test("3A known user without membership is NOT_FOUND without querying persistence", async () => {
  const f = fixture();
  await rejects(f.service.forUser(actor(empty)), "NOT_FOUND");
  await rejects(f.service.resolveCode(actor(empty), "PRIME-A001", "exact"), "NOT_FOUND");
  assert.equal(f.calls(), 0);
});
test("3A absent binding and own missing persisted member are NOT_PROVISIONED", async () => {
  const f = fixture();
  await rejects(f.service.forUser({ kind: "member", userId: randomUUID() }), "NOT_PROVISIONED");
  f.rows.length = 0;
  await rejects(f.service.forUser(actor(a)), "NOT_PROVISIONED");
  await rejects(f.service.byMembershipId(actor(a), a.membershipId), "NOT_PROVISIONED");
});
test("3A rejects absent/non-member authority and cross-user selectors before SQL", async () => {
  const f = fixture();
  for (const principal of [null, { kind: "control", userId: a.userId }, { kind: "member", userId: "invalid" }])
    await rejects(f.service.forUser(principal), "DENIED");
  await rejects(f.service.forUser(actor(a), b.userId), "DENIED");
  assert.equal(f.calls(), 0);
});
test("3A foreign and unknown UUID/code/alias share NOT_FOUND with no owner details", async () => {
  const f = fixture();
  for (const id of [b.membershipId, randomUUID()]) await rejects(f.service.byMembershipId(actor(a), id), "NOT_FOUND");
  assert.equal(f.calls(), 0);
  for (const code of [bRow.canonicalNumber, bRow.legacyNumbers[0], "UNKNOWN"])
    await rejects(f.service.resolveCode(actor(a), code, "exact"), "NOT_FOUND");
  assert.equal((await f.service.resolveCode(actor(b), "PRIM001AA", "exact")).membershipId, b.membershipId);
});
test("3A malformed selectors and implicit normalization do not query the repository", async () => {
  const f = fixture();
  await rejects(f.service.byMembershipId(actor(a), "bad"), "INVALID_INPUT");
  await rejects(f.service.forUser(actor(a), "bad"), "INVALID_INPUT");
  await rejects(f.service.resolveCode(actor(a), "bad code", "exact"), "INVALID_INPUT");
  await rejects(f.service.resolveCode(actor(a), "PRIM001A"), "INVALID_INPUT");
  assert.equal(f.calls(), 0);
});
test("3A binding manifests are immutable and reject ambiguous user/account/member relations", () => {
  const source = [{ ...a }]; const bindings = new SyntheticIdentityBindings(source);
  source[0].accountId = b.accountId; source.length = 0;
  assert.equal(bindings.forUser(a.userId).accountId, a.accountId);
  for (const entries of [[a, a], [a, { ...b, accountId: a.accountId }], [a, { ...b, membershipId: a.membershipId }]])
    assert.throws(() => new SyntheticIdentityBindings(entries), (e) => e.code === "BINDING_MISMATCH");
});
test("3A provider errors are UNAVAILABLE without raw SQL or credential disclosure; next read recovers", async () => {
  const f = fixture(); const original = f.repository.snapshot;
  f.repository.snapshot = async () => { throw Error("SELECT secret; postgresql://user:private@host/db"); };
  await rejects(f.service.forUser(actor(a)), "UNAVAILABLE");
  f.repository.snapshot = original;
  assert.equal((await f.service.forUser(actor(a))).membershipId, a.membershipId);
});
test("3A stale account/member mapping is an explicit BINDING_MISMATCH", async () => {
  const f = fixture(); f.rows[0].membershipId = randomUUID();
  await rejects(f.service.forUser(actor(a)), "BINDING_MISMATCH");
});
test("3A invalid provider responses never become successful empty/default identities", async () => {
  for (const patch of [{ canonicalNumber: "PRIME-A000" }, { legacyNumbers: ["bad code"] },
    { legacyNumbers: ["PRIM001A", "PRIM001A"] }, { legacyNumbers: ["PRIME-A001"] }]) {
    const f = fixture(); Object.assign(f.rows[0], patch);
    await rejects(f.service.forUser(actor(a)), "INVALID_UPSTREAM_RESPONSE");
  }
});
test("3A read views and aliases are immutable, contain no finance/PII, and expose no write methods", async () => {
  const f = fixture(); Object.assign(f.rows[0], { balance: "99.00", passwordHash: "private", status: "ACTIVE" });
  const before = structuredClone(f.rows);
  const view = await f.service.forUser(actor(a));
  assert.deepEqual(Object.keys(view).sort(), ["accountId", "canonicalNumber", "contractVersion", "legacyNumbers", "membershipId", "provenance"]);
  assert.equal(Object.isFrozen(view), true); assert.equal(Object.isFrozen(view.legacyNumbers), true);
  assert.deepEqual(await f.service.aliasesForMember(actor(a), a.membershipId), ["PRIM001A"]);
  assert.deepEqual(f.rows, before);
  assert.equal(f.service.provision, undefined); assert.equal(f.service.lookup, undefined);
});

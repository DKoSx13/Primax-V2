const { test } = require("node:test"), assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { PrivateVehicleLinkV1, VehicleLinkError } = require("./vehicle-link-contract.ts");
const { LegacyVehicleLinkAdapter } = require("./vehicle-link-legacy-adapter.cjs");
const userId = randomUUID(), accountId = randomUUID(), membershipId = randomUUID(), vehicleId = randomUUID();
const rejects = (p, code, outcome) => assert.rejects(p, e => e.code === code && e.message === code && (!outcome || e.outcome === outcome));
function fixture() {
  let calls = 0;
  const principal = { kind: "member", userId, permissions: ["vehicle:link:own", "vehicle:read:own"] };
  const authorization = { async authenticate(value) { if (value !== "synthetic-credential") throw new VehicleLinkError("DENIED"); return principal; } };
  const identity = { async forUser(actor) { assert.equal(actor.userId, userId); return { membershipId, accountId }; } };
  const commands = { async linkForOwner(input) { calls++; assert.equal(input.userId, userId);
    return { vehicleId, membershipId, plate: input.plate, label: "Persisted label" }; } };
  const queries = { async forOwner() { return { vehicleId, membershipId, plate: "ABC-123", label: "Persisted label" }; } };
  // Production integration injects the actual legacy normalizers, not these test doubles.
  const normalization = { plate: v => typeof v === "string" ? v.trim().toUpperCase() : v, label: v => typeof v === "string" ? v.trim() : v };
  const service = new PrivateVehicleLinkV1(authorization, identity, commands, queries, normalization, { synthetic: true });
  const command = { contractVersion: 1, operationId: randomUUID(), expectedMembershipId: membershipId, plate: " abc-123 ", label: "Requested label" };
  return { service, authorization, identity, principal, commands, queries, command, calls: () => calls };
}
test("4A delegates exactly once, preserves UUID and persisted label, and declares correlation-only recovery", async () => {
  const f = fixture(), before = structuredClone(f.command), result = await f.service.link("synthetic-credential", f.command);
  assert.equal(f.calls(), 1); assert.equal(result.vehicleId, vehicleId); assert.equal(result.label, "Persisted label");
  assert.equal(result.operationId, f.command.operationId); assert.equal(result.recovery, "STATE_CONVERGENCE_ONLY");
  assert.equal(result.replayed, undefined); assert.equal(result.balance, undefined); assert.ok(Object.isFrozen(result));
  assert.deepEqual(f.command, before);
});
for (const principal of [{ kind: "kiosk", userId, permissions: ["vehicle:link:own"] },
  { kind: "member", userId, permissions: [] }, { kind: "member", userId: "invalid", permissions: ["vehicle:link:own"] }])
  test("4A rejects unsupported or insufficient principal before delegation " + JSON.stringify(principal), async () => {
    const f = fixture(); f.authorization.authenticate = async () => principal;
    await rejects(f.service.link("synthetic-credential", f.command), "DENIED", "NOT_SENT"); assert.equal(f.calls(), 0);
  });
test("4A a forged userId body/credential does not authorize a command", async () => {
  const f = fixture();
  await rejects(f.service.link({ userId }, f.command), "DENIED");
  await rejects(f.service.link("synthetic-credential", { ...f.command, userId: randomUUID() }), "INVALID_INPUT");
  assert.equal(f.calls(), 0);
});
test("4A label bounds count Unicode code points like the existing DTO", async () => {
  const f = fixture(); await f.service.link("synthetic-credential", { ...f.command, label: "🚗".repeat(80) });
  await rejects(f.service.link("synthetic-credential", { ...f.command, label: "🚗".repeat(81) }), "INVALID_INPUT");
  assert.equal(f.calls(), 1);
});
test("4A requested membership must match authenticated Identity binding", async () => {
  const f = fixture(); await rejects(f.service.link("synthetic-credential", { ...f.command, expectedMembershipId: randomUUID() }), "DENIED");
  assert.equal(f.calls(), 0);
});
for (const change of [{ contractVersion: 2 }, { operationId: "invalid" }, { plate: "INVALID" }, { label: "" }])
  test("4A validates command before dispatch " + JSON.stringify(change), async () => {
    const f = fixture(); await rejects(f.service.link("synthetic-credential", { ...f.command, ...change }), "INVALID_INPUT");
    assert.equal(f.calls(), 0);
  });
test("4A unavailable credential authority never dispatches", async () => {
  const f = fixture(); f.authorization.authenticate = async () => { throw Error("synthetic failure"); };
  await rejects(f.service.link("synthetic-credential", f.command), "UNAVAILABLE", "NOT_SENT"); assert.equal(f.calls(), 0);
});
for (const [upstream, expected] of [["NOT_PROVISIONED", "NOT_FOUND"], ["BINDING_MISMATCH", "BINDING_MISMATCH"], ["UNAVAILABLE", "UNAVAILABLE"]])
  test("4A maps Identity error without raw provider data " + upstream, async () => {
    const f = fixture(); f.identity.forUser = async () => { throw { code: upstream, message: "synthetic internal detail" }; };
    await rejects(f.service.link("synthetic-credential", f.command), expected); assert.equal(f.calls(), 0);
  });
test("4A lost reply is unknown, never retried, and does not become a durable replay claim", async () => {
  const f = fixture(); let sends = 0; f.commands.linkForOwner = async () => { sends++; throw Error("response lost"); };
  await rejects(f.service.link("synthetic-credential", f.command), "OUTCOME_UNKNOWN", "UNKNOWN"); assert.equal(sends, 1);
});
test("4A repeated invocation is explicit new delegation, no hidden operationId ledger", async () => {
  const f = fixture(); await f.service.link("synthetic-credential", f.command); await f.service.link("synthetic-credential", f.command);
  assert.equal(f.calls(), 2);
});
test("4A malformed success cannot be reported as confirmed or safe to replay", async () => {
  const f = fixture(); f.commands.linkForOwner = async () => ({ vehicleId, membershipId: randomUUID(), plate: "ABC-123", label: "Synthetic" });
  await rejects(f.service.link("synthetic-credential", f.command), "OUTCOME_UNKNOWN", "UNKNOWN");
});
test("4A owner reads require read permission and cannot leak a mismatched binding", async () => {
  const f = fixture(); assert.equal((await f.service.forOwner("synthetic-credential", "ABC-123")).vehicleId, vehicleId);
  f.queries.forOwner = async () => ({ vehicleId, membershipId: randomUUID(), plate: "ABC-123", label: "Synthetic" });
  await rejects(f.service.forOwner("synthetic-credential", "ABC-123"), "BINDING_MISMATCH");
  f.principal.permissions = ["vehicle:link:own"];
  await rejects(f.service.forOwner("synthetic-credential", "ABC-123"), "DENIED");
});
for (const [status, expected] of [[403, "DENIED"], [404, "NOT_FOUND"], [409, "OWNERSHIP_CONFLICT"], [503, "UNAVAILABLE"]])
  test("4A legacy adapter sanitizes known rejected status " + status, async () => {
    const adapter = new LegacyVehicleLinkAdapter({ synthetic: true, readError: VehicleLinkError,
      database: { atomic: async () => { throw { getStatus: () => status }; } },
      repository: db => ({ link: () => db.atomic(async () => null) }), ownerService: { findByPlate: async () => null } });
    await rejects(adapter.linkForOwner({ userId, expectedMembershipId: membershipId, plate: "ABC-123", label: "Synthetic" }), expected, "REJECTED");
  });
test("4A legacy membership binding is checked inside the same delegated transaction before repository work", async () => {
  let writes = 0, transactions = 0;
  const adapter = new LegacyVehicleLinkAdapter({ synthetic: true, readError: VehicleLinkError,
    database: { async atomic(work) { transactions++; return work({ membership: { findUnique: async () => ({ id: randomUUID() }) } }); } },
    repository: db => ({ link: () => db.atomic(async () => { writes++; }) }), ownerService: { findByPlate: async () => null } });
  await rejects(adapter.linkForOwner({ userId, expectedMembershipId: membershipId, plate: "ABC-123", label: "Synthetic" }), "BINDING_MISMATCH", "REJECTED");
  assert.equal(transactions, 1); assert.equal(writes, 0);
});

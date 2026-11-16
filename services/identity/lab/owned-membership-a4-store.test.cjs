const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const core = require("../src/membership-codes/core.ts");
const { OwnedMembershipA4Store, prepare, sqlState } = require("./owned-membership-a4-store.cjs");
const options = { synthetic: true, runId: "a4-" + "a".repeat(24) };
const command = () => ({ operationId: randomUUID(), membershipId: randomUUID(), accountId: randomUUID(), normalization: "exact", aliases: ["PRIM001"] });

test("A.4 requires explicit private opt-in and bounded budgets", () => {
  const port = { atomic() {}, snapshot() {} };
  assert.throws(() => new OwnedMembershipA4Store(port, core), /OPT_IN/);
  assert.throws(() => new OwnedMembershipA4Store(port, core, { ...options, maxAttempts: 0 }), /BUDGET/);
  assert.throws(() => new OwnedMembershipA4Store({}, core, options), /PORT_REQUIRED/);
});
test("A.4 rejects foreign ownership fields and malformed IDs before SQL", async () => {
  let calls = 0;
  const store = new OwnedMembershipA4Store({ atomic() { calls++; }, snapshot() { calls++; } }, core, options);
  for (const bad of [{ ...command(), balance: 1 }, { ...command(), status: "ACTIVE" },
    { ...command(), membershipId: "invalid" }, { ...command(), aliases: ["bad code"] },
    { ...command(), normalization: undefined }]) await assert.rejects(store.provision(bad));
  assert.equal(calls, 0);
});
test("A.4 makes normalization explicit and rejects normalized duplicate aliases", () => {
  const input = { ...command(), aliases: [" prim001 "], normalization: "trim-uppercase" };
  assert.deepEqual(prepare(input, core).aliases, ["PRIM001"]);
  assert.throws(() => prepare({ ...input, aliases: ["PRIM001", " prim001 "] }, core), /DUPLICATE_ALIAS/);
  assert.throws(() => prepare({ ...input, normalization: "exact" }, core), /INVALID_ALIAS/);
});
test("A.4 immutable retry digest binds UUID, raw aliases, mode and order", () => {
  const input = command();
  const first = prepare(input, core).digest;
  assert.equal(prepare(structuredClone(input), core).digest, first);
  for (const changed of [{ ...input, accountId: randomUUID() }, { ...input, membershipId: randomUUID() },
    { ...input, normalization: "trim-uppercase" }, { ...input, aliases: ["prim001"] , normalization: "trim-uppercase" }])
    assert.notEqual(prepare(changed, core).digest, first);
});
test("A.4 only retries known transaction serialization failures", async () => {
  let attempts = 0;
  const failure = Object.assign(new Error("serialization"), { code: "P2034" });
  const store = new OwnedMembershipA4Store({ async atomic() { attempts++; throw failure; }, snapshot() {} }, core, { ...options, maxAttempts: 2 });
  await assert.rejects(store.provision(command()), (e) => e === failure);
  assert.equal(attempts, 2);
  assert.equal(sqlState({ code: "P2010", meta: { code: "40P01" } }), "40P01");
});
test("A.4 unknown commit outcome is propagated without automatic replay", async () => {
  let attempts = 0;
  const failure = new Error("response lost");
  const store = new OwnedMembershipA4Store({ async atomic() { attempts++; throw failure; }, snapshot() {} }, core, options);
  await assert.rejects(store.provision(command()), (e) => e === failure);
  assert.equal(attempts, 1);
});
test("A.4 missing counter does not allocate or create a fallback", async () => {
  const sql = [];
  const store = new OwnedMembershipA4Store({
    atomic: (work) => work({ async query(text) { sql.push(text); return []; } }), snapshot() {},
  }, core, options);
  await assert.rejects(store.provision(command()), /COUNTER_MISSING/);
  assert.equal(sql.some((s) => /^(INSERT|UPDATE)\b/.test(s)), false);
});
test("A.4 lookup distinguishes absence from unavailability and validates operation IDs", async () => {
  const store = new OwnedMembershipA4Store({ atomic() {}, snapshot: (work) => work({ query: async () => [] }) }, core, options);
  assert.equal(await store.lookup(randomUUID()), null);
  await assert.rejects(store.lookup("invalid"), /INVALID_UUID/);
  store.sql.snapshot = async () => { throw Error("synthetic unavailable"); };
  await assert.rejects(store.lookup(randomUUID()), /unavailable/);
});

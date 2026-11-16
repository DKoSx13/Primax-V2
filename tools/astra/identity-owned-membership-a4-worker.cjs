// Executed ONLY by the fresh-resource runner in a disposable, read-only tool image.
const assert = require("node:assert/strict");
const { randomUUID, createHash } = require("node:crypto");
const fs = require("node:fs");
const Module = require("node:module");
const { createRequire } = Module;
const load = createRequire("/app/package.json");
const ts = load("typescript");
const { PrismaClient } = load("@prisma/client");
const root = "/workspace";
const runId = process.env.A4_RUN_ID;
assert.match(runId, /^a4-[a-f0-9]{24}$/);
assert.equal(process.env.A4_SYNTHETIC, "true");
// Only the runner's exact fresh container hostname/database are accepted.
function checkedUrl(raw) {
  const url = new URL(raw);
  assert.equal(url.hostname, runId + "-pg");
  assert.ok(["/a4_primary", "/a4_restored"].includes(url.pathname));
  return raw;
}
const db = new PrismaClient({ datasources: { db: { url: checkedUrl(process.env.A4_DATABASE_URL) } } });
const admin = new PrismaClient({ datasources: { db: { url: checkedUrl(process.env.A4_ADMIN_URL) } } });
const source = root + "/services/identity/src/membership-codes/core.ts";
const configPath = root + "/services/identity/tsconfig.json";
const config = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(config.error, undefined);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root + "/services/identity");
const program = ts.createProgram([source], { ...parsed.options, noEmit: true });
const diagnostics = ts.getPreEmitDiagnostics(program);
assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
  getCanonicalFileName: (p) => p, getCurrentDirectory: () => root, getNewLine: () => "\n",
}));
const coreModule = new Module("/tmp/a4-core.cjs");
coreModule._compile(ts.transpileModule(fs.readFileSync(source, "utf8"), { compilerOptions: parsed.options }).outputText, "/tmp/a4-core.cjs");
const core = coreModule.exports;
const { OwnedMembershipA4Store, POLICY } = require(root + "/services/identity/lab/owned-membership-a4-store.cjs");
const tables = ["AccountReference", "MembershipIdentity", "MembershipCode", "MembershipNumberCounter", "AllocationReceipt"];
const checks = [];
let stage = "start";
const pass = (name) => { checks.push(name); process.stderr.write("PASS " + name + "\n"); };
const query = (client) => ({ query: (sql, values = []) => client.$queryRawUnsafe(sql, ...values) });
function port(client = db, fault) {
  return {
    atomic: (work) => client.$transaction(async (tx) => {
      const session = query(tx);
      const wrapped = { async query(sql, values) {
        const result = await session.query(sql, values);
        if (fault?.(sql)) throw Error("synthetic injected rollback");
        return result;
      } };
      return work(wrapped);
    }, { isolationLevel: "Serializable", maxWait: 20000, timeout: 20000 }),
    snapshot: (work) => client.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      return work(query(tx));
    }, { isolationLevel: "RepeatableRead", maxWait: 20000, timeout: 20000 }),
  };
}
const store = (client = db, fault, extra = {}) => new OwnedMembershipA4Store(port(client, fault), core, { synthetic: true, runId, ...extra });
const makeCommand = (aliases = []) => ({ operationId: randomUUID(), membershipId: randomUUID(), accountId: randomUUID(), aliases, normalization: "exact" });
const insertAnchor = (cmd) => admin.$executeRawUnsafe('INSERT INTO identity_a4_private."AccountReference" ("accountId") VALUES ($1::uuid)', cmd.accountId);
const canonical = (value) => JSON.stringify(value, (_, v) => typeof v === "bigint" ? String(v) : v);
async function snapshot() {
  return admin.$transaction(async (tx) => {
    const result = {};
    for (const table of tables) {
      // Table names are fixed source constants; never input-derived SQL identifiers.
      const rows = await tx.$queryRawUnsafe(`SELECT * FROM identity_a4_private."${table}"`);
      result[table] = JSON.parse(canonical(rows)).sort((a, b) => canonical(a).localeCompare(canonical(b)));
    }
    return result;
  }, { isolationLevel: "RepeatableRead" });
}
const checksum = (data) => createHash("sha256").update(canonical(data)).digest("hex");
async function noChange(action, predicate) {
  const before = await snapshot();
  await assert.rejects(action, predicate);
  assert.deepEqual(await snapshot(), before);
}
async function run() {
  stage = "typecheck";
  pass("TypeScript " + ts.version + ": core checked with actual project options (noEmit)");
  stage = "boundaries";
  for (const [before, expected] of [[998n, "PRIME-999"], [999n, "PRIME-A001"], [1997n, "PRIME-A999"], [1998n, "PRIME-B001"], [26972n, "PRIME-Z999"], [26973n, "PRIME-AA001"]]) {
    await admin.$executeRawUnsafe('UPDATE identity_a4_private."MembershipNumberCounter" SET value=$1::bigint WHERE id=1', String(before));
    const cmd = makeCommand(); await insertAnchor(cmd);
    const result = await store().provision(cmd);
    assert.equal(result.canonicalCode, expected);
    assert.equal(result.canonicalCode, core.formatMembershipNumber(BigInt(result.allocatedOrdinal)));
  }
  pass("PostgreSQL numbering matches legacy numeric/alphabetic boundaries");
  stage = "aliases";
  const a = makeCommand(["PRIM001A", "PRIME-AA002"]); await insertAnchor(a);
  const receipt = await store().provision(a);
  assert.equal(receipt.canonicalCode, "PRIME-AA003"); // AA002 was reserved as alias first.
  assert.equal(receipt.membershipId, a.membershipId);
  const resolved = await store().resolve("PRIM001A", "exact");
  assert.equal(resolved.membership.id, a.membershipId);
  assert.equal(resolved.membership.number, receipt.canonicalCode);
  assert.equal(resolved.matchedBy, "alias");
  assert.equal(await store().resolve("unknown", "exact"), null);
  assert.equal((await store().resolve(" prim001a ", "trim-uppercase")).membership.id, a.membershipId);
  const b = makeCommand([receipt.canonicalCode]); await insertAnchor(b);
  await noChange(() => store().provision(b));
  const c = makeCommand(["PRIM001A"]); await insertAnchor(c);
  await noChange(() => store().provision(c));
  pass("Unified namespace skips aliases and rejects alias/canonical cross-member collisions; UUID preserved");
  const budget = makeCommand([core.formatMembershipNumber(BigInt(receipt.allocatedOrdinal) + 1n)]); await insertAnchor(budget);
  await noChange(() => store(db, undefined, { maxCandidates: 1 }).provision(budget), /CANDIDATE_BUDGET/);
  pass("Occupied-candidate budget exhaustion rolls back aliases, identity and counter");
  stage = "concurrency";
  const commands = Array.from({ length: 8 }, (_, i) => makeCommand(["SYNTH-" + String(i).padStart(3, "0")]));
  for (const cmd of commands) await insertAnchor(cmd);
  const second = new PrismaClient({ datasources: { db: { url: checkedUrl(process.env.A4_DATABASE_URL) } } });
  try {
    const receipts = await Promise.all(commands.map((cmd, i) => store(i % 2 ? second : db, undefined, { maxAttempts: 10 }).provision(cmd)));
    assert.equal(new Set(receipts.map((r) => r.canonicalCode)).size, commands.length);
    for (let i = 0; i < commands.length; i++) {
      assert.equal(receipts[i].membershipId, commands[i].membershipId);
      assert.equal((await store().resolve(commands[i].aliases[0], "exact")).membership.id, commands[i].membershipId);
    }
    const same = makeCommand(["SAME-REQUEST"]); await insertAnchor(same);
    const twins = await Promise.all([store(db).provision(same), store(second).provision(same)]);
    assert.deepEqual(twins[0], twins[1]);
    const owner = makeCommand(["CONTESTED"]); await insertAnchor(owner);
    const other = makeCommand(["CONTESTED"]); await insertAnchor(other);
    const race = await Promise.allSettled([store(db).provision(owner), store(second).provision(other)]);
    assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
    const sameAccount = [makeCommand(), makeCommand()];
    sameAccount[1].accountId = sameAccount[0].accountId; await insertAnchor(sameAccount[0]);
    const accountRace = await Promise.allSettled(sameAccount.map((cmd, i) => store(i ? second : db).provision(cmd)));
    assert.equal(accountRace.filter((r) => r.status === "fulfilled").length, 1);
  } finally { await second.$disconnect(); }
  pass("Concurrent real PostgreSQL clients: distinct registrations, same request, contested alias and same account");
  stage = "rollback";
  for (const pattern of [/INSERT INTO.*MembershipIdentity/, /INSERT INTO.*MembershipCode.*ALIAS/, /UPDATE.*MembershipNumberCounter/, /INSERT INTO.*MembershipCode.*CANONICAL/, /INSERT INTO.*AllocationReceipt/]) {
    const cmd = makeCommand(["FAULT-" + randomUUID().slice(0, 8).toUpperCase()]); await insertAnchor(cmd);
    await noChange(() => store(db, (sql) => pattern.test(sql)).provision(cmd));
  }
  pass("Injected faults after member/alias/counter/canonical/receipt rollback the entire SQL transaction");
  stage = "idempotency";
  const beforeReplay = await snapshot();
  assert.deepEqual(await store().provision(a), receipt);
  assert.deepEqual(await store().lookup(a.operationId), receipt);
  await noChange(() => store().provision({ ...a, aliases: ["CHANGED"] }));
  assert.deepEqual(await snapshot(), beforeReplay);
  const lost = makeCommand(["LOST-RESPONSE"]); await insertAnchor(lost);
  const realPort = port();
  const dropResponse = { ...realPort, async atomic(work) {
    await realPort.atomic(work); // Commit really finishes before dropping the result.
    throw Error("synthetic post-commit response lost");
  } };
  const dropStore = new OwnedMembershipA4Store(dropResponse, core, { synthetic: true, runId });
  await assert.rejects(dropStore.provision(lost), /response lost/);
  const recovered = await store().lookup(lost.operationId);
  assert.ok(recovered);
  const afterLostCommit = await snapshot();
  assert.deepEqual(await store().provision(lost), recovered);
  assert.deepEqual(await snapshot(), afterLostCommit);
  pass("Idempotent retry and discarded post-commit response recover same number/UUID/receipt; altered request rejected");
  stage = "constraints";
  await noChange(() => store().provision(makeCommand())); // No AccountReference.
  const incomplete = makeCommand(); await insertAnchor(incomplete);
  await noChange(() => port().atomic((tx) => tx.query('INSERT INTO identity_a4_private."MembershipIdentity" ("membershipId","accountId") VALUES ($1::uuid,$2::uuid)', [incomplete.membershipId, incomplete.accountId])));
  await noChange(() => port().atomic((tx) => tx.query('INSERT INTO identity_a4_private."MembershipCode" (code,"membershipId",kind) VALUES (\'ORPHAN\',$1::uuid,\'ALIAS\')', [randomUUID()])));
  for (const code of ["bad code", "PRIME-A000", "PRIME-001\n"]) {
    await noChange(() => port().atomic((tx) => tx.query('INSERT INTO identity_a4_private."MembershipCode" (code,"membershipId",kind) VALUES ($1,$2::uuid,\'CANONICAL\')', [code, a.membershipId])));
  }
  await noChange(() => port().atomic((tx) => tx.query('INSERT INTO identity_a4_private."MembershipCode" (code,"membershipId",kind) VALUES (\'PRIME-Z001\',$1::uuid,\'CANONICAL\')', [a.membershipId])));
  await noChange(() => port().atomic((tx) => tx.query('UPDATE identity_a4_private."AllocationReceipt" SET "canonicalCode"=\'PRIME-001\'')));
  pass("Real FK/check/deferred constraints reject unknown account, orphan alias, malformed/duplicate canonical and incomplete member");
  stage = "permissions";
  await assert.rejects(db.$queryRawUnsafe('SELECT * FROM a4_sentinel.secret'));
  await assert.rejects(db.$executeRawUnsafe('DELETE FROM identity_a4_private."MembershipCode"'));
  await assert.rejects(db.$executeRawUnsafe('CREATE TABLE identity_a4_private.forbidden(id int)'));
  assert.deepEqual(await admin.$queryRawUnsafe('SELECT value FROM a4_sentinel.secret'), [{ value: "synthetic-unchanged" }]);
  pass("Restricted writer cannot read sentinel, delete data or create tables; per-code identity projections remain separate");
  stage = "capacity";
  const data = await snapshot(); // Consistent recovery point, before capacity-only fault fixture.
  await admin.$executeRawUnsafe('UPDATE identity_a4_private."MembershipNumberCounter" SET value=9223372036854775807 WHERE id=1');
  const exhausted = makeCommand(); await insertAnchor(exhausted);
  await noChange(() => store().provision(exhausted), /COUNTER_EXHAUSTED/);
  for (const value of [9007199254740993n, 9223372036854775807n]) {
    const rows = await admin.$queryRawUnsafe('SELECT identity_a4_private.format_ordinal($1::bigint) AS code', String(value));
    assert.equal(rows[0].code, core.formatMembershipNumber(value));
  }
  pass("Signed BIGINT exhaustion fails without wraparound or partial provision");
  return { checks, typeScript: ts.version, node: process.version, snapshot: data, checksum: checksum(data), replayCommand: lost, replayReceipt: recovered };
}

function validateRecoveryPoint(incoming, expectedChecksum, expectedReceipt) {
  assert.equal(expectedChecksum, checksum(incoming), "snapshot checksum mismatch");
  assert.deepEqual(Object.keys(incoming), tables);
  const acknowledged = incoming.AllocationReceipt.find((r) => r.operationId === expectedReceipt.operationId);
  assert.ok(acknowledged, "acknowledged receipt missing; block writes");
  assert.equal(acknowledged.membershipId, expectedReceipt.membershipId);
  assert.equal(acknowledged.canonicalCode, expectedReceipt.canonicalCode);
  assert.equal(acknowledged.requestDigest, expectedReceipt.requestDigest);
}
async function insertRecoveryPoint(incoming) {
  // Fixed schema/columns, parameter values only. No SQL from the supplied snapshot.
  const columns = {
    AccountReference: ["accountId"], MembershipIdentity: ["membershipId", "accountId", "createdAt"],
    MembershipCode: ["code", "membershipId", "kind", "createdAt"], MembershipNumberCounter: ["id", "value"],
    AllocationReceipt: ["operationId", "requestDigest", "contractVersion", "policyVersion", "membershipId", "canonicalCode", "codeKind", "allocatedOrdinal", "committedAt"],
  };
  await admin.$transaction(async (tx) => {
    for (const table of tables) for (const row of incoming[table]) {
      const cols = columns[table];
      assert.deepEqual(Object.keys(row).sort(), [...cols].sort());
      const casts = cols.map((col, i) => `$${i + 1}` + (col === "value" || col === "allocatedOrdinal" ? "::bigint" : col.endsWith("At") ? "::timestamptz" : col.endsWith("Id") ? "::uuid" : ""));
      await tx.$executeRawUnsafe(`INSERT INTO identity_a4_private."${table}" (${cols.map((c) => '"' + c + '"').join(",")}) VALUES (${casts.join(",")})`, ...cols.map((c) => row[c]));
    }
  }, { timeout: 20000 });
}
async function restore(payload) {
  const incoming = payload.snapshot;
  validateRecoveryPoint(incoming, payload.checksum, payload.replayReceipt);
  for (const table of tables) assert.equal((await admin.$queryRawUnsafe(`SELECT count(*)::int AS n FROM identity_a4_private."${table}"`))[0].n, 0);
  const corrupted = structuredClone(incoming);
  corrupted.AllocationReceipt.pop();
  assert.throws(() => validateRecoveryPoint(corrupted, payload.checksum, payload.replayReceipt), /checksum/);
  const missingAcknowledgement = structuredClone(incoming);
  missingAcknowledgement.AllocationReceipt = missingAcknowledgement.AllocationReceipt.filter((r) => r.operationId !== payload.replayReceipt.operationId);
  assert.throws(() => validateRecoveryPoint(missingAcknowledgement, checksum(missingAcknowledgement), payload.replayReceipt), /acknowledged receipt/);
  await noChange(() => insertRecoveryPoint(missingAcknowledgement));
  const behind = structuredClone(incoming);
  behind.MembershipNumberCounter[0].value = "0";
  await noChange(() => insertRecoveryPoint(behind));
  pass("Corrupt/incomplete recovery points and low-counter restores are rejected with no partial rows");
  await insertRecoveryPoint(incoming);
  assert.deepEqual(await snapshot(), incoming);
  assert.deepEqual(await store().provision(payload.replayCommand), payload.replayReceipt);
  assert.deepEqual(await store().lookup(payload.replayCommand.operationId), payload.replayReceipt);
  pass("Fresh-database logical restore preserves all five tables/counter, UUIDs and idempotent receipt replay");
  // Low counter with correctly re-hashed snapshot must fail state validation at commit.
  await assert.rejects(admin.$executeRawUnsafe('UPDATE identity_a4_private."MembershipNumberCounter" SET value=0 WHERE id=1'));
  assert.deepEqual(await snapshot(), incoming);
  pass("Counter behind receipts is rejected; restore state remains unchanged");
  const next = makeCommand(["AFTER-RESTORE"]); await insertAnchor(next);
  const allocated = await store().provision(next);
  const previous = BigInt(incoming.MembershipNumberCounter[0].value);
  assert.equal(BigInt(allocated.allocatedOrdinal), previous + 1n);
  assert.equal(allocated.canonicalCode, core.formatMembershipNumber(previous + 1n));
  pass("Fresh restore continues allocation from restored counter without reusing acknowledged codes");
  return { checks, checksum: checksum(incoming) };
}

(async () => {
  let payload = ""; for await (const part of process.stdin) payload += part;
  const input = payload ? JSON.parse(payload) : {};
  const result = process.argv[2] === "restore" ? await restore(input) : await run();
  console.log(JSON.stringify(result));
})().catch((error) => {
  let message = String(error.message);
  for (const key of ["A4_DATABASE_URL", "A4_ADMIN_URL"]) message = message.replaceAll(process.env[key] || "<absent>", "[private-url]");
  message = message.replace(/postgres(?:ql)?:\/\/[^\s]+/g, "[private-url]");
  process.stderr.write(JSON.stringify({ stage, code: error.code, message: message.slice(0, 2400), meta: error.meta?.code }) + "\n");
  process.exitCode = 1;
}).finally(async () => { await Promise.allSettled([db.$disconnect(), admin.$disconnect()]); });

// Private fresh-resource integration worker. No server or operational bootstrap.
const fs = require("node:fs"), assert = require("node:assert/strict");
const { randomUUID, createHash } = require("node:crypto");
const Module = require("node:module"), load = Module.createRequire("/app/package.json");
const ts = load("typescript"), { PrismaClient } = load("@prisma/client");
const root = "/workspace", project = root + "/services/identity";
const runId = process.env.A4_READ_RUN;
assert.match(runId, /^a4-[a-f0-9]{24}$/);
assert.equal(process.env.A4_READ_SYNTHETIC, "true");
function client(key, expectedUser) {
  const url = new URL(process.env[key]);
  assert.equal(url.hostname, runId + "-pg"); assert.equal(url.pathname, "/a4_read");
  assert.equal(url.username, expectedUser);
  return new PrismaClient({ datasources: { db: { url: url.href } } });
}
const admin = client("A4_READ_ADMIN", "postgres"), writer = client("A4_READ_WRITER", "a4_writer"), reader = client("A4_READ_READER", "a4_reader");
const checks = []; let stage = "typecheck";
const pass = (name) => { checks.push(name); process.stderr.write("PASS " + name + "\n"); };
const config = ts.readConfigFile(project + "/tsconfig.json", ts.sys.readFile);
assert.equal(config.error, undefined);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, project);
assert.equal(parsed.errors.length, 0);
function check(files, options) {
  const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram(files, { ...options, noEmit: true }));
  assert.equal(diagnostics.length, 0, ts.formatDiagnostics(diagnostics, {
    getCanonicalFileName: (p) => p, getCurrentDirectory: () => root, getNewLine: () => "\n",
  }));
}
check([project + "/src/membership-codes/core.ts"], parsed.options);
// Lab is excluded from runtime tsconfig include. Broaden only in-memory rootDir;
// strict/target/module/libs are the real options; no configuration file is changed.
check([project + "/lab/membership-a4-read.ts", project + "/lab/membership-a4-read.types.test.ts"], { ...parsed.options, rootDir: project });
pass("TypeScript 5.9.3 core and 3A contracts compile; negative type assertions checked, no emit");
function compiled(relative, override) {
  const file = root + "/" + relative, instance = new Module(file);
  instance.paths = Module._nodeModulePaths("/app");
  instance.require = override || load;
  instance._compile(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: parsed.options }).outputText, file);
  return instance.exports;
}
const core = compiled("services/identity/src/membership-codes/core.ts");
const reads = compiled("services/identity/lab/membership-a4-read.ts");
const { OwnedMembershipA4Store } = require(project + "/lab/owned-membership-a4-store.cjs");
const { MembershipA4ReadRepository } = require(project + "/lab/membership-a4-read-store.cjs");
const query = (db) => ({ query: (sql, values = []) => db.$queryRawUnsafe(sql, ...values) });
const writerPort = {
  atomic: (work) => writer.$transaction((tx) => work(query(tx)), { isolationLevel: "Serializable", timeout: 15000 }),
  snapshot: (work) => writer.$transaction((tx) => work(query(tx)), { isolationLevel: "RepeatableRead", timeout: 15000 }),
};
let readCalls = 0; const statements = [];
const readPort = { snapshot: (work) => reader.$transaction(async (tx) => {
  readCalls++;
  await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
  assert.equal((await tx.$queryRawUnsafe("SHOW transaction_read_only"))[0].transaction_read_only, "on");
  assert.equal((await tx.$queryRawUnsafe("SHOW transaction_isolation"))[0].transaction_isolation, "repeatable read");
  return work({ async query(sql, values = []) { statements.push(sql); assert.match(sql.trim(), /^SELECT\b/i); return tx.$queryRawUnsafe(sql, ...values); } });
}, { isolationLevel: "RepeatableRead", timeout: 15000 }) };
const repository = new MembershipA4ReadRepository(readPort, core);
const createReads = (bindings) => new reads.PrivateMembershipReads(repository, bindings, core, {
  synthetic: true, sourceDatasetId: runId, clock: () => "2026-11-16T00:00:00.000Z",
});
const tables = ["AccountReference", "MembershipIdentity", "MembershipCode", "MembershipNumberCounter", "AllocationReceipt"];
async function snapshot() {
  return admin.$transaction(async (tx) => {
    const data = {};
    for (const table of tables) {
      const rows = await tx.$queryRawUnsafe(`SELECT * FROM identity_a4_private."${table}"`);
      data[table] = JSON.parse(JSON.stringify(rows, (_, v) => typeof v === "bigint" ? String(v) : v))
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    }
    return data;
  }, { isolationLevel: "RepeatableRead" });
}
const rejects = (promise, code) => assert.rejects(promise, (e) => e.code === code && e.message === code);
(async () => {
  stage = "fixtures";
  const provision = new OwnedMembershipA4Store(writerPort, core, { synthetic: true, runId });
  const bindings = [], fixtures = [];
  for (const [before, expected, aliases] of [[0, "PRIME-001", ["PRIM001"]], [999, "PRIME-A001", ["PRIM001A"]], [26973, "PRIME-AA001", ["PRIM001AA", "PRIM-001AA"]], [26974, "PRIME-AA002", ["PRIM002AA"]]]) {
    const binding = { userId: randomUUID(), accountId: randomUUID(), membershipId: randomUUID() };
    await admin.$executeRawUnsafe('INSERT INTO identity_a4_private."AccountReference" ("accountId") VALUES ($1::uuid)', binding.accountId);
    await admin.$executeRawUnsafe('UPDATE identity_a4_private."MembershipNumberCounter" SET value=$1::bigint WHERE id=1', String(before));
    const result = await provision.provision({ membershipId: binding.membershipId, accountId: binding.accountId,
      operationId: randomUUID(), normalization: "exact", aliases });
    assert.equal(result.canonicalCode, expected);
    bindings.push(binding); fixtures.push({ ...binding, number: expected, aliases });
  }
  const withoutMember = { userId: randomUUID(), accountId: randomUUID(), membershipId: null };
  bindings.push(withoutMember);
  const manifest = new reads.SyntheticIdentityBindings(bindings), service = createReads(manifest);
  const before = await snapshot();
  pass("New synthetic fixtures reuse phase-2 provisioning with distinct explicit user/account/member UUIDs");
  stage = "read parity";
  const legacyMatches = compiled("Backend/src/users/membership-code.ts").matchesMembershipCode;
  const { PrismaMembershipProfiles } = compiled("Backend/src/identity-adapters/persistence.ts");
  const { VehiclesRepository } = compiled("Backend/src/vehicles/vehicles.repository.ts", (spec) => {
    if (spec === "../prisma/prisma.service") return { PrismaService: class SyntheticPrismaToken {} };
    return load(spec);
  });
  const legacyRows = fixtures.map((f) => ({ id: f.membershipId, userId: f.userId, number: f.number,
    status: "ACTIVE", user: { name: "Synthetic", email: "synthetic@example.invalid" }, vehicles: [] }));
  const aliases = new Map(fixtures.flatMap((f) => f.aliases.map((code) => [code, f.membershipId])));
  const legacyDb = {
    membership: { async findUnique({ where, select }) {
      const row = legacyRows.find((r) => where.number ? r.number === where.number : r.userId === where.userId);
      if (!row) return null;
      return select?.vehicles ? { number: row.number, status: row.status, vehicles: row.vehicles } : row;
    } },
    membershipCodeAlias: { async findUnique({ where }) {
      const id = aliases.get(where.code); if (!id) return null;
      const row = legacyRows.find((r) => r.id === id);
      return { membershipId: id, membership: { number: row.number, status: row.status, vehicles: row.vehicles } };
    } },
  };
  const legacyProfiles = new PrismaMembershipProfiles(legacyDb), legacyVehicles = new VehiclesRepository(legacyDb);
  for (const f of fixtures) {
    const actor = { kind: "member", userId: f.userId };
    const view = await service.forUser(actor), legacy = await legacyProfiles.forUser(f.userId);
    assert.equal(view.membershipId, legacy.id); assert.equal(view.canonicalNumber, legacy.number);
    assert.deepEqual(await service.byMembershipId(actor, f.membershipId), view);
    for (const code of [f.number, ...f.aliases]) {
      const candidate = await service.resolveCode(actor, code, "exact");
      assert.equal((await legacyVehicles.membership(code)).number, candidate.canonicalNumber);
      assert.equal(await legacyMatches(legacyDb, { id: f.membershipId, number: f.number }, code), true);
      assert.equal(candidate.membershipId, f.membershipId);
    }
    assert.deepEqual([...await service.aliasesForMember(actor, f.membershipId)], [...f.aliases].sort());
    assert.deepEqual(reads.legacyMembershipCodes(view), { id: f.membershipId, number: f.number, legacyNumbers: [...f.aliases].sort() });
  }
  pass("Actual legacy helper/repository/profile methods over memory fixtures match PostgreSQL identity/code reads");
  stage = "isolation";
  const actor = { kind: "member", userId: fixtures[0].userId };
  let calls = readCalls;
  await rejects(service.forUser(actor, fixtures[1].userId), "DENIED");
  await rejects(service.byMembershipId(actor, fixtures[1].membershipId), "NOT_FOUND");
  await rejects(service.byMembershipId(actor, randomUUID()), "NOT_FOUND");
  assert.equal(readCalls, calls);
  for (const code of [fixtures[1].number, fixtures[1].aliases[0], "UNKNOWN"])
    await rejects(service.resolveCode(actor, code, "exact"), "NOT_FOUND");
  assert.equal(await legacyMatches(legacyDb, { id: fixtures[0].membershipId, number: fixtures[0].number }, fixtures[1].aliases[0]), false);
  await rejects(service.forUser({ kind: "control", userId: actor.userId }), "DENIED");
  pass("Foreign/unknown IDs and aliases are masked; cross-user and unsupported actors denied without owner disclosure");
  stage = "absence";
  calls = readCalls;
  await rejects(service.forUser({ kind: "member", userId: withoutMember.userId }), "NOT_FOUND");
  await rejects(service.forUser({ kind: "member", userId: randomUUID() }), "NOT_PROVISIONED");
  assert.equal(readCalls, calls);
  assert.equal(await repository.snapshot((session) => session.byMembershipId(randomUUID())), null);
  const stale = { userId: randomUUID(), accountId: randomUUID(), membershipId: randomUUID() };
  await rejects(createReads(new reads.SyntheticIdentityBindings([stale])).forUser({ kind: "member", userId: stale.userId }), "NOT_PROVISIONED");
  const crossed = { ...fixtures[0], accountId: fixtures[1].accountId };
  await rejects(createReads(new reads.SyntheticIdentityBindings([{ userId: crossed.userId, accountId: crossed.accountId, membershipId: crossed.membershipId }])).forUser(actor), "BINDING_MISMATCH");
  pass("Known no-membership, unknown UUID, missing provisioning and crossed account binding remain distinct");
  stage = "provider failure";
  await admin.$executeRawUnsafe('REVOKE SELECT ON identity_a4_private."MembershipIdentity" FROM a4_reader');
  await rejects(service.forUser(actor), "UNAVAILABLE");
  await admin.$executeRawUnsafe('GRANT SELECT ON identity_a4_private."MembershipIdentity" TO a4_reader');
  assert.equal((await service.forUser(actor)).membershipId, fixtures[0].membershipId);
  pass("Real SQL permission failure is UNAVAILABLE with sanitized errors; next fresh snapshot recovers");
  stage = "read only";
  for (const sql of [
    'UPDATE identity_a4_private."MembershipCode" SET code=code',
    'DELETE FROM identity_a4_private."MembershipCode"',
    'SELECT * FROM identity_a4_private."MembershipNumberCounter"',
    'SELECT * FROM identity_a4_private."AllocationReceipt"',
    'SELECT * FROM a4_sentinel.secret',
  ]) await assert.rejects(reader.$queryRawUnsafe(sql));
  await assert.rejects(reader.$executeRawUnsafe('CREATE TABLE identity_a4_private.forbidden_read(id int)'));
  for (let i = 0; i < 20; i++) {
    await service.forUser(actor);
    await service.resolveCode(actor, fixtures[0].aliases[0], "exact");
  }
  assert.ok(statements.length > 0 && statements.every((s) => /^SELECT\b/i.test(s.trim())));
  assert.deepEqual(await snapshot(), before);
  assert.deepEqual(await admin.$queryRawUnsafe('SELECT value FROM a4_sentinel.secret'), [{ value: "synthetic-unchanged" }]);
  pass("Dedicated SELECT role, READ ONLY/REPEATABLE READ snapshots and before/after equality of all five tables");
  stage = "phase 4A private delegation";
  check([project + "/lab/vehicle-link-contract.ts", project + "/lab/vehicle-link-contract.types.test.ts"], { ...parsed.options, rootDir: project });
  const phase4a = await require(root + "/tools/astra/identity-a4-vehicle-link-scenarios.cjs")({ root, runId, fixtures, service, reads, core, pass, admin });
  const snapshotHash = createHash("sha256").update(JSON.stringify(before)).digest("hex");
  console.log(JSON.stringify({ success: true, checks, readTransactions: readCalls, domainStatements: statements.length,
    snapshotHash, phase4a, typeScript: ts.version, node: process.version }));
})().catch((error) => {
  let message = String(error.message);
  for (const key of ["A4_READ_ADMIN", "A4_READ_WRITER", "A4_READ_READER", "A4_LEGACY_ADMIN", "A4_LEGACY_READER", "A4_VEHICLE_WRITER"]) message = message.replaceAll(process.env[key] || "<absent>", "[private-url]");
  message = message.replace(/postgres(?:ql)?:\/\/[^\s]+/g, "[private-url]");
  process.stderr.write(JSON.stringify({ stage, code: error.code, message: message.slice(0, 3000), sqlState: error.meta?.code }) + "\n");
  process.exitCode = 1;
}).finally(async () => { await Promise.allSettled([admin.$disconnect(), writer.$disconnect(), reader.$disconnect()]); });

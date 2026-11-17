// 4A authority delegation tests, only on a newly created synthetic PostgreSQL.
const fs = require("node:fs"), path = require("node:path"), Module = require("node:module");
const cp = require("node:child_process"), assert = require("node:assert/strict");
const { randomUUID, randomBytes, createHash } = require("node:crypto");
const load = Module.createRequire("/app/package.json"), ts = load("typescript");
module.exports = async function scenarios({ root, runId, fixtures, service, reads, pass, admin }) {
  function url(key, user) {
    const value = new URL(process.env[key]);
    assert.equal(value.hostname, runId + "-pg"); assert.equal(value.pathname, "/a4_legacy");
    assert.equal(value.username, user); assert.equal(value.searchParams.get("schema"), "public");
    return value.href;
  }
  const adminURL = url("A4_LEGACY_ADMIN", "postgres"), readerURL = url("A4_LEGACY_READER", "a4_legacy_reader"), writerURL = url("A4_VEHICLE_WRITER", "a4_vehicle_writer");
  const temp = fs.mkdtempSync("/tmp/a4-4a-"), generated = path.join(temp, "client");
  fs.symlinkSync("/app/node_modules", path.join(temp, "node_modules"), "dir");
  const schema = fs.readFileSync(root + "/Backend/prisma/schema.prisma", "utf8")
    .replace(/generator client\s*\{/, 'generator client {\n output = ' + JSON.stringify(generated));
  const schemaFile = path.join(temp, "legacy.prisma"); fs.writeFileSync(schemaFile, schema, { flag: "wx" });
  cp.execFileSync(process.execPath, ["/app/node_modules/prisma/build/index.js", "generate", "--schema", schemaFile],
    { cwd: temp, env: { ...process.env, DATABASE_URL: adminURL, DATABASE_URL_UNPOOLED: adminURL,
      PRISMA_GENERATE_SKIP_AUTOINSTALL: "true", CHECKPOINT_DISABLE: "1" }, stdio: "pipe", timeout: 30000 });
  const client = require(generated), legacyAdmin = new client.PrismaClient({ datasources: { db: { url: adminURL } } });
  const legacy = new client.PrismaClient({ datasources: { db: { url: readerURL } }, log: [{ emit: "event", level: "query" }] });
  const statements = []; legacy.$on("query", event => statements.push(event.query));
  const cache = new Map();
  function compiled(relative) {
    const file = path.resolve(root, relative);
    if (cache.has(file)) return cache.get(file).exports;
    const instance = new Module(file); cache.set(file, instance);
    instance.require = spec => {
      if (spec === "@prisma/client") return client;
      if (spec.startsWith(".")) {
        const target = path.resolve(path.dirname(file), spec);
        return compiled(path.relative(root, target.endsWith(".ts") ? target : target + ".ts"));
      }
      return load(spec);
    };
    instance._compile(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, experimentalDecorators: true,
      emitDecoratorMetadata: true, esModuleInterop: true,
    } }).outputText, file);
    return instance.exports;
  }
  const json = value => JSON.parse(JSON.stringify(value));
  const rejected = (promise, code) => assert.rejects(promise, error => error.code === code && error.message === code);
  let authority;
  async function state(db, schemaName) {
    return db.$transaction(async tx => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      const tables = await tx.$queryRawUnsafe("SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname=$1 ORDER BY tablename", schemaName);
      const result = {};
      for (const { tablename } of tables) {
        const table = '"' + tablename.replaceAll('"', '""') + '"';
        result[tablename] = (await tx.$queryRawUnsafe(`SELECT row_to_json(t) AS data FROM "${schemaName}".${table} t`))
          .map(row => JSON.stringify(row.data)).sort();
      }
      return result;
    }, { isolationLevel: "RepeatableRead", timeout: 30000 });
  }
  const { Logger } = load("@nestjs/common"); Logger.overrideLogger(false);
  try {
    assert.equal(fixtures.length, 4);
    for (const [index, fixture] of fixtures.entries()) {
      await legacyAdmin.user.create({ data: { id: fixture.userId, active: index !== 3,
        name: "Synthetic vehicle owner", email: `owner-${index}@synthetic.invalid`, passwordHash: "synthetic-not-a-login-hash" } });
      await legacyAdmin.membership.create({ data: { id: fixture.membershipId, userId: fixture.userId, number: fixture.number,
        status: index === 2 ? "SUSPENDED" : "ACTIVE", balance: "91.25", welcomeAvailable: true,
        welcomeReservedOperationId: randomUUID(), codeAliases: { create: fixture.aliases.map(code => ({ code })) } } });
    }
    const owned = await legacyAdmin.vehicle.create({ data: { plate: "OWN-001", label: "Original owned label", membershipId: fixtures[0].membershipId } });
    const foreign = await legacyAdmin.vehicle.create({ data: { plate: "FOR-001", label: "Synthetic foreign", membershipId: fixtures[1].membershipId } });
    const guest = await legacyAdmin.vehicle.create({ data: { plate: "GUE-001", label: "Historical guest", membershipId: null } });
    const contested = await legacyAdmin.vehicle.create({ data: { plate: "RAC-002", label: "Unowned race", membershipId: null } });
    const deniedOwned = [];
    for (const index of [2, 3]) deniedOwned.push(await legacyAdmin.vehicle.create({ data: {
      plate: "DOW-00" + index, label: "Historical denied owner", membershipId: fixtures[index].membershipId } }));
    const station = await legacyAdmin.station.create({ data: { code: "SYNTHETIC", name: "Synthetic", address: "Synthetic fixture" } });
    const fuel = await legacyAdmin.fuel.create({ data: { code: "SYNTHETIC", name: "Synthetic", pricePerGallon: "10.00" } });
    const transaction = data => legacyAdmin.transaction.create({ data: { operationId: randomUUID(), requestHash: "a".repeat(64),
      stationId: station.id, fuelId: fuel.id, amount: "12.50", unitPrice: "10.00", pointsRate: "1.00", pointsEarned: 17,
      mode: "POSTPAGO", ...data } });
    const memberPurchase = await transaction({ plate: owned.plate, vehicleId: owned.id, membershipId: fixtures[0].membershipId });
    const guestPurchase = await transaction({ plate: guest.plate, vehicleId: guest.id, membershipId: null, mode: "PREPAGO", pointsEarned: 0 });
    await legacyAdmin.membershipDebt.create({ data: { membershipId: fixtures[0].membershipId, transactionId: memberPurchase.id,
      amountOriginal: "12.50", amountPending: "12.50" } });
    await legacyAdmin.rewardMovement.create({ data: { membershipId: fixtures[0].membershipId, transactionId: memberPurchase.id, kind: "EARN", points: 17 } });
    const guestAuthorization = await legacyAdmin.fuelAuthorization.create({ data: { operationId: randomUUID(), requestHash: "b".repeat(64),
      stationId: station.id, fuelId: fuel.id, plate: guest.plate, vehicleId: guest.id, membershipId: null,
      authorizedAmount: "10.00", reservedAmount: "0.00", balanceAfter: "0.00", mode: "PREPAGO" } });
    const before = await state(legacyAdmin, "public"), beforeA4 = await state(admin, "identity_a4_private");
    const { PrismaService } = compiled("Backend/src/prisma/prisma.service.ts");
    authority = new PrismaService({ datasources: { db: { url: writerURL } }, log: [{ emit: "event", level: "query" }] });
    const writerStatements = []; authority.$on("query", event => writerStatements.push(event.query));
    const { VehiclesRepository } = compiled("Backend/src/vehicles/vehicles.repository.ts");
    const { VehiclesService } = compiled("Backend/src/vehicles/vehicles.service.ts");
    const contract = compiled("services/identity/lab/vehicle-link-contract.ts");
    const { LegacyVehicleLinkAdapter } = require(root + "/services/identity/lab/vehicle-link-legacy-adapter.cjs");
    const normalizePlate = compiled("Backend/src/vehicles/plate.dto.ts").normalizePlate;
    const cleanText = compiled("Backend/src/memberships/profile.dto.ts").cleanText;
    let rendezvous = null, transactionAttempts = 0, repositoryCalls = 0;
    const database = { atomic: work => authority.atomic(async tx => {
      transactionAttempts++;
      const vehicle = new Proxy(tx.vehicle, { get(target, key) {
        if (key === "findUnique") return async args => {
          const value = await target.findUnique(args);
          if (rendezvous?.plate === args.where.plate) await rendezvous.arrive();
          return value;
        };
        const value = target[key]; return typeof value === "function" ? value.bind(target) : value;
      } });
      return work(new Proxy(tx, { get: (target, key) => key === "vehicle" ? vehicle : target[key] }));
    }) };
    const provider = new LegacyVehicleLinkAdapter({ database,
      repository: db => { const repo = new VehiclesRepository(db); return { link: (...args) => { repositoryCalls++; return repo.link(...args); } }; },
      ownerService: new VehiclesService(new VehiclesRepository(legacy)), readError: contract.VehicleLinkError, synthetic: true });
    const credentials = fixtures.map(() => randomBytes(32).toString("hex"));
    const authorization = { async authenticate(credential) {
      const index = credentials.indexOf(credential);
      if (index < 0) throw new contract.VehicleLinkError("DENIED");
      return Object.freeze({ kind: "member", userId: fixtures[index].userId,
        permissions: Object.freeze(["vehicle:link:own", "vehicle:read:own"]) });
    } };
    const makeService = (commands = provider, auth = authorization) => new contract.PrivateVehicleLinkV1(auth, service, commands, provider,
      { plate: normalizePlate, label: cleanText }, { synthetic: true });
    const facade = makeService();
    const command = (index, plate, label = "Synthetic requested") => ({ contractVersion: 1, operationId: randomUUID(),
      expectedMembershipId: fixtures[index].membershipId, plate, label });
    const linked = await facade.link(credentials[0], command(0, " own001 ", "New label ignored"));
    assert.equal(linked.vehicleId, owned.id); assert.equal(linked.label, owned.label);
    assert.deepEqual(await legacyAdmin.vehicle.findUnique({ where: { id: owned.id } }), owned);
    const adopted = await facade.link(credentials[0], command(0, guest.plate, "<b>Guest now linked</b>"));
    assert.equal(adopted.vehicleId, guest.id); assert.equal(adopted.label, "Guest now linked");
    await rejected(facade.link(credentials[0], command(0, foreign.plate)), "OWNERSHIP_CONFLICT");
    pass("4A actual legacy link preserves owned UUID/label, links unowned UUID and rejects another owner using actual normalizers");
    function race(plate) {
      let count = 0, release; const barrier = new Promise(resolve => { release = resolve; });
      rendezvous = { plate, async arrive() { count++; if (count === 2) release();
        if (count <= 2) { let timer; try { await Promise.race([barrier, new Promise((_, reject) => { timer = setTimeout(() => reject(Error("RACE_BARRIER_TIMEOUT")), 3000); })]); }
          finally { clearTimeout(timer); } } } };
    }
    for (const plate of ["RAC-001", "RAC-002"]) {
      race(plate);
      const outcomes = await Promise.allSettled([facade.link(credentials[0], command(0, plate)), facade.link(credentials[1], command(1, plate))]);
      rendezvous = null;
      assert.equal(outcomes.filter(result => result.status === "fulfilled").length, 1);
      const failure = outcomes.find(result => result.status === "rejected").reason;
      assert.equal(failure.code, "OWNERSHIP_CONFLICT");
      const rows = await legacyAdmin.vehicle.findMany({ where: { plate } }); assert.equal(rows.length, 1);
      if (plate === "RAC-002") assert.equal(rows[0].id, contested.id);
      assert.ok(fixtures.slice(0, 2).some(f => f.membershipId === rows[0].membershipId));
    }
    pass("4A deterministic overlap: two owners racing a new or unowned plate yield one owner, one conflict, no duplicate UUID");
    const repeated = command(0, "REP-001", "Winning label");
    const repeats = await Promise.all(Array.from({ length: 8 }, () => facade.link(credentials[0], repeated)));
    assert.equal(new Set(repeats.map(value => value.vehicleId)).size, 1);
    const changedLabel = await facade.link(credentials[0], { ...repeated, label: "Ignored on repeat" });
    assert.equal(changedLabel.label, "Winning label");
    assert.equal(await legacyAdmin.vehicle.count({ where: { plate: "REP-001" } }), 1);
    pass("4A eight concurrent explicit repeats converge to one legacy Vehicle; later label does not change it; no durable receipt claimed");
    for (const index of [2, 3]) {
      await rejected(facade.link(credentials[index], command(index, "DEN-00" + index)), "DENIED");
      await rejected(facade.link(credentials[index], command(index, "DOW-00" + index, "Must not change")), "DENIED");
      assert.equal(await legacyAdmin.vehicle.count({ where: { plate: "DEN-00" + index } }), 0);
    }
    const priorCalls = repositoryCalls;
    await rejected(facade.link({ userId: fixtures[0].userId }, command(0, "DEN-004")), "DENIED");
    await rejected(facade.link(credentials[0], command(1, "DEN-005")), "DENIED");
    assert.equal(repositoryCalls, priorCalls);
    await rejected(provider.linkForOwner({ userId: randomUUID(), expectedMembershipId: randomUUID(), plate: "DEN-006", label: "Synthetic" }), "NOT_FOUND");
    await rejected(provider.linkForOwner({ userId: fixtures[0].userId, expectedMembershipId: fixtures[1].membershipId, plate: "DEN-007", label: "Synthetic" }), "BINDING_MISMATCH");
    pass("4A legacy authority rejects suspended/inactive fixtures; missing or crossed membership is rejected before a write");
    await rejected(facade.forOwner(credentials[0], foreign.plate), "NOT_FOUND");
    await rejected(facade.forOwner(credentials[0], "NON-001"), "NOT_FOUND");
    assert.equal((await facade.forOwner(credentials[1], foreign.plate)).vehicleId, foreign.id);
    pass("4A actual VehiclesService owner authorization hides foreign and nonexistent vehicles identically");
    let forwards = 0;
    const unavailable = makeService({ async linkForOwner() { throw new contract.VehicleLinkError("UNAVAILABLE", "NOT_SENT"); } });
    await rejected(unavailable.link(credentials[0], command(0, "OUT-001")), "UNAVAILABLE");
    assert.equal(await legacyAdmin.vehicle.count({ where: { plate: "OUT-001" } }), 0);
    const lost = makeService({ async linkForOwner(input) { forwards++; await provider.linkForOwner(input); throw Error("synthetic reply lost after commit"); } });
    const lostCommand = command(0, "LOS-001", "Committed label");
    await rejected(lost.link(credentials[0], lostCommand), "OUTCOME_UNKNOWN"); assert.equal(forwards, 1);
    const recoveredByObservation = await facade.forOwner(credentials[0], lostCommand.plate);
    const explicitRetry = await facade.link(credentials[0], { ...lostCommand, label: "Ignored retry label" });
    assert.equal(explicitRetry.vehicleId, recoveredByObservation.vehicleId); assert.equal(explicitRetry.label, "Committed label");
    assert.equal(explicitRetry.recovery, "STATE_CONVERGENCE_ONLY");
    assert.equal(await legacyAdmin.vehicle.count({ where: { plate: lostCommand.plate } }), 1);
    pass("4A pre-dispatch failure differs from lost post-commit reply; observation/explicit retry converge but cannot recover a durable receipt");
    const rollbackProvider = new LegacyVehicleLinkAdapter({ synthetic: true, readError: contract.VehicleLinkError,
      database: { atomic: work => authority.atomic(async tx => { await work(tx); throw Error("synthetic rollback after legacy work"); }) },
      repository: db => new VehiclesRepository(db), ownerService: new VehiclesService(new VehiclesRepository(legacy)) });
    await rejected(makeService(rollbackProvider).link(credentials[0], command(0, "ROL-001")), "OUTCOME_UNKNOWN");
    assert.equal(await legacyAdmin.vehicle.count({ where: { plate: "ROL-001" } }), 0);
    pass("4A injected transaction abort leaves no Vehicle; conservative unknown response does not trigger automatic replay");
    for (const sql of ['UPDATE public."Membership" SET balance=0', 'UPDATE public."User" SET active=false',
      'UPDATE public."Transaction" SET "membershipId"=NULL', 'DELETE FROM public."Vehicle"'])
      await assert.rejects(authority.$executeRawUnsafe(sql), error => error.meta?.code === "42501");
    const identityURL = new URL(process.env.A4_READ_READER); identityURL.pathname = "/a4_legacy"; identityURL.searchParams.set("schema", "public");
    const identityOnly = new client.PrismaClient({ datasources: { db: { url: identityURL.href } } });
    try { await assert.rejects(identityOnly.$queryRawUnsafe('SELECT * FROM public."Vehicle"'), error => error.meta?.code === "42501"); }
    finally { await identityOnly.$disconnect(); }
    const after = await state(legacyAdmin, "public");
    for (const table of Object.keys(before).filter(table => table !== "Vehicle")) assert.deepEqual(after[table], before[table], table + " changed");
    assert.deepEqual(await state(admin, "identity_a4_private"), beforeA4);
    assert.equal((await legacyAdmin.transaction.findUnique({ where: { id: guestPurchase.id } })).membershipId, null);
    assert.equal((await legacyAdmin.fuelAuthorization.findUnique({ where: { id: guestAuthorization.id } })).membershipId, null);
    assert.deepEqual(await legacyAdmin.vehicle.findUnique({ where: { id: owned.id } }), owned);
    assert.deepEqual(await legacyAdmin.vehicle.findUnique({ where: { id: foreign.id } }), foreign);
    for (const row of deniedOwned) assert.deepEqual(await legacyAdmin.vehicle.findUnique({ where: { id: row.id } }), row);
    const vehicleChanges = writerStatements.filter(sql => /^(INSERT INTO|UPDATE) "public"\."Vehicle"/.test(sql));
    assert.ok(vehicleChanges.length > 0);
    pass("4A all 39 non-Vehicle legacy tables and five A4 tables unchanged, including historical guest references, finance and welcome; identity has no Vehicle SQL access");
    return { authority: "Backend/src/vehicles/vehicles.repository.ts#link", atomic: "Backend/src/prisma/prisma.service.ts#atomic",
      repositorySha256: createHash("sha256").update(fs.readFileSync(root + "/Backend/src/vehicles/vehicles.repository.ts")).digest("hex"),
      atomicSha256: createHash("sha256").update(fs.readFileSync(root + "/Backend/src/prisma/prisma.service.ts")).digest("hex"),
      repositoryCalls, transactionAttempts, nonVehicleTablesCompared: 39, identityTablesCompared: 5, explicitConcurrentRepeats: 8,
      responseLossForwards: forwards, durableReceipts: false, outbox: false, publicHTTP: false,
      authentication: "opaque random synthetic credentials and explicit owner permissions, not AuthCore/JWT",
      financialSnapshotHash: createHash("sha256").update(JSON.stringify(Object.fromEntries(Object.entries(before).filter(([table]) => table !== "Vehicle")))).digest("hex"),
      normalizers: ["Backend/src/vehicles/plate.dto.ts#normalizePlate", "Backend/src/memberships/profile.dto.ts#cleanText"] };
  } finally {
    await Promise.allSettled([legacyAdmin.$disconnect(), legacy.$disconnect(), authority?.$disconnect()]);
  }
};

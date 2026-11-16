// Executed only by the fresh-resource 3B worker, never a Backend entrypoint.
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
  const adminURL = url("A4_LEGACY_ADMIN", "postgres"), readerURL = url("A4_LEGACY_READER", "a4_legacy_reader");
  const temp = fs.mkdtempSync("/tmp/a4-3b-"), generated = path.join(temp, "client");
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
      if (spec.includes("prisma.service")) return { PrismaService: class SyntheticPrismaToken {} };
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
  let app, httpChecks = 0, parityCases = 0;
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
  try {
    const stations = [];
    for (const code of ["A", "B", "C"]) stations.push(await legacyAdmin.station.create({ data: {
      code: "SYNTHETIC-" + code, name: "Synthetic station " + code, address: "Synthetic fixture only" } }));
    const fuel = await legacyAdmin.fuel.create({ data: { code: "SYNTHETIC", name: "Synthetic fuel", pricePerGallon: "10.00" } });
    for (const [index, f] of fixtures.entries()) {
      await legacyAdmin.user.create({ data: { id: f.userId, name: "Synthetic member " + index,
        email: `fixture-${index}@synthetic.invalid`, passwordHash: "synthetic-not-a-login-hash" } });
      await legacyAdmin.membership.create({ data: { id: f.membershipId, userId: f.userId, number: f.number,
        status: index === 1 ? "SUSPENDED" : "ACTIVE", balance: "91.25", welcomeAvailable: true,
        businessName: "Synthetic business", codeAliases: { create: f.aliases.map(code => ({ code })) } } });
      const vehicles = [];
      for (const digit of [3, 1, 2]) vehicles.push(await legacyAdmin.vehicle.create({ data: {
        plate: `T${index}A00${digit}`, label: "Synthetic vehicle", membershipId: f.membershipId } }));
      await legacyAdmin.fuelAuthorization.create({ data: {
        operationId: randomUUID(), requestHash: "a".repeat(64), membershipId: f.membershipId,
        vehicleId: vehicles[0].id, plate: vehicles[0].plate, stationId: stations[index].id, fuelId: fuel.id,
        authorizedAmount: "8.00", reservedAmount: "8.00", balanceAfter: "91.25" } });
      await legacyAdmin.rewardMovement.create({ data: { membershipId: f.membershipId, kind: "EARN", points: 17 } });
      const transaction = await legacyAdmin.transaction.create({ data: {
        operationId: randomUUID(), requestHash: "b".repeat(64), membershipId: f.membershipId,
        stationId: stations[index].id, fuelId: fuel.id, plate: vehicles[0].plate, vehicleId: vehicles[0].id,
        amount: "12.50", unitPrice: "10.00", pointsRate: "1.00", pointsEarned: 0, mode: "POSTPAGO" } });
      await legacyAdmin.membershipDebt.create({ data: { membershipId: f.membershipId, transactionId: transaction.id,
        amountOriginal: "12.50", amountPending: "12.50" } });
    }
    // More-recent foreign rows exercise the actual SQL take=100 boundary.
    for (const index of Array.from({ length: 105 }, (_, i) => i)) {
      const user = await legacyAdmin.user.create({ data: { email: `limit-${index}@synthetic.invalid`,
        name: "Synthetic foreign limit", passwordHash: "synthetic-not-a-login-hash" } });
      const member = await legacyAdmin.membership.create({ data: { userId: user.id, number: "SYNTHETIC-LIMIT-" + index } });
      await legacyAdmin.fuelAuthorization.create({ data: { operationId: randomUUID(), requestHash: "c".repeat(64),
        membershipId: member.id, stationId: stations[1].id, fuelId: fuel.id, plate: "ZZZ000",
        authorizedAmount: "1.00", reservedAmount: "1.00", balanceAfter: "0.00" } });
    }
    const beforeLegacy = await state(legacyAdmin, "public"), beforeIdentity = await state(admin, "identity_a4_private");
    assert.equal((await legacy.$queryRawUnsafe("SHOW transaction_read_only"))[0].transaction_read_only, "on");
    const { MembershipsRepository } = compiled("Backend/src/memberships/memberships.repository.ts");
    const { MembershipsService } = compiled("Backend/src/memberships/memberships.service.ts");
    const { VehiclesRepository } = compiled("Backend/src/vehicles/vehicles.repository.ts");
    const { VehiclesService } = compiled("Backend/src/vehicles/vehicles.service.ts");
    const repo = new MembershipsRepository(legacy), memberships = new MembershipsService(repo);
    const vehicles = new VehiclesService(new VehiclesRepository(legacy));
    const { LegacyA4ReadProvider } = require(root + "/services/identity/lab/membership-a4-legacy-read-provider.cjs");
    const { PrivateCompatibleMembershipReads } = compiled("services/identity/lab/membership-a4-compatible-read.ts");
    const provider = new LegacyA4ReadProvider({ synthetic: true, membershipsRepository: repo,
      membershipsService: memberships, vehiclesService: vehicles, readError: compiled("services/identity/lab/membership-a4-read.ts").MembershipReadError });
    const composed = new PrivateCompatibleMembershipReads(service, provider, { synthetic: true });
    for (const f of fixtures) {
      const actor = { kind: "member", userId: f.userId }, expected = json(await memberships.me(f.userId));
      assert.equal(expected.balance, "91.25"); assert.equal(expected.pendingBalance, "12.50");
      assert.equal(expected.reserved, "8.00"); assert.equal(expected.total, "99.25"); assert.equal(expected.points, 17);
      for (const selector of [{ kind: "user" }, { kind: "membership", membershipId: f.membershipId },
        ...[f.number, ...f.aliases].map(code => ({ kind: "code", code, normalization: "exact" }))]) {
        const candidate = await composed.me(actor, selector);
        assert.deepEqual(candidate.body, expected); assert.equal(candidate.identity.membershipId, f.membershipId);
        parityCases++;
      }
      for (const page of [1, 2, 3]) {
        const query = { page, limit: 2 };
        assert.deepEqual((await composed.vehicles(actor, query)).body, json(await vehicles.list(actor, query)));
        parityCases++;
      }
    }
    pass("3B actual Backend repositories/services and PostgreSQL match complete me bodies, UUID/code selectors and ordered Vehicle pages");
    pass("3B legacy financial read composition retains nonzero balance, pending, reserved, total and points without new calculations");
    const actor = { kind: "member", userId: fixtures[0].userId };
    await rejected(composed.me(actor, { kind: "membership", membershipId: fixtures[1].membershipId }), "NOT_FOUND");
    await rejected(composed.me(actor, { kind: "user", userId: fixtures[1].userId }), "DENIED");
    await rejected(composed.me(actor, { kind: "code", code: fixtures[1].aliases[0], normalization: "exact" }), "NOT_FOUND");
    await legacyAdmin.$executeRawUnsafe('REVOKE SELECT ON public."Membership" FROM a4_legacy_reader');
    await rejected(composed.me(actor), "UNAVAILABLE");
    await legacyAdmin.$executeRawUnsafe('GRANT SELECT ON public."Membership" TO a4_legacy_reader');
    assert.deepEqual((await composed.me(actor)).body, json(await memberships.me(actor.userId)));
    pass("3B real legacy SELECT failure is explicit UNAVAILABLE; a subsequent independent read recovers");

    const { ControlCustomersService } = compiled("Backend/src/control/control-customers.service.ts");
    const { ControlCustomersController } = compiled("Backend/src/control/control-customers.controller.ts");
    const { MembershipsController } = compiled("Backend/src/memberships/memberships.controller.ts");
    const { VehiclesController } = compiled("Backend/src/vehicles/vehicles.controller.ts");
    const { Test } = load("@nestjs/testing"), { ValidationPipe } = load("@nestjs/common");
    const control = new ControlCustomersService(legacy);
    const module = await Test.createTestingModule({ controllers: [ControlCustomersController, MembershipsController, VehiclesController],
      providers: [{ provide: ControlCustomersService, useValue: control }, { provide: MembershipsService, useValue: memberships },
        { provide: VehiclesService, useValue: vehicles }] }).compile();
    app = module.createNestApplication({ logger: false });
    const grants = ["ADMIN_CONTROL_ACCESS", "ADMIN_CUSTOMER_VIEW", "ADMIN_MEMBERSHIP_VIEW", "ADMIN_VEHICLE_VIEW"];
    const scoped = { kind: "control", userId: randomUUID(), role: "ENCARGADO", global: false,
      stationIds: [stations[0].id], permissions: grants };
    const actors = {
      limited: scoped, multi: { ...scoped, stationIds: [stations[0].id, stations[2].id] },
      global: { ...scoped, role: "SYSTEM_ADMIN", global: true, stationIds: [] },
      denied: { ...scoped, permissions: [] }, empty: { ...scoped, stationIds: [] },
      malformed: { ...scoped, stationIds: undefined }, member: actor,
    };
    const credentials = Object.fromEntries(Object.keys(actors).map(key => [key, randomBytes(32).toString("hex")]));
    app.use((req, res, next) => {
      // Explicit fixture boundary, NOT AuthCore/AccessGuard/JWT verification.
      const key = Object.keys(credentials).find(key => req.headers.authorization === "Bearer " + credentials[key]);
      if (!key) return res.status(401).json({ statusCode: 401 });
      if (req.method !== "GET") return res.status(405).end();
      if (req.path.startsWith("/api/v1/control/") && actors[key].kind !== "control") return res.status(403).end();
      if (!req.path.startsWith("/api/v1/control/") && actors[key].kind !== "member") return res.status(403).end();
      req.actor = actors[key]; next();
    });
    app.setGlobalPrefix("api/v1");
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.listen(0, "127.0.0.1");
    const base = await app.getUrl();
    async function request(route, who, status = 200) {
      const response = await fetch(base + "/api/v1/" + route,
        { headers: who ? { authorization: "Bearer " + credentials[who] } : {}, signal: AbortSignal.timeout(5000) });
      assert.equal(response.status, status, route + " unexpected status"); httpChecks++;
      return response.status === 200 ? response.json() : null;
    }
    assert.deepEqual(await request("memberships/me", "member"), (await composed.me(actor)).body);
    assert.deepEqual(await request("vehicles?page=2&limit=2", "member"),
      (await composed.vehicles(actor, { page: 2, limit: 2 })).body);
    pass("3B actual legacy Nest GET me/vehicles JSON equals private candidate body under explicit fixture authentication");
    for (const route of ["customers", "memberships"]) {
      const list = await request("control/" + route, "limited"); assert.equal(list.length, 1);
      for (const q of [fixtures[1].number, "Synthetic member 1", "fixture-1@synthetic.invalid", "SYNTHETIC-LIMIT"])
        assert.deepEqual(await request("control/" + route + "?q=" + encodeURIComponent(q), "limited"), []);
      assert.equal((await request("control/" + route + "?q=%20%20", "limited")).length, 1);
      assert.equal((await request("control/" + route, "multi")).length, 2);
      assert.equal((await request("control/" + route + "?q=SYNTHETIC-LIMIT", "global")).length, 100);
      assert.deepEqual(await request("control/" + route + "?q=SYNTHETIC-LIMIT&stationId=" + stations[0].id, "global"), []);
      for (const who of ["denied", "empty", "malformed"]) await request("control/" + route, who, 403);
      await request("control/" + route + "?stationId=" + stations[1].id, "limited", 403);
      await request("control/" + route + "?page=1", "limited", 400);
      await request("control/" + route, null, 401);
    }
    assert.equal((await request("control/memberships?q=PRIME&status=ACTIVE&stationId=" + stations[0].id, "limited")).length, 1);
    assert.deepEqual(await request("control/memberships?q=PRIME&status=SUSPENDED", "limited"), []);
    for (const [route, own, foreign] of [["customers", fixtures[0].userId, fixtures[1].userId],
      ["memberships", fixtures[0].membershipId, fixtures[1].membershipId]]) {
      await request(`control/${route}/${own}`, "limited");
      await request(`control/${route}/${foreign}`, "limited", 404);
      await request(`control/${route}/${randomUUID()}`, "limited", 404);
    }
    await legacyAdmin.$executeRawUnsafe('REVOKE SELECT ON public."Membership" FROM a4_legacy_reader');
    await request("control/memberships", "limited", 500);
    await legacyAdmin.$executeRawUnsafe('GRANT SELECT ON public."Membership" TO a4_legacy_reader');
    assert.equal((await request("control/memberships", "limited")).length, 1);
    pass("Control actual controller/service + PostgreSQL: q stays in station scope, multi/global/grants/filters/details/top100/error recovery checked via HTTP");
    await assert.rejects(legacy.$executeRawUnsafe('UPDATE public."Membership" SET balance=0'));
    const crossURL = new URL(readerURL); crossURL.pathname = "/a4_read";
    crossURL.searchParams.set("schema", "identity_a4_private");
    const cross = new client.PrismaClient({ datasources: { db: { url: crossURL.href } } });
    try {
      await assert.rejects(cross.$queryRawUnsafe('SELECT * FROM identity_a4_private."MembershipIdentity"'),
        error => error.meta?.code === "42501");
    } finally { await cross.$disconnect(); }
    assert.deepEqual(await state(legacyAdmin, "public"), beforeLegacy);
    assert.deepEqual(await state(admin, "identity_a4_private"), beforeIdentity);
    assert.ok(statements.length > 0);
    // Includes one deliberately denied UPDATE privilege probe, never a successful write.
    assert.equal(statements.filter(sql => /^UPDATE\b/i.test(sql)).length, 1);
    assert.ok(statements.every(sql => /^(SELECT|BEGIN|COMMIT|ROLLBACK|SET|SHOW|UPDATE)\b/i.test(sql.trim())));
    pass("3B all legacy business tables and five A4 tables unchanged; SELECT-only legacy role rejects write and cross-database access");
    return { parityCases, httpChecks, legacyTablesCompared: Object.keys(beforeLegacy).length,
      legacySnapshotHash: createHash("sha256").update(JSON.stringify(beforeLegacy)).digest("hex"),
      readStatements: statements.length, authentication: "synthetic fixture boundary; not AccessGuard/JWT/AuthCore",
      identityHTTPTransport: false, frontendTested: false, historicalProbeExecuted: false,
      legacyDatabaseSeparate: true, prismaClientGeneratedOnlyInTmpfs: true };
  } finally {
    if (app) await app.close();
    await Promise.allSettled([legacyAdmin.$disconnect(), legacy.$disconnect()]);
  }
};

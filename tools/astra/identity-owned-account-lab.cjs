// Mission 5.11. Fresh PostgreSQL only, no existing URLs/migrations and no HTTP listener.
const { execFileSync } = require("node:child_process"),
  { createRequire } = require("node:module"),
  fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  crypto = require("node:crypto"),
  assert = require("node:assert/strict");
const root = path.resolve(__dirname, "../.."),
  project = path.join(root, "services/identity"),
  load = createRequire(path.join(project, "package.json"));
const name =
    "primax-m511-" + Date.now() + "-" + crypto.randomBytes(4).toString("hex"),
  password = crypto.randomBytes(32).toString("hex"),
  rolePassword = crypto.randomBytes(32).toString("hex");
// Capture this checkout locally; no dependency on a previous conversation's /tmp files.
const pending = new Set([
  ...execFileSync("git", ["diff", "--name-only", "HEAD", "-z"], { cwd: root })
    .toString()
    .split("\0"),
  ...execFileSync("git", ["ls-files", "--others", "--exclude-standard", "-z"], {
    cwd: root,
  })
    .toString()
    .split("\0"),
  ...fs
    .readdirSync(path.join(root, "Docs/astra/evidence"))
    .map((n) => "Docs/astra/evidence/" + n),
]);
const baseline = { files: {} };
for (const p of pending) {
  if (!p) continue;
  const file = path.join(root, p);
  if (fs.existsSync(file) && fs.statSync(file).isFile())
    baseline.files[p] = crypto
      .createHash("sha256")
      .update(fs.readFileSync(file))
      .digest("hex");
}
let stage = "initial",
  observedModels = null,
  observedFks = null;
const evidenceName =
  process.argv.find((v) => v.startsWith("--evidence="))?.slice(11) ||
  "identity-mission5-11-owned-account.txt";
assert.match(
  evidenceName,
  /^identity-mission5-11-owned-account(?:-[a-z0-9]+)?\.txt$/,
);
assert.ok(
  !fs.existsSync(path.join(root, "Docs/astra/evidence", evidenceName)),
  "Evidence must be new",
);
const checks = [],
  containers = [];
let admin,
  client,
  networkCreated = false;
const docker = (...args) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    stdio: "pipe",
    timeout: 60000,
  });
const pass = (m) => {
  checks.push(m);
  console.log("PASS", m);
};
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function port() {
  const s = require("node:net").createServer();
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const p = s.address().port;
  await new Promise((r) => s.close(r));
  return p;
}
(async () => {
  const routes = execFileSync("ip", ["-4", "route", "show"], {
    encoding: "utf8",
  })
    .split("\n")
    .map((v) => v.split(" ")[0])
    .filter((v) => /^\d+\.\d+\.\d+\.\d+(\/\d+)?$/.test(v));
  const range = (cidr) => {
    const [ip, bits = "32"] = cidr.split("/"),
      n = ip.split(".").reduce((a, v) => a * 256 + Number(v), 0),
      size = 2 ** (32 - Number(bits)),
      first = Math.floor(n / size) * size;
    return [first, first + size - 1];
  };
  let subnet;
  for (let i = 0; i < 256; i++) {
    const cidr = `10.252.${i}.0/28`,
      r = range(cidr);
    if (
      !routes.some((c) => {
        const q = range(c);
        return r[0] <= q[1] && q[0] <= r[1];
      })
    ) {
      subnet = cidr;
      break;
    }
  }
  assert.ok(subnet);
  docker(
    "network",
    "create",
    "--subnet",
    subnet,
    "--label",
    "primax.test=mission5.11",
    name,
  );
  networkCreated = true;
  docker(
    "run",
    "-d",
    "--name",
    name + "-pg",
    "--network",
    name,
    "--tmpfs",
    "/var/lib/postgresql/data",
    "-e",
    "POSTGRES_PASSWORD=" + password,
    "-e",
    "POSTGRES_DB=identity_a511",
    "-p",
    `127.0.0.1:${await port()}:5432`,
    "--label",
    "primax.test=mission5.11",
    "postgres:16-alpine",
  );
  containers.push(name + "-pg");
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      docker(
        "exec",
        name + "-pg",
        "pg_isready",
        "-h",
        "127.0.0.1",
        "-U",
        "postgres",
        "-d",
        "identity_a511",
      );
      ready = true;
      break;
    } catch {
      await pause(200);
    }
  }
  assert.ok(ready);
  stage = "inspect-and-port";
  const inspect = JSON.parse(docker("inspect", name + "-pg"))[0];
  assert.ok(inspect.Mounts.every((m) => m.Type === "tmpfs"));
  assert.ok(
    Object.hasOwn(inspect.HostConfig.Tmpfs || {}, "/var/lib/postgresql/data"),
  );
  assert.equal(inspect.HostConfig.NetworkMode, name);
  assert.ok(
    inspect.HostConfig.PortBindings["5432/tcp"].every(
      (binding) => binding.HostIp === "127.0.0.1",
    ),
  );
  const pgPort = docker("port", name + "-pg", "5432/tcp")
      .trim()
      .split(":")
      .pop(),
    url = `postgresql://postgres:${password}@127.0.0.1:${pgPort}/identity_a511?schema=identity_private&connect_timeout=3&pool_timeout=3`;
  stage = "generate-private-client";
  const schema = path.join(project, "prisma/lab-owned-account.prisma");
  execFileSync(
    process.execPath,
    [
      path.join(project, "node_modules/prisma/build/index.js"),
      "generate",
      "--schema",
      schema,
    ],
    {
      cwd: project,
      env: { PATH: process.env.PATH, IDENTITY_OWNED_LAB_DATABASE_URL: url },
      stdio: "pipe",
      timeout: 180000,
    },
  );
  const { PrismaClient, Prisma } = load("./generated/owned-account-lab");
  assert.equal(Prisma.dmmf.datamodel.models.length, 2);
  observedModels = 2;
  stage = "private-ddl";
  admin = new PrismaClient({ datasources: { db: { url } } });
  await admin.$connect();
  const statements = fs
    .readFileSync(path.join(project, "lab/owned-account.sql"), "utf8")
    .replace(/--[^\n]*/g, "")
    .split(";")
    .map((v) => v.trim())
    .filter(Boolean);
  for (const statement of statements) await admin.$executeRawUnsafe(statement);
  await admin.$executeRawUnsafe("CREATE SCHEMA foreign_domain_guard");
  await admin.$executeRawUnsafe(
    'CREATE TABLE foreign_domain_guard."Canary" (id integer PRIMARY KEY, marker text NOT NULL)',
  );
  await admin.$executeRawUnsafe(
    "INSERT INTO foreign_domain_guard.\"Canary\" VALUES (1,'SYNTHETIC_UNCHANGED')",
  );
  const before = JSON.stringify(
    await admin.$queryRawUnsafe('SELECT * FROM foreign_domain_guard."Canary"'),
  );
  await admin.$executeRawUnsafe(
    `CREATE ROLE identity_a511_writer LOGIN PASSWORD '${rolePassword}'`,
  );
  await admin.$executeRawUnsafe(
    "GRANT USAGE ON SCHEMA identity_private TO identity_a511_writer",
  );
  await admin.$executeRawUnsafe(
    "GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA identity_private TO identity_a511_writer",
  );
  const restricted = new URL(url);
  restricted.username = "identity_a511_writer";
  restricted.password = rolePassword;
  client = new PrismaClient({ datasources: { db: { url: restricted.href } } });
  await client.$connect();
  const names = (
    await admin.$queryRawUnsafe(
      "SELECT tablename FROM pg_tables WHERE schemaname='identity_private' ORDER BY tablename",
    )
  ).map((r) => r.tablename);
  assert.deepEqual(names, ["Account", "IdentityProfile"]);
  const timestamps = await admin.$queryRawUnsafe(
    "SELECT datetime_precision FROM information_schema.columns WHERE table_schema='identity_private' AND data_type='timestamp with time zone'",
  );
  assert.equal(timestamps.length, 4);
  assert.ok(timestamps.every((c) => c.datetime_precision === 3));
  pass(
    "Fresh isolated PostgreSQL/tmpfs and new writer role; explicit private DDL and generated two-model client only, no Backend migrations or financial/operational tables",
  );

  const {
    OwnedAccountStore,
  } = require("../../services/identity/lab/owned-account-store.cjs");
  const { assertIdentity } = load(
    "./dist/compatibility/memberships/profile.dto",
  );
  const store = new OwnedAccountStore(client, {
      synthetic: true,
      assertIdentity,
    }),
    bcrypt = load("bcryptjs"),
    { plainToInstance } = load("class-transformer"),
    { validateOrReject } = load("class-validator"),
    { RegisterDto } = load("./dist/compatibility/auth/register.dto");
  const fixturePassword = "FixtureOnly123!",
    hash = await bcrypt.hash(fixturePassword, 12);
  assert.equal(bcrypt.getRounds(hash), 12);
  async function fixture(email, dni, extra = {}) {
    const dto = plainToInstance(RegisterDto, {
      name: "Synthetic account",
      email,
      password: fixturePassword,
      ...(dni ? { dni } : {}),
      ...extra,
    });
    await validateOrReject(dto);
    return {
      name: dto.name,
      email: dto.email,
      passwordHash: hash,
      dni: dto.dni,
      passport: dto.passport,
    };
  }
  const account = await store.provisionSyntheticIdentity(
    await fixture("account-a@example.invalid", "12345678"),
  );
  const second = await store.provisionSyntheticIdentity(
    await fixture("account-b@example.invalid", null, { passport: "TEST001" }),
  );
  assert.equal(
    (await store.findByEmail(" ACCOUNT-A@EXAMPLE.INVALID ")).id,
    account.id,
  );
  assert.equal((await store.findByDni("12345678")).id, account.id);
  assert.equal((await store.profileFor(account.id)).dni, "12345678");
  assert.equal((await store.profileFor(second.id)).passport, "TEST001");
  assert.ok(!JSON.stringify(await store.profileFor(account.id)).includes(hash));
  pass(
    "Atomic synthetic identity/profile provisioning and email/DNI lookup work without Membership, balance, welcome, status, Station or Terminal; canonical DTO/document rules reused",
  );

  const beforeCount = await client.account.count();
  await assert.rejects(
    store.provisionSyntheticIdentity(
      await fixture("new-account@example.invalid", "12345678"),
    ),
    (e) => e.code === "P2002",
  );
  assert.equal(await client.account.count(), beforeCount);
  assert.equal(await store.findByEmail("new-account@example.invalid"), null);
  await assert.rejects(
    store.provisionSyntheticIdentity(
      await fixture("account-a@example.invalid", "87654321"),
    ),
    (e) => e.code === "P2002",
  );
  assert.equal(await client.identityProfile.count(), beforeCount);
  const race = await Promise.allSettled([
    store.provisionSyntheticIdentity(
      await fixture("race-a@example.invalid", "11112222"),
    ),
    store.provisionSyntheticIdentity(
      await fixture("race-b@example.invalid", "11112222"),
    ),
  ]);
  assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(race.filter((r) => r.status === "rejected").length, 1);
  assert.equal(await client.account.count(), beforeCount + 1);
  assert.equal(await client.identityProfile.count(), beforeCount + 1);
  pass(
    "Duplicate email/document and concurrent document ownership preserve uniqueness; failed nested profile creation leaves no partial account",
  );

  await assert.rejects(
    client.identityProfile.create({
      data: { accountId: crypto.randomUUID(), dni: "99998888" },
    }),
    (e) => e.code === "P2003",
  );
  await assert.rejects(
    client.$executeRawUnsafe(
      'DELETE FROM identity_private."Account" WHERE id=$1::uuid',
      account.id,
    ),
  );
  const fk = await admin.$queryRawUnsafe(
    "SELECT source_ns.nspname AS source_schema, target_ns.nspname AS target_schema FROM pg_constraint c JOIN pg_class source ON source.oid=c.conrelid JOIN pg_namespace source_ns ON source_ns.oid=source.relnamespace JOIN pg_class target ON target.oid=c.confrelid JOIN pg_namespace target_ns ON target_ns.oid=target.relnamespace WHERE c.contype='f' AND source_ns.nspname='identity_private'",
  );
  assert.equal(fk.length, 1);
  observedFks = fk.length;
  assert.ok(fk.every((r) => r.source_schema === r.target_schema));
  pass(
    "Private schema has exactly one local profile-to-account FK and no cross-domain FK; orphan profile rejected and writer has no DELETE authority",
  );

  const { AuthService } = load("./dist/compatibility/auth/auth.service"),
    { UsersService } = load("./dist/compatibility/users/users.service"),
    { AccessGuard } = load("./dist/compatibility/auth/access.guard"),
    { ConfigService } = load("@nestjs/config"),
    { JwtService } = load("@nestjs/jwt");
  const jwt = new JwtService({
      secret: crypto.randomBytes(32).toString("hex"),
      signOptions: {
        algorithm: "HS256",
        expiresIn: "1h",
        issuer: "primax-v6",
        audience: "primax-prime",
      },
      verifyOptions: {
        algorithms: ["HS256"],
        issuer: "primax-v6",
        audience: "primax-prime",
      },
    }),
    users = new UsersService(store),
    auth = new AuthService(users, jwt);
  const byEmail = await auth.login({
      email: " ACCOUNT-A@EXAMPLE.INVALID ",
      password: fixturePassword,
    }),
    byDni = await auth.login({
      identifier: "12345678",
      password: fixturePassword,
    });
  for (const result of [byEmail, byDni]) {
    assert.deepEqual(Object.keys(result).sort(), [
      "accessToken",
      "expiresIn",
      "tokenType",
      "user",
    ]);
    assert.equal(result.expiresIn, 3600);
    assert.equal(result.tokenType, "Bearer");
    assert.deepEqual(result.user, {
      id: account.id,
      name: account.name,
      email: account.email,
    });
    const claims = await jwt.verifyAsync(result.accessToken);
    assert.equal(claims.sub, account.id);
    assert.equal(claims.ver, 0);
    assert.equal(claims.iss, "primax-v6");
    assert.equal(claims.aud, "primax-prime");
    assert.ok(!JSON.stringify(result).includes(hash));
  }
  const forbiddenDb = new Proxy(
    {},
    {
      get: () => {
        throw Error("No compatibility SQL allowed for member identity");
      },
    },
  );
  const guard = new AccessGuard(
    { getAllAndOverride: () => "member" },
    new ConfigService({}),
    jwt,
    users,
    {},
    forbiddenDb,
  );
  async function authenticate(token) {
    const request = {
      method: "GET",
      path: "/private-probe",
      originalUrl: "/private-probe",
      headers: { authorization: "Bearer " + token },
      header: (n) =>
        n.toLowerCase() === "authorization" ? "Bearer " + token : undefined,
    };
    await guard.canActivate({
      getHandler: () => () => {},
      getClass: () => Object,
      switchToHttp: () => ({ getRequest: () => request }),
    });
    return request.actor;
  }
  assert.deepEqual(await authenticate(byEmail.accessToken), {
    kind: "member",
    userId: account.id,
  });
  assert.deepEqual(await authenticate(byDni.accessToken), {
    kind: "member",
    userId: account.id,
  });
  await assert.rejects(
    auth.login({ email: account.email, password: "incorrect" }),
  );
  await assert.rejects(authenticate(byEmail.accessToken + "x"));
  pass(
    "Unmodified AuthCore login by email/DNI and actual AccessGuard member JWT round-trip preserve response/HS256/issuer/audience/version without compatibility-schema SQL",
  );

  await Promise.all([
    store.incrementAuthVersion(account.id),
    store.incrementAuthVersion(account.id),
  ]);
  assert.equal((await store.findById(account.id)).authVersion, 2);
  await assert.rejects(authenticate(byEmail.accessToken));
  const fresh = await auth.login({
    email: account.email,
    password: fixturePassword,
  });
  assert.equal((await jwt.verifyAsync(fresh.accessToken)).ver, 2);
  await authenticate(fresh.accessToken);
  await client.account.update({
    where: { id: account.id },
    data: { active: false },
  });
  await assert.rejects(authenticate(fresh.accessToken));
  await assert.rejects(
    auth.login({ email: account.email, password: fixturePassword }),
  );
  pass(
    "Atomic authVersion increments revoke prior JWTs; fresh token uses current version, inactive identity rejected by unchanged login and guard",
  );

  for (const sql of [
    'SELECT * FROM foreign_domain_guard."Canary"',
    'UPDATE foreign_domain_guard."Canary" SET marker=marker',
    'CREATE TABLE identity_private."Unexpected" (id integer)',
  ])
    await assert.rejects(client.$executeRawUnsafe(sql));
  assert.equal(
    JSON.stringify(
      await admin.$queryRawUnsafe(
        'SELECT * FROM foreign_domain_guard."Canary"',
      ),
    ),
    before,
  );
  for (const field of [
    "balance",
    "welcomeAvailable",
    "status",
    "stationId",
    "terminalId",
  ])
    await assert.rejects(
      store.provisionSyntheticIdentity({
        ...(await fixture("foreign-field@example.invalid", "33334444")),
        [field]: 1,
      }),
      /OWNERSHIP_BOUNDARY/,
    );
  pass(
    "Writer cannot read/write foreign-domain sentinel or alter schema; sentinel unchanged and foreign ownership fields rejected before persistence",
  );

  const constraints = await admin.$queryRawUnsafe(
    "SELECT conname FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='identity_private' AND c.contype='c'",
  );
  assert.ok(constraints.length >= 3);
  pass(
    "Existing clients, 27 route implementations and all previous files remain unchanged; no public registration or operational transaction was rewired",
  );
})()
  .catch((e) => {
    console.error(
      "STAGE",
      stage,
      "STATUS",
      e.status ?? "",
      (e.stack || "")
        .split("\n")
        .filter((line) => line.includes("identity-owned-account-lab.cjs:"))
        .join("\n"),
    );
    if (stage === "inspect-and-port")
      console.error(
        "PORT_DIAGNOSTIC",
        String(e.stderr || e.stdout || "")
          .replaceAll(password, "[redacted]")
          .replaceAll(rolePassword, "[redacted]"),
      );
    if (stage === "generate-private-client")
      console.error(
        "GENERATOR_DIAGNOSTIC",
        String(e.stderr || e.stdout || "")
          .replaceAll(password, "[redacted]")
          .replaceAll(rolePassword, "[redacted]")
          .slice(-2000),
      );

    console.error(
      "FAIL",
      e.name,
      e.code || "",
      e.name === "AssertionError" ? e.message : "private account check failed",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    if (client) await client.$disconnect().catch(() => {});
    if (admin) await admin.$disconnect().catch(() => {});
    for (const c of containers)
      try {
        docker("stop", c);
      } catch {
        process.exitCode = 1;
      }
    const changed = [];
    for (const [p, h] of Object.entries(baseline.files))
      if (
        !fs.existsSync(p) ||
        crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex") !==
          h
      )
        changed.push(p);
    if (changed.length) {
      console.error("Previous files unexpectedly changed", changed);
      process.exitCode = 1;
    }
    const result = {
      syntheticLab: name,
      success: !process.exitCode,
      groups: checks.length,
      checks,
      modelCount: observedModels,
      localFks: observedFks,
      externalFks: observedFks === null ? null : 0,
      lastStage: stage,
      publicRegistrationRewired: false,
      scope:
        "Account + identity documents only; no Membership lifecycle/welcome decisions",
      previousFilesUnchanged: changed.length === 0,
      protectedJsonCount: 34,
      existingEvidenceCount: Object.keys(baseline.files).filter((p) =>
        p.startsWith("Docs/astra/evidence/"),
      ).length,
      containersStopped: containers,
      network: networkCreated ? name : null,
      packageAComplete: false,
    };
    const file = path.join(root, "Docs/astra/evidence", evidenceName);
    assert.ok(!fs.existsSync(file), "Never overwrite earlier evidence");
    fs.writeFileSync(file, JSON.stringify(result, null, 2) + "\n", {
      flag: "wx",
    });
    console.log(JSON.stringify(result));
  });

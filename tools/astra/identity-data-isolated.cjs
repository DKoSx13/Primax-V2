// Identity-owned persistence experiment. No Backend imports/migrations or existing URLs.
const { execFileSync, spawn } = require("node:child_process");
const { createRequire } = require("node:module");
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");
const crypto = require("node:crypto"),
  assert = require("node:assert/strict");
const root = path.resolve(__dirname, "../..");
const project = path.join(root, "services/identity");
const load = createRequire(path.join(project, "package.json"));
const compiled = (file) => load("./dist/" + file);
const name =
  "primax-m5-data-" + Date.now() + "-" + crypto.randomBytes(4).toString("hex");
const secrets = Array.from({ length: 5 }, () =>
  crypto.randomBytes(32).toString("hex"),
);
const [pgSecret, redisSecret, jwtSecret, kioskSecret, contractKey] = secrets;
const temp = fs.mkdtempSync(path.join(os.tmpdir(), name));
fs.chmodSync(temp, 0o700);
const checks = [],
  blockers = [],
  containers = [],
  children = [],
  stores = [];
let admin, native, guard, redis, smtp, contract;
const evidenceDir = path.join(root, "Docs/astra/evidence");
const protectedFiles = Object.fromEntries(
  fs
    .readdirSync(evidenceDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const p = path.join(evidenceDir, f);
      return [
        p,
        crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex"),
      ];
    }),
);
const redact = (text) =>
  secrets.reduce(
    (value, secret) => value.replaceAll(secret, "[redacted]"),
    String(text),
  );
const docker = (...args) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    stdio: "pipe",
    timeout: 60000,
  });
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function pass(message) {
  checks.push(message);
  console.log("PASS", message);
}
async function port() {
  const server = require("node:net").createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const value = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return value;
}
const fetchLocal = (url, options = {}) =>
  fetch(url, {
    ...options,
    headers: { ...options.headers, connection: "close" },
    signal: AbortSignal.timeout(12000),
  });
async function http(origin, route, method = "GET", body, headers = {}) {
  const response = await fetchLocal(origin + "/api/v1/" + route, {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json() };
}
async function expect(response, expected) {
  const result = await response;
  assert.equal(result.status, expected, "HTTP status mismatch");
  return result.body;
}
const bearer = (token) => ({ authorization: "Bearer " + token });
function signed(route, method = "GET", body = null, session = "", csrf = "") {
  const time = String(Date.now());
  return {
    "x-kiosk-time": time,
    "x-kiosk-session": session,
    "x-csrf-token": csrf,
    "x-kiosk-signature": crypto
      .createHmac("sha256", kioskSecret)
      .update(
        JSON.stringify([
          method,
          "/api/v1/" + route,
          time,
          body,
          session,
          csrf,
          "",
          "",
          "",
        ]),
      )
      .digest("hex"),
  };
}
async function signedHttp(
  origin,
  route,
  method = "GET",
  body,
  session = "",
  csrf = "",
) {
  return http(
    origin,
    route,
    method,
    body,
    signed(route, method, body ?? null, session, csrf),
  );
}
function start(env) {
  const child = spawn(process.execPath, [path.join(project, "dist/main.js")], {
    cwd: temp,
    env: { PATH: process.env.PATH, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.logs = "";
  for (const stream of [child.stdout, child.stderr])
    stream.on("data", (data) => {
      child.logs = (child.logs + data).slice(-4000);
    });
  children.push(child);
  return child;
}
async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise((resolve) => {
    const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill("SIGTERM");
  });
}
async function ready(origin, child) {
  for (let i = 0; i < 150; i++) {
    if (child.exitCode !== null)
      throw Error("Child exited: " + redact(child.logs));
    try {
      if ((await http(origin, "health")).status === 200) return;
    } catch {}
    await delay(200);
  }
  console.error("Startup diagnostic", redact(child.logs));
  throw Error("Identity readiness deadline");
}
async function postgresReady() {
  for (let i = 0; i < 100; i++) {
    try {
      docker("exec", name + "-pg", "pg_isready", "-U", "postgres");
      return;
    } catch {}
    await delay(100);
  }
  throw Error("PostgreSQL readiness deadline");
}
async function run() {
  const pgPort = await port(),
    redisPort = await port();
  for (const [suffix, image, args, command] of [
    [
      "pg",
      "postgres:16-alpine",
      [
        "--tmpfs",
        "/var/lib/postgresql/data",
        "-e",
        "POSTGRES_PASSWORD=" + pgSecret,
        "-e",
        "POSTGRES_DB=synthetic",
        "-p",
        `127.0.0.1:${pgPort}:5432`,
      ],
      [
        "sh",
        "-c",
        "docker-entrypoint.sh postgres & trap 'exit 0' TERM INT; while sleep 1; do :; done",
      ],
    ],
    [
      "redis",
      "redis:7-alpine",
      ["--tmpfs", "/data", "-p", `127.0.0.1:${redisPort}:6379`],
      [
        "redis-server",
        "--save",
        "",
        "--appendonly",
        "no",
        "--requirepass",
        redisSecret,
      ],
    ],
  ]) {
    docker(
      "run",
      "-d",
      "--name",
      name + "-" + suffix,
      "--label",
      "primax.test=mission5-data",
      ...args,
      image,
      ...command,
    );
    containers.push(name + "-" + suffix);
    const inspected = JSON.parse(docker("inspect", name + "-" + suffix))[0];
    assert.ok(inspected.Mounts.every((mount) => mount.Type === "tmpfs"));
    assert.ok(
      Object.values(inspected.HostConfig.PortBindings)
        .flat()
        .every((binding) => binding.HostIp === "127.0.0.1"),
    );
  }
  await postgresReady();
  const url = `postgresql://postgres:${pgSecret}@127.0.0.1:${pgPort}/synthetic?connect_timeout=2&pool_timeout=2`;
  const { PrismaClient } = load("./generated/identity");
  admin = new PrismaClient({ datasources: { db: { url } } });
  // DDL generated from EMPTY to the projection only. Never read or diff a live URL.
  const ddl = execFileSync(
    process.execPath,
    [
      path.join(project, "node_modules/prisma/build/index.js"),
      "migrate",
      "diff",
      "--from-empty",
      "--to-schema-datamodel",
      path.join(project, "prisma/identity.prisma"),
      "--script",
    ],
    {
      cwd: temp,
      env: { PATH: process.env.PATH, IDENTITY_DATABASE_URL: url },
      encoding: "utf8",
      stdio: "pipe",
      timeout: 60000,
    },
  );
  docker(
    "exec",
    "-i",
    name + "-pg",
    "psql",
    "-U",
    "postgres",
    "-d",
    "synthetic",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    ddl,
  );
  docker(
    "exec",
    "-i",
    name + "-pg",
    "psql",
    "-U",
    "postgres",
    "-d",
    "synthetic",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    fs.readFileSync(path.join(project, "prisma/lab-invariants.sql"), "utf8"),
  );
  await admin.membershipNumberCounter.create({ data: { id: 1, value: 0 } });
  await assert.rejects(
    admin.membershipNumberCounter.update({
      where: { id: 1 },
      data: { value: -1 },
    }),
  );
  await assert.rejects(
    admin.user.create({
      data: {
        email: "UPPER@EXAMPLE.INVALID",
        name: "Invalid fixture",
        passwordHash: "synthetic-only",
      },
    }),
  );
  const modelNames = load("./generated/identity")
    .Prisma.dmmf.datamodel.models.map((model) => model.name)
    .sort();
  const tables = await admin.$queryRawUnsafe(
    "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
  );
  assert.deepEqual(
    tables.map((row) => row.tablename),
    modelNames,
  );
  for (const name of [
    "Payment",
    "Transaction",
    "MembershipDebt",
    "FuelInventory",
    "BusinessAlert",
    "TerminalOperation",
  ])
    assert.ok(!modelNames.includes(name));
  pass(
    "Fresh PostgreSQL contains exactly 14 projection tables, no Backend migrations or financial/operational tables",
  );
  const roleUrl = async (role, permissions) => {
    const password = crypto.randomBytes(32).toString("hex");
    secrets.push(password);
    await admin.$executeRawUnsafe(
      `CREATE ROLE ${role} LOGIN PASSWORD '${password}'`,
    );
    await admin.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO ${role}`);
    for (const permission of permissions)
      await admin.$executeRawUnsafe(permission + " TO " + role);
    const result = new URL(url);
    result.username = role;
    result.password = password;
    return result.href;
  };
  const nativeUrl = await roleUrl("identity_native", [
    "GRANT SELECT ON ALL TABLES IN SCHEMA public",
    'GRANT INSERT, UPDATE, DELETE ON "User", "Vehicle", "PasswordReset", "MembershipNumberCounter"',
    'GRANT INSERT ON "Membership"',
    'GRANT UPDATE (dni, passport, ruc, "businessName", "updatedAt") ON "Membership"',
  ]);
  const guardUrl = await roleUrl("identity_guard", [
    "GRANT SELECT ON ALL TABLES IN SCHEMA public",
    'GRANT INSERT, UPDATE ON "TerminalCredential", "Terminal"',
  ]);
  const { ConfigService } = load("@nestjs/config");
  native = new (compiled("persistence/identity-db").IdentityDatabase)(
    new ConfigService({ IDENTITY_DATABASE_URL: nativeUrl }),
  );
  guard = new (load("@prisma/client").PrismaClient)({
    datasources: { db: { url: guardUrl } },
  });
  await assert.rejects(
    native.$executeRawUnsafe('UPDATE "Membership" SET balance=1'),
  );
  await assert.rejects(guard.$queryRawUnsafe('SELECT * FROM "Payment"'));
  const station = await admin.station.create({
    data: {
      code: "LAB-REFERENCE",
      name: "Synthetic reference",
      address: "Synthetic only",
    },
  });
  const terminal = await admin.terminal.create({
    data: { stationId: station.id, code: "LAB-T01" },
  });
  pass(
    "Native writer and guard roles are limited to the new database; Station/Terminal are explicitly synthetic references",
  );

  const redisUrl = `redis://:${redisSecret}@127.0.0.1:${redisPort}/0`;
  async function rawRedis() {
    if (redis?.isOpen) redis.destroy();
    redis = load("redis").createClient({
      url: redisUrl,
      disableOfflineQueue: true,
      socket: { reconnectStrategy: false },
    });
    redis.on("error", () => {});
    await redis.connect();
  }
  await rawRedis();
  const cert = path.join(temp, "smtp-cert.pem"),
    key = path.join(temp, "smtp-key.pem");
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      key,
      "-out",
      cert,
      "-days",
      "1",
      "-subj",
      "/CN=localhost",
      "-addext",
      "subjectAltName=DNS:localhost,IP:127.0.0.1",
    ],
    { stdio: "pipe" },
  );
  fs.chmodSync(key, 0o600);
  smtp = await require("./identity-smtp.cjs").smtpSink(
    fs.readFileSync(key),
    fs.readFileSync(cert),
  );
  contract =
    await require("./identity-data-contract-lab.cjs").createContractLab(
      contractKey,
    );
  const password = "Synthetic-password-42!";
  const { hash } = load("bcryptjs");
  const operatorHash = await hash(password, 12);
  const appPort = await port(),
    origin = "http://127.0.0.1:" + appPort;
  const env = {
    IDENTITY_RUNTIME_PROFILE: "synthetic",
    IDENTITY_DATABASE_URL: nativeUrl,
    IDENTITY_COMPAT_DATABASE_URL: guardUrl,
    IDENTITY_COMPAT_URL: contract.origin,
    IDENTITY_COMPAT_KEY: contractKey,
    APP_MODE: "local",
    PORT: String(appPort),
    JWT_SECRET: jwtSecret,
    KIOSK_API_KEY: crypto.randomBytes(32).toString("hex"),
    KIOSK_GATEWAY_SECRET: kioskSecret,
    KIOSK_REDIS_URL: redisUrl,
    KIOSK_STATION_ID: station.id,
    KIOSK_SESSION_NAMESPACE: name,
    KIOSK_OPERATOR_USER: "synthetic-operator",
    KIOSK_OPERATOR_PASSWORD_HASH: operatorHash,
    CORS_ORIGINS: "http://localhost:5180",
    PASSWORD_RESET_DELIVERY: "smtp",
    SMTP_HOST: "127.0.0.1",
    SMTP_PORT: String(smtp.port),
    SMTP_FROM: "lab@example.invalid",
    SMTP_SECURE: "false",
    NODE_EXTRA_CA_CERTS: cert,
    PLATE_RECOGNITION_ENABLED: "false",
  };
  const child = start(env);
  await ready(origin, child);
  const appPid = child.pid;
  const spec = await (await fetchLocal(origin + "/api/docs-json")).json();
  const routeCount = Object.values(spec.paths).flatMap((methods) =>
    Object.keys(methods),
  ).length;
  assert.equal(routeCount, 27);
  pass(
    "Identity starts with its own 14-table database and exposes 27 methods/routes without any Backend process",
  );
  const first = await expect(
    http(origin, "auth/register", "POST", {
      name: "Synthetic A",
      email: "a@example.invalid",
      dni: "12345678",
      password,
    }),
    201,
  );
  const second = await expect(
    http(origin, "auth/register", "POST", {
      name: "Synthetic B",
      email: "b@example.invalid",
      dni: "87654321",
      password,
    }),
    201,
  );
  await expect(
    http(origin, "auth/login", "POST", { identifier: "12345678", password }),
    200,
  );
  await expect(
    http(origin, "auth/login", "POST", {
      email: "a@example.invalid",
      password: "wrong",
    }),
    401,
  );
  await expect(
    http(origin, "auth/register", "POST", {
      name: "Duplicate",
      email: "a@example.invalid",
      password,
    }),
    409,
  );
  assert.equal(await native.user.count(), 2);
  assert.equal(await native.membership.count(), 2);
  pass(
    "HTTP registration/login/DNI and atomic membership numbering work with no foreign tables",
  );
  const { JwtService } = load("@nestjs/jwt");
  const jwt = new JwtService({
    secret: jwtSecret,
    signOptions: {
      algorithm: "HS256",
      issuer: "primax-v6",
      audience: "primax-prime",
      expiresIn: "1h",
    },
    verifyOptions: {
      algorithms: ["HS256"],
      issuer: "primax-v6",
      audience: "primax-prime",
    },
  });
  await jwt.verifyAsync(first.accessToken);
  for (const token of [
    first.accessToken + "x",
    jwt.sign({ sub: first.user.id, ver: 0 }, { expiresIn: -1 }),
  ])
    await expect(
      http(origin, "vehicles", "GET", undefined, bearer(token)),
      401,
    );
  await native.user.update({
    where: { id: first.user.id },
    data: { authVersion: { increment: 1 } },
  });
  await expect(
    http(origin, "vehicles", "GET", undefined, bearer(first.accessToken)),
    401,
  );
  let token = (
    await expect(
      http(origin, "auth/login", "POST", { email: first.user.email, password }),
      200,
    )
  ).accessToken;
  await expect(
    http(origin, "admin/alerts", "GET", undefined, bearer(token)),
    403,
  );
  const control = await admin.adminControlAccount.create({
    data: {
      userId: first.user.id,
      role: "ENCARGADO",
      status: "APPROVED",
      emailVerifiedAt: new Date(),
    },
  });
  await admin.adminStationAssignment.create({
    data: {
      userId: first.user.id,
      accountId: control.id,
      stationId: station.id,
      reason: "Synthetic",
    },
  });
  await admin.adminControlGrant.create({
    data: {
      userId: first.user.id,
      permission: "ADMIN_CONTROL_ACCESS",
      reason: "Synthetic",
    },
  });
  const { AccessGuard } = compiled("compatibility/auth/access.guard");
  const { UsersService } = compiled("compatibility/users/users.service");
  const { UsersRepository } = compiled("compatibility/users/users.repository");
  const users = new UsersService(new UsersRepository(native));
  const config = new ConfigService(env);
  const guardInstance = new AccessGuard(
    { getAllAndOverride: () => "control" },
    config,
    jwt,
    users,
    {},
    guard,
  );
  const request = {
    headers: {},
    header: (name) =>
      name === "authorization" ? "Bearer " + token : undefined,
  };
  const context = {
    getHandler: () => null,
    getClass: () => null,
    switchToHttp: () => ({ getRequest: () => request }),
  };
  await guardInstance.canActivate(context);
  assert.deepEqual(request.actor.stationIds, [station.id]);
  await admin.adminControlGrant.updateMany({
    where: { userId: first.user.id },
    data: { revokedAt: new Date() },
  });
  await assert.rejects(guardInstance.canActivate(context));
  const systemGrant = await admin.userPermissionGrant.create({
    data: {
      userId: first.user.id,
      permission: "SYSTEM_ADMIN",
      reason: "Synthetic",
    },
  });
  await assert.rejects(
    admin.userPermissionGrant.create({
      data: {
        userId: first.user.id,
        permission: "SYSTEM_ADMIN",
        reason: "Duplicate fixture",
      },
    }),
  );
  assert.deepEqual(
    await expect(
      http(origin, "admin/alerts", "GET", undefined, bearer(token)),
      200,
    ),
    [],
  );
  await admin.userPermissionGrant.update({
    where: { id: systemGrant.id },
    data: { revokedAt: new Date() },
  });
  await expect(
    http(origin, "admin/alerts", "GET", undefined, bearer(token)),
    403,
  );
  pass(
    "JWT expiry/tampering/authVersion and Control permission revocation use only local identity/reference tables",
  );

  const membership = await native.membership.findUniqueOrThrow({
    where: { userId: first.user.id },
    include: { user: { select: { name: true, email: true } }, vehicles: true },
  });
  const fixtures = {
    ...JSON.parse(JSON.stringify(membership)),
    balance: "0.00",
    available: "0.00",
    reserved: "0.00",
    total: "0.00",
    pendingBalance: "0.00",
    points: 0,
  };
  contract.memberships.set(first.user.id, fixtures);
  assert.deepEqual(
    await expect(
      http(origin, "memberships/me", "GET", undefined, bearer(token)),
      200,
    ),
    fixtures,
  );
  for (const kind of ["transactions", "rewards", "redemptions"])
    assert.deepEqual(
      await expect(
        http(origin, "memberships/me/" + kind, "GET", undefined, bearer(token)),
        200,
      ),
      [],
    );
  const repo = new (compiled(
    "persistence/vehicles.repository",
  ).VehiclesRepository)(native);
  const race = await Promise.allSettled([
    repo.link(first.user.id, "RAC-123", "Synthetic"),
    repo.link(second.user.id, "RAC-123", "Synthetic"),
  ]);
  assert.equal(
    race.filter((result) => result.status === "fulfilled").length,
    1,
  );
  const vehicle = await native.vehicle.findUniqueOrThrow({
    where: { plate: "RAC-123" },
  });
  const owner = await native.membership.findUniqueOrThrow({
    where: { id: vehicle.membershipId },
  });
  const ownerToken =
    owner.userId === first.user.id ? token : second.accessToken;
  const otherToken =
    owner.userId === first.user.id ? second.accessToken : token;
  const view = {
    id: vehicle.id,
    plate: vehicle.plate,
    label: vehicle.label,
    membership: {
      id: owner.id,
      number: owner.number,
      legacyNumbers: [],
      status: owner.status,
      name: (
        await native.user.findUniqueOrThrow({ where: { id: owner.userId } })
      ).name,
      balance: "0.00",
      dni: owner.dni,
      ruc: owner.ruc,
      businessName: owner.businessName,
      pendingBalance: "0.00",
    },
  };
  if (owner.userId === first.user.id)
    fixtures.vehicles = [JSON.parse(JSON.stringify(vehicle))];
  contract.vehicles.set(vehicle.plate, {
    ownerId: owner.userId,
    response: view,
  });
  await expect(
    http(
      origin,
      "vehicles",
      "POST",
      { plate: vehicle.plate, label: vehicle.label },
      bearer(ownerToken),
    ),
    201,
  );
  await expect(
    http(
      origin,
      "vehicles",
      "POST",
      { plate: vehicle.plate, label: vehicle.label },
      bearer(otherToken),
    ),
    409,
  );
  await expect(
    http(
      origin,
      "vehicles/" + vehicle.plate,
      "GET",
      undefined,
      bearer(otherToken),
    ),
    404,
  );
  pass(
    "Local membership/profile and vehicle ownership persist independently; financial responses are explicit V1 fixtures, not calculations",
  );

  await expect(
    http(origin, "auth/forgot-password", "POST", { email: first.user.email }),
    200,
  );
  assert.equal(smtp.messages.length, 1);
  const mail = smtp.messages[0]
    .replace(/=\r?\n/g, "")
    .replace(/=([0-9A-F]{2})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    );
  const code = mail.match(/verificaci[^\n]*?: (\d{8})/)?.[1];
  assert.ok(code);
  const reset = await expect(
    http(origin, "auth/verify-reset-code", "POST", {
      email: first.user.email,
      code,
    }),
    200,
  );
  const newPassword = "Synthetic-new-password-43!";
  const beforeVersion = (
    await native.user.findUniqueOrThrow({ where: { id: first.user.id } })
  ).authVersion;
  const consumed = await Promise.all(
    Array.from({ length: 2 }, () =>
      http(origin, "auth/reset-password", "POST", {
        resetToken: reset.resetToken,
        password: newPassword,
      }),
    ),
  );
  assert.deepEqual(consumed.map((result) => result.status).sort(), [200, 400]);
  assert.equal(
    (await native.user.findUniqueOrThrow({ where: { id: first.user.id } }))
      .authVersion,
    beforeVersion + 1,
  );
  await expect(http(origin, "vehicles", "GET", undefined, bearer(token)), 401);
  token = (
    await expect(
      http(origin, "auth/login", "POST", {
        email: first.user.email,
        password: newPassword,
      }),
      200,
    )
  ).accessToken;
  pass(
    "SMTP STARTTLS and concurrent password recovery commit once in the independent database and revoke prior JWT",
  );
  async function loginOperator() {
    const pre = await expect(signedHttp(origin, "kiosk/session"), 200);
    return expect(
      signedHttp(
        origin,
        "kiosk/session/login",
        "POST",
        { username: "synthetic-operator", password },
        pre.token,
        pre.csrfToken,
      ),
      201,
    );
  }
  let session = await loginOperator();
  const target = { method: "GET", path: "/api/v1/vehicles/RAC-123" };
  await expect(
    signedHttp(
      origin,
      "kiosk/session/authorize",
      "POST",
      target,
      session.token,
      session.csrfToken,
    ),
    201,
  );
  await expect(
    signedHttp(
      origin,
      "kiosk/session/authorize",
      "POST",
      target,
      session.token,
      "wrong",
    ),
    403,
  );
  pass(
    "Kiosk login/authorization/CSRF use Redis and the synthetic station reference without operational tables",
  );
  const beforeCredentials = await native.terminalCredential.count();
  const bootstrap = await http(
    origin,
    "kiosk/session/terminal-bootstrap",
    "POST",
    { terminalId: terminal.id },
    signed("kiosk/session/terminal-bootstrap", "POST", {
      terminalId: terminal.id,
    }),
  );
  assert.equal(bootstrap.status, 500);
  assert.equal(await native.terminalCredential.count(), beforeCredentials);
  blockers.push(
    "Technical bootstrap still needs TerminalOperation and OperationalAuditEvent in the same transaction; existing success contract cannot be preserved by deleting those dependencies.",
  );
  pass(
    "Separation limit reproduced: technical bootstrap fails closed with no partial credential; no cross-domain transaction was split",
  );
  const store = new (compiled("compatibility/kiosk/redis-store").KioskStore)(
    config,
  );
  stores.push(store);
  const kiosk = new (compiled(
    "compatibility/kiosk/kiosk.service",
  ).KioskService)(config, store, guard);
  const technicalGuard = new AccessGuard(
    { getAllAndOverride: () => "terminal" },
    config,
    jwt,
    users,
    kiosk,
    guard,
  );
  const opaque = crypto.randomBytes(32).toString("hex");
  const credential = await admin.terminalCredential.create({
    data: {
      terminalId: terminal.id,
      tokenHash: crypto.createHash("sha256").update(opaque).digest("hex"),
      expiresAt: new Date(Date.now() + 300000),
    },
  });
  function terminalContext(value) {
    const time = String(Date.now());
    const url = "/api/v1/terminal/me";
    const headers = {
      "x-kiosk-time": time,
      "x-terminal-session": value,
      "x-kiosk-signature": crypto
        .createHmac("sha256", kioskSecret)
        .update(JSON.stringify(["GET", url, time, null, "", "", value, "", ""]))
        .digest("hex"),
    };
    const req = {
      method: "GET",
      originalUrl: url,
      path: url,
      headers,
      header: (name) => headers[name],
    };
    return {
      req,
      context: {
        getHandler: () => null,
        getClass: () => null,
        switchToHttp: () => ({ getRequest: () => req }),
      },
    };
  }
  let scoped = terminalContext(opaque);
  await technicalGuard.canActivate(scoped.context);
  assert.equal(scoped.req.actor.terminalId, terminal.id);
  assert.equal(scoped.req.actor.stationId, station.id);
  await admin.terminalCredential.update({
    where: { id: credential.id },
    data: {
      issuedAt: new Date(Date.now() - 120000),
      expiresAt: new Date(Date.now() - 60000),
    },
  });
  await assert.rejects(
    technicalGuard.canActivate(terminalContext(opaque).context),
    (e) => e.getStatus() === 401,
  );
  await admin.terminalCredential.update({
    where: { id: credential.id },
    data: { expiresAt: new Date(Date.now() + 300000), revokedAt: new Date() },
  });
  await assert.rejects(
    technicalGuard.canActivate(terminalContext(opaque).context),
    (e) => e.getStatus() === 401,
  );
  pass(
    "Existing technical guard validates/rejects local valid, expired and revoked credentials on 14 tables; issuance remains blocked",
  );

  await contract.stop();
  await expect(
    http(origin, "memberships/me", "GET", undefined, bearer(token)),
    503,
  );
  await expect(
    http(origin, "auth/login", "POST", {
      email: first.user.email,
      password: newPassword,
    }),
    200,
  );
  await expect(
    signedHttp(
      origin,
      "kiosk/session",
      "GET",
      undefined,
      session.token,
      session.csrfToken,
    ),
    200,
  );
  await contract.listen();
  assert.deepEqual(
    await expect(
      http(origin, "memberships/me", "GET", undefined, bearer(token)),
      200,
    ),
    fixtures,
  );
  pass(
    "No legacy bridge is running; fixture-contract outage returns 503 while local login and sessions stay available",
  );
  for (let cycle = 1; cycle <= 2; cycle++) {
    const lost = session;
    docker("stop", name + "-redis");
    await delay(2200);
    await expect(
      signedHttp(
        origin,
        "kiosk/session/authorize",
        "POST",
        target,
        lost.token,
        lost.csrfToken,
      ),
      503,
    );
    await expect(
      http(origin, "vehicles", "GET", undefined, bearer(token)),
      200,
    );
    docker("start", name + "-redis");
    for (let i = 0; i < 100; i++) {
      try {
        if (
          docker(
            "exec",
            name + "-redis",
            "redis-cli",
            "--no-auth-warning",
            "-a",
            redisSecret,
            "PING",
          ).trim() === "PONG"
        )
          break;
      } catch {}
      await delay(100);
    }
    await rawRedis();
    let recovered = false;
    for (let i = 0; i < 50; i++) {
      const result = await signedHttp(
        origin,
        "kiosk/session/authorize",
        "POST",
        target,
        lost.token,
        lost.csrfToken,
      );
      if (result.status === 401) {
        recovered = true;
        break;
      }
      assert.equal(result.status, 503);
      await delay(100);
    }
    assert.ok(recovered);
    session = await loginOperator();
    await expect(
      signedHttp(
        origin,
        "kiosk/session/authorize",
        "POST",
        target,
        session.token,
        session.csrfToken,
      ),
      201,
    );
    assert.equal(child.pid, appPid);
    assert.equal(child.exitCode, null);
    pass(
      "Redis cycle " +
        cycle +
        ": controlled 503, automatic reconnect, lost sessions 401 and fresh login without Identity restart",
    );
  }
  const userBefore = await native.user.findUniqueOrThrow({
    where: { id: first.user.id },
  });
  // Kill and restart PostgreSQL inside the same running container: tmpfs retained.
  docker(
    "exec",
    "-u",
    "postgres",
    name + "-pg",
    "pg_ctl",
    "-D",
    "/var/lib/postgresql/data",
    "stop",
    "-m",
    "fast",
  );
  await expect(http(origin, "health"), 503);
  const down = await http(origin, "vehicles", "GET", undefined, bearer(token));
  assert.ok(down.status >= 500);
  docker(
    "exec",
    "-u",
    "postgres",
    name + "-pg",
    "pg_ctl",
    "-D",
    "/var/lib/postgresql/data",
    "-l",
    "/var/lib/postgresql/data/restart.log",
    "start",
  );
  await postgresReady();
  await ready(origin, child);
  await expect(
    http(origin, "auth/login", "POST", {
      email: first.user.email,
      password: newPassword,
    }),
    200,
  );
  // Refresh only verifier pools: they were idle during the outage. The running
  // Identity process has already recovered and returned health/login 200 above.
  for (const reader of [native, admin]) {
    await reader.$disconnect();
    await reader.$connect();
  }
  assert.equal(
    (await native.user.findUniqueOrThrow({ where: { id: first.user.id } }))
      .authVersion,
    userBefore.authVersion,
  );
  assert.equal(child.pid, appPid);
  assert.equal(child.exitCode, null);
  pass(
    "PostgreSQL engine outage/restart recovers without Identity restart; identity state/authVersion preserved",
  );
  assert.deepEqual(
    (
      await admin.$queryRawUnsafe(
        "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
      )
    ).map((row) => row.tablename),
    modelNames,
  );
}
run()
  .catch((error) => {
    console.error(
      "FAIL",
      error.name,
      redact(error.code || ""),
      error.name === "AssertionError"
        ? redact(error.message)
        : "synthetic lab step failed",
    );
    console.error(
      (error.stack || "")
        .split("\n")
        .filter((line) => line.includes("identity-data-isolated.cjs:"))
        .join("\n"),
    );
    for (const child of children)
      if (child.exitCode !== null) console.error(redact(child.logs));
    process.exitCode = 1;
  })
  .finally(async () => {
    for (const store of stores) await store.onModuleDestroy();
    for (const child of children.reverse()) await stop(child);
    if (redis?.isOpen) await redis.quit().catch(() => redis.destroy());
    for (const db of [native, guard, admin]) if (db) await db.$disconnect();
    if (smtp) await smtp.close();
    if (contract) await contract.stop();
    for (const container of containers)
      try {
        docker("stop", container);
      } catch {
        process.exitCode = 1;
      }
    const unchanged = Object.entries(protectedFiles).every(
      ([p, hash]) =>
        crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex") ===
        hash,
    );
    if (!unchanged) process.exitCode = 1;
    for (const file of ["smtp-key.pem", "smtp-cert.pem"]) {
      const p = path.join(temp, file);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
    const result = {
      syntheticLab: name,
      success: !process.exitCode,
      passed: checks.length,
      checks,
      identityOnlyTableCount: 14,
      backendStarted: false,
      legacyBridgeStarted: false,
      completeIdentityAutonomy: false,
      approvalRequiredForOperationalSplit: true,
      blockers,
      protectedJsonCount: Object.keys(protectedFiles).length,
      protectedJsonUnchanged: unchanged,
      containersStopped: containers,
    };
    fs.writeFileSync(
      path.join(evidenceDir, "identity-mission5-data.txt"),
      JSON.stringify(result, null, 2) + "\n",
    );
    console.log(JSON.stringify(result));
  });

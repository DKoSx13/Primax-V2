// Mission 5. Only fresh named containers/tmpfs, explicit synthetic environment.
const { execFileSync, spawn } = require("node:child_process");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { createRequire } = require("node:module");
const root = path.resolve(__dirname, "../..");
const secureTransport = process.argv.includes("--service-tls");
const controlRemote =
  secureTransport || process.argv.includes("--control-remote");
const fuelFlowPrivate =
  controlRemote || process.argv.includes("--fuelflow-private");
const consumerV2 = fuelFlowPrivate || process.argv.includes("--consumer-v2");
const actorIntentContract =
  consumerV2 || process.argv.includes("--actor-intent-contract");
const consumerCorrelations =
  actorIntentContract || process.argv.includes("--consumer-correlations");
const consumerOnly = process.argv.includes("--consumer-only");
if (fuelFlowPrivate && !consumerOnly)
  throw Error("Private FuelFlow checks require focused --consumer-only mode");
if (consumerOnly && !consumerCorrelations)
  throw Error("Consumer probe requires consumer opt-in");
const remoteReceipts =
  consumerCorrelations || process.argv.includes("--remote-receipts");
const operational = remoteReceipts || process.argv.includes("--operational");
let providerProcess, providerEnv, restartProvider, consumerUrl, fuelFlowUrl;
const standalone = operational || process.argv.includes("--standalone");
let operationalDb;
const runtimeSecrets = [];
let bridge;
let foreignKeysBefore;
let runtimeRoot, artifactSourceSha256, artifactDistSha256;
const reusedArtifact = process.argv
  .find((arg) => arg.startsWith("--runtime-artifact="))
  ?.slice("--runtime-artifact=".length);
if (reusedArtifact && !remoteReceipts)
  throw Error("Artifact reuse is restricted to the receipt laboratory");
const load = createRequire(path.join(root, "Backend/package.json"));
const compiled = (file) => load("./dist/src/" + file);
const name =
  "primax-m5-" + Date.now() + "-" + crypto.randomBytes(4).toString("hex");
const pgSecret = crypto.randomBytes(32).toString("hex");
const redisSecret = crypto.randomBytes(32).toString("hex");
const jwtSecret = crypto.randomBytes(32).toString("hex");
const kioskSecret = crypto.randomBytes(32).toString("hex");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), name));
fs.chmodSync(tmp, 0o700);
const managedStores = [];
const children = [],
  containers = [],
  checks = [];
let db,
  redis,
  smtp,
  networkCreated = false;
const evidence = path.join(
  root,
  secureTransport
    ? "Docs/astra/evidence/identity-mission5-9a-service-tls.txt"
    : controlRemote
      ? "Docs/astra/evidence/identity-mission5-8-remote.txt"
      : fuelFlowPrivate
        ? "Docs/astra/evidence/identity-mission5-7-private.txt"
        : consumerV2
          ? consumerOnly
            ? "Docs/astra/evidence/identity-mission5-v2-probe.txt"
            : "Docs/astra/evidence/identity-mission5-v2-full.txt"
          : actorIntentContract
            ? consumerOnly
              ? "Docs/astra/evidence/identity-mission5-actor-probe.txt"
              : "Docs/astra/evidence/identity-mission5-actor-intent.txt"
            : consumerOnly
              ? "Docs/astra/evidence/identity-mission5-consumer-probe.txt"
              : consumerCorrelations
                ? "Docs/astra/evidence/identity-mission5-consumer-correlations.txt"
                : remoteReceipts
                  ? "Docs/astra/evidence/identity-mission5-remote-receipts.txt"
                  : operational
                    ? "Docs/astra/evidence/identity-mission5-operational.txt"
                    : standalone
                      ? "Docs/astra/evidence/identity-mission5-runtime.txt"
                      : "Docs/astra/evidence/identity-mission5-redis-recovery.txt",
);
const previousEvidence = Object.fromEntries(
  fs
    .readdirSync(path.dirname(evidence))
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const p = path.join(path.dirname(evidence), f);
      return [
        p,
        crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex"),
      ];
    }),
);
const redact = (value) =>
  [pgSecret, redisSecret, jwtSecret, kioskSecret, ...runtimeSecrets].reduce(
    (s, key) => s.replaceAll(key, "[redacted]"),
    String(value),
  );
const docker = (...args) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    timeout: 60000,
    stdio: "pipe",
  });
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const pass = (message) => {
  checks.push(message);
  console.log("PASS", message);
};
const fetchLocal = (url, options = {}) =>
  fetch(url, {
    ...options,
    headers: { ...options.headers, connection: "close" },
    signal: AbortSignal.timeout(12000),
  });
async function freePort() {
  const server = require("node:net").createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
function start(file, env) {
  const child = spawn(process.execPath, [path.resolve(root, file)], {
    cwd: tmp,
    env: { PATH: process.env.PATH, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.logs = "";
  for (const stream of [child.stdout, child.stderr])
    stream.on("data", (d) => {
      child.logs = (child.logs + d).slice(-5000);
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
  const deadline = Date.now() + (remoteReceipts ? 120000 : 45000);
  let lastStatus = "not-listening";
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      const error = Error("Lab child exited");
      error.labReadiness = { lastStatus, logs: redact(child.logs) };
      throw error;
    }
    try {
      const response = await fetchLocal(origin + "/api/v1/health");
      lastStatus = response.status;
      if (response.ok) return;
    } catch {}
    await delay(200);
  }
  const error = Error("Lab readiness timeout");
  error.labReadiness = { lastStatus, logs: redact(child.logs) };
  throw error;
}
function treeDigest(folder) {
  const entries = [];
  function walk(relative) {
    for (const entry of fs
      .readdirSync(path.join(folder, relative), { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(relative, entry.name);
      if (entry.isDirectory()) walk(file);
      else
        entries.push([
          file,
          crypto
            .createHash("sha256")
            .update(fs.readFileSync(path.join(folder, file)))
            .digest("hex"),
        ]);
    }
  }
  walk("");
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(entries))
    .digest("hex");
}

async function http(
  origin,
  route,
  { method = "GET", body, headers = {} } = {},
) {
  const response = await fetchLocal(origin + "/api/v1/" + route, {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return {
    status: response.status,
    body: await response.json(),
    headers: response.headers,
  };
}
const bearer = (token) => ({ authorization: "Bearer " + token });
function signed(
  route,
  {
    method = "GET",
    body = null,
    session = "",
    csrf = "",
    technical = "",
    owner = "",
    bad = false,
  } = {},
) {
  const time = String(Date.now());
  const signature = crypto
    .createHmac("sha256", kioskSecret)
    .update(
      JSON.stringify([
        method,
        "/api/v1/" + route,
        time,
        body,
        session,
        csrf,
        technical,
        "",
        owner,
      ]),
    )
    .digest("hex");
  return {
    "x-kiosk-time": time,
    "x-kiosk-signature": bad ? "0".repeat(64) : signature,
    "x-kiosk-session": session,
    "x-csrf-token": csrf,
    "x-terminal-session": technical,
    "x-terminal-owner": owner,
  };
}
async function signedHttp(origin, route, options = {}) {
  return http(origin, route, {
    method: options.method,
    body: options.body,
    headers: signed(route, options),
  });
}
async function status(result, expected) {
  const value = await result;
  // Avoid exposing tokens, recovery codes or synthetic credential hashes on failures.
  assert.equal(
    value.status,
    expected,
    "HTTP status mismatch: " + value.status + " expected " + expected,
  );
  return value.body;
}

async function run() {
  const networkArgs = [];
  if (operational) {
    // Historical lab networks exhausted Docker's automatic pools. Allocate a tiny
    // private subnet only after checking all non-default host routes; no pruning.
    const routes = execFileSync("ip", ["-4", "route", "show"], {
      encoding: "utf8",
    })
      .split("\n")
      .map((line) => line.split(" ")[0])
      .filter((route) => /^\d+\.\d+\.\d+\.\d+(?:\/\d+)?$/.test(route));
    const range = (cidr) => {
      const [ip, bits = "32"] = cidr.split("/");
      const value = ip
        .split(".")
        .reduce((n, part) => n * 256 + Number(part), 0);
      const size = 2 ** (32 - Number(bits));
      const first = Math.floor(value / size) * size;
      return [first, first + size - 1];
    };
    let subnet;
    for (let octet = 0; octet < 256; octet++) {
      const candidate = `10.253.${octet}.0/28`,
        own = range(candidate);
      if (
        !routes.some((route) => {
          const used = range(route);
          return own[0] <= used[1] && used[0] <= own[1];
        })
      ) {
        subnet = candidate;
        break;
      }
    }
    assert.ok(subnet, "No conflict-free synthetic subnet");
    networkArgs.push("--subnet", subnet);
  }
  docker(
    "network",
    "create",
    "--label",
    "primax.test=mission5",
    ...networkArgs,
    name,
  );
  networkCreated = true;
  for (const [suffix, image, args] of [
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
        `127.0.0.1:${await freePort()}:5432`,
      ],
    ],
    [
      "redis",
      "redis:7-alpine",
      ["--tmpfs", "/data", "-p", `127.0.0.1:${await freePort()}:6379`],
    ],
  ]) {
    const container = name + "-" + suffix;
    docker(
      "run",
      "-d",
      "--name",
      container,
      "--label",
      "primax.test=mission5",
      "--network",
      name,
      ...args,
      image,
      ...(suffix === "redis"
        ? [
            "redis-server",
            "--save",
            "",
            "--appendonly",
            "no",
            "--requirepass",
            redisSecret,
          ]
        : remoteReceipts
          ? [
              "sh",
              "-c",
              "docker-entrypoint.sh postgres & trap 'exit 0' TERM INT; while sleep 1; do :; done",
            ]
          : []),
    );
    containers.push(container);
    const config = JSON.parse(docker("inspect", container))[0];
    assert.ok(config.Mounts.every((mount) => mount.Type === "tmpfs"));
    assert.ok(
      Object.values(config.HostConfig.PortBindings)
        .flat()
        .every((binding) => binding.HostIp === "127.0.0.1"),
    );
  }
  const pgPort = docker("port", name + "-pg", "5432/tcp")
    .trim()
    .split(":")
    .at(-1);
  const redisPort = docker("port", name + "-redis", "6379/tcp")
    .trim()
    .split(":")
    .at(-1);
  const url = `postgresql://postgres:${pgSecret}@127.0.0.1:${pgPort}/synthetic?connect_timeout=3&pool_timeout=3`;
  const redisUrl = `redis://:${redisSecret}@127.0.0.1:${redisPort}/0`;
  let pgReady = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      docker("exec", name + "-pg", "pg_isready", "-U", "postgres");
      pgReady = true;
      break;
    } catch {}
    await delay(200);
  }
  assert.ok(pgReady);
  await delay(500);
  execFileSync(
    path.join(root, "Backend/node_modules/.bin/prisma"),
    [
      "migrate",
      "deploy",
      "--schema",
      path.join(root, "Backend/prisma/schema.prisma"),
    ],
    {
      cwd: tmp,
      env: {
        PATH: process.env.PATH,
        DATABASE_URL: url,
        DATABASE_URL_UNPOOLED: url,
      },
      timeout: 60000,
      stdio: "pipe",
    },
  );
  const { PrismaClient } = load("@prisma/client");
  db = new PrismaClient({ datasources: { db: { url } } });
  if (remoteReceipts)
    await db.$executeRawUnsafe(
      fs.readFileSync(
        path.join(
          root,
          "services/identity/prisma/lab-operational-receipts.sql",
        ),
        "utf8",
      ),
    );
  if (consumerCorrelations)
    await db.$executeRawUnsafe(
      fs.readFileSync(
        path.join(root, "services/identity/prisma/lab-consumer-intents.sql"),
        "utf8",
      ),
    );
  if (fuelFlowPrivate) {
    await db.$executeRawUnsafe("CREATE SCHEMA fuelflow_lab");
    await db.$executeRawUnsafe(
      fs.readFileSync(
        path.join(root, "Frontend_1_FuelFlow/lab/caller-journal.sql"),
        "utf8",
      ),
    );
  }
  if (secureTransport)
    for (const file of ["lab-service-transport.sql", "lab-service-nonces.sql"])
      await db.$executeRawUnsafe(
        fs.readFileSync(
          path.join(root, "services/identity/prisma", file),
          "utf8",
        ),
      );
  redis = load("redis").createClient({
    url: redisUrl,
    disableOfflineQueue: true,
    socket: { connectTimeout: 2000, reconnectStrategy: false },
  });
  redis.on("error", () => {});
  await redis.connect();
  pass(
    "Fresh PostgreSQL migrations and authenticated Redis; tmpfs only, loopback ports, no inherited env",
  );

  const station = await db.station.create({
    data: { code: "LAB-A", name: "Synthetic A", address: "Synthetic" },
  });
  const stationB = await db.station.create({
    data: { code: "LAB-B", name: "Synthetic B", address: "Synthetic" },
  });
  const terminal = await db.terminal.create({
    data: { stationId: station.id, code: "LAB-T01" },
  });
  const otherTerminal = await db.terminal.create({
    data: { stationId: stationB.id, code: "LAB-T02" },
  });
  const { hash, compare } = load("bcryptjs");
  const password = "Synthetic-password-42!";
  const operatorHash = await hash(password, 12);
  const cert = path.join(tmp, "smtp-cert.pem"),
    key = path.join(tmp, "smtp-key.pem");
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
  const env = {
    IDENTITY_SYNTHETIC_LAB: name,
    BIND_HOST: "127.0.0.1",
    DATABASE_URL: url,
    DATABASE_URL_UNPOOLED: url,
    JWT_SECRET: jwtSecret,
    KIOSK_API_KEY: crypto.randomBytes(32).toString("hex"),
    APP_MODE: "local",
    CORS_ORIGINS: "http://localhost:5180",
    KIOSK_STATION_ID: station.id,
    KIOSK_GATEWAY_SECRET: kioskSecret,
    KIOSK_REDIS_URL: redisUrl,
    KIOSK_SESSION_NAMESPACE: name,
    KIOSK_OPERATOR_USER: "synthetic-operator",
    KIOSK_OPERATOR_PASSWORD_HASH: operatorHash,
    PASSWORD_RESET_DELIVERY: "smtp",
    SMTP_HOST: "127.0.0.1",
    SMTP_PORT: String(smtp.port),
    SMTP_SECURE: "false",
    SMTP_FROM: "lab@example.invalid",
    NODE_EXTRA_CA_CERTS: cert,
    PLATE_RECOGNITION_ENABLED: "false",
    ADMIN_USER: "synthetic-admin",
    ADMIN_PASSWORD_HASH: operatorHash,
  };
  const standaloneEnv = {};
  if (standalone) {
    foreignKeysBefore = JSON.stringify(
      await db.$queryRawUnsafe(
        "SELECT conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE contype='f' ORDER BY conname",
      ),
    );
    const roleUrl = async (role, permissions) => {
      const password = crypto.randomBytes(32).toString("hex");
      runtimeSecrets.push(password);
      await db.$executeRawUnsafe(
        `CREATE ROLE ${role} LOGIN PASSWORD '${password}'`,
      );
      await db.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO ${role}`);
      for (const statement of permissions)
        await db.$executeRawUnsafe(statement + " TO " + role);
      const result = new URL(url);
      result.username = role;
      result.password = password;
      return result.href;
    };
    const identityUrl = await roleUrl("identity_writer", [
      'GRANT SELECT ON "User", "MembershipNumberCounter", "Membership", "MembershipCodeAlias", "Vehicle", "PasswordReset", "UserPermissionGrant", "AdminControlAccount", "AdminControlGrant", "AdminStationAssignment", "AdminEmailVerification", "Station", "Terminal", "TerminalCredential"',
      'GRANT INSERT, UPDATE, DELETE ON "User", "Vehicle", "PasswordReset", "MembershipNumberCounter"',
      'GRANT INSERT ON "Membership"',
      'GRANT UPDATE (dni, passport, ruc, "businessName", "updatedAt") ON "Membership"',
    ]);
    const compatibilityUrl = await roleUrl("identity_operational", [
      "GRANT SELECT ON ALL TABLES IN SCHEMA public",
      'GRANT INSERT, UPDATE ON "TerminalCredential", "Terminal", "TerminalOperation"',
      'GRANT INSERT ON "OperationalAuditEvent"',
    ]);
    const bridgeUrl = await roleUrl("identity_bridge", [
      "GRANT SELECT ON ALL TABLES IN SCHEMA public",
      'GRANT INSERT, UPDATE ON "BusinessAlert"',
    ]);
    let receiptProviderUrl;
    if (remoteReceipts) {
      receiptProviderUrl = await roleUrl("identity_receipt_provider", [
        "GRANT SELECT ON ALL TABLES IN SCHEMA public",
        'GRANT INSERT, UPDATE ON "TerminalCredential", "Terminal", "TerminalOperation"',
        'GRANT INSERT ON "OperationalAuditEvent", "IdentityOperationalReceipt"',
      ]);
      for (const role of ["identity_operational", "identity_bridge"])
        await db.$executeRawUnsafe(
          'REVOKE ALL ON "IdentityOperationalReceipt" FROM ' + role,
        );
    }
    if (consumerCorrelations) {
      consumerUrl = await roleUrl("identity_consumer", [
        'GRANT SELECT ON "User", "UserPermissionGrant", "AdminControlAccount", "AdminControlGrant", "AdminStationAssignment", "Station", "Terminal", "IdentityConsumerIntent"',
        'GRANT INSERT ON "IdentityConsumerIntent"',
        ...(secureTransport
          ? [
              'GRANT SELECT ON "IdentityServiceCredential", "IdentityServiceNonce"',
              'GRANT INSERT ON "IdentityServiceNonce"',
            ]
          : []),
      ]);
      for (const role of [
        "identity_operational",
        "identity_bridge",
        "identity_receipt_provider",
      ])
        await db.$executeRawUnsafe(
          'REVOKE ALL ON "IdentityConsumerIntent" FROM ' + role,
        );
    }
    if (fuelFlowPrivate)
      fuelFlowUrl = await roleUrl("fuelflow_caller", [
        "GRANT USAGE ON SCHEMA fuelflow_lab",
        'GRANT SELECT, INSERT ON fuelflow_lab."CallerOperation"',
      ]);
    const bridgeKey = crypto.randomBytes(32).toString("hex");
    runtimeSecrets.push(bridgeKey);
    bridge = await require("./identity-compatibility-bridge.cjs").createBridge({
      load,
      url: bridgeUrl,
      key: bridgeKey,
    });
    Object.assign(standaloneEnv, {
      ...(operational ? { IDENTITY_OPERATIONAL_LAB: "enabled" } : {}),
      IDENTITY_RUNTIME_PROFILE: "synthetic",
      IDENTITY_DATABASE_URL: identityUrl,
      IDENTITY_COMPAT_DATABASE_URL: compatibilityUrl,
      IDENTITY_COMPAT_URL: bridge.origin,
      IDENTITY_COMPAT_KEY: bridgeKey,
    });
    // Code/dependency copies belong on disk, not in /tmp tmpfs (DB data stays tmpfs).
    const artifactCache = path.join(
      os.homedir(),
      ".cache",
      "primax-identity-lab-artifacts",
    );
    fs.mkdirSync(artifactCache, { recursive: true });
    if (reusedArtifact) {
      runtimeRoot = fs.realpathSync(reusedArtifact);
      assert.ok(
        runtimeRoot.startsWith(fs.realpathSync(artifactCache) + path.sep),
      );
      for (const directory of ["src", "prisma"])
        assert.equal(
          treeDigest(path.join(runtimeRoot, directory)),
          treeDigest(path.join(root, "services/identity", directory)),
          "Reused build input changed: " + directory,
        );
      for (const file of ["package.json", "package-lock.json", "tsconfig.json"])
        assert.ok(
          fs
            .readFileSync(path.join(runtimeRoot, file))
            .equals(
              fs.readFileSync(path.join(root, "services/identity", file)),
            ),
        );
      assert.ok(!fs.existsSync(path.join(runtimeRoot, ".env")));
      assert.ok(
        fs.existsSync(
          path.join(runtimeRoot, "dist/operational/remote/provider-main.js"),
        ),
      );
    } else {
      runtimeRoot = fs.mkdtempSync(path.join(artifactCache, name + "-"));
      for (const file of [
        "dist",
        "generated",
        "node_modules",
        "package.json",
        "package-lock.json",
        "src",
        "prisma",
        "tsconfig.json",
      ])
        fs.cpSync(
          path.join(root, "services/identity", file),
          path.join(runtimeRoot, file),
          { recursive: true, verbatimSymlinks: true },
        );
      for (const binary of ["prisma", "tsc"]) {
        assert.ok(
          fs
            .realpathSync(path.join(runtimeRoot, "node_modules/.bin", binary))
            .startsWith(runtimeRoot + path.sep),
        );
      }
      execFileSync("npm", ["run", "build"], {
        cwd: runtimeRoot,
        env: {
          PATH: process.env.PATH,
          IDENTITY_DATABASE_URL: identityUrl,
          IDENTITY_COMPAT_DATABASE_URL: compatibilityUrl,
        },
        stdio: "pipe",
        timeout: operational ? 600000 : 300000,
      });
    }
    artifactSourceSha256 = treeDigest(path.join(runtimeRoot, "src"));
    artifactDistSha256 = treeDigest(path.join(runtimeRoot, "dist"));
    const identityClient = require(
      path.join(runtimeRoot, "generated/identity"),
    );
    const native = new identityClient.PrismaClient({
      datasources: { db: { url: identityUrl } },
    });
    try {
      assert.equal(native.payment, undefined);
      assert.equal(native.transaction, undefined);
      await assert.rejects(native.$queryRawUnsafe('SELECT * FROM "Payment"'));
      await assert.rejects(
        native.$executeRawUnsafe('UPDATE "Membership" SET balance=balance'),
      );
      await assert.rejects(
        native.$executeRawUnsafe('UPDATE "FuelInventory" SET liters=liters'),
      );
    } finally {
      await native.$disconnect();
    }
    const nativeCompatibility = require(
      path.join(runtimeRoot, "node_modules/@prisma/client"),
    );
    const operationalClient = new nativeCompatibility.PrismaClient({
      datasources: { db: { url: compatibilityUrl } },
    });
    try {
      await assert.rejects(
        operationalClient.$executeRawUnsafe(
          'UPDATE "Membership" SET balance=balance',
        ),
      );
    } finally {
      await operationalClient.$disconnect();
    }
    if (remoteReceipts) {
      const apiKey = crypto.randomBytes(32).toString("hex"),
        receiptKey = crypto.randomBytes(32).toString("hex");
      runtimeSecrets.push(apiKey, receiptKey);
      const providerPort = await freePort(),
        providerOrigin = "http://127.0.0.1:" + providerPort;
      providerEnv = {
        IDENTITY_RUNTIME_PROFILE: "synthetic",
        IDENTITY_RECEIPT_LAB: "enabled",
        IDENTITY_COMPAT_DATABASE_URL: receiptProviderUrl,
        OPERATIONAL_API_KEY: apiKey,
        OPERATIONAL_RECEIPT_KEY: receiptKey,
        KIOSK_STATION_ID: station.id,
        PORT: String(providerPort),
      };
      restartProvider = async () => {
        if (providerProcess) await stop(providerProcess);
        providerProcess = start(
          path.join(runtimeRoot, "dist/operational/remote/provider-main.js"),
          providerEnv,
        );
        for (let n = 0; n < 150; n++) {
          if (providerProcess.exitCode !== null)
            throw Error("Synthetic provider failed startup");
          try {
            const response = await fetchLocal(
              providerOrigin + "/operational/v1/receipts/query",
              {
                method: "POST",
                headers: {
                  "content-type": "application/json",
                  "x-operational-key": apiKey,
                },
                body: JSON.stringify({
                  version: 1,
                  commandId: crypto.randomUUID(),
                  command: { contractVersion: 1, stationId: station.id },
                }),
              },
            );
            if (response.status === 404) return;
          } catch {}
          await delay(200);
        }
        throw Error("Synthetic provider readiness");
      };
      await restartProvider();
      Object.assign(standaloneEnv, {
        IDENTITY_RECEIPT_LAB: "enabled",
        OPERATIONAL_ORIGIN: providerOrigin,
        OPERATIONAL_API_KEY: apiKey,
      });
    }
    pass(
      "Standalone project builds and runs outside repository with own dependencies and two generated clients; native financial tables inaccessible",
    );
  }
  const origins = {},
    processes = {};
  for (const [domain, file] of [
    ["legacy", "Backend/dist/src/apps/identity/main.js"],
    ["minimal", "tools/astra/identity-lab-app.cjs"],
    ["commerce", "Backend/dist/src/apps/commerce/main.js"],
    ["administration", "Backend/dist/src/apps/administration/main.js"],
  ]) {
    const port = await freePort();
    origins[domain] = "http://127.0.0.1:" + port;
    processes[domain] = start(
      standalone && domain === "minimal"
        ? path.join(
            runtimeRoot,
            operational ? "dist/operational/main.js" : "dist/main.js",
          )
        : file,
      {
        ...env,
        ...(standalone && domain === "minimal"
          ? {
              ...standaloneEnv,
              DATABASE_URL: undefined,
              DATABASE_URL_UNPOOLED: undefined,
            }
          : {}),
        PORT: String(port),
      },
    );
    await ready(origins[domain], processes[domain]);
  }
  pass(
    "Legacy Identity and minimal composition ready; real Commerce/Administration only for existing HTTP contracts",
  );

  const routeSurface = async (origin) => {
    const response = await fetchLocal(origin + "/api/docs-json");
    assert.equal(response.status, 200);
    const spec = await response.json();
    return Object.entries(spec.paths)
      .flatMap(([route, operations]) =>
        Object.keys(operations)
          .filter((method) =>
            ["get", "post", "patch", "put", "delete"].includes(method),
          )
          .map((method) => method.toUpperCase() + " " + route),
      )
      .sort();
  };
  const legacyRoutes = await routeSurface(origins.legacy);
  assert.deepEqual(await routeSurface(origins.minimal), legacyRoutes);
  pass(
    "Full Identity HTTP method/path surface matches legacy: " +
      legacyRoutes.length +
      " contracts",
  );

  async function runConsumerChecks() {
    const projectLoad = createRequire(path.join(runtimeRoot, "package.json"));
    await require("./identity-consumer-checks.cjs")({
      db,
      projectLoad,
      origin: origins.minimal,
      providerOrigin: standaloneEnv.OPERATIONAL_ORIGIN,
      apiKey: providerEnv.OPERATIONAL_API_KEY,
      start,
      stop,
      freePort,
      pass,
      http,
      status,
      stationId: station.id,
      otherStationId: stationB.id,
      consumerUrl,
      consumerConfig: {
        IDENTITY_CONSUMER_LAB: "enabled",
        IDENTITY_CONTROL_VERIFY_LAB: fuelFlowPrivate ? "enabled" : "disabled",
        IDENTITY_CONSUMER_V2_LAB: consumerV2 ? "enabled" : "disabled",
        IDENTITY_RUNTIME_PROFILE: "synthetic",
        IDENTITY_COMPAT_DATABASE_URL: consumerUrl,
        KIOSK_STATION_ID: station.id,
        JWT_SECRET: jwtSecret,
        OPERATIONAL_API_KEY: providerEnv.OPERATIONAL_API_KEY,
      },
      consumerFile: path.join(runtimeRoot, "dist/operational/consumer/main.js"),
      operatorHash,
      password,
      skipConsumerLaunch: secureTransport,
      validateFuelFlow: fuelFlowPrivate
        ? (context) =>
            require(
              secureTransport
                ? "./identity-service-tls-checks.cjs"
                : "./fuelflow-identity-private-checks.cjs",
            )(context, {
              start,
              stop,
              freePort,
              runtimeRoot,
              fuelFlowUrl,
              stationId: station.id,
              runtimeSecrets,
            })
        : undefined,
      validateV2:
        consumerV2 && !fuelFlowPrivate
          ? (context) =>
              require("./identity-consumer-v2-checks.cjs")(context, {
                docker,
                pgContainer: name + "-pg",
                redisContainer: name + "-redis",
                bridge,
                standaloneEnv,
              })
          : undefined,
      validateActorContract:
        actorIntentContract && !fuelFlowPrivate
          ? (context) =>
              require("./identity-actor-intent-checks.cjs")(context, {
                signed,
                authConfig: {
                  ...env,
                  IDENTITY_COMPAT_DATABASE_URL:
                    standaloneEnv.IDENTITY_COMPAT_DATABASE_URL,
                },
              })
          : undefined,
    });
  }
  if (consumerOnly) {
    if (fuelFlowPrivate) {
      for (const domain of ["legacy", "commerce", "administration"])
        await stop(processes[domain]);
      pass(
        "Legacy Backend comparator entrypoints stopped before private FuelFlow communication; no legacy caller is imported",
      );
    }
    await runConsumerChecks();
    return;
  }

  const registration = {
    name: "Synthetic One",
    email: "one@example.invalid",
    password,
    dni: "12345678",
  };
  const registered = await status(
    http(origins.legacy, "auth/register", {
      method: "POST",
      body: registration,
    }),
    201,
  );
  const second = await status(
    http(origins.minimal, "auth/register", {
      method: "POST",
      body: {
        ...registration,
        name: "Synthetic Two",
        email: "two@example.invalid",
        dni: "87654321",
      },
    }),
    201,
  );
  assert.deepEqual(Object.keys(registered).sort(), [
    "accessToken",
    "expiresIn",
    "tokenType",
    "user",
  ]);
  assert.equal(registered.tokenType, "Bearer");
  assert.equal(registered.expiresIn, 3600);
  assert.deepEqual(Object.keys(registered.user).sort(), [
    "email",
    "id",
    "name",
  ]);
  const userId = registered.user.id,
    secondId = second.user.id;
  const account = await db.user.findUniqueOrThrow({ where: { id: userId } });
  assert.ok(await compare(password, account.passwordHash));
  assert.match(account.passwordHash, /^\$2[aby]\$12\$/);
  await status(
    http(origins.legacy, "auth/register", {
      method: "POST",
      body: registration,
    }),
    409,
  );
  await status(
    http(origins.minimal, "auth/register", {
      method: "POST",
      body: { ...registration, email: "bad@example.invalid", password: "weak" },
    }),
    400,
  );
  assert.equal(
    await db.user.count({ where: { email: "bad@example.invalid" } }),
    0,
  );
  assert.equal(await db.user.count(), 2);
  assert.equal(await db.membership.count(), 2);
  pass(
    "HTTP registration, bcrypt cost 12, duplicate/invalid registration and atomic user-membership creation",
  );

  const login = await status(
    http(origins.legacy, "auth/login", {
      method: "POST",
      body: { email: " ONE@EXAMPLE.INVALID ", password },
    }),
    200,
  );
  await status(
    http(origins.minimal, "auth/login", {
      method: "POST",
      body: { identifier: "12345678", password },
    }),
    200,
  );
  await status(
    http(origins.minimal, "auth/login", {
      method: "POST",
      body: { email: registration.email, password: "wrong" },
    }),
    401,
  );
  await status(
    http(origins.minimal, "auth/login", {
      method: "POST",
      body: { email: "missing@example.invalid", password },
    }),
    401,
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
  const { Identity, IdentitySessions, requireControlPermission } = compiled(
    "identity-core/identity",
  );
  const { AuthCoreTokens, PrismaIdentityAccess } = compiled(
    "identity-adapters/authcore",
  );
  const {
    PrismaIdentityAccounts,
    PrismaMembershipProfiles,
    RedisVerifiedKioskSessions,
    LegacyVehicleLinks,
  } = compiled("identity-adapters/persistence");
  const accounts = new PrismaIdentityAccounts(db),
    profiles = new PrismaMembershipProfiles(db),
    access = new PrismaIdentityAccess(db);
  const core = new Identity({
    accounts,
    passwords: { compare },
    tokens: new AuthCoreTokens(jwt),
    grants: access,
    revocations: access,
    clock: { nowSeconds: () => Date.now() / 1000 },
    dummyPasswordHash: async () => operatorHash,
  });
  assert.equal((await accounts.byEmail(registration.email)).id, userId);
  assert.equal((await accounts.byDni("12345678")).id, userId);
  assert.equal(await accounts.byDni("00000000"), null);
  assert.equal(
    (await core.authenticate(login.accessToken)).actor.userId,
    userId,
  );
  const coreLogin = await core.login({ identifier: "12345678", password });
  await status(
    http(origins.minimal, "memberships/me", {
      headers: bearer(coreLogin.accessToken),
    }),
    200,
  );
  const profile = await profiles.forUser(userId);
  assert.deepEqual(Object.keys(profile).sort(), [
    "email",
    "id",
    "name",
    "number",
    "status",
    "userId",
  ]);
  pass(
    "Real Prisma accounts/profile adapters run without Nest bootstrap; core and legacy JWT interoperate",
  );

  for (const token of [
    login.accessToken + "x",
    jwt.sign({ sub: userId, ver: 0 }, { expiresIn: -1 }),
    jwt.sign({ sub: userId, ver: 0 }, { issuer: "other" }),
    jwt.sign({ sub: userId, ver: 0 }, { audience: "other" }),
    jwt.sign({ sub: userId, ver: 0 }, { algorithm: "HS384" }),
  ]) {
    await assert.rejects(core.authenticate(token));
    for (const origin of [origins.legacy, origins.minimal])
      await status(
        http(origin, "memberships/me", { headers: bearer(token) }),
        401,
      );
  }
  await core.revokeAll(userId);
  for (const origin of [origins.legacy, origins.minimal])
    await status(
      http(origin, "memberships/me", { headers: bearer(login.accessToken) }),
      401,
    );
  await assert.rejects(core.authenticate(login.accessToken));
  let token = (await core.login({ email: registration.email, password }))
    .accessToken;
  await db.user.update({ where: { id: userId }, data: { active: false } });
  await status(
    http(origins.minimal, "memberships/me", { headers: bearer(token) }),
    403,
  );
  await assert.rejects(core.authenticate(token));
  await db.user.update({ where: { id: userId }, data: { active: true } });
  pass(
    "JWT tampering, expiry, issuer/audience/algorithm, authVersion revocation and inactive accounts denied",
  );

  await status(
    http(origins.administration, "control/session", { headers: bearer(token) }),
    403,
  );
  const control = await db.adminControlAccount.create({
    data: {
      userId,
      role: "ENCARGADO",
      status: "APPROVED",
      emailVerifiedAt: new Date(),
    },
  });
  await db.adminControlGrant.create({
    data: { userId, permission: "ADMIN_CONTROL_ACCESS", reason: "Synthetic" },
  });
  await db.adminStationAssignment.create({
    data: {
      userId,
      accountId: control.id,
      stationId: station.id,
      reason: "Synthetic",
    },
  });
  await db.adminStationAssignment.create({
    data: {
      userId,
      accountId: control.id,
      stationId: stationB.id,
      reason: "Synthetic",
      endedAt: new Date(),
    },
  });
  const actor = (await core.authenticate(token, "control")).actor;
  assert.deepEqual(actor.stationIds, [station.id]);
  const controlHttp = await status(
    http(origins.administration, "control/session", { headers: bearer(token) }),
    200,
  );
  assert.deepEqual(controlHttp.permissions, actor.permissions);
  assert.equal(controlHttp.global, actor.global);
  requireControlPermission(actor, "ADMIN_CONTROL_ACCESS", station.id);
  assert.throws(() =>
    requireControlPermission(actor, "ADMIN_CONTROL_ACCESS", stationB.id),
  );
  assert.throws(() =>
    requireControlPermission(actor, "ADMIN_USER_MANAGE", station.id),
  );
  await db.adminControlGrant.updateMany({
    where: { userId },
    data: { revokedAt: new Date() },
  });
  await assert.rejects(core.authenticate(token, "control"));
  await status(
    http(origins.administration, "control/session", { headers: bearer(token) }),
    403,
  );
  await db.userPermissionGrant.create({
    data: { userId, permission: "SYSTEM_ADMIN", reason: "Synthetic" },
  });
  assert.equal((await core.authenticate(token, "control")).actor.global, true);
  await db.userPermissionGrant.updateMany({
    where: { userId },
    data: { revokedAt: new Date() },
  });
  pass(
    "Live PostgreSQL grants, ended assignment filtering, insufficient permission, station scope and SYSTEM_ADMIN",
  );

  const vehicle = { plate: "ABC-123", label: "Synthetic" };
  await status(
    http(origins.minimal, "vehicles", {
      method: "POST",
      body: vehicle,
      headers: bearer(token),
    }),
    201,
  );
  await status(
    http(origins.legacy, "vehicles/ABC-123", {
      headers: bearer(second.accessToken),
    }),
    404,
  );
  await status(
    http(origins.minimal, "vehicles", {
      method: "POST",
      body: vehicle,
      headers: bearer(second.accessToken),
    }),
    409,
  );
  const ownVehicles = await status(
    http(origins.minimal, "vehicles", { headers: bearer(second.accessToken) }),
    200,
  );
  assert.deepEqual(ownVehicles, []);
  const { PrismaService } = compiled("prisma/prisma.service");
  const serviceDb = new PrismaService({ datasources: { db: { url } } });
  try {
    const { VehiclesRepository } = compiled("vehicles/vehicles.repository");
    const links = new LegacyVehicleLinks(new VehiclesRepository(serviceDb));
    await links.link(userId, "DEF-456", "Synthetic adapter");
    await assert.rejects(links.link(secondId, "DEF-456", "Other"));
    assert.equal(
      (await db.vehicle.findUniqueOrThrow({ where: { plate: "DEF-456" } }))
        .membershipId,
      profile.id,
    );
  } finally {
    await serviceDb.$disconnect();
  }
  pass(
    "HTTP and vehicle port preserve exclusive atomic ownership and isolation between users",
  );

  if (standalone) {
    const results = await Promise.all(
      [token, second.accessToken].map((value) =>
        http(origins.minimal, "vehicles", {
          method: "POST",
          body: { plate: "RAC-789", label: "Synthetic concurrent owner" },
          headers: bearer(value),
        }),
      ),
    );
    assert.deepEqual(results.map((result) => result.status).sort(), [201, 409]);
    const beforeCounter = (
      await db.membershipNumberCounter.findUniqueOrThrow({ where: { id: 1 } })
    ).value;
    await status(
      http(origins.minimal, "auth/register", {
        method: "POST",
        body: registration,
      }),
      409,
    );
    assert.equal(
      (await db.membershipNumberCounter.findUniqueOrThrow({ where: { id: 1 } }))
        .value,
      beforeCounter,
    );
    await status(
      http(origins.minimal, "memberships/me/profile", {
        method: "PATCH",
        headers: bearer(token),
        body: { passport: "SYNTHETIC42" },
      }),
      400,
    );
    assert.equal(
      (await db.membership.findUniqueOrThrow({ where: { userId } })).passport,
      null,
    );
    pass(
      "Own identity client preserves concurrent vehicle exclusivity and atomic membership-counter/profile rollback",
    );
  }
  const fuel = await db.fuel.create({
    data: { code: "LAB", name: "Synthetic", pricePerGallon: "21.30" },
  });
  await db.membership.update({
    where: { id: profile.id },
    data: { balance: "12.34" },
  });
  await db.fuelAuthorization.create({
    data: {
      operationId: crypto.randomUUID(),
      requestHash: "0".repeat(64),
      membershipId: profile.id,
      plate: "ABC-123",
      stationId: station.id,
      fuelId: fuel.id,
      authorizedAmount: "5.67",
      reservedAmount: "5.67",
      balanceAfter: "12.34",
      mode: "POSTPAGO",
    },
  });
  const sale = await db.transaction.create({
    data: {
      operationId: crypto.randomUUID(),
      requestHash: "1".repeat(64),
      membershipId: profile.id,
      plate: "ABC-123",
      stationId: station.id,
      fuelId: fuel.id,
      amount: "2.01",
      unitPrice: "21.30",
      pointsRate: "9",
      pointsEarned: 0,
      mode: "POSTPAGO",
      status: "PAYMENT_PENDING",
    },
  });
  await db.membershipDebt.create({
    data: {
      membershipId: profile.id,
      transactionId: sale.id,
      amountOriginal: "2.01",
      amountPending: "2.01",
    },
  });
  const earnedSale = await db.transaction.create({
    data: {
      operationId: crypto.randomUUID(),
      requestHash: "2".repeat(64),
      membershipId: profile.id,
      plate: "ABC-123",
      stationId: station.id,
      fuelId: fuel.id,
      amount: "81.00",
      unitPrice: "21.30",
      pointsRate: "9",
      pointsEarned: 9,
      mode: "POSTPAGO",
      status: "PAID",
    },
  });
  await db.rewardMovement.create({
    data: {
      membershipId: profile.id,
      transactionId: earnedSale.id,
      kind: "EARN",
      points: 9,
    },
  });
  const financeSnapshot = async () => {
    const tables = [
      "Membership",
      "Transaction",
      "FuelAuthorization",
      "MembershipDebt",
      "RewardMovement",
      "WalletMovement",
      "Payment",
      "Redemption",
      "FuelInventory",
      "InventoryReservation",
      "InventoryMovement",
    ];
    const snapshot = {};
    for (const table of tables)
      snapshot[table] = await db.$queryRawUnsafe(
        `SELECT row_to_json(t)::text AS row FROM "${table}" t ORDER BY row_to_json(t)::text`,
      );
    return JSON.stringify(snapshot);
  };
  const before = await financeSnapshot();
  const oldMe = await status(
    http(origins.legacy, "memberships/me", { headers: bearer(token) }),
    200,
  );
  const newMe = await status(
    http(origins.minimal, "memberships/me", { headers: bearer(token) }),
    200,
  );
  assert.deepEqual(newMe, oldMe);
  for (const [key, value] of Object.entries({
    balance: "12.34",
    reserved: "5.67",
    available: "12.34",
    total: "18.01",
    pendingBalance: "2.01",
    points: 9,
  }))
    assert.equal(newMe[key], value);
  assert.equal(await financeSnapshot(), before);
  // PostgreSQL enforces read-only for the same HTTP path and projection adapter.
  const readerSecret = crypto.randomBytes(32).toString("hex");
  runtimeSecrets.push(readerSecret);
  await db.$executeRawUnsafe(
    `CREATE ROLE identity_reader LOGIN PASSWORD '${readerSecret}'`,
  );
  await db.$executeRawUnsafe("GRANT USAGE ON SCHEMA public TO identity_reader");
  await db.$executeRawUnsafe(
    "GRANT SELECT ON ALL TABLES IN SCHEMA public TO identity_reader",
  );
  if (consumerCorrelations)
    await db.$executeRawUnsafe(
      'REVOKE ALL ON "IdentityConsumerIntent" FROM identity_reader',
    );
  const readerUrl = new URL(url);
  readerUrl.username = "identity_reader";
  readerUrl.password = readerSecret;
  const roPort = await freePort();
  const roOrigin = "http://127.0.0.1:" + roPort;
  await ready(
    roOrigin,
    start("tools/astra/identity-lab-app.cjs", {
      ...env,
      DATABASE_URL: readerUrl.href,
      DATABASE_URL_UNPOOLED: readerUrl.href,
      PORT: String(roPort),
    }),
  );
  assert.deepEqual(
    await status(
      http(roOrigin, "memberships/me", { headers: bearer(token) }),
      200,
    ),
    oldMe,
  );
  const readDb = new PrismaClient({
    datasources: { db: { url: readerUrl.href } },
  });
  try {
    await assert.rejects(
      readDb.$executeRawUnsafe('UPDATE "Membership" SET "balance"="balance"'),
    );
  } finally {
    await readDb.$disconnect();
  }
  assert.equal(await financeSnapshot(), before);
  pass(
    "memberships/me HTTP parity, nonzero Decimal/reservations/debt/points, SELECT-only role and unchanged financial snapshots",
  );

  await status(
    http(origins.minimal, "auth/forgot-password", {
      method: "POST",
      body: { email: registration.email },
    }),
    200,
  );
  assert.equal(smtp.messages.length, 1);
  // Nodemailer may encode the text as quoted-printable. Decode only the local fixture.
  const mail = smtp.messages[0]
    .replace(/=\r?\n/g, "")
    .replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  const code = mail.match(/verificaci[^\n]*?: (\d{8})/)?.[1];
  assert.ok(code, "Recovery code captured by local TLS SMTP");
  const resetRow = await db.passwordReset.findUniqueOrThrow({
    where: { userId },
  });
  assert.notEqual(resetRow.codeHash, code);
  assert.equal(resetRow.tokenHash, null);
  await status(
    http(origins.minimal, "auth/verify-reset-code", {
      method: "POST",
      body: {
        email: registration.email,
        code: code === "00000000" ? "00000001" : "00000000",
      },
    }),
    400,
  );
  assert.equal(
    (await db.passwordReset.findUniqueOrThrow({ where: { userId } })).attempts,
    1,
  );
  const reset = await status(
    http(origins.minimal, "auth/verify-reset-code", {
      method: "POST",
      body: { email: registration.email, code },
    }),
    200,
  );
  const newPassword = "Synthetic-new-password-43!";
  if (standalone) {
    const version = (await db.user.findUniqueOrThrow({ where: { id: userId } }))
      .authVersion;
    const consumed = await Promise.all(
      Array.from({ length: 2 }, () =>
        http(origins.minimal, "auth/reset-password", {
          method: "POST",
          body: { resetToken: reset.resetToken, password: newPassword },
        }),
      ),
    );
    assert.deepEqual(
      consumed.map((result) => result.status).sort(),
      [200, 400],
    );
    assert.equal(
      (await db.user.findUniqueOrThrow({ where: { id: userId } })).authVersion,
      version + 1,
    );
  } else {
    await status(
      http(origins.minimal, "auth/reset-password", {
        method: "POST",
        body: { resetToken: reset.resetToken, password: newPassword },
      }),
      200,
    );
  }
  await status(
    http(origins.minimal, "auth/reset-password", {
      method: "POST",
      body: { resetToken: reset.resetToken, password: newPassword },
    }),
    400,
  );
  await status(
    http(origins.legacy, "memberships/me", { headers: bearer(token) }),
    401,
  );
  await status(
    http(origins.legacy, "auth/login", {
      method: "POST",
      body: { email: registration.email, password },
    }),
    401,
  );
  token = (
    await status(
      http(origins.legacy, "auth/login", {
        method: "POST",
        body: { email: registration.email, password: newPassword },
      }),
      200,
    )
  ).accessToken;
  await core.authenticate(token);
  assert.ok(
    (await db.passwordReset.findUniqueOrThrow({ where: { userId } })).usedAt,
  );
  assert.equal(await financeSnapshot(), before);
  pass(
    "Real STARTTLS SMTP recovery HTTP; failed attempt persists, reset single use and previous password/JWT revoked",
  );

  let pre = await status(signedHttp(origins.minimal, "kiosk/session"), 200);
  const operatorBody = { username: "synthetic-operator", password };
  await status(
    signedHttp(origins.minimal, "kiosk/session/login", {
      method: "POST",
      body: operatorBody,
      session: pre.token,
      csrf: "wrong",
    }),
    403,
  );
  const session = await status(
    signedHttp(origins.minimal, "kiosk/session/login", {
      method: "POST",
      body: operatorBody,
      session: pre.token,
      csrf: pre.csrfToken,
    }),
    201,
  );
  for (const origin of [origins.legacy, origins.minimal]) {
    assert.deepEqual(
      await status(http(origin, "admin/demo-credentials"), 200),
      { enabled: false },
    );
    await status(
      http(origin, "admin/login", {
        method: "POST",
        body: { username: "synthetic-admin", password: "wrong" },
      }),
      401,
    );
    const adminSession = await status(
      http(origin, "admin/login", {
        method: "POST",
        body: { username: "synthetic-admin", password },
      }),
      201,
    );
    await status(
      http(origin, "admin/alerts", {
        headers: bearer(adminSession.accessToken),
      }),
      200,
    );
    await status(http(origin, "admin/alerts", { headers: bearer(token) }), 403);
    const check = await status(
      signedHttp(origin, "admin/check-plate", {
        method: "POST",
        body: {
          plate: "ABC-123",
          membershipCode: profile.number,
          operationId: crypto.randomUUID(),
        },
        session: session.token,
        csrf: session.csrfToken,
      }),
      201,
    );
    assert.deepEqual(check, { mismatch: false });
  }
  pass(
    "Full Identity HTTP composition includes existing admin login/alerts/check-plate with original authorization",
  );
  const version = crypto
    .createHmac("sha256", kioskSecret)
    .update(
      JSON.stringify(["synthetic-operator", operatorHash, station.id, "1"]),
    )
    .digest("hex");
  const sessionAdapter = new RedisVerifiedKioskSessions(redis, {
    namespace: name,
    stationId: station.id,
    version,
  });
  const sessions = new IdentitySessions(sessionAdapter, {
    nowSeconds: () => Date.now() / 1000,
  });
  assert.deepEqual(await sessions.resolveVerifiedKioskSession(session.token), {
    kind: "kiosk",
    stationId: station.id,
  });
  await status(
    signedHttp(origins.legacy, "vehicles/ABC-123", {
      session: session.token,
      csrf: session.csrfToken,
    }),
    200,
  );
  await status(
    signedHttp(origins.minimal, "vehicles/ABC-123", {
      session: session.token,
      bad: true,
    }),
    401,
  );
  await status(
    signedHttp(origins.minimal, "vehicles/ABC-123?stationId=" + stationB.id, {
      session: session.token,
    }),
    403,
  );
  const sessionKey = `primax:v12:${name}:session:${crypto.createHash("sha256").update(session.token).digest("hex")}`;
  const sessionRaw = await redis.get(sessionKey),
    sessionRow = JSON.parse(sessionRaw);
  for (const patch of [
    { expiresAt: Date.now() - 1 },
    { stationId: stationB.id },
    { version: "other" },
    { authenticated: false },
  ]) {
    await redis.set(sessionKey, JSON.stringify({ ...sessionRow, ...patch }));
    await assert.rejects(sessions.resolveVerifiedKioskSession(session.token));
    await status(
      signedHttp(origins.minimal, "vehicles/ABC-123", {
        session: session.token,
      }),
      401,
    );
  }
  await redis.set(sessionKey, sessionRaw);
  await status(
    signedHttp(origins.minimal, "kiosk/session/logout", {
      method: "POST",
      body: {},
      session: session.token,
      csrf: session.csrfToken,
    }),
    201,
  );
  assert.equal(await redis.get(sessionKey), null);
  await assert.rejects(sessions.resolveVerifiedKioskSession(session.token));
  await redis.set(sessionKey, sessionRaw);
  await sessions.revoke(session.token);
  await status(
    signedHttp(origins.legacy, "vehicles/ABC-123", { session: session.token }),
    401,
  );
  pass(
    "Real Redis kiosk pre-session/login/logout, CSRF/signature/station/version/expiry and port revocation parity",
  );

  const bootstrap = await status(
    signedHttp(origins.minimal, "kiosk/session/terminal-bootstrap", {
      method: "POST",
      body: { terminalId: terminal.id },
    }),
    201,
  );
  assert.match(bootstrap.terminalToken, /^[a-f0-9]{64}$/);
  const credential = await db.terminalCredential.findUniqueOrThrow({
    where: {
      tokenHash: crypto
        .createHash("sha256")
        .update(bootstrap.terminalToken)
        .digest("hex"),
    },
  });
  assert.equal(credential.terminalId, terminal.id);
  const terminalMe = await status(
    signedHttp(origins.commerce, "terminal/me", {
      technical: bootstrap.terminalToken,
    }),
    200,
  );
  assert.equal(terminalMe.id, terminal.id);
  assert.equal(terminalMe.stationId, station.id);
  await status(
    signedHttp(origins.minimal, "kiosk/session/terminal-bootstrap", {
      method: "POST",
      body: { terminalId: otherTerminal.id },
    }),
    409,
  );
  await status(
    http(origins.commerce, "terminal/me", {
      headers: { "x-terminal-session": bootstrap.terminalToken },
    }),
    401,
  );
  await status(
    signedHttp(origins.commerce, "terminal/me", {
      technical: bootstrap.terminalToken + "a",
    }),
    401,
  );
  await status(
    signedHttp(origins.commerce, "terminal/me", {
      technical: bootstrap.terminalToken,
      bad: true,
    }),
    401,
  );
  await db.terminalCredential.update({
    where: { id: credential.id },
    data: {
      issuedAt: new Date(Date.now() - 120000),
      expiresAt: new Date(Date.now() - 60000),
    },
  });
  await status(
    signedHttp(origins.commerce, "terminal/me", {
      technical: bootstrap.terminalToken,
    }),
    401,
  );
  await db.terminalCredential.update({
    where: { id: credential.id },
    data: { expiresAt: new Date(Date.now() + 60000), revokedAt: new Date() },
  });
  await status(
    signedHttp(origins.commerce, "terminal/me", {
      technical: bootstrap.terminalToken,
    }),
    401,
  );
  await db.terminalCredential.update({
    where: { id: credential.id },
    data: { revokedAt: null },
  });
  await db.terminal.update({
    where: { id: terminal.id },
    data: { lifecycle: "REVOCADA", revokedAt: new Date() },
  });
  await status(
    signedHttp(origins.commerce, "terminal/me", {
      technical: bootstrap.terminalToken,
    }),
    401,
  );
  await db.terminal.update({
    where: { id: terminal.id },
    data: { lifecycle: "REGISTRADA", revokedAt: null },
  });
  pass(
    "Existing technical bootstrap and Commerce terminal/me: valid/altered/expired/revoked credentials, signature and station isolation",
  );

  const { KioskStore } = compiled("kiosk/redis-store");
  const { ConfigService } = load("@nestjs/config");
  const managedStore = new KioskStore(
    new ConfigService({
      APP_MODE: "local",
      KIOSK_REDIS_URL: redisUrl,
      KIOSK_SESSION_NAMESPACE: name,
    }),
  );
  managedStores.push(managedStore);
  const identityPid = processes.minimal.pid;
  async function freshOperator() {
    const initial = await status(
      signedHttp(origins.minimal, "kiosk/session"),
      200,
    );
    return status(
      signedHttp(origins.minimal, "kiosk/session/login", {
        method: "POST",
        body: operatorBody,
        session: initial.token,
        csrf: initial.csrfToken,
      }),
      201,
    );
  }
  async function eventuallySigned(origin, active, expected) {
    for (let attempt = 0; attempt < 50; attempt++) {
      const response = await signedHttp(origin, "vehicles/ABC-123", {
        session: active.token,
        csrf: active.csrfToken,
      });
      if (response.status === expected) return;
      assert.equal(
        response.status,
        503,
        "Unexpected Redis recovery HTTP status",
      );
      await delay(100);
    }
    throw Error("Redis recovery deadline exceeded");
  }
  async function rawReconnect() {
    if (redis.isOpen) redis.destroy();
    redis = load("redis").createClient({
      url: redisUrl,
      disableOfflineQueue: true,
      socket: { connectTimeout: 2000, reconnectStrategy: false },
    });
    redis.on("error", () => {});
    await redis.connect();
  }
  async function readyRedis() {
    let available = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        assert.equal(
          docker(
            "exec",
            name + "-redis",
            "redis-cli",
            "--no-auth-warning",
            "-a",
            redisSecret,
            "PING",
          ).trim(),
          "PONG",
        );
        available = true;
        break;
      } catch {}
      await delay(100);
    }
    assert.ok(available, "Redis readiness");
    assert.equal(
      docker("port", name + "-redis", "6379/tcp")
        .trim()
        .split(":")
        .at(-1),
      redisPort,
    );
  }
  async function managedReady() {
    for (let attempt = 0; attempt < 50; attempt++) {
      try {
        assert.equal(await managedStore.command("PING"), "PONG");
        return;
      } catch {}
      await delay(100);
    }
    throw Error("KioskStore recovery deadline exceeded");
  }
  async function oneConnectionAndNoReplay(label) {
    const ids = await Promise.all(
      Array.from({ length: 30 }, () => managedStore.command("CLIENT", "ID")),
    );
    assert.equal(
      new Set(ids).size,
      1,
      "Concurrent calls must share a connection",
    );
    const counter = managedStore.key("recovery-counter:" + label);
    const values = await Promise.all(
      Array.from({ length: 30 }, () => managedStore.command("INCR", counter)),
    );
    assert.deepEqual(
      values.sort((a, b) => a - b),
      Array.from({ length: 30 }, (_, i) => i + 1),
    );
  }
  await oneConnectionAndNoReplay("initial");
  let active = await freshOperator();
  const activeKey = `primax:v12:${name}:session:${crypto.createHash("sha256").update(active.token).digest("hex")}`;
  const preserved = await redis.get(activeKey);
  docker(
    "exec",
    name + "-redis",
    "redis-cli",
    "--no-auth-warning",
    "-a",
    redisSecret,
    "CLIENT",
    "KILL",
    "TYPE",
    "normal",
    "SKIPME",
    "yes",
  );
  await eventuallySigned(origins.minimal, active, 200);
  await eventuallySigned(origins.legacy, active, 200);
  await managedReady();
  await rawReconnect();
  assert.equal(await redis.get(activeKey), preserved);
  await oneConnectionAndNoReplay("disconnect");
  await status(
    signedHttp(origins.minimal, "vehicles/ABC-123", {
      session: session.token,
      csrf: session.csrfToken,
    }),
    401,
  );
  await status(
    signedHttp(origins.minimal, "kiosk/session/logout", {
      method: "POST",
      body: {},
      session: active.token,
      csrf: active.csrfToken,
    }),
    201,
  );
  await status(
    signedHttp(origins.minimal, "vehicles/ABC-123", {
      session: active.token,
      csrf: active.csrfToken,
    }),
    401,
  );
  pass(
    "Socket disconnect recovers without Identity restart; preserved session valid, revoked sessions invalid, one connection and exact INCR counts",
  );
  active = await freshOperator();
  for (let cycle = 1; cycle <= 2; cycle++) {
    const lostSession = active;
    docker("stop", name + "-redis");
    await delay(2200); // Let the driver's finite background retry budget exhaust.
    const failed = await Promise.all(
      Array.from({ length: 20 }, () =>
        managedStore.command("INCR", managedStore.key("must-not-replay")).then(
          () => false,
          (e) => e.status === 503,
        ),
      ),
    );
    assert.ok(failed.every(Boolean));
    for (const origin of [origins.minimal, origins.legacy]) {
      const failures = await Promise.all(
        Array.from({ length: 6 }, () =>
          signedHttp(origin, "vehicles/ABC-123", {
            session: lostSession.token,
            csrf: lostSession.csrfToken,
          }),
        ),
      );
      assert.ok(failures.every((response) => response.status === 503));
    }
    await status(
      http(origins.minimal, "memberships/me", { headers: bearer(token) }),
      200,
    );
    docker("start", name + "-redis");
    await readyRedis();
    await rawReconnect();
    await eventuallySigned(origins.minimal, lostSession, 401);
    await eventuallySigned(origins.legacy, lostSession, 401);
    await managedReady();
    assert.equal(await redis.get(managedStore.key("must-not-replay")), null);
    assert.equal(
      await redis.get(
        `primax:v12:${name}:session:${crypto.createHash("sha256").update(lostSession.token).digest("hex")}`,
      ),
      null,
    );
    await oneConnectionAndNoReplay("restart-" + cycle);
    active = await freshOperator();
    assert.notEqual(active.token, lostSession.token);
    for (const origin of [origins.minimal, origins.legacy]) {
      const responses = await Promise.all(
        Array.from({ length: 6 }, () =>
          signedHttp(origin, "vehicles/ABC-123", {
            session: active.token,
            csrf: active.csrfToken,
          }),
        ),
      );
      assert.ok(responses.every((response) => response.status === 200));
    }
    await status(
      signedHttp(origins.minimal, "vehicles/ABC-123", {
        session: active.token,
        csrf: "wrong",
      }),
      403,
    );
    await status(
      signedHttp(origins.minimal, "vehicles/ABC-123", {
        session: active.token,
        csrf: active.csrfToken,
        bad: true,
      }),
      401,
    );
    await status(
      signedHttp(origins.minimal, "vehicles/ABC-123", {
        session: session.token,
        csrf: session.csrfToken,
      }),
      401,
    );
    assert.equal(processes.minimal.pid, identityPid);
    assert.equal(processes.minimal.exitCode, null);
    assert.equal(processes.legacy.exitCode, null);
    pass(
      "Redis restart cycle " +
        cycle +
        ": exhaustion/503, automatic reconnect without Identity restart, lost sessions 401, fresh login and CSRF/signature intact",
    );
  }

  if (standalone) {
    const fullMe = await status(
      http(origins.minimal, "memberships/me", { headers: bearer(token) }),
      200,
    );
    assert.deepEqual(
      fullMe,
      await status(
        http(origins.legacy, "memberships/me", { headers: bearer(token) }),
        200,
      ),
    );
    for (const route of ["transactions", "rewards", "redemptions"]) {
      assert.deepEqual(
        await status(
          http(origins.minimal, "memberships/me/" + route, {
            headers: bearer(token),
          }),
          200,
        ),
        await status(
          http(origins.legacy, "memberships/me/" + route, {
            headers: bearer(token),
          }),
          200,
        ),
      );
    }
    const denied = await fetchLocal(
      bridge.origin + "/identity-compat/finance/me",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId }),
      },
    );
    assert.equal(denied.status, 401);
    await bridge.stop();
    await status(
      http(origins.minimal, "memberships/me", { headers: bearer(token) }),
      503,
    );
    await status(
      http(origins.minimal, "admin/alerts", {
        headers: bearer(
          jwt.sign({
            sub: "admin",
            role: "admin",
            adminUser: "synthetic-admin",
          }),
        ),
      }),
      503,
    );
    await status(
      http(origins.minimal, "auth/login", {
        method: "POST",
        body: { email: registration.email, password: newPassword },
      }),
      200,
    );
    await status(
      signedHttp(origins.minimal, "kiosk/session", {
        session: active.token,
        csrf: active.csrfToken,
      }),
      200,
    );
    await bridge.listen();
    assert.deepEqual(
      await status(
        http(origins.minimal, "memberships/me", { headers: bearer(token) }),
        200,
      ),
      fullMe,
    );
    assert.equal(
      JSON.stringify(
        await db.$queryRawUnsafe(
          "SELECT conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE contype='f' ORDER BY conname",
        ),
      ),
      foreignKeysBefore,
    );
    pass(
      "Financial/Alerts ports authenticated and fail closed; native login/Redis remain available; history parity and unchanged foreign keys",
    );
    if (operational) {
      const projectLoad = createRequire(path.join(runtimeRoot, "package.json"));
      operationalDb = new (projectLoad(
        "./dist/persistence/compatibility-db",
      ).PrismaService)(
        new (projectLoad("@nestjs/config").ConfigService)({
          IDENTITY_COMPAT_DATABASE_URL:
            standaloneEnv.IDENTITY_COMPAT_DATABASE_URL,
        }),
      );
      await require("./identity-operational-checks.cjs")({
        db,
        projectLoad,
        portDb: operationalDb,
        origin: origins.minimal,
        http,
        signed,
        status,
        pass,
        redis,
        docker,
        httpStationId: station.id,
        redisContainer: name + "-redis",
        redisSecret,
        remote: remoteReceipts,
      });
      if (remoteReceipts)
        await require("./identity-remote-receipt-checks.cjs")({
          db,
          projectLoad,
          origin: origins.minimal,
          providerOrigin: standaloneEnv.OPERATIONAL_ORIGIN,
          apiKey: providerEnv.OPERATIONAL_API_KEY,
          restartProvider,
          getProvider: () => providerProcess,
          identityProcess: processes.minimal,
          http,
          signed,
          status,
          pass,
          docker,
          pgContainer: name + "-pg",
          stationId: station.id,
          providerUrl: providerEnv.IDENTITY_COMPAT_DATABASE_URL,
          redisContainer: name + "-redis",
          redisSecret,
          financialRead: () =>
            http(origins.minimal, "memberships/me", { headers: bearer(token) }),
        });
    }
    if (consumerCorrelations) await runConsumerChecks();
    for (const domain of ["legacy", "commerce", "administration"])
      await stop(processes[domain]);
    await status(
      http(origins.minimal, "auth/login", {
        method: "POST",
        body: { email: registration.email, password: newPassword },
      }),
      200,
    );
    assert.deepEqual(
      await status(
        http(origins.minimal, "memberships/me", { headers: bearer(token) }),
        200,
      ),
      fullMe,
    );
    await status(http(origins.minimal, "health"), 200);
    pass(
      "Backend HTTP entrypoints stopped: standalone native authentication and compatibility reads remain available",
    );
  }
  docker("stop", name + "-pg");
  await assert.rejects(core.authenticate(token));
  assert.ok(
    (await http(origins.minimal, "memberships/me", { headers: bearer(token) }))
      .status >= 500,
  );
  await status(http(origins.minimal, "health"), 503);
  pass(
    "PostgreSQL outage rejects core authentication and protected HTTP; health 503, never permissive",
  );
}

run()
  .catch((error) => {
    if (error.labReadiness)
      console.error("READINESS", redact(JSON.stringify(error.labReadiness)));
    if (bridge?.diagnostics)
      console.error("BRIDGE_DIAGNOSTICS", JSON.stringify(bridge.diagnostics));
    // Prisma errors can contain input credentials: do not serialize their messages.
    console.error(
      "LOCATION",
      (error.stack || "")
        .split("\n")
        .filter((line) => line.includes("identity-isolated.cjs:"))
        .join("\n"),
    );
    console.error(
      "FAIL",
      error.name,
      redact(error.code || ""),
      redact(
        error.name === "AssertionError" ? error.message : "lab step failed",
      ),
    );
    for (const child of children)
      if (child.exitCode !== null)
        console.error("Child exited", child.exitCode, redact(child.logs));
    process.exitCode = 1;
  })
  .finally(async () => {
    for (const store of managedStores) await store.onModuleDestroy();
    for (const child of children.reverse()) await stop(child);
    if (redis?.isOpen) await redis.quit().catch(() => redis.destroy());
    if (operationalDb) await operationalDb.$disconnect();
    if (db) await db.$disconnect();
    if (smtp) await smtp.close();
    if (bridge) await bridge.close();
    // Only resources created by this invocation; stop retains containers for audit.
    for (const container of containers) {
      try {
        docker("stop", container);
      } catch {
        process.exitCode = 1;
      }
    }
    for (const [file, expected] of Object.entries(previousEvidence)) {
      if (
        crypto
          .createHash("sha256")
          .update(fs.readFileSync(file))
          .digest("hex") !== expected
      )
        process.exitCode = 1;
    }
    // Erase temporary private keys/CA from this invocation, never repository artifacts.
    for (const file of ["smtp-key.pem", "smtp-cert.pem"]) {
      const p = path.join(tmp, file);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
    const result = {
      syntheticLab: name,
      passed: checks.length,
      success: !process.exitCode,
      autonomousDeploymentReady: false,
      redisRecoveryResolved: !consumerOnly && !process.exitCode,
      fullRegression: !consumerOnly,
      identityRestarted: false,
      standaloneRuntime: standalone,
      operationalPort: operational,
      remoteReceipts,
      consumerCorrelations,
      actorIntentContract,
      consumerV2,
      fuelFlowPrivate,
      controlRemote,
      secureTransport,
      consumerOnly,
      sqlAtomicBoundary: remoteReceipts
        ? "Terminal + TerminalOperation + TerminalCredential + OperationalAuditEvent + IdentityOperationalReceipt"
        : operational
          ? "Terminal + TerminalOperation + TerminalCredential + OperationalAuditEvent"
          : null,
      artifactOutsideBackend: standalone,
      artifactReused: Boolean(reusedArtifact),
      artifactSourceSha256,
      artifactDistSha256,
      identityProjectionModelCount: standalone ? 14 : null,
      knownBlockers: standalone
        ? [
            "Physical tables/FKs still shared; full-schema operational kiosk client retained; financial/Alerts bridge requires legacy adapter host.",
          ]
        : [
            "Shared Backend runtime/schema, legacy atomic vehicle writes and local financial projection still required.",
          ],
      checks,
      protectedJsonCount: Object.keys(previousEvidence).length,
      protectedJsonUnchanged: Object.entries(previousEvidence).every(
        ([file, digest]) =>
          crypto
            .createHash("sha256")
            .update(fs.readFileSync(file))
            .digest("hex") === digest,
      ),
      containersStopped: containers,
      network: networkCreated ? name : null,
    };
    fs.writeFileSync(evidence, JSON.stringify(result, null, 2) + "\n");
    console.log(JSON.stringify(result));
  });

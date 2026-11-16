// Real synthetic TLS, shared nonce ledger, two Identity + two FuelFlow OS processes.
module.exports = async function (ctx, lab) {
  const assert = require("node:assert/strict"),
    crypto = require("node:crypto"),
    fs = require("node:fs"),
    path = require("node:path"),
    os = require("node:os"),
    https = require("node:https"),
    { execFileSync } = require("node:child_process");
  const fixture = require("./identity-service-tls-fixture.cjs")(),
    { db, u, terminal, pass, once, consumerConfig, projectLoad } = ctx;
  const callerRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "primax-service-caller-"),
  );
  fs.cpSync(
    path.resolve(__dirname, "../../Frontend_1_FuelFlow/lab"),
    callerRoot,
    { recursive: true, verbatimSymlinks: true },
  );
  execFileSync("npm", ["run", "build"], {
    cwd: callerRoot,
    env: { PATH: process.env.PATH },
    stdio: "pipe",
    timeout: 30000,
  });
  const { serviceTransport } = require(
    path.join(callerRoot, "service-transport.cjs"),
  );
  const routes = [
    "/consumer/v2/control/verify",
    "/consumer/v2/intents",
    "/consumer/v2/intents/execute",
  ];
  const keys = [0, 1].map(() => ({
    serviceId: "fuelflow-private",
    keyId: crypto.randomUUID(),
    key: crypto.randomBytes(32).toString("hex"),
  }));
  lab.runtimeSecrets.push(...keys.map((k) => k.key));
  const credentialFile = fixture.file("caller-credential.json");
  function writeCredential(k) {
    const tmp = fixture.file("credential-next.json");
    fs.writeFileSync(tmp, JSON.stringify(k), { mode: 0o600 });
    fs.renameSync(tmp, credentialFile);
  }
  writeCredential(keys[0]);
  for (const k of keys)
    await db.$executeRawUnsafe(
      'INSERT INTO "IdentityServiceCredential" ("keyId","serviceId","secretDigest","stationId",routes,"notBefore","expiresAt") VALUES ($1::uuid,$2,$3,$4::uuid,$5::text[],$6,$7)',
      k.keyId,
      k.serviceId,
      crypto.createHash("sha256").update(k.key).digest("hex"),
      lab.stationId,
      routes,
      new Date(Date.now() - 60000),
      new Date(Date.now() + 3600000),
    );
  const servers = [],
    callers = [],
    proxies = [],
    serverPorts = [
      await lab.freePort(),
      await lab.freePort(),
      await lab.freePort(),
    ],
    callerPorts = [await lab.freePort(), await lab.freePort()];
  const origins = serverPorts.map((p) => "https://127.0.0.1:" + p),
    callerOrigins = callerPorts.map((p) => "http://127.0.0.1:" + p);
  const transport = (index) =>
    serviceTransport(origins[index], fixture.file("ca.crt"), credentialFile);
  async function raw(index, route, body = {}, extra = {}, opts = {}) {
    const k = keys[0],
      now = Date.now();
    const headers = {
      "content-type": "application/json",
      authorization: "Bearer " + u[0].token,
      "x-identity-service": k.serviceId,
      "x-identity-key-id": k.keyId,
      "x-identity-service-key": k.key,
      "x-identity-request-nonce": crypto.randomUUID(),
      "x-identity-issued-at": String(now),
      "x-identity-expires-at": String(now + 30000),
      ...extra,
    };
    return new Promise((resolve, reject) => {
      const q = https.request(
        origins[index] + route,
        {
          method: "POST",
          rejectUnauthorized: true,
          minVersion: "TLSv1.2",
          ca: fs.readFileSync(
            fixture.file(opts.wrongCa ? "wrong-ca.crt" : "ca.crt"),
          ),
          agent: opts.agent || false,
          ...(opts.servername ? { servername: opts.servername } : {}),
          headers,
          signal: AbortSignal.timeout(15000),
        },
        (r) => {
          let data = "";
          const socket = r.socket,
            tlsProtocol = socket.getProtocol(),
            tlsAuthorized = socket.authorized;
          r.on("data", (c) => (data += c));
          r.on("error", reject);
          r.on("end", () =>
            resolve({
              status: r.statusCode,
              body: JSON.parse(data),
              socket,
              tlsProtocol,
              tlsAuthorized,
            }),
          );
        },
      );
      q.on("error", reject);
      q.end(JSON.stringify(body));
    });
  }
  async function launchServer(i, expired = false) {
    if (servers[i]) await lab.stop(servers[i]);
    servers[i] = lab.start(
      path.join(lab.runtimeRoot, "dist/operational/consumer/main.js"),
      {
        ...consumerConfig,
        IDENTITY_SERVICE_TLS_LAB: "enabled",
        IDENTITY_TLS_KEY_FILE: fixture.file("server.key"),
        IDENTITY_TLS_CERT_FILE: fixture.file(
          expired ? "expired.crt" : "server.crt",
        ),
        OPERATIONAL_ORIGIN:
          ctx.providerOrigin || consumerConfig.OPERATIONAL_ORIGIN,
        PORT: String(serverPorts[i]),
      },
    );
    // Provider origin is passed explicitly below by the harness.
    let ready = false;
    for (let n = 0; n < 150; n++) {
      if (servers[i].exitCode !== null) break;
      try {
        if (
          (
            await raw(
              i,
              routes[0],
              {},
              { "x-identity-service-key": "00".repeat(32) },
            )
          ).status === 401
        ) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    if (!expired) assert.ok(ready, "HTTPS Identity readiness");
  }
  async function launchCaller(i, origin = origins[i]) {
    if (callers[i]) await lab.stop(callers[i]);
    callers[i] = lab.start(path.join(callerRoot, "identity-caller.cjs"), {
      FUELFLOW_IDENTITY_PRIVATE_LAB: "enabled",
      IDENTITY_RUNTIME_PROFILE: "synthetic",
      FUELFLOW_CALLER_DATABASE_URL: lab.fuelFlowUrl,
      FUELFLOW_IDENTITY_ORIGIN: origin,
      KIOSK_STATION_ID: lab.stationId,
      FUELFLOW_SERVICE_TLS_LAB: "enabled",
      FUELFLOW_TLS_CA_FILE: fixture.file("ca.crt"),
      FUELFLOW_SERVICE_CREDENTIAL_FILE: credentialFile,
      PORT: String(callerPorts[i]),
    });
    let ready = false;
    for (let n = 0; n < 150; n++) {
      try {
        const r = await fetch(
          callerOrigins[i] + "/private/fuelflow/v1/operations",
          { method: "POST", body: "{}" },
        );
        if (r.status === 401) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.ok(ready, "FuelFlow HTTPS client readiness");
  }
  const req = (t) => ({
    callerOperationId: crypto.randomUUID(),
    action: "TERMINAL_CREDENTIAL_ISSUE",
    stationId: lab.stationId,
    terminalId: t.id,
    expiresAt: new Date(Date.now() + 14 * 60000).toISOString(),
  });
  const call = async (i, route, body, user = u[0]) => {
    const r = await fetch(
      callerOrigins[i] + "/private/fuelflow/v1/operations" + route,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(user ? { authorization: "Bearer " + user.token } : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20000),
      },
    );
    return { status: r.status, body: await r.json() };
  };
  const expect = async (p, status) => {
    const r = await p;
    assert.equal(r.status, status, "secure private HTTP status");
    return r.body;
  };
  const execute = (i, id, user) =>
    call(i, "/execute", { callerOperationId: id }, user);
  const rows = (id) =>
    db.$queryRawUnsafe(
      'SELECT * FROM "IdentityConsumerIntent" WHERE "callerOperationId"=$1::uuid',
      id,
    );
  try {
    // Both TLS processes share only the durable authorization registry/nonce ledger.
    await launchServer(0);
    await launchServer(1);
    const valid = await raw(0, routes[0]);
    assert.equal(valid.status, 200);
    assert.equal(valid.body.actor.userId, u[0].id);
    assert.ok(valid.tlsAuthorized);
    assert.match(valid.tlsProtocol, /^TLSv1\.[23]$/);
    await assert.rejects(raw(0, routes[0], {}, {}, { wrongCa: true }), (e) =>
      [
        "SELF_SIGNED_CERT_IN_CHAIN",
        "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
        "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
      ].includes(e.code),
    );
    await assert.rejects(
      raw(0, routes[0], {}, {}, { servername: "wrong.identity.lab" }),
      (e) => e.code === "ERR_TLS_CERT_ALTNAME_INVALID",
    );
    await assert.rejects(
      fetch(origins[0].replace("https:", "http:") + routes[0], {
        method: "POST",
        body: "{}",
        signal: AbortSignal.timeout(5000),
      }),
    );
    servers[2] = lab.start(
      path.join(lab.runtimeRoot, "dist/operational/consumer/main.js"),
      {
        ...consumerConfig,
        IDENTITY_SERVICE_TLS_LAB: "enabled",
        IDENTITY_TLS_KEY_FILE: fixture.file("server.key"),
        IDENTITY_TLS_CERT_FILE: fixture.file("expired.crt"),
        OPERATIONAL_ORIGIN: ctx.providerOrigin,
        PORT: String(serverPorts[2]),
      },
    );
    // Readiness of expired-cert server uses TCP only; HTTPS validation remains enabled.
    const net = require("node:net");
    let listening = false;
    for (let n = 0; n < 100; n++) {
      try {
        await new Promise((r, j) => {
          const s = net.connect(serverPorts[2], "127.0.0.1");
          s.once("connect", () => {
            s.destroy();
            r();
          });
          s.once("error", j);
        });
        listening = true;
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    assert.ok(listening);
    await assert.rejects(
      raw(2, routes[0]),
      (e) => e.code === "CERT_HAS_EXPIRED",
    );
    pass(
      "Native HTTPS validates chain, hostname and expiry; wrong CA/hostname/expired certificate and plaintext HTTP rejected without disabling TLS checks",
    );

    await expect(
      raw(0, routes[0], {}, { "x-identity-service": "unknown-service" }),
      401,
    );
    await expect(
      raw(0, routes[0], {}, { "x-identity-key-id": crypto.randomUUID() }),
      401,
    );
    await expect(
      raw(0, routes[0], {}, { "x-identity-service-key": "ff".repeat(32) }),
      401,
    );
    await expect(raw(0, routes[0], {}, { authorization: "" }), 401);
    await expect(
      raw(0, routes[0], {}, { authorization: "Bearer " + u[2].token }),
      403,
    );
    await expect(
      raw(0, routes[0], {}, { authorization: "Bearer " + u[0].token + "x" }),
      401,
    );
    pass(
      "Service identity and human Control are independently required: unknown/invalid technical caller, absent/invalid human and insufficient human permission rejected",
    );

    for (const data of [
      { issued: Date.now() - 60000, expires: Date.now() - 30000 },
      { issued: Date.now() + 30000, expires: Date.now() + 60000 },
      { issued: Date.now(), expires: Date.now() + 31000 },
    ])
      await expect(
        raw(
          0,
          routes[0],
          {},
          {
            "x-identity-issued-at": String(data.issued),
            "x-identity-expires-at": String(data.expires),
          },
        ),
        401,
      );
    await db.$executeRawUnsafe(
      'UPDATE "IdentityServiceCredential" SET "expiresAt"=$2 WHERE "keyId"=$1::uuid',
      keys[0].keyId,
      new Date(Date.now() - 1000),
    );
    await expect(raw(0, routes[0]), 401);
    await db.$executeRawUnsafe(
      'UPDATE "IdentityServiceCredential" SET "expiresAt"=$2 WHERE "keyId"=$1::uuid',
      keys[0].keyId,
      new Date(Date.now() + 3600000),
    );
    pass(
      "Expired/future/overlong transport windows and expired service credential rejected with unchanged 30s window and 5s clock skew",
    );

    const nonce = crypto.randomUUID(),
      headers = { "x-identity-request-nonce": nonce };
    const race = await Promise.all(
      Array.from({ length: 6 }, (_, n) => raw(n % 2, routes[0], {}, headers)),
    );
    assert.equal(race.filter((r) => r.status === 200).length, 1);
    assert.equal(race.filter((r) => r.status === 409).length, 5);
    const reused = await raw(1, routes[0], { actor: "manipulated" }, headers);
    assert.equal(reused.status, 409);
    assert.equal(
      (
        await db.$queryRawUnsafe(
          'SELECT count(*)::int AS n FROM "IdentityServiceNonce" WHERE "keyId"=$1::uuid AND nonce=$2::uuid',
          keys[0].keyId,
          nonce,
        )
      )[0].n,
      1,
    );
    pass(
      "Same transport nonce sent concurrently to two TLS Identity instances is consumed once; replay with altered body rejected before human operation",
    );

    await db.$executeRawUnsafe(
      'UPDATE "IdentityServiceCredential" SET routes=ARRAY[]::text[] WHERE "keyId"=$1::uuid',
      keys[0].keyId,
    );
    await expect(raw(0, routes[0]), 403);
    await db.$executeRawUnsafe(
      'UPDATE "IdentityServiceCredential" SET routes=$2::text[],"stationId"=$3::uuid WHERE "keyId"=$1::uuid',
      keys[0].keyId,
      routes,
      crypto.randomUUID(),
    );
    await expect(raw(1, routes[0]), 403);
    await db.$executeRawUnsafe(
      'UPDATE "IdentityServiceCredential" SET "stationId"=$2::uuid WHERE "keyId"=$1::uuid',
      keys[0].keyId,
      lab.stationId,
    );
    await db.$executeRawUnsafe(
      'REVOKE INSERT ON "IdentityServiceNonce" FROM identity_consumer',
    );
    try {
      await expect(raw(0, routes[0]), 503);
    } finally {
      await db.$executeRawUnsafe(
        'GRANT INSERT ON "IdentityServiceNonce" TO identity_consumer',
      );
    }
    await db.$executeRawUnsafe(
      'REVOKE SELECT ON "IdentityServiceCredential" FROM identity_consumer',
    );
    try {
      await expect(raw(1, routes[0]), 503);
    } finally {
      await db.$executeRawUnsafe(
        'GRANT SELECT ON "IdentityServiceCredential" TO identity_consumer',
      );
    }
    await expect(raw(1, routes[0]), 200);
    pass(
      "Live technical route/station scope is enforced; unavailable credential registry or shared nonce ledger fails closed and recovers without local authority fallback",
    );

    await launchCaller(0);
    await launchCaller(1);
    const t = await terminal(),
      request = req(t);
    const a = await expect(call(0, "", request), 200),
      b = await expect(call(1, "", request), 200);
    assert.equal(a.intentId, b.intentId);
    const issued = await Promise.all(
      Array.from({ length: 6 }, (_, n) =>
        expect(execute(n % 2, request.callerOperationId), 200),
      ),
    );
    assert.ok(issued.every((v) => v.terminalToken === issued[0].terminalToken));
    await once(t);
    const saved = (await rows(request.callerOperationId))[0];
    await launchCaller(0);
    await launchServer(1);
    await launchCaller(1);
    assert.equal(
      (await expect(execute(1, request.callerOperationId), 200)).terminalToken,
      issued[0].terminalToken,
    );
    await once(t);
    assert.equal(
      (await rows(request.callerOperationId))[0].commandId,
      saved.commandId,
    );
    const another = await expect(
      call(1, "", { ...request, callerOperationId: crypto.randomUUID() }),
      200,
    );
    assert.notEqual(another.intentId, a.intentId);
    const different = await terminal();
    await expect(call(1, "", { ...request, terminalId: different.id }), 409);
    await expect(
      call(1, "", { ...request, stationId: crypto.randomUUID() }),
      403,
    );
    pass(
      "TLS FuelFlow instances with own dependencies preserve durable correlation across restarts and concurrent fresh transport nonces; same business operation emits once, distinct intents stay distinct",
    );

    // TLS proxy consumes actual Identity response, then drops it. It forwards existing
    // technical headers exactly once, never signs a replacement or retries a command.
    let committed = 0;
    const proxy = https.createServer(
      {
        key: fs.readFileSync(fixture.file("server.key")),
        cert: fs.readFileSync(fixture.file("server.crt")),
        minVersion: "TLSv1.2",
      },
      async (q, s) => {
        try {
          let body = "";
          for await (const c of q) body += c;
          const result = await new Promise((resolve, reject) => {
            const p = https.request(
              origins[0] + q.url,
              {
                method: "POST",
                ca: fs.readFileSync(fixture.file("ca.crt")),
                rejectUnauthorized: true,
                headers: q.headers,
              },
              (r) => {
                let raw = "";
                r.on("data", (c) => (raw += c));
                r.on("end", () => resolve({ status: r.statusCode, raw }));
              },
            );
            p.on("error", reject);
            p.end(body);
          });
          if (q.url === routes[2] && result.status === 200) {
            committed++;
            s.destroy();
            return;
          }
          s.writeHead(result.status, { "content-type": "application/json" });
          s.end(result.raw);
        } catch {
          s.destroy();
        }
      },
    );
    await new Promise((r) => proxy.listen(0, "127.0.0.1", r));
    proxies.push(proxy);
    await launchCaller(0, "https://127.0.0.1:" + proxy.address().port);
    const loss = req(await terminal());
    await expect(call(1, "", loss), 200);
    await expect(execute(0, loss.callerOperationId), 503);
    assert.equal(committed, 1);
    await once({ id: loss.terminalId });
    const recovery = await expect(execute(1, loss.callerOperationId), 200);
    assert.ok(recovery.terminalToken);
    await once({ id: loss.terminalId });
    await db.terminalCredential.updateMany({
      where: { terminalId: loss.terminalId },
      data: { revokedAt: new Date() },
    });
    await expect(execute(1, loss.callerOperationId), 409);
    await once({ id: loss.terminalId });
    await launchCaller(0);
    pass(
      "Real TLS response lost after issuance commit returns controlled 503; other instance uses new transport nonce and original business IDs to recover receipt once; revoked result stays rejected",
    );

    const agent = new https.Agent({
      keepAlive: true,
      ca: fs.readFileSync(fixture.file("ca.crt")),
      rejectUnauthorized: true,
      minVersion: "TLSv1.2",
    });
    try {
      const before = await raw(0, routes[0], {}, {}, { agent });
      assert.equal(before.status, 200);
      await db.$executeRawUnsafe(
        'UPDATE "IdentityServiceCredential" SET "revokedAt"=now() WHERE "keyId"=$1::uuid',
        keys[0].keyId,
      );
      const after = await raw(0, routes[0], {}, {}, { agent });
      assert.equal(after.status, 401);
      assert.ok(
        after.socket === before.socket,
        "TLS connection must be reused",
      );
    } finally {
      agent.destroy();
    }
    writeCredential(keys[1]);
    assert.equal(
      (await expect(execute(1, request.callerOperationId), 200)).terminalToken,
      issued[0].terminalToken,
    );
    await once(t);
    pass(
      "Revocation is checked on a reused TLS connection; atomic credential-file rotation activates a separately provisioned key without changing human authority or reissuing credentials",
    );

    await db.userPermissionGrant.deleteMany({ where: { userId: u[0].id } });
    await expect(execute(1, request.callerOperationId), 403);
    await db.userPermissionGrant.create({
      data: {
        userId: u[0].id,
        permission: "SYSTEM_ADMIN",
        reason: "Synthetic TLS reauthorization",
      },
    });
    await db.user.update({
      where: { id: u[0].id },
      data: { authVersion: { increment: 1 } },
    });
    await expect(execute(1, request.callerOperationId), 401);
    pass(
      "Valid rotated technical credential cannot bypass human permission or authVersion revocation; TLS/service authentication never substitutes Control",
    );

    const { Pool } = require(path.join(callerRoot, "node_modules/pg"));
    const limited = new Pool({ connectionString: lab.fuelFlowUrl });
    try {
      for (const sql of [
        'SELECT * FROM "IdentityServiceCredential"',
        'SELECT * FROM "IdentityServiceNonce"',
        'SELECT * FROM "User"',
      ])
        await assert.rejects(limited.query(sql));
    } finally {
      await limited.end();
    }
    const registry = JSON.stringify(
        await db.$queryRawUnsafe('SELECT * FROM "IdentityServiceCredential"'),
      ),
      ledger = JSON.stringify(
        await db.$queryRawUnsafe('SELECT * FROM "IdentityServiceNonce"'),
      );
    for (const key of keys)
      assert.ok(!registry.includes(key.key) && !ledger.includes(key.key));
    assert.ok(!ledger.includes(u[0].token));
    pass(
      "Registry stores only secret digests; nonce ledger contains no keys, bearer, body or response token; FuelFlow SQL role cannot read registry, ledger or authorization tables",
    );
  } finally {
    for (const p of callers) if (p) await lab.stop(p);
    for (const p of servers) if (p) await lab.stop(p);
    for (const p of proxies) {
      p.closeAllConnections();
      await new Promise((r) => p.close(r));
    }
    fixture.cleanup();
  }
};

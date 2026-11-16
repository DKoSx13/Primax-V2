// Private explicit-intent workflow; never mounted on the 27 Identity routes.
module.exports = async function ({
  db,
  projectLoad,
  origin,
  providerOrigin,
  apiKey,
  start,
  stop,
  freePort,
  pass,
  http,
  status,
  stationId,
  otherStationId,
  consumerUrl,
  consumerConfig,
  consumerFile,
  operatorHash,
  password,
  validateActorContract,
  validateV2,
  validateFuelFlow,
  skipConsumerLaunch,
}) {
  const assert = require("node:assert/strict"),
    crypto = require("node:crypto"),
    net = require("node:http");
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const { PrismaService } = projectLoad("./dist/persistence/compatibility-db"),
    { ConfigService } = projectLoad("@nestjs/config");
  const u = [];
  for (let n = 0; n < 3; n++) {
    const user = await db.user.create({
      data: {
        email: "consumer-" + crypto.randomUUID() + "@example.invalid",
        name: "Synthetic consumer",
        passwordHash: operatorHash,
      },
    });
    if (n < 2)
      await db.userPermissionGrant.create({
        data: {
          userId: user.id,
          permission: "SYSTEM_ADMIN",
          reason: "Synthetic consumer authorization",
        },
      });
    const login = await status(
      http(origin, "auth/login", {
        method: "POST",
        body: { email: user.email, password },
      }),
      200,
    );
    u.push({ ...user, token: login.accessToken });
  }
  let child, base;
  const port = await freePort();
  async function launch(upstream = providerOrigin) {
    if (child) await stop(child);
    child = start(consumerFile, {
      ...consumerConfig,
      PORT: String(port),
      OPERATIONAL_ORIGIN: upstream,
    });
    base = "http://127.0.0.1:" + port;
    for (let n = 0; n < 300; n++) {
      try {
        const r = await fetch(base + "/consumer/v1/intents", {
          method: "POST",
          body: "{}",
          signal: AbortSignal.timeout(2000),
        });
        if (r.status === 401) return;
      } catch {}
      await wait(200);
    }
    throw Error("Consumer readiness");
  }
  const call = async (path, body, user = u[0], extra = {}) => {
    const r = await fetch(base + "/consumer/v1/" + path, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(user ? { authorization: "Bearer " + user.token } : {}),
        ...extra,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    return { status: r.status, body: await r.json() };
  };
  async function expect(p, code) {
    const r = await p;
    assert.equal(r.status, code, "consumer HTTP status");
    return r.body;
  }
  const prepare = (t, user) =>
    expect(call("intents", { terminalId: t.id }, user), 200);
  const execute = (id, user, extra) =>
    call("intents/execute", { intentId: id }, user, extra);
  const terminal = () =>
    db.terminal.create({
      data: {
        stationId,
        code: "CJ-" + crypto.randomBytes(5).toString("hex").toUpperCase(),
      },
    });
  const row = async (id) =>
    (
      await db.$queryRawUnsafe(
        'SELECT * FROM "IdentityConsumerIntent" WHERE "intentId"=$1::uuid',
        id,
      )
    )[0];
  const receiptCount = (t) =>
    db.$queryRawUnsafe(
      'SELECT count(*)::int AS n FROM "IdentityOperationalReceipt" WHERE "terminalId"=$1::uuid',
      t.id,
    );
  async function once(t) {
    assert.equal((await receiptCount(t))[0].n, 1);
    assert.equal(
      await db.terminalCredential.count({ where: { terminalId: t.id } }),
      1,
    );
    assert.equal(
      await db.operationalAuditEvent.count({
        where: { terminalId: t.id, action: "TERMINAL_CREDENTIAL_ISSUED" },
      }),
      1,
    );
  }
  async function proxy() {
    let command = 0,
      query = 0,
      blocked = false;
    const server = net.createServer(async (q, s) => {
      try {
        let body = "";
        for await (const c of q) body += c;
        if (blocked) {
          s.writeHead(503);
          s.end("{}");
          return;
        }
        const r = await fetch(providerOrigin + q.url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-operational-key": apiKey,
          },
          body,
          signal: AbortSignal.timeout(12000),
        });
        const data = await r.text();
        if (q.url === "/operational/v1/commands") {
          command++;
          if (r.ok) {
            blocked = true;
            s.destroy();
            return;
          }
        } else query++;
        s.writeHead(r.status, { "content-type": "application/json" });
        s.end(data);
      } catch {
        s.writeHead(503);
        s.end("{}");
      }
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    return {
      url: "http://127.0.0.1:" + server.address().port,
      counts: () => ({ command, query }),
      close: async () => {
        server.closeAllConnections();
        await new Promise((r) => server.close(r));
      },
    };
  }
  if (!skipConsumerLaunch) await launch();
  if (validateFuelFlow) {
    await validateFuelFlow({
      db,
      projectLoad,
      u,
      consumerConfig,
      consumerUrl,
      providerOrigin,
      terminal,
      base,
      pass,
      once,
      row,
      launch,
      http,
      status,
      origin,
      password,
    });
    return;
  }
  const t = await terminal();
  await expect(call("intents", { terminalId: t.id }, null), 401);
  await expect(call("intents", { terminalId: t.id }, u[2]), 403);
  await expect(
    call("intents", { terminalId: t.id }, u[0], {
      cookie: "primax_control=ambient",
    }),
    401,
  );
  await expect(
    call("intents", { terminalId: t.id }, u[0], { "x-kiosk-signature": "bad" }),
    403,
  );
  await expect(call("intents", { terminalId: t.id, userId: u[1].id }), 400);
  const foreign = await db.terminal.create({
    data: { stationId: otherStationId, code: "CJ-FOREIGN" },
  });
  await expect(call("intents", { terminalId: foreign.id }), 404);
  pass(
    "Private consumer reuses live AuthCore Control/Bearer authorization; no member/cookie/signed-Control authority, injected owner or foreign station accepted",
  );
  const a = await prepare(t),
    b = await prepare(t);
  assert.notEqual(a.intentId, b.intentId);
  assert.notEqual(
    (await row(a.intentId)).commandId,
    (await row(b.intentId)).commandId,
  );
  assert.equal((await receiptCount(t))[0].n, 0);
  const local = await row(a.intentId);
  assert.equal(local.userId, u[0].id);
  assert.equal(local.authVersion, u[0].authVersion);
  assert.equal(local.terminalId, t.id);
  await expect(execute(a.intentId, u[1]), 404);
  await expect(execute(crypto.randomUUID()), 404);
  await expect(
    call("intents/execute", {
      intentId: a.intentId,
      commandId: crypto.randomUUID(),
    }),
    400,
  );
  await expect(
    call("intents/execute", { intentId: a.intentId, terminalId: foreign.id }),
    400,
  );
  await expect(execute("tampered"), 400);
  pass(
    "Intent is persisted before RPC, bound to authenticated user/action/station/terminal; identical prepares yield different operations, forged IDs/owners/commands are rejected",
  );
  const results = await Promise.all(
    Array.from({ length: 6 }, () => expect(execute(a.intentId), 200)),
  );
  assert.ok(results.every((r) => r.terminalToken === results[0].terminalToken));
  await once(t);
  pass(
    "Six authenticated concurrent retries resolve one persisted commandId and commit one credential/audit/receipt",
  );
  const mixed = await Promise.all([
    ...Array.from({ length: 3 }, () => execute(a.intentId, u[0])),
    ...Array.from({ length: 3 }, () => execute(a.intentId, u[1])),
  ]);
  assert.ok(mixed.slice(0, 3).every((r) => r.status === 200));
  assert.ok(mixed.slice(3).every((r) => r.status === 404));
  await once(t);
  if (validateActorContract)
    await validateActorContract({
      db,
      projectLoad,
      u,
      consumerConfig,
      consumerUrl,
      terminal,
      prepare,
      execute,
      expect,
      row,
      once,
      base,
      pass,
    });
  if (validateV2)
    await validateV2({
      db,
      projectLoad,
      u,
      consumerConfig,
      consumerUrl,
      terminal,
      prepare,
      execute,
      expect,
      row,
      once,
      base,
      pass,
      launch,
      call,
      stationId,
      otherStationId,
      http,
      status,
      origin,
      password,
    });
  const persisted = JSON.stringify(await row(a.intentId));
  const pendingProxy = await proxy();
  const interrupted = await terminal();
  try {
    await launch(pendingProxy.url);
    const intent = await prepare(interrupted);
    const original = await row(intent.intentId);
    await expect(execute(intent.intentId), 503);
    await once(interrupted);
    assert.equal(pendingProxy.counts().command, 1);
    const old = child.pid;
    await new Promise((r) => {
      child.once("exit", r);
      child.kill("SIGKILL");
    });
    await launch();
    assert.notEqual(child.pid, old);
    const recovered = await expect(execute(intent.intentId), 200);
    await once(interrupted);
    assert.deepEqual(await row(intent.intentId), original);
    assert.equal(recovered.terminalId, interrupted.id);
  } finally {
    await pendingProxy.close();
  }
  pass(
    "Provider commits but response and lookup are lost: consumer returns 503; genuine consumer restart recovers via its journal and receipt, without privileged SQL discovery or another POST",
  );
  assert.equal(JSON.stringify(await row(a.intentId)), persisted);
  // Drop the final consumer response after it has completed; caller retains the explicit handle.
  const ct = await terminal(),
    ci = await prepare(ct);
  const drop = net.createServer(async (q, s) => {
    try {
      let body = "";
      for await (const c of q) body += c;
      const r = await fetch(base + "/consumer/v1/intents/execute", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer " + u[0].token,
        },
        body,
      });
      await r.text();
      s.destroy();
    } catch {
      s.destroy();
    }
  });
  await new Promise((r) => drop.listen(0, "127.0.0.1", r));
  try {
    await assert.rejects(
      fetch("http://127.0.0.1:" + drop.address().port, {
        method: "POST",
        body: JSON.stringify({ intentId: ci.intentId }),
      }),
    );
  } finally {
    drop.closeAllConnections();
    await new Promise((r) => drop.close(r));
  }
  await launch();
  await expect(execute(ci.intentId), 200);
  await once(ct);
  pass(
    "Lost consumer HTTP response is recovered after another process restart by the same opaque intent handle; no request-body deduplication",
  );
  // An absent receipt during outage is not inferred: lookup failure must prevent command POST.
  const unavailable = net.createServer((q, s) => {
    s.writeHead(503);
    s.end("{}");
  });
  let requests = 0,
    posts = 0;
  unavailable.on("request", (q) => {
    requests++;
    if (q.url === "/operational/v1/commands") posts++;
  });
  await new Promise((r) => unavailable.listen(0, "127.0.0.1", r));
  const off = await terminal();
  let offIntent;
  try {
    await launch("http://127.0.0.1:" + unavailable.address().port);
    offIntent = await prepare(off);
    await expect(execute(offIntent.intentId), 503);
    assert.equal(posts, 0);
    assert.equal(requests, 1);
    assert.equal((await receiptCount(off))[0].n, 0);
  } finally {
    unavailable.closeAllConnections();
    await new Promise((r) => unavailable.close(r));
  }
  await launch();
  await expect(execute(offIntent.intentId), 200);
  await once(off);
  pass(
    "Unavailable/uncertain receipt lookup never sends an issuance POST or changes ID; explicit retry after recovery commits once",
  );
  const expired = await prepare(await terminal());
  await db.$executeRawUnsafe(
    'UPDATE "IdentityConsumerIntent" SET "createdAt"=now()-interval \'20 minutes\',"expiresAt"=now()-interval \'1 second\' WHERE "intentId"=$1::uuid',
    expired.intentId,
  );
  await expect(execute(expired.intentId), 410);
  const tamper = await prepare(await terminal()),
    tr = await row(tamper.intentId);
  await db.$executeRawUnsafe(
    'UPDATE "IdentityConsumerIntent" SET "commandId"=$1::uuid WHERE "intentId"=$2::uuid',
    crypto.randomUUID(),
    tamper.intentId,
  );
  await expect(execute(tamper.intentId), 409);
  await db.$executeRawUnsafe(
    'UPDATE "IdentityConsumerIntent" SET "commandId"=$1::uuid WHERE "intentId"=$2::uuid',
    tr.commandId,
    tamper.intentId,
  );
  pass(
    "Expired handles remain tombstones (410); journal command substitution is detected before RPC (409), never re-associated with a new operation",
  );
  const rt = await terminal(),
    ri = await prepare(rt);
  await expect(execute(ri.intentId), 200);
  await db.terminalCredential.updateMany({
    where: { terminalId: rt.id },
    data: { revokedAt: new Date() },
  });
  await expect(execute(ri.intentId), 409);
  await once(rt);
  const et = await terminal(),
    ei = await prepare(et);
  await expect(execute(ei.intentId), 200);
  await db.terminalCredential.updateMany({
    where: { terminalId: et.id },
    data: {
      issuedAt: new Date(Date.now() - 20000),
      lastUsedAt: new Date(Date.now() - 2000),
      expiresAt: new Date(Date.now() - 1000),
    },
  });
  await expect(execute(ei.intentId), 409);
  await once(et);
  pass(
    "Consumer rechecks provider receipt validity on every replay: revoked/expired technical credentials stay rejected, without local token caching or reissuance",
  );
  const second = await prepare(await terminal(), u[1]);
  await db.userPermissionGrant.updateMany({
    where: { userId: u[1].id, permission: "SYSTEM_ADMIN", revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await expect(execute(second.intentId, u[1]), 403);
  const versioned = await prepare(await terminal());
  await db.user.update({
    where: { id: u[0].id },
    data: { authVersion: { increment: 1 } },
  });
  await expect(execute(versioned.intentId), 401);
  const fresh = await status(
    http(origin, "auth/login", {
      method: "POST",
      body: { email: u[0].email, password },
    }),
    200,
  );
  u[0].token = fresh.accessToken;
  await expect(execute(versioned.intentId), 403);
  pass(
    "Live permission revocation and authVersion invalidate recovery; even a new valid JWT for the same user cannot reuse a handle from its revoked authorization generation",
  );
  const role = new PrismaService(
    new ConfigService({ IDENTITY_COMPAT_DATABASE_URL: consumerUrl }),
  );
  try {
    for (const sql of [
      'UPDATE "IdentityConsumerIntent" SET action=action',
      'DELETE FROM "IdentityConsumerIntent"',
      'SELECT * FROM "IdentityOperationalReceipt"',
      'UPDATE "Membership" SET balance=balance',
    ])
      await assert.rejects(role.$executeRawUnsafe(sql), /permission denied/i);
  } finally {
    await role.$disconnect();
  }
  const rows = await db.$queryRawUnsafe(
    'SELECT * FROM "IdentityConsumerIntent"',
  );
  assert.ok(!JSON.stringify(rows).includes(results[0].terminalToken));
  assert.ok(!JSON.stringify(rows).includes(u[0].token));
  pass(
    "Consumer SQL role cannot mutate/delete intents, read provider receipts or write money; journal contains no bearer, CSRF, previous credential or response token",
  );
  await stop(child);
};

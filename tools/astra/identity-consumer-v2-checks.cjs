// Private real-service checks. No changed public routes or manufactured actors.
module.exports = async function (ctx, lab) {
  const assert = require("node:assert/strict"),
    crypto = require("node:crypto"),
    fs = require("node:fs"),
    os = require("node:os"),
    path = require("node:path"),
    httpNode = require("node:http"),
    { execFileSync } = require("node:child_process");
  const client = require("./identity-control-v2-client.cjs");
  const {
    db,
    u,
    base,
    terminal,
    expect,
    row,
    once,
    pass,
    launch,
    consumerConfig,
    projectLoad,
    consumerUrl,
    stationId,
    otherStationId,
    http,
    status,
    origin,
    password,
  } = ctx;
  const call = async (route, body, user = u[0], extra = {}) => {
    const r = await fetch(base + "/consumer/v2/" + route, {
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
  const request = (t) => ({
    callerOperationId: crypto.randomUUID(),
    action: "TERMINAL_CREDENTIAL_ISSUE",
    stationId,
    terminalId: t.id,
    expiresAt: new Date(Date.now() + 14 * 60000).toISOString(),
  });
  const count = async (id) =>
    (
      await db.$queryRawUnsafe(
        'SELECT count(*)::int AS n FROM "IdentityConsumerIntent" WHERE "callerOperationId"=$1::uuid',
        id,
      )
    )[0].n;
  const get = async (request) => expect(call("intents", request), 200),
    execute = (id) => call("intents/execute", { intentId: id });
  const { PrismaService } = projectLoad("./dist/persistence/compatibility-db"),
    { ConfigService } = projectLoad("@nestjs/config"),
    { ConsumerAuthenticator } = projectLoad("./dist/operational/consumer/auth");
  const authDb = new PrismaService(
    new ConfigService({ IDENTITY_COMPAT_DATABASE_URL: consumerUrl }),
  );
  const auth = new ConsumerAuthenticator(
    authDb,
    new ConfigService(consumerConfig),
  );
  const adapted = (user) => ({
    headers: { authorization: "Bearer " + user.token },
    path: "/consumer/v2/intents",
    originalUrl: "/consumer/v2/intents",
    method: "POST",
    header: (n) =>
      n.toLowerCase() === "authorization" ? "Bearer " + user.token : undefined,
  });
  const a = await auth.authenticate(adapted(u[0])),
    actor = { kind: "human", subjectId: a.userId, generation: a.authVersion };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "primax-v2-client-"));
  fs.chmodSync(dir, 0o700);
  const file = path.join(dir, "operation.json");
  async function proxy(mode, route) {
    let forwarded = 0,
      code;
    const server = httpNode.createServer(async (q, s) => {
      try {
        let body = "";
        for await (const c of q) body += c;
        if (mode === "before") {
          s.destroy();
          return;
        }
        const r = await fetch(base + route, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: "Bearer " + u[0].token,
          },
          body,
        });
        forwarded++;
        code = r.status;
        await r.text();
        s.destroy();
      } catch {
        s.destroy();
      }
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    return {
      url: "http://127.0.0.1:" + server.address().port,
      stats: () => ({ forwarded, code }),
      close: async () => {
        server.closeAllConnections();
        await new Promise((r) => server.close(r));
      },
    };
  }
  try {
    const t = await terminal(),
      req = request(t);
    await expect(call("intents", req, null), 401);
    await expect(call("intents", req, u[2]), 403);
    await expect(call("intents", { ...req, actor: { userId: u[0].id } }), 400);
    await expect(call("intents", { ...req, stationId: otherStationId }), 403);
    await expect(
      call("intents", { ...req, action: "TERMINAL_RECOVERY_APPROVE" }),
      400,
    );
    await expect(
      call("intents", req, u[0], { cookie: "session=not-authority" }),
      401,
    );
    const first = await get(req),
      saved = await row(first.intentId);
    assert.equal(saved.callerOperationId, req.callerOperationId);
    assert.equal(saved.userId, u[0].id);
    assert.equal(saved.authVersion, a.authVersion);
    assert.deepEqual(await get(req), first);
    assert.equal(await count(req.callerOperationId), 1);
    pass(
      "V2 opt-in human Control preparation binds real AuthCore actor and immutable callerOperationId/intentId/commandId; missing permissions, actor injection, station/action manipulation and cookies rejected",
    );

    const batch = await Promise.all(Array.from({ length: 6 }, () => get(req)));
    assert.ok(batch.every((x) => x.intentId === first.intentId));
    const issued = await Promise.all(
      Array.from({ length: 6 }, () => expect(execute(first.intentId), 200)),
    );
    assert.ok(issued.every((x) => x.terminalToken === issued[0].terminalToken));
    await once(t);
    const raceT = await terminal(),
      race = request(raceT);
    const prepared = await Promise.all(
      Array.from({ length: 6 }, () => get(race)),
    );
    assert.ok(prepared.every((x) => x.intentId === prepared[0].intentId));
    assert.equal(await count(race.callerOperationId), 1);
    const competingA = await terminal(),
      competingB = await terminal(),
      competing = request(competingA);
    const mixed = await Promise.all(
      Array.from({ length: 6 }, (_, n) =>
        call("intents", {
          ...competing,
          terminalId: n % 2 ? competingA.id : competingB.id,
        }),
      ),
    );
    assert.ok(mixed.every((r) => [200, 409].includes(r.status)));
    assert.ok(mixed.some((r) => r.status === 200));
    assert.ok(mixed.some((r) => r.status === 409));
    assert.equal(await count(competing.callerOperationId), 1);
    assert.equal(
      new Set(mixed.filter((r) => r.status === 200).map((r) => r.body.intentId))
        .size,
      1,
    );
    const distinct = await get({
      ...req,
      callerOperationId: crypto.randomUUID(),
    });
    assert.notEqual(distinct.intentId, first.intentId);
    assert.notEqual((await row(distinct.intentId)).commandId, saved.commandId);
    pass(
      "Concurrent first prepares and concurrent execute retries preserve one command/credential/audit/receipt; identical targets with distinct callerOperationId create distinct intentions",
    );

    const rollbackRequest = request(await terminal());
    await db.$executeRawUnsafe(`CREATE FUNCTION lab_v2_reject_insert() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW."callerOperationId"::text = '${rollbackRequest.callerOperationId}' THEN
        RAISE EXCEPTION 'synthetic V2 insert fault' USING ERRCODE='P0001'; END IF; RETURN NEW; END $$`);
    await db.$executeRawUnsafe(
      'CREATE TRIGGER lab_v2_insert_fault BEFORE INSERT ON "IdentityConsumerIntent" FOR EACH ROW EXECUTE FUNCTION lab_v2_reject_insert()',
    );
    try {
      await expect(call("intents", rollbackRequest), 503);
      assert.equal(await count(rollbackRequest.callerOperationId), 0);
    } finally {
      await db.$executeRawUnsafe(
        'DROP TRIGGER lab_v2_insert_fault ON "IdentityConsumerIntent"',
      );
      await db.$executeRawUnsafe("DROP FUNCTION lab_v2_reject_insert()");
    }
    const afterFault = await get(rollbackRequest);
    assert.equal(await count(rollbackRequest.callerOperationId), 1);
    assert.equal(
      await db.terminalCredential.count({
        where: { terminalId: rollbackRequest.terminalId },
      }),
      0,
    );
    assert.deepEqual(await get(rollbackRequest), afterFault);
    pass(
      "Actual SQL INSERT fault before commit returns 503 and rolls back nonce/intent/command together; explicit same-ID retry after fault removal prepares once without credentials",
    );

    const different = await terminal();
    await expect(call("intents", { ...req, terminalId: different.id }), 409);
    await expect(
      call("intents", {
        ...req,
        expiresAt: new Date(Date.parse(req.expiresAt) + 1).toISOString(),
      }),
      409,
    );
    await expect(
      call("intents/execute", { intentId: first.intentId }, u[1]),
      404,
    );
    await expect(
      call("intents", {
        ...req,
        callerOperationId: crypto.randomUUID(),
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      }),
      410,
    );
    await expect(
      call("intents", {
        ...req,
        callerOperationId: crypto.randomUUID(),
        expiresAt: new Date(Date.now() + 16 * 60000).toISOString(),
      }),
      400,
    );
    assert.equal(await count(req.callerOperationId), 1);
    await once(t);
    const corruptedRequest = request(await terminal()),
      corruptedRef = await get(corruptedRequest);
    await db.$executeRawUnsafe(
      `UPDATE "IdentityConsumerIntent" SET permissions=ARRAY['FORGED']::text[] WHERE "intentId"=$1::uuid`,
      corruptedRef.intentId,
    );
    await expect(call("intents", corruptedRequest), 409);
    await expect(execute(corruptedRef.intentId), 409);
    pass(
      "Reused nonce cannot change terminal/expiry/action; actor ownership and immutable expiry enforced without replaying issuance or extending TTL",
    );

    const durable = await terminal();
    client.create(
      file,
      actor,
      { stationId: durable.stationId, terminalId: durable.id },
      new Date(Date.now() + 14 * 60000).toISOString(),
    );
    const onDisk = JSON.parse(fs.readFileSync(file, "utf8"));
    assert.equal(onDisk.request.terminalId, durable.id);
    assert.ok(!fs.readFileSync(file, "utf8").includes(u[0].token));
    const make = (url = base) =>
      client.open({
        enabled: true,
        origin: url,
        file,
        verifiedActor: actor,
        getSession: async () => {
          const current = await auth.authenticate(adapted(u[0]));
          return {
            verifiedActor: {
              kind: "human",
              subjectId: current.userId,
              generation: current.authVersion,
            },
            bearer: u[0].token,
          };
        },
      });
    const pre = await proxy("before", "/consumer/v2/intents");
    try {
      await assert.rejects(make(pre.url).prepare());
      assert.deepEqual(pre.stats(), { forwarded: 0, code: undefined });
      assert.equal(await count(onDisk.request.callerOperationId), 0);
    } finally {
      await pre.close();
    }
    const lost = await proxy("after", "/consumer/v2/intents");
    try {
      await assert.rejects(make(lost.url).prepare());
      assert.equal(lost.stats().code, 200);
      assert.equal(await count(onDisk.request.callerOperationId), 1);
    } finally {
      await lost.close();
    }
    assert.equal(
      await db.terminalCredential.count({ where: { terminalId: durable.id } }),
      0,
    );
    await launch();
    // New OS process recovers a nonce persisted before network. Bearer is supplied via stdin, never argv/file.
    const recovered = JSON.parse(
      execFileSync(
        process.execPath,
        [
          "-e",
          "const fs=require('node:fs');const p=JSON.parse(fs.readFileSync(0,'utf8'));require(process.argv[1]).open({...p,getSession:async()=>({verifiedActor:p.verifiedActor,bearer:p.token})}).prepare().then(v=>process.stdout.write(JSON.stringify(v))).catch(()=>process.exit(1));",
          path.resolve(__dirname, "identity-control-v2-client.cjs"),
        ],
        {
          input: JSON.stringify({
            enabled: true,
            origin: base,
            file,
            verifiedActor: actor,
            token: u[0].token,
          }),
          encoding: "utf8",
        },
      ),
    );
    assert.equal(
      (await row(recovered.intentId)).callerOperationId,
      onDisk.request.callerOperationId,
    );
    assert.equal(await count(onDisk.request.callerOperationId), 1);
    pass(
      "Caller fsyncs nonce before request; response lost before SQL leaves zero rows, after commit leaves one; genuine consumer and client process restarts recover same preparation without body deduplication",
    );

    const lostExecute = await proxy("after", "/consumer/v2/intents/execute");
    try {
      await assert.rejects(
        fetch(lostExecute.url, {
          method: "POST",
          body: JSON.stringify({ intentId: recovered.intentId }),
        }),
      );
      assert.equal(lostExecute.stats().code, 200);
    } finally {
      await lostExecute.close();
    }
    await once(durable);
    const before = await row(recovered.intentId);
    await launch();
    const replay = await make().execute();
    assert.ok(replay.terminalToken);
    assert.equal((await row(recovered.intentId)).commandId, before.commandId);
    await once(durable);
    await db.terminalCredential.updateMany({
      where: { terminalId: durable.id },
      data: { revokedAt: new Date() },
    });
    await assert.rejects(make().execute(), (e) => e.status === 409);
    await once(durable);
    pass(
      "V2 lost issuance response recovers durable receipt after restart with same command; revoked credential cannot be resurrected or silently reissued",
    );

    const expT = await terminal(),
      exp = request(expT);
    exp.expiresAt = new Date(Date.now() + 1200).toISOString();
    const expRef = await get(exp);
    await new Promise((r) => setTimeout(r, 1400));
    await expect(call("intents", exp), 410);
    await expect(execute(expRef.intentId), 410);
    assert.equal(await count(exp.callerOperationId), 1);
    pass(
      "Expired V2 preparation remains a tombstone: same callerOperationId cannot extend lifetime or issue after expiration",
    );

    const user = await db.user.create({
      data: {
        email: "v2-" + crypto.randomUUID() + "@example.invalid",
        name: "Synthetic Control V2",
        passwordHash: u[0].passwordHash,
      },
    });
    const grant = () =>
      db.userPermissionGrant.create({
        data: {
          userId: user.id,
          permission: "SYSTEM_ADMIN",
          reason: "Synthetic V2 revocation",
        },
      });
    await grant();
    const login = async () => {
      const result = await status(
        http(origin, "auth/login", {
          method: "POST",
          body: { email: user.email, password },
        }),
        200,
      );
      return { ...user, token: result.accessToken };
    };
    let logged = await login();
    const r = request(await terminal()),
      ref = await expect(call("intents", r, logged), 200);
    await db.userPermissionGrant.deleteMany({ where: { userId: user.id } });
    await expect(call("intents", r, logged), 403);
    await expect(
      call("intents/execute", { intentId: ref.intentId }, logged),
      403,
    );
    await grant();
    await db.user.update({
      where: { id: user.id },
      data: { authVersion: { increment: 1 } },
    });
    await expect(call("intents", r, logged), 401);
    logged = await login();
    await expect(call("intents", r, logged), 403);
    await expect(
      call("intents/execute", { intentId: ref.intentId }, logged),
      403,
    );
    assert.equal(await count(r.callerOperationId), 1);
    pass(
      "Live Control grant revocation and session authVersion revoke V2 prepare/execute; fresh login cannot recycle prior-generation nonce",
    );

    lab.docker(
      "exec",
      "-u",
      "postgres",
      lab.pgContainer,
      "pg_ctl",
      "-D",
      "/var/lib/postgresql/data",
      "stop",
      "-m",
      "immediate",
      "-w",
    );
    try {
      await expect(call("intents", req), 503);
      await expect(execute(first.intentId), 503);
    } finally {
      lab.docker(
        "exec",
        "-u",
        "postgres",
        lab.pgContainer,
        "pg_ctl",
        "-D",
        "/var/lib/postgresql/data",
        "-l",
        "/var/lib/postgresql/data/v2-restart.log",
        "start",
        "-w",
      );
    }
    // Readiness probes only; never replay business commands automatically.
    let ready = false;
    for (let n = 0; n < 30; n++) {
      try {
        await db.$queryRawUnsafe("SELECT 1");
        ready = true;
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    assert.ok(ready);
    assert.deepEqual(await get(req), first);
    assert.equal(
      (await expect(execute(first.intentId), 200)).terminalToken,
      issued[0].terminalToken,
    );
    await once(t);
    pass(
      "Actual PostgreSQL immediate shutdown fails V2 closed with 503; WAL recovery retains nonce mapping and receipt without another emission",
    );

    lab.docker("stop", lab.redisContainer);
    try {
      assert.deepEqual(await get(req), first);
      assert.equal(
        (await expect(execute(first.intentId), 200)).terminalToken,
        issued[0].terminalToken,
      );
      await once(t);
    } finally {
      lab.docker("start", lab.redisContainer);
    }
    pass(
      "Redis outage does not turn a confirmed SQL receipt into a new command: V2 recovers SQL result only, creates no kiosk session and claims no Redis-data recovery",
    );

    // Reproduce compatibility deadline failure without changing timeout/assertions or retrying a command.
    const { CompatibilityPort } = projectLoad(
      "./dist/adapters/compatibility-port",
    );
    let delayed = true,
      requests = 0,
      upstreamStatus;
    const slow = httpNode.createServer(async (q, s) => {
      try {
        let raw = "";
        for await (const c of q) raw += c;
        requests++;
        const result = await fetch(
          lab.standaloneEnv.IDENTITY_COMPAT_URL + q.url,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-identity-compat-key": lab.standaloneEnv.IDENTITY_COMPAT_KEY,
            },
            body: raw,
          },
        );
        upstreamStatus = result.status;
        const body = await result.text();
        if (delayed) await new Promise((r) => setTimeout(r, 4200));
        if (!s.destroyed) {
          s.writeHead(result.status, { "content-type": "application/json" });
          s.end(body);
        }
      } catch {
        s.destroy();
      }
    });
    await new Promise((r) => slow.listen(0, "127.0.0.1", r));
    try {
      const p = new CompatibilityPort(
        new ConfigService({
          IDENTITY_COMPAT_URL: "http://127.0.0.1:" + slow.address().port,
          IDENTITY_COMPAT_KEY: lab.standaloneEnv.IDENTITY_COMPAT_KEY,
        }),
      );
      const body = {
        plate: "ZZZ-999",
        code: "SYNTHETIC-UNKNOWN",
        operationId: crypto.randomUUID(),
      };
      const started = Date.now();
      await assert.rejects(
        p.call("alerts/check-plate", body),
        (e) => e.getStatus() === 503,
      );
      assert.equal(requests, 1);
      assert.equal(upstreamStatus, 200);
      assert.ok(Date.now() - started >= 3900);
      delayed = false;
      assert.deepEqual(await p.call("alerts/check-plate", body), {
        mismatch: false,
      });
      assert.equal(requests, 2);
    } finally {
      slow.closeAllConnections();
      await new Promise((r) => slow.close(r));
    }
    pass(
      "Compatibility 503 reproduced by real upstream success with response delayed beyond unchanged 4s deadline; one request only, subsequent explicit read succeeds; historical cause remains unproven",
    );

    consumerConfig.IDENTITY_CONSUMER_V2_LAB = "disabled";
    await launch();
    await expect(call("intents", req), 404);
    const legacy = await ctx.prepare(await terminal());
    assert.ok(legacy.intentId);
    consumerConfig.IDENTITY_CONSUMER_V2_LAB = "enabled";
    await launch();
    assert.deepEqual(await get(req), first);
    pass(
      "Disabling V2 opt-in hides new private routes while V1 remains compatible; re-enable recovers original nonce mapping",
    );
  } finally {
    await authDb.$disconnect();
    for (const f of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir, f));
    fs.rmdirSync(dir);
  }
};

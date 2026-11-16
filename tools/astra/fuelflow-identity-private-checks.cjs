module.exports = async function (ctx, lab) {
  const assert = require("node:assert/strict"),
    crypto = require("node:crypto"),
    httpNode = require("node:http"),
    path = require("node:path");
  const fs = require("node:fs"),
    os = require("node:os"),
    { execFileSync } = require("node:child_process");
  const callerRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "primax-control-remote-caller-"),
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
  const {
    db,
    projectLoad,
    u,
    terminal,
    base: identity,
    pass,
    once,
    row,
    http,
    status,
    origin,
    password,
  } = ctx;
  const { Pool } = require("../../Frontend_1_FuelFlow/lab/node_modules/pg");
  const processes = [],
    proxies = [];
  const ports = [await lab.freePort(), await lab.freePort()];
  const urls = ports.map((p) => "http://127.0.0.1:" + p);
  const config = {
    IDENTITY_RUNTIME_PROFILE: "synthetic",
    KIOSK_STATION_ID: lab.stationId,
    FUELFLOW_IDENTITY_PRIVATE_LAB: "enabled",
    FUELFLOW_CALLER_DATABASE_URL: lab.fuelFlowUrl,
  };
  async function launch(index, upstream = identity) {
    if (processes[index]) await lab.stop(processes[index]);
    processes[index] = lab.start(path.join(callerRoot, "identity-caller.cjs"), {
      ...config,
      FUELFLOW_IDENTITY_ORIGIN: upstream,
      PORT: String(ports[index]),
    });
    let ready = false;
    for (let i = 0; i < 150; i++) {
      try {
        const r = await fetch(urls[index] + "/private/fuelflow/v1/operations", {
          method: "POST",
          body: "{}",
          signal: AbortSignal.timeout(1500),
        });
        if (r.status === 401) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.ok(ready, "private caller readiness");
  }
  const call = async (index, route, body, user = u[0], extra = {}) => {
    const r = await fetch(
      urls[index] + "/private/fuelflow/v1/operations" + route,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(user ? { authorization: "Bearer " + user.token } : {}),
          ...extra,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20000),
      },
    );
    return { status: r.status, body: await r.json() };
  };
  const expect = async (p, code) => {
    const r = await p;
    assert.equal(r.status, code, "private FuelFlow HTTP status");
    return r.body;
  };
  const request = (t) => ({
    callerOperationId: crypto.randomUUID(),
    action: "TERMINAL_CREDENTIAL_ISSUE",
    stationId: t.stationId,
    terminalId: t.id,
    expiresAt: new Date(Date.now() + 14 * 60000).toISOString(),
  });
  const execute = (index, id, user) =>
    call(index, "/execute", { callerOperationId: id }, user);
  const callerRows = async (id) =>
    db.$queryRawUnsafe(
      'SELECT * FROM fuelflow_lab."CallerOperation" WHERE "callerOperationId"=$1::uuid',
      id,
    );
  const consumerRows = async (id) =>
    db.$queryRawUnsafe(
      'SELECT * FROM "IdentityConsumerIntent" WHERE "callerOperationId"=$1::uuid',
      id,
    );
  async function proxy(mode) {
    let requests = 0,
      executions = 0,
      lastStatus,
      blocked = true;
    const server = httpNode.createServer(async (q, s) => {
      try {
        let raw = "";
        for await (const c of q) raw += c;
        if (q.url !== "/consumer/v2/control/verify") requests++;
        const body = JSON.parse(raw);
        if (q.url === "/consumer/v2/intents")
          assert.equal(
            (await callerRows(body.callerOperationId)).length,
            1,
            "caller nonce must commit before Identity request",
          );
        if (
          mode === "verify-unavailable" &&
          q.url === "/consumer/v2/control/verify"
        ) {
          s.writeHead(503, { "content-type": "application/json" });
          s.end("{}");
          return;
        }
        if (
          mode === "unavailable" &&
          blocked &&
          q.url === "/consumer/v2/intents"
        ) {
          s.writeHead(503, { "content-type": "application/json" });
          s.end("{}");
          return;
        }
        const r = await fetch(identity + q.url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: q.headers.authorization,
          },
          body: raw,
          signal: AbortSignal.timeout(15000),
        });
        lastStatus = r.status;
        const data = await r.text();
        if (q.url === "/consumer/v2/intents/execute") executions++;
        if (
          (mode === "lose-prepare" && q.url === "/consumer/v2/intents") ||
          (mode === "lose-execute" && q.url === "/consumer/v2/intents/execute")
        ) {
          s.destroy();
          return;
        }
        s.writeHead(r.status, { "content-type": "application/json" });
        s.end(data);
      } catch {
        s.destroy();
      }
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const p = {
      url: "http://127.0.0.1:" + server.address().port,
      stats: () => ({ requests, executions, lastStatus }),
      unblock: () => {
        blocked = false;
      },
      close: async () => {
        server.closeAllConnections();
        await new Promise((r) => server.close(r));
      },
    };
    proxies.push(p);
    return p;
  }
  try {
    await launch(0);
    await launch(1);
    pass(
      "FuelFlow private caller builds and runs outside repository with own pg package, no Identity compiled authenticator, Prisma, JWT secret or direct authorization reads",
    );
    const t = await terminal(),
      r = request(t);
    await expect(call(0, "", r, null), 401);
    await expect(call(0, "", r, u[2]), 403);
    await expect(call(0, "", r, { ...u[0], token: u[0].token + "x" }), 401);
    await expect(
      call(0, "", r, u[0], { cookie: "primax_control=ambient" }),
      401,
    );
    await expect(call(0, "", r, u[0], { "x-kiosk-signature": "bad" }), 403);
    await expect(call(0, "", { ...r, actor: { userId: u[1].id } }), 400);
    await expect(call(0, "", { ...r, stationId: crypto.randomUUID() }), 403);
    const ref = await expect(call(0, "", r), 200);
    assert.equal(ref.callerOperationId, r.callerOperationId);
    const local = (await callerRows(r.callerOperationId))[0],
      remote = (await consumerRows(r.callerOperationId))[0];
    assert.equal(local.userId, u[0].id);
    assert.equal(local.authVersion, u[0].authVersion);
    assert.equal(remote.intentId, ref.intentId);
    assert.ok(remote.commandId);
    pass(
      "Private FuelFlow admission uses real AuthCore Control Bearer at both ends; missing/forged/cookie/signed-Control identities and injected actor/scope rejected",
    );

    assert.deepEqual(await expect(call(1, "", r), 200), ref);
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, n) =>
        expect(execute(n % 2, r.callerOperationId), 200),
      ),
    );
    assert.ok(
      results.every((v) => v.terminalToken === results[0].terminalToken),
    );
    await once(t);
    assert.equal((await callerRows(r.callerOperationId)).length, 1);
    assert.equal((await consumerRows(r.callerOperationId)).length, 1);
    pass(
      "Two real FuelFlow processes share committed caller persistence and recover one intent/command; six concurrent executions commit exactly one credential/audit/receipt",
    );

    await lab.stop(processes[0]);
    await launch(0);
    await lab.stop(processes[1]);
    await launch(1);
    const recovered = await expect(execute(1, r.callerOperationId), 200);
    assert.equal(recovered.terminalToken, results[0].terminalToken);
    await once(t);
    assert.equal(
      (await consumerRows(r.callerOperationId))[0].commandId,
      remote.commandId,
    );
    pass(
      "Both caller processes genuinely restart; another instance recovers SQL journal and same durable receipt without caller files or token cache",
    );

    const verifyDown = await proxy("verify-unavailable");
    await launch(0, verifyDown.url);
    const notAdmitted = request(await terminal());
    await expect(call(0, "", notAdmitted), 503);
    assert.equal((await callerRows(notAdmitted.callerOperationId)).length, 0);
    assert.equal((await consumerRows(notAdmitted.callerOperationId)).length, 0);
    await expect(execute(0, r.callerOperationId), 503);
    await once(t);
    assert.equal(
      (await expect(execute(1, r.callerOperationId), 200)).terminalToken,
      results[0].terminalToken,
    );
    await launch(0);
    pass(
      "Remote verification outage denies new admission and recovery without stale authority or SQL writes; healthy instance recovers existing receipt once",
    );

    const unavailable = await proxy("unavailable");
    await launch(0, unavailable.url);
    const pending = request(await terminal());
    await expect(call(0, "", pending), 503);
    assert.equal(unavailable.stats().requests, 1);
    assert.equal((await callerRows(pending.callerOperationId)).length, 1);
    assert.equal((await consumerRows(pending.callerOperationId)).length, 0);
    const pendingRef = await expect(call(1, "", pending), 200);
    assert.ok(pendingRef.intentId);
    assert.equal((await callerRows(pending.callerOperationId)).length, 1);
    pass(
      "Unavailable Identity fails once with controlled 503 after caller commit; second instance recovers nonce persisted before first RPC and prepares once",
    );

    const lostPrepare = await proxy("lose-prepare");
    await launch(0, lostPrepare.url);
    const lost = request(await terminal());
    await expect(call(0, "", lost), 503);
    assert.equal(lostPrepare.stats().requests, 1);
    assert.equal(lostPrepare.stats().lastStatus, 200);
    const before = (await consumerRows(lost.callerOperationId))[0];
    assert.ok(before);
    const original = await expect(call(1, "", lost), 200);
    assert.equal(original.intentId, before.intentId);
    assert.equal((await callerRows(lost.callerOperationId)).length, 1);
    pass(
      "Lost Identity prepare response after its actual commit is recovered by another caller using original nonce, intent and command; no body-based rediscovery",
    );

    const lostExecute = await proxy("lose-execute");
    await launch(0, lostExecute.url);
    await expect(execute(0, lost.callerOperationId), 503);
    assert.equal(lostExecute.stats().executions, 1);
    assert.equal(lostExecute.stats().lastStatus, 200);
    const lostTerminal = { id: lost.terminalId };
    await once(lostTerminal);
    await expect(execute(1, lost.callerOperationId), 200);
    await once(lostTerminal);
    assert.equal(
      (await consumerRows(lost.callerOperationId))[0].commandId,
      before.commandId,
    );
    pass(
      "Identity issuance commits but reply is lost: caller returns 503 without automatic POST replay; second instance recovers original receipt with no duplicate credential/audit",
    );

    await launch(0);
    const fresh = request(await terminal());
    const admissions = await Promise.all(
      Array.from({ length: 6 }, (_, n) => expect(call(n % 2, "", fresh), 200)),
    );
    assert.ok(admissions.every((v) => v.intentId === admissions[0].intentId));
    assert.equal((await callerRows(fresh.callerOperationId)).length, 1);
    assert.equal((await consumerRows(fresh.callerOperationId)).length, 1);
    const different = await expect(
      call(1, "", { ...fresh, callerOperationId: crypto.randomUUID() }),
      200,
    );
    assert.notEqual(different.intentId, admissions[0].intentId);
    const changed = await terminal();
    await expect(call(1, "", { ...fresh, terminalId: changed.id }), 409);
    await expect(
      call(1, "", {
        ...fresh,
        expiresAt: new Date(Date.parse(fresh.expiresAt) + 1).toISOString(),
      }),
      409,
    );
    await expect(
      call(1, "", { ...fresh, action: "TERMINAL_RECOVERY_APPROVE" }),
      400,
    );
    await expect(execute(1, fresh.callerOperationId, u[1]), 404);
    pass(
      "Concurrent first admission shares one nonce mapping; distinct explicit nonces with identical targets stay separate; modified terminal/action/expiry and foreign owner rejected",
    );

    const exp = request(await terminal());
    exp.expiresAt = new Date(Date.now() + 1800).toISOString();
    await expect(call(0, "", exp), 200);
    await new Promise((r) => setTimeout(r, 2000));
    await expect(call(1, "", exp), 410);
    await expect(execute(1, exp.callerOperationId), 410);
    const corrupt = request(await terminal());
    await expect(call(0, "", corrupt), 200);
    await db.$executeRawUnsafe(
      'UPDATE fuelflow_lab."CallerOperation" SET "terminalId"=$1::uuid WHERE "callerOperationId"=$2::uuid',
      changed.id,
      corrupt.callerOperationId,
    );
    await expect(execute(1, corrupt.callerOperationId), 409);
    await db.terminalCredential.updateMany({
      where: { terminalId: lost.terminalId },
      data: { revokedAt: new Date() },
    });
    await expect(execute(1, lost.callerOperationId), 409);
    await once(lostTerminal);
    pass(
      "Expiry keeps caller tombstone; persisted-target tampering fails integrity; revoked issued credentials remain rejected rather than renewed implicitly",
    );

    const user = await db.user.create({
      data: {
        email: "fuelflow-private-" + crypto.randomUUID() + "@example.invalid",
        name: "Synthetic human Control",
        passwordHash: u[0].passwordHash,
      },
    });
    const grant = () =>
      db.userPermissionGrant.create({
        data: {
          userId: user.id,
          permission: "SYSTEM_ADMIN",
          reason: "Synthetic FuelFlow Control",
        },
      });
    await grant();
    const login = async () => {
      const logged = await status(
        http(origin, "auth/login", {
          method: "POST",
          body: { email: user.email, password },
        }),
        200,
      );
      return { ...user, token: logged.accessToken };
    };
    let logged = await login();
    const owned = request(await terminal());
    await expect(call(0, "", owned, logged), 200);
    await db.userPermissionGrant.deleteMany({ where: { userId: user.id } });
    await expect(call(1, "", owned, logged), 403);
    await expect(execute(1, owned.callerOperationId, logged), 403);
    await grant();
    await db.user.update({
      where: { id: user.id },
      data: { authVersion: { increment: 1 } },
    });
    await expect(execute(0, owned.callerOperationId, logged), 401);
    logged = await login();
    await expect(call(1, "", owned, logged), 403);
    await expect(execute(1, owned.callerOperationId, logged), 403);
    assert.equal((await callerRows(owned.callerOperationId)).length, 1);
    pass(
      "Control permissions and authVersion revocation are live across instances; even fresh login cannot take over a prior-generation caller nonce",
    );

    const restricted = new Pool({ connectionString: lab.fuelFlowUrl, max: 1 });
    try {
      for (const sql of [
        'UPDATE fuelflow_lab."CallerOperation" SET action=action',
        'DELETE FROM fuelflow_lab."CallerOperation"',
        'SELECT * FROM "IdentityConsumerIntent"',
        'SELECT * FROM "IdentityOperationalReceipt"',
        'SELECT * FROM "User"',
        'SELECT * FROM "UserPermissionGrant"',
        'SELECT * FROM "AdminControlAccount"',
        'SELECT * FROM "AdminControlGrant"',
        'SELECT * FROM "AdminStationAssignment"',
        'SELECT * FROM "Station"',
        'SELECT * FROM "Terminal"',
        'UPDATE "TerminalCredential" SET "revokedAt"=NULL',
        'UPDATE "Membership" SET balance=balance',
      ])
        await assert.rejects(restricted.query(sql));
      const { rows } = await restricted.query(
        'SELECT * FROM fuelflow_lab."CallerOperation"',
      );
      const saved = JSON.stringify(rows);
      assert.ok(
        !saved.includes(u[0].token) &&
          !saved.includes(results[0].terminalToken),
      );
    } finally {
      await restricted.end();
    }
    pass(
      "Caller with own pg dependency and no Identity runtime/JWT configuration cannot read User/grants/Control/Station/Terminal; own journal only and no stored credentials",
    );
  } finally {
    for (const p of processes) if (p) await lab.stop(p);
    for (const p of proxies) await p.close();
  }
};

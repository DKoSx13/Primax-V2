// Runs only against the fresh --remote-receipts laboratory; no inherited URLs or data.
module.exports = async function checks({
  db,
  projectLoad,
  origin,
  providerOrigin,
  apiKey,
  restartProvider,
  getProvider,
  identityProcess,
  http,
  signed,
  status,
  pass,
  docker,
  pgContainer,
  stationId,
  providerUrl,
  financialRead,
  redisContainer,
  redisSecret,
}) {
  const assert = require("node:assert/strict"),
    crypto = require("node:crypto"),
    httpNode = require("node:http");
  const { RemoteOperationalSessions } = projectLoad(
    "./dist/operational/remote/http-client",
  );
  const { DurableOperationalProvider } = projectLoad(
    "./dist/operational/remote/receipt-provider",
  );
  const { PrismaService } = projectLoad("./dist/persistence/compatibility-db");
  const { ConfigService } = projectLoad("@nestjs/config");
  const client = new RemoteOperationalSessions(providerOrigin, apiKey, 6000);
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  async function terminal(aged = false) {
    const t = await db.terminal.create({
      data: {
        stationId,
        code: "RC-" + crypto.randomBytes(5).toString("hex").toUpperCase(),
        operationalStatus: aged ? "EN_USO" : "DISPONIBLE",
      },
    });
    if (aged) {
      const pump = await db.pump.create({
        data: {
          stationId,
          code: "RP-" + crypto.randomBytes(5).toString("hex").toUpperCase(),
          name: "Synthetic receipt pump",
        },
      });
      const assignment = await db.terminalPumpAssignment.create({
        data: { stationId, terminalId: t.id, pumpId: pump.id },
      });
      await db.terminalOperation.create({
        data: {
          stationId,
          terminalId: t.id,
          pumpId: pump.id,
          terminalPumpAssignmentId: assignment.id,
          operationId: crypto.randomUUID(),
          openedAt: new Date(Date.now() - 600000),
        },
      });
      await db.terminalCredential.create({
        data: {
          terminalId: t.id,
          tokenHash: crypto.randomBytes(32).toString("hex"),
          issuedAt: new Date(Date.now() - 600000),
          expiresAt: new Date(Date.now() - 300000),
          lastUsedAt: new Date(Date.now() - 500000),
        },
      });
    }
    return t;
  }
  const request = (t) => ({
    version: 1,
    commandId: crypto.randomUUID(),
    command: { contractVersion: 1, stationId, terminalId: t.id },
  });
  const receipts = (terminalId) =>
    db.$queryRawUnsafe(
      'SELECT * FROM "IdentityOperationalReceipt" WHERE "terminalId"=$1::uuid ORDER BY "commandId"',
      terminalId,
    );
  async function snapshot(id) {
    return JSON.stringify({
      terminal: await db.terminal.findUnique({ where: { id } }),
      operations: await db.terminalOperation.findMany({
        where: { terminalId: id },
        orderBy: { id: "asc" },
      }),
      credentials: await db.terminalCredential.findMany({
        where: { terminalId: id },
        orderBy: { id: "asc" },
      }),
      audits: await db.operationalAuditEvent.findMany({
        where: { terminalId: id },
        orderBy: { id: "asc" },
      }),
      receipts: await receipts(id),
    });
  }
  async function once(t, n = 1) {
    assert.equal((await receipts(t.id)).length, n);
    assert.equal(
      await db.operationalAuditEvent.count({
        where: { terminalId: t.id, action: "TERMINAL_CREDENTIAL_ISSUED" },
      }),
      n,
    );
    assert.equal(
      await db.terminalCredential.count({
        where: { terminalId: t.id, revokedAt: null },
      }),
      1,
    );
  }
  const raw = async (r, key = apiKey, path = "/operational/v1/commands") =>
    fetch(providerOrigin + path, {
      method: "POST",
      headers: { "content-type": "application/json", "x-operational-key": key },
      body: JSON.stringify(r),
      signal: AbortSignal.timeout(10000),
    });
  const initial = await terminal(),
    initialCommand = request(initial);
  assert.equal((await raw(initialCommand, "wrong")).status, 401);
  assert.equal(
    (
      await raw({
        ...initialCommand,
        command: { ...initialCommand.command, stationId: crypto.randomUUID() },
      })
    ).status,
    403,
  );
  assert.equal((await raw({ ...initialCommand, sql: "SELECT 1" })).status, 400);
  assert.equal((await receipts(initial.id)).length, 0);
  pass(
    "Remote provider requires service authentication, versioned closed DTO and configured station before SQL; no new public Identity routes",
  );

  await db.$executeRawUnsafe(
    "CREATE TABLE identity_remote_fault (\"commandId\" uuid PRIMARY KEY, phase text NOT NULL DEFAULT 'fail')",
  );
  await db.$executeRawUnsafe("CREATE SEQUENCE identity_remote_fault_attempts");
  await db.$executeRawUnsafe(`CREATE FUNCTION identity_remote_fail() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
    IF EXISTS(SELECT 1 FROM identity_remote_fault WHERE "commandId"=NEW."commandId") THEN PERFORM nextval('identity_remote_fault_attempts'); IF EXISTS(SELECT 1 FROM identity_remote_fault WHERE "commandId"=NEW."commandId" AND phase='sleep') THEN PERFORM pg_sleep(8); ELSE RAISE EXCEPTION 'synthetic receipt insert failure'; END IF; END IF; RETURN NEW; END $$`);
  await db.$executeRawUnsafe(
    'CREATE TRIGGER identity_remote_fail BEFORE INSERT ON "IdentityOperationalReceipt" FOR EACH ROW EXECUTE FUNCTION identity_remote_fail()',
  );
  const rollback = await terminal(true),
    rollbackCommand = request(rollback),
    before = await snapshot(rollback.id);
  await db.$executeRawUnsafe(
    'INSERT INTO identity_remote_fault ("commandId") VALUES ($1::uuid)',
    rollbackCommand.commandId,
  );
  await assert.rejects(
    client.execute(rollbackCommand),
    (e) => e.getStatus() === 503,
  );
  assert.deepEqual(
    await db.$queryRawUnsafe(
      "SELECT is_called, last_value::text AS value FROM identity_remote_fault_attempts",
    ),
    [{ is_called: true, value: "1" }],
  );
  assert.equal(await snapshot(rollback.id), before);
  assert.equal(
    (await raw(rollbackCommand, apiKey, "/operational/v1/receipts/query"))
      .status,
    404,
  );
  await db.$executeRawUnsafe(
    'DELETE FROM identity_remote_fault WHERE "commandId"=$1::uuid',
    rollbackCommand.commandId,
  );
  await client.execute(rollbackCommand);
  await once(rollback);
  assert.equal(
    await db.operationalAuditEvent.count({
      where: {
        terminalId: rollback.id,
        action: "ABANDONED_EMPTY_ATTENTION_CLOSED",
      },
    }),
    1,
  );
  pass(
    "Receipt INSERT failure rolls back closure/terminal/credential/revocation/audit/receipt together; same command succeeds once after fault removal",
  );

  const unfinished = await terminal(true),
    unfinishedCommand = request(unfinished),
    unfinishedBefore = await snapshot(unfinished.id);
  await db.$executeRawUnsafe(
    'INSERT INTO identity_remote_fault ("commandId",phase) VALUES ($1::uuid,$2)',
    unfinishedCommand.commandId,
    "sleep",
  );
  const pending = client.execute(unfinishedCommand).then(
    () => null,
    (error) => error,
  );
  let backend;
  for (let i = 0; i < 50; i++) {
    const rows = await db.$queryRawUnsafe(
      "SELECT pid FROM pg_stat_activity WHERE usename='identity_receipt_provider' AND wait_event='PgSleep'",
    );
    if (rows.length) {
      backend = rows[0].pid;
      break;
    }
    await pause(100);
  }
  assert.ok(backend, "Receipt trigger must be reached before interrupting");
  const uncommittedProvider = getProvider();
  await new Promise((resolve) => {
    uncommittedProvider.once("exit", resolve);
    uncommittedProvider.kill("SIGKILL");
  });
  assert.equal((await pending).getStatus(), 503);
  let gone = false;
  for (let i = 0; i < 80; i++) {
    const rows = await db.$queryRawUnsafe(
      "SELECT pid FROM pg_stat_activity WHERE pid=$1",
      backend,
    );
    if (!rows.length) {
      gone = true;
      break;
    }
    await pause(200);
  }
  assert.ok(gone, "Interrupted SQL connection must roll back");
  assert.equal(await snapshot(unfinished.id), unfinishedBefore);
  await db.$executeRawUnsafe(
    'DELETE FROM identity_remote_fault WHERE "commandId"=$1::uuid',
    unfinishedCommand.commandId,
  );
  await restartProvider();
  assert.equal(
    (await raw(unfinishedCommand, apiKey, "/operational/v1/receipts/query"))
      .status,
    404,
  );
  await client.execute(unfinishedCommand);
  await once(unfinished);
  pass(
    "Provider killed while SQL receipt INSERT was pending: whole uncommitted unit rolls back; restart and explicit same-ID retry commit once",
  );

  const concurrent = await terminal(),
    concurrentCommand = request(concurrent);
  const results = await Promise.all(
    Array.from({ length: 6 }, () => client.execute(concurrentCommand)),
  );
  assert.ok(results.every((r) => r.terminalToken === results[0].terminalToken));
  await once(concurrent);
  const stable = await snapshot(concurrent.id);
  const changed = {
    ...concurrentCommand,
    command: {
      ...concurrentCommand.command,
      previousCredential: "f".repeat(64),
    },
  };
  assert.equal((await raw(changed)).status, 409);
  assert.equal(await snapshot(concurrent.id), stable);
  pass(
    "Six concurrent remote retries with one commandId commit exactly one credential, audit and receipt; conflicting fingerprint returns 409 without writes",
  );

  async function proxy(afterCommit) {
    let commands = 0,
      queries = 0;
    const server = httpNode.createServer(async (req, res) => {
      try {
        let body = "";
        for await (const chunk of req) body += chunk;
        const response = await fetch(providerOrigin + req.url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-operational-key": apiKey,
          },
          body,
          signal: AbortSignal.timeout(12000),
        });
        const payload = await response.text();
        if (req.url === "/operational/v1/commands") {
          commands++;
          if (commands === 1 && response.ok) {
            await afterCommit();
            res.destroy();
            return;
          }
        } else queries++;
        res.writeHead(response.status, { "content-type": "application/json" });
        res.end(payload);
      } catch {
        res.writeHead(503, { "content-type": "application/json" });
        res.end('{"code":"PROVIDER_UNAVAILABLE"}');
      }
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    return {
      client: new RemoteOperationalSessions(
        "http://127.0.0.1:" + server.address().port,
        apiKey,
        8000,
      ),
      counts: () => ({ commands, queries }),
      close: async () => {
        server.closeAllConnections();
        await new Promise((r) => server.close(r));
      },
    };
  }
  const lost = await terminal(),
    lostCommand = request(lost),
    p = await proxy(async () => {});
  try {
    const result = await p.client.execute(lostCommand);
    assert.equal(result.terminalId, lost.id);
    await once(lost);
    assert.deepEqual(p.counts(), { commands: 1, queries: 1 });
  } finally {
    await p.close();
  }
  pass(
    "Lost HTTP response after actual commit recovered by one receipt query; client never replays command POST",
  );

  const interrupted = await terminal(),
    interruptedCommand = request(interrupted),
    oldProvider = getProvider().pid;
  const crash = await proxy(async () => {
    const child = getProvider();
    await new Promise((r) => {
      child.once("exit", r);
      child.kill("SIGKILL");
    });
  });
  try {
    await assert.rejects(
      crash.client.execute(interruptedCommand),
      (e) => e.getStatus() === 503,
    );
    await once(interrupted);
  } finally {
    await crash.close();
  }
  await restartProvider();
  assert.notEqual(getProvider().pid, oldProvider);
  const recovered = await new RemoteOperationalSessions(
    providerOrigin,
    apiKey,
  ).query(interruptedCommand);
  assert.equal(
    (await client.execute(interruptedCommand)).terminalToken,
    recovered.terminalToken,
  );
  await once(interrupted);
  pass(
    "Provider killed after commit and before reply: durable encrypted receipt survives genuine process restart; same command returns original token without another audit",
  );

  const row = (await receipts(interrupted.id))[0];
  assert.ok(!JSON.stringify(row).includes(recovered.terminalToken));
  const roleDb = new PrismaService(
    new ConfigService({ IDENTITY_COMPAT_DATABASE_URL: providerUrl }),
  );
  try {
    await assert.rejects(
      roleDb.$executeRawUnsafe(
        'UPDATE "IdentityOperationalReceipt" SET ciphertext=ciphertext',
      ),
      /permission denied/i,
    );
    await assert.rejects(
      roleDb.$executeRawUnsafe('UPDATE "Membership" SET balance=balance'),
      /permission denied/i,
    );
    await assert.rejects(
      roleDb.$executeRawUnsafe('DELETE FROM "OperationalAuditEvent"'),
      /permission denied/i,
    );
    const wrongKey = new DurableOperationalProvider(
      roleDb,
      crypto.randomBytes(32),
    );
    await assert.rejects(
      wrongKey.execute("identity-lab", interruptedCommand),
      (e) => e.code === "RECEIPT_UNAVAILABLE",
    );
    await once(interrupted);
  } finally {
    await roleDb.$disconnect();
  }
  pass(
    "Receipt stores no plaintext credential, AEAD rejects wrong key without re-execution; provider cannot update receipts/money or delete audits",
  );

  const rotation = await terminal(),
    first = request(rotation),
    firstResult = await client.execute(first);
  await client.execute(request(rotation));
  await once(rotation, 2);
  await assert.rejects(client.execute(first), (e) => e.getStatus() === 409);
  await once(rotation, 2);
  const expired = await terminal(),
    expiredCommand = request(expired);
  await client.execute(expiredCommand);
  await db.terminalCredential.updateMany({
    where: { terminalId: expired.id },
    data: {
      issuedAt: new Date(Date.now() - 20000),
      lastUsedAt: new Date(Date.now() - 2000),
      expiresAt: new Date(Date.now() - 1000),
    },
  });
  await assert.rejects(
    client.query(expiredCommand),
    (e) => e.getStatus() === 409,
  );
  const revoked = await terminal(),
    revokedCommand = request(revoked);
  await client.execute(revokedCommand);
  await db.terminal.update({
    where: { id: revoked.id },
    data: { lifecycle: "REVOCADA", revokedAt: new Date() },
  });
  await assert.rejects(
    client.query(revokedCommand),
    (e) => e.getStatus() === 409,
  );
  pass(
    "Durable receipts never resurrect rotated/revoked/expired credentials or revoked terminals; completed command IDs remain tombstones",
  );

  const redisTerminal = await terminal(),
    route = "kiosk/session/terminal-bootstrap",
    body = { terminalId: redisTerminal.id };
  // Deny SET only: gateway/rate EVAL still works, forcing the real post-commit failure.
  docker(
    "exec",
    redisContainer,
    "redis-cli",
    "--no-auth-warning",
    "-a",
    redisSecret,
    "ACL",
    "SETUSER",
    "default",
    "-set",
  );
  try {
    await status(
      http(origin, route, {
        method: "POST",
        body,
        headers: signed(route, { method: "POST", body }),
      }),
      503,
    );
  } finally {
    docker(
      "exec",
      redisContainer,
      "redis-cli",
      "--no-auth-warning",
      "-a",
      redisSecret,
      "ACL",
      "SETUSER",
      "default",
      "+set",
    );
  }
  await once(redisTerminal);
  const redisReceipt = (await receipts(redisTerminal.id))[0];
  const redisCommand = {
    ...request(redisTerminal),
    commandId: redisReceipt.commandId,
  };
  const committed = await client.query(redisCommand);
  assert.equal(
    (await client.execute(redisCommand)).terminalToken,
    committed.terminalToken,
  );
  await once(redisTerminal);
  // Legacy HTTP carries no durable commandId: a distinct signed request remains a new rotation.
  await status(
    http(origin, route, {
      method: "POST",
      body,
      headers: signed(route, { method: "POST", body }),
    }),
    201,
  );
  await once(redisTerminal, 2);
  await assert.rejects(
    client.query(redisCommand),
    (e) => e.getStatus() === 409,
  );
  pass(
    "Real Identity HTTP: Redis SET fails after SQL commit (503), receipt permits same-command recovery without SQL duplication; distinct legacy HTTP retry rotates as before",
  );

  const pg = await terminal(),
    pgCommand = request(pg),
    pgResult = await client.execute(pgCommand),
    providerPid = getProvider().pid,
    identityPid = identityProcess.pid;
  const outage = await terminal(),
    outageCommand = request(outage);
  docker(
    "exec",
    "-u",
    "postgres",
    pgContainer,
    "pg_ctl",
    "-D",
    "/var/lib/postgresql/data",
    "stop",
    "-m",
    "immediate",
    "-w",
  );
  await assert.rejects(client.query(pgCommand), (e) => e.getStatus() === 503);
  await assert.rejects(
    client.execute(outageCommand),
    (e) => e.getStatus() === 503,
  );
  await status(http(origin, "health"), 503);
  docker(
    "exec",
    "-u",
    "postgres",
    pgContainer,
    "pg_ctl",
    "-D",
    "/var/lib/postgresql/data",
    "-l",
    "/var/lib/postgresql/data/receipt-restart.log",
    "start",
    "-w",
  );
  let restored = false;
  for (let i = 0; i < 30; i++) {
    try {
      assert.equal(
        (await client.query(pgCommand)).terminalToken,
        pgResult.terminalToken,
      );
      restored = true;
      break;
    } catch {
      await pause(300);
    }
  }
  assert.ok(restored, "Provider must reconnect without restart");
  assert.equal(getProvider().pid, providerPid);
  assert.equal(identityProcess.pid, identityPid);
  // Refresh only the verifier pool after actual provider recovery, never the tested processes.
  await db.$disconnect();
  await db.$connect();
  await once(pg);
  assert.equal((await receipts(outage.id)).length, 0);
  await client.execute(outageCommand);
  await once(outage);
  let ready = false;
  for (let i = 0; i < 30; i++) {
    try {
      if ((await financialRead()).status === 200) {
        ready = true;
        break;
      }
    } catch {}
    await pause(300);
  }
  assert.ok(ready, "Identity and bridge recover through real HTTP");
  pass(
    "PostgreSQL engine crash/WAL recovery retains committed receipts; provider/Identity reconnect without restart; failed new command commits once after recovery",
  );
};

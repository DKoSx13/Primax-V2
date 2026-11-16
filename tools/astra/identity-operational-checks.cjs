// Invoked only by a newly created synthetic full-schema laboratory.
module.exports = async function operationalChecks({
  db,
  projectLoad,
  origin,
  http,
  signed,
  status,
  pass,
  redis,
  docker,
  redisContainer,
  redisSecret,
  portDb,
  httpStationId,
  remote = false,
}) {
  const assert = require("node:assert/strict"),
    crypto = require("node:crypto");
  const { PrismaOperationalSessions } = projectLoad(
    "./dist/operational/prisma-sessions",
  );
  // Caller owns db and URL. Use the same complete transactional adapter as HTTP.
  assert.equal(
    typeof portDb.atomic,
    "function",
    "Real serializable provider required",
  );
  const adapter = new PrismaOperationalSessions(portDb);
  const station = await db.station.findUniqueOrThrow({
    where: { id: httpStationId },
  });

  async function fixture() {
    const terminal = await db.terminal.create({
      data: {
        stationId: station.id,
        code: "OP-" + crypto.randomBytes(5).toString("hex").toUpperCase(),
        operationalStatus: "EN_USO",
      },
    });
    const pump = await db.pump.create({
      data: {
        stationId: station.id,
        code: "P-" + crypto.randomBytes(5).toString("hex").toUpperCase(),
        name: "Synthetic pump",
      },
    });
    const assignment = await db.terminalPumpAssignment.create({
      data: { stationId: station.id, terminalId: terminal.id, pumpId: pump.id },
    });
    const operation = await db.terminalOperation.create({
      data: {
        operationId: crypto.randomUUID(),
        stationId: station.id,
        terminalId: terminal.id,
        pumpId: pump.id,
        terminalPumpAssignmentId: assignment.id,
        openedAt: new Date(Date.now() - 600000),
      },
    });
    const previous = crypto.randomBytes(32).toString("hex");
    const credential = await db.terminalCredential.create({
      data: {
        terminalId: terminal.id,
        tokenHash: crypto.createHash("sha256").update(previous).digest("hex"),
        issuedAt: new Date(Date.now() - 600000),
        expiresAt: new Date(Date.now() - 300000),
        lastUsedAt: new Date(Date.now() - 500000),
      },
    });
    return { terminal, operation, credential, previous };
  }
  const snapshot = async (terminalId) =>
    JSON.stringify({
      terminal: await db.terminal.findUniqueOrThrow({
        where: { id: terminalId },
      }),
      operations: await db.terminalOperation.findMany({
        where: { terminalId },
        orderBy: { id: "asc" },
      }),
      credentials: await db.terminalCredential.findMany({
        where: { terminalId },
        orderBy: { id: "asc" },
      }),
      audits: await db.operationalAuditEvent.findMany({
        where: { terminalId },
        orderBy: { id: "asc" },
      }),
    });
  const command = (f) => ({
    contractVersion: 1,
    stationId: station.id,
    terminalId: f.terminal.id,
    previousCredential: f.previous,
  });
  // These functions/triggers affect ONLY the fresh lab DB and explicit fixture UUIDs.
  await db.$executeRawUnsafe(
    'CREATE TABLE identity_lab_fault ("terminalId" uuid PRIMARY KEY, phase text NOT NULL)',
  );
  await db.$executeRawUnsafe("CREATE SEQUENCE identity_lab_attempts");
  await db.$executeRawUnsafe(`CREATE FUNCTION identity_lab_fail() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
    DECLARE phase text;
    BEGIN
      SELECT f.phase INTO phase FROM identity_lab_fault f WHERE f."terminalId"=NEW."terminalId";
      IF (TG_TABLE_NAME='TerminalCredential' AND phase='after-revoke') OR
         (TG_TABLE_NAME='OperationalAuditEvent' AND NEW.action='ABANDONED_EMPTY_ATTENTION_CLOSED' AND phase='after-close') OR
         (TG_TABLE_NAME='OperationalAuditEvent' AND NEW.action='TERMINAL_CREDENTIAL_ISSUED' AND phase='after-insert') THEN
         RAISE EXCEPTION 'synthetic atomic failure';
      END IF;
      IF TG_TABLE_NAME='OperationalAuditEvent' AND NEW.action='TERMINAL_CREDENTIAL_ISSUED' AND phase='transient'
         AND nextval('identity_lab_attempts')=1 THEN
         RAISE EXCEPTION 'synthetic serialization conflict' USING ERRCODE='40001';
      END IF;
      RETURN NEW;
    END $$`);
  // Separate functions avoid accessing fields not present in a credential trigger.
  await db.$executeRawUnsafe(`CREATE FUNCTION identity_lab_credential_fail() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
    BEGIN IF EXISTS(SELECT 1 FROM identity_lab_fault WHERE "terminalId"=NEW."terminalId" AND phase='after-revoke')
    THEN RAISE EXCEPTION 'synthetic insert failure'; END IF; RETURN NEW; END $$`);
  await db.$executeRawUnsafe(
    'CREATE TRIGGER identity_lab_credential BEFORE INSERT ON "TerminalCredential" FOR EACH ROW EXECUTE FUNCTION identity_lab_credential_fail()',
  );
  await db.$executeRawUnsafe(
    'CREATE TRIGGER identity_lab_audit BEFORE INSERT ON "OperationalAuditEvent" FOR EACH ROW EXECUTE FUNCTION identity_lab_fail()',
  );
  await db.$executeRawUnsafe(`CREATE FUNCTION identity_lab_commit_fail() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
    BEGIN IF NEW.action='TERMINAL_CREDENTIAL_ISSUED' AND EXISTS(SELECT 1 FROM identity_lab_fault WHERE "terminalId"=NEW."terminalId" AND phase='commit')
    THEN RAISE EXCEPTION 'synthetic deferred failure'; END IF; RETURN NEW; END $$`);
  await db.$executeRawUnsafe(
    'CREATE CONSTRAINT TRIGGER identity_lab_commit AFTER INSERT ON "OperationalAuditEvent" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION identity_lab_commit_fail()',
  );
  for (const phase of [
    "after-close",
    "after-revoke",
    "after-insert",
    "commit",
  ]) {
    const f = await fixture();
    await db.$executeRawUnsafe(
      "INSERT INTO identity_lab_fault VALUES ($1::uuid,$2)",
      f.terminal.id,
      phase,
    );
    const before = await snapshot(f.terminal.id);
    await assert.rejects(
      adapter.issueOrResume(command(f)),
      /synthetic (atomic|insert|deferred) failure/,
    );
    assert.equal(
      await snapshot(f.terminal.id),
      before,
      "Every domain row must roll back: " + phase,
    );
    await db.$executeRawUnsafe(
      'DELETE FROM identity_lab_fault WHERE "terminalId"=$1::uuid',
      f.terminal.id,
    );
  }
  pass(
    "Operational port: closure, revocation, credential insertion and deferred commit faults roll back Terminal/Operation/Credential/Audit snapshots completely",
  );

  const recovered = await fixture();
  await db.$queryRawUnsafe("SELECT setval('identity_lab_attempts',1,false)");
  await db.$executeRawUnsafe(
    "INSERT INTO identity_lab_fault VALUES ($1::uuid,$2)",
    recovered.terminal.id,
    "transient",
  );
  const issued = await adapter.issueOrResume(command(recovered));
  const attempts = await db.$queryRawUnsafe(
    "SELECT last_value::text AS value FROM identity_lab_attempts",
  );
  assert.equal(Number(attempts[0].value), 2);
  assert.equal(
    await db.terminalCredential.count({
      where: { terminalId: recovered.terminal.id, revokedAt: null },
    }),
    1,
  );
  assert.equal(
    await db.operationalAuditEvent.count({
      where: {
        terminalId: recovered.terminal.id,
        action: "TERMINAL_CREDENTIAL_ISSUED",
      },
    }),
    1,
  );
  assert.equal(
    await db.operationalAuditEvent.count({
      where: {
        terminalId: recovered.terminal.id,
        action: "ABANDONED_EMPTY_ATTENTION_CLOSED",
      },
    }),
    1,
  );
  assert.equal(
    (
      await db.terminalOperation.findUniqueOrThrow({
        where: { id: recovered.operation.id },
      })
    ).version,
    1,
  );
  assert.equal(
    (
      await db.terminal.findUniqueOrThrow({
        where: { id: recovered.terminal.id },
      })
    ).statusVersion,
    1,
  );
  await db.$executeRawUnsafe(
    'DELETE FROM identity_lab_fault WHERE "terminalId"=$1::uuid',
    recovered.terminal.id,
  );
  pass(
    "Operational port retries a real SQL serialization failure and commits closure/rotation/audits exactly once",
  );
  const resumed = await Promise.all(
    Array.from({ length: 6 }, () =>
      adapter.issueOrResume({
        ...command(recovered),
        previousCredential: issued.terminalToken,
      }),
    ),
  );
  assert.ok(
    resumed.every((result) => result.terminalToken === issued.terminalToken),
  );
  assert.equal(
    await db.operationalAuditEvent.count({
      where: {
        terminalId: recovered.terminal.id,
        action: "TERMINAL_CREDENTIAL_ISSUED",
      },
    }),
    1,
  );
  pass(
    "Concurrent duplicates with the same live credential resume it without a second issuance or audit",
  );

  const free = await db.terminal.create({
    data: { stationId: station.id, code: "OP-FREE" },
  });
  const rotations = await Promise.all(
    Array.from({ length: 4 }, () =>
      adapter.issueOrResume({
        contractVersion: 1,
        stationId: station.id,
        terminalId: free.id,
      }),
    ),
  );
  assert.equal(
    new Set(rotations.map((result) => result.terminalToken)).size,
    4,
  );
  assert.equal(
    await db.terminalCredential.count({
      where: { terminalId: free.id, revokedAt: null },
    }),
    1,
  );
  assert.equal(
    await db.operationalAuditEvent.count({
      where: { terminalId: free.id, action: "TERMINAL_CREDENTIAL_ISSUED" },
    }),
    4,
  );
  const latest = await db.terminalCredential.findFirstOrThrow({
    where: { terminalId: free.id, revokedAt: null },
  });
  assert.ok(
    rotations.some(
      (result) =>
        crypto
          .createHash("sha256")
          .update(result.terminalToken)
          .digest("hex") === latest.tokenHash,
    ),
  );
  pass(
    "Concurrent requests without prior credential retain legacy rotation semantics: all audited, only the last credential active",
  );
  await db.terminal.update({
    where: { id: free.id },
    data: { lifecycle: "REVOCADA", revokedAt: new Date() },
  });
  const revokedBefore = await snapshot(free.id);
  await assert.rejects(
    adapter.issueOrResume({
      contractVersion: 1,
      stationId: station.id,
      terminalId: free.id,
    }),
  );
  assert.equal(await snapshot(free.id), revokedBefore);
  pass(
    "Revoked terminal rejects issuance without changing credentials, operation or audit",
  );

  const recent = await fixture();
  await db.terminalOperation.update({
    where: { id: recent.operation.id },
    data: { openedAt: new Date() },
  });
  const recentBefore = await snapshot(recent.terminal.id);
  await assert.rejects(adapter.issueOrResume(command(recent)));
  assert.equal(await snapshot(recent.terminal.id), recentBefore);
  // An existing non-financial incident also prevents classifying an old attention as empty.
  const evidence = await fixture();
  await db.operationalIncident.create({
    data: {
      stationId: station.id,
      terminalId: evidence.terminal.id,
      operationId: evidence.operation.operationId,
      terminalOperationId: evidence.operation.id,
      eventKey: "identity-operational-test:" + crypto.randomUUID(),
      code: "TERMINAL_UNAVAILABLE",
      summary: "Synthetic incident",
    },
  });
  const evidenceBefore = await snapshot(evidence.terminal.id);
  await assert.rejects(adapter.issueOrResume(command(evidence)));
  assert.equal(await snapshot(evidence.terminal.id), evidenceBefore);
  pass(
    "Recent attention and existing incident evidence prohibit takeover; rollback keeps all prior state",
  );
  const route = "kiosk/session/terminal-bootstrap";
  const f = await fixture();
  const body = { terminalId: f.terminal.id };
  await db.$executeRawUnsafe(
    "INSERT INTO identity_lab_fault VALUES ($1::uuid,$2)",
    f.terminal.id,
    "after-insert",
  );
  const before = await snapshot(f.terminal.id);
  const sessionsBefore = (await redis.keys("primax:v12:*:session:*")).length;
  await status(
    http(origin, route, {
      method: "POST",
      body,
      headers: signed(route, { method: "POST", body }),
    }),
    remote ? 503 : 500,
  );
  assert.equal(await snapshot(f.terminal.id), before);
  assert.equal(
    (await redis.keys("primax:v12:*:session:*")).length,
    sessionsBefore,
  );
  await db.$executeRawUnsafe(
    'DELETE FROM identity_lab_fault WHERE "terminalId"=$1::uuid',
    f.terminal.id,
  );
  const reply = await status(
    http(origin, route, {
      method: "POST",
      body,
      headers: signed(route, { method: "POST", body }),
    }),
    201,
  );
  assert.match(reply.terminalToken, /^[a-f0-9]{64}$/);
  assert.ok(reply.token);
  assert.ok(reply.csrfToken);
  assert.equal(reply.terminalId, f.terminal.id);
  assert.equal(reply.ttl, 1800);
  for (const invalid of [
    { terminalId: "invalid" },
    { terminalId: f.terminal.id, stationId: station.id },
  ])
    await status(
      http(origin, route, {
        method: "POST",
        body: invalid,
        headers: signed(route, { method: "POST", body: invalid }),
      }),
      400,
    );
  await status(
    http(origin, route, {
      method: "POST",
      body,
      headers: signed(route, { method: "POST", body, bad: true }),
    }),
    401,
  );
  pass(
    "HTTP experimental coordinator preserves DTO/signature/response contract; SQL fault rolls back every row and creates no Redis session",
  );

  const preSql = await fixture();
  const preBody = { terminalId: preSql.terminal.id };
  const preSnapshot = await snapshot(preSql.terminal.id);
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
    "-eval",
  );
  try {
    await status(
      http(origin, route, {
        method: "POST",
        body: preBody,
        headers: signed(route, { method: "POST", body: preBody }),
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
      "+eval",
    );
  }
  assert.equal(await snapshot(preSql.terminal.id), preSnapshot);
  pass(
    "Redis rate-limit failure returns 503 before SQL: no closure, revocation, credential or audit changes",
  );

  // The legacy flow commits SQL BEFORE creating its Redis session. Demonstrate
  // this boundary honestly; there is no compensating/distributed rollback here.
  const postCommit = await fixture();
  const postBody = { terminalId: postCommit.terminal.id };
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
        body: postBody,
        headers: signed(route, { method: "POST", body: postBody }),
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
  assert.equal(
    await db.terminalCredential.count({
      where: { terminalId: postCommit.terminal.id, revokedAt: null },
    }),
    1,
  );
  assert.equal(
    await db.operationalAuditEvent.count({
      where: {
        terminalId: postCommit.terminal.id,
        action: "TERMINAL_CREDENTIAL_ISSUED",
      },
    }),
    1,
  );
  assert.equal(
    (
      await db.terminalOperation.findUniqueOrThrow({
        where: { id: postCommit.operation.id },
      })
    ).status,
    "CLOSED",
  );
  const unavailableId = (
    await db.terminalCredential.findFirstOrThrow({
      where: { terminalId: postCommit.terminal.id, revokedAt: null },
    })
  ).id;
  const finalReply = await status(
    http(origin, route, {
      method: "POST",
      body: postBody,
      headers: signed(route, { method: "POST", body: postBody }),
    }),
    201,
  );
  assert.match(finalReply.terminalToken, /^[a-f0-9]{64}$/);
  assert.ok(
    (
      await db.terminalCredential.findUniqueOrThrow({
        where: { id: unavailableId },
      })
    ).revokedAt,
  );
  assert.equal(
    await db.terminalCredential.count({
      where: { terminalId: postCommit.terminal.id, revokedAt: null },
    }),
    1,
  );
  pass(
    "Existing SQL/Redis boundary reproduced: post-commit Redis error returns 503 with coherent SQL; explicit retry rotates safely, no automatic replay or false rollback claim",
  );
};

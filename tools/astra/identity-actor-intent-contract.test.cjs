const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  crypto = require("node:crypto"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const c = require("./identity-actor-intent-contract.cjs");
function setup() {
  const human = {
    kind: "human",
    subjectId: crypto.randomUUID(),
    generation: 0,
    permissions: ["ADMIN_TERMINAL_MANAGE"],
    global: true,
    stationIds: [],
    role: "SUPER_ADMIN",
  };
  const r = {
    intentId: crypto.randomUUID(),
    commandId: crypto.randomUUID(),
    action: "TERMINAL_CREDENTIAL_ISSUE",
    stationId: crypto.randomUUID(),
    terminalId: crypto.randomUUID(),
    expiresAt: new Date(Date.now() + 60000).toISOString(),
  };
  return {
    human,
    r,
    e: c.envelope(human, r),
    request: {
      action: r.action,
      stationId: r.stationId,
      terminalId: r.terminalId,
    },
  };
}
test("complete proposal binds actor, permissions, action, scope, intent/command and immutable expiry", () => {
  const { human, e } = setup();
  assert.deepEqual(c.validate(e, e, human), e);
  for (const key of ["intentId", "commandId", "stationId", "terminalId"])
    assert.throws(
      () => c.validate({ ...e, [key]: crypto.randomUUID() }, e, human),
      { code: "PERSISTED_INTENT_CHANGED" },
    );
  assert.throws(
    () =>
      c.validate(
        { ...e, expiresAt: new Date(Date.now() + 120000).toISOString() },
        e,
        human,
      ),
    { code: "PERSISTED_INTENT_CHANGED" },
  );
  assert.throws(
    () => c.validate({ ...e, action: "TERMINAL_STATUS_READ" }, e, human),
    { code: "PERSISTED_INTENT_CHANGED" },
  );
});
test("another user/generation and revoked live permission cannot reuse a record", () => {
  const { human, e } = setup();
  assert.throws(
    () => c.validate(e, e, { ...human, subjectId: crypto.randomUUID() }),
    { code: "ACTOR_BINDING_MISMATCH" },
  );
  assert.throws(() => c.validate(e, e, { ...human, generation: 1 }), {
    code: "ACTOR_BINDING_MISMATCH",
  });
  assert.throws(() => c.validate(e, e, { ...human, permissions: [] }), {
    code: "PERMISSION_REVOKED",
  });
  assert.throws(
    () => c.validate(e, e, { ...human, global: false, stationIds: [] }),
    { code: "STATION_FORBIDDEN" },
  );
});
test("gateway/service/operator identity cannot be invented from a transport credential", () => {
  const { e } = setup();
  for (const kind of ["gateway", "service", "operator", "kiosk"])
    assert.throws(() => c.validate(e, e, { kind }), {
      code: "ACTOR_UNRESOLVED",
    });
});
test("technical proposal permits only scoped continuity/read, never fresh credentials or human impersonation", () => {
  const { r, human, e } = setup();
  const t = {
    kind: "terminal",
    subjectId: r.terminalId,
    generation: crypto.randomUUID(),
    terminalId: r.terminalId,
    stationId: r.stationId,
    permissions: [],
    credentialExpiresAt: new Date(Date.now() + 120000).toISOString(),
  };
  const a = c.envelope(t, { ...r, action: "TERMINAL_SESSION_RESUME" });
  assert.deepEqual(c.validate(a, a, t), a);
  assert.throws(() => c.validate(e, e, t), { code: "ACTOR_BINDING_MISMATCH" });
  assert.throws(
    () => c.validate(a, a, { ...t, generation: crypto.randomUUID() }),
    { code: "ACTOR_BINDING_MISMATCH" },
  );
  const issue = c.envelope(t, r);
  assert.throws(() => c.validate(issue, issue, t), {
    code: "HUMAN_AUTHORITY_REQUIRED",
  });
  assert.throws(
    () => c.validate(a, a, { ...t, permissions: ["ADMIN_TERMINAL_MANAGE"] }),
    { code: "TECHNICAL_PERMISSION_ESCALATION" },
  );
  assert.throws(
    () => c.validate(a, a, { ...t, stationId: crypto.randomUUID() }),
    { code: "TERMINAL_SCOPE_MISMATCH" },
  );
});
test("exceptional recovery keeps human SUPER_ADMIN/global/incident authority; expiry is never renewed", () => {
  const { human, r } = setup();
  const e = c.envelope(human, { ...r, action: "TERMINAL_RECOVERY_APPROVE" });
  assert.throws(() => c.validate(e, e, human), { code: "PERMISSION_REVOKED" });
  const granted = {
    ...human,
    permissions: [...human.permissions, "ADMIN_INCIDENT_MANAGE"],
  };
  assert.deepEqual(c.validate(e, e, granted), e);
  assert.throws(() => c.validate(e, e, { ...granted, role: "ADMIN" }), {
    code: "EXCEPTIONAL_AUTHORITY_REQUIRED",
  });
  assert.throws(() => c.validate(e, e, granted, Date.parse(e.expiresAt) + 1), {
    code: "INTENT_EXPIRED",
  });
});
function temp(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "primax-actor-contract-"));
  fs.chmodSync(dir, 0o700);
  const file = path.join(dir, "reference.json");
  t.after(() => {
    if (fs.existsSync(file)) fs.unlinkSync(file);
    fs.rmdirSync(dir);
  });
  return file;
}
test("durable caller nonce before prepare cannot infer a lost prepare response from an identical payload", (t) => {
  const { human, r, request } = setup(),
    file = temp(t);
  c.prepareReference(file, human, request, r.expiresAt);
  assert.throws(() => c.recoverReference(file, human, request), {
    code: "PREPARE_OUTCOME_UNKNOWN",
  });
  assert.throws(() => c.prepareReference(file, human, request, r.expiresAt));
});
test("acknowledged reference survives reload, remains scoped and stores no command/credential", (t) => {
  const { human, r, request } = setup(),
    file = temp(t);
  const nonce = c.prepareReference(file, human, request, r.expiresAt);
  c.acknowledgeReference(file, human, request, r);
  assert.deepEqual(c.recoverReference(file, human, request), {
    intentId: r.intentId,
    callerOperationId: nonce,
  });
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.ok(!fs.readFileSync(file, "utf8").includes(r.commandId));
  assert.throws(
    () =>
      c.recoverReference(
        file,
        { ...human, subjectId: crypto.randomUUID() },
        request,
      ),
    { code: "ACTOR_BINDING_MISMATCH" },
  );
  assert.throws(
    () =>
      c.recoverReference(file, human, {
        ...request,
        terminalId: crypto.randomUUID(),
      }),
    { code: "REQUEST_CHANGED" },
  );
  const body = JSON.parse(fs.readFileSync(file));
  body.intentId = crypto.randomUUID();
  fs.writeFileSync(file, JSON.stringify(body));
  assert.throws(() => c.recoverReference(file, human, request), {
    code: "CALLER_STATE_CHANGED",
  });
});
test("permission snapshot manipulation and unknown fields cannot confer authority", () => {
  const { human, e } = setup();
  assert.throws(
    () =>
      c.validate({ ...e, actor: { ...e.actor, permissions: [] } }, e, human),
    { code: "PERSISTED_INTENT_CHANGED" },
  );
  assert.throws(() => c.validate({ ...e, userId: human.subjectId }, e, human), {
    code: "INVALID_CONTRACT",
  });
});

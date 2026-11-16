// Executable PROPOSAL / private lab only. Not imported by any service or client.
// Context arguments MUST come from existing authentication adapters, never JSON.
const { createHash, randomUUID } = require("node:crypto");
const fs = require("node:fs");
const uuid =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const actions = [
  "TERMINAL_CREDENTIAL_ISSUE",
  "TERMINAL_STATUS_READ",
  "TERMINAL_SESSION_RESUME",
  "TERMINAL_RECOVERY_APPROVE",
];
function fail(code) {
  const e = new Error(code);
  e.code = code;
  throw e;
}
function closed(v, keys) {
  if (
    !v ||
    typeof v !== "object" ||
    Array.isArray(v) ||
    Object.keys(v).some((k) => !keys.includes(k)) ||
    keys.some((k) => !Object.hasOwn(v, k))
  )
    fail("INVALID_CONTRACT");
}
function id(v) {
  if (typeof v !== "string" || !uuid.test(v)) fail("INVALID_IDENTIFIER");
  return v.toLowerCase();
}
function date(v) {
  if (
    typeof v !== "string" ||
    !Number.isFinite(Date.parse(v)) ||
    new Date(v).toISOString() !== v
  )
    fail("INVALID_EXPIRY");
  return v;
}
function list(v) {
  if (
    !Array.isArray(v) ||
    v.some((s) => typeof s !== "string") ||
    new Set(v).size !== v.length
  )
    fail("INVALID_PERMISSIONS");
  return [...v].sort();
}
function subject(ctx) {
  if (!ctx || !["human", "terminal"].includes(ctx.kind))
    fail("ACTOR_UNRESOLVED");
  if (ctx.kind === "human") {
    if (!Number.isInteger(ctx.generation) || ctx.generation < 0)
      fail("INVALID_GENERATION");
    return {
      kind: "human",
      subjectId: id(ctx.subjectId),
      generation: ctx.generation,
    };
  }
  return {
    kind: "terminal",
    subjectId: id(ctx.subjectId),
    generation: id(ctx.generation),
  };
}
function actorSnapshot(ctx) {
  const s = subject(ctx);
  return { ...s, permissions: list(ctx.permissions) };
}
function target(v) {
  closed(v, ["action", "stationId", "terminalId"]);
  if (!actions.includes(v.action)) fail("UNKNOWN_ACTION");
  return {
    action: v.action,
    stationId: id(v.stationId),
    terminalId: id(v.terminalId),
  };
}
function access(ctx, t, expiresAt, now = Date.now()) {
  subject(ctx);
  date(expiresAt);
  if (Date.parse(expiresAt) <= now) fail("INTENT_EXPIRED");
  if (ctx.kind === "human") {
    const required =
      t.action === "TERMINAL_RECOVERY_APPROVE"
        ? ["ADMIN_TERMINAL_MANAGE", "ADMIN_INCIDENT_MANAGE"]
        : ["ADMIN_TERMINAL_MANAGE"];
    if (required.some((p) => !ctx.permissions.includes(p)))
      fail("PERMISSION_REVOKED");
    if (!ctx.global && !ctx.stationIds.map(id).includes(t.stationId))
      fail("STATION_FORBIDDEN");
    if (
      t.action === "TERMINAL_RECOVERY_APPROVE" &&
      (!ctx.global || ctx.role !== "SUPER_ADMIN")
    )
      fail("EXCEPTIONAL_AUTHORITY_REQUIRED");
  } else {
    if (ctx.permissions.length !== 0) fail("TECHNICAL_PERMISSION_ESCALATION");
    if (
      id(ctx.subjectId) !== t.terminalId ||
      id(ctx.terminalId) !== t.terminalId ||
      id(ctx.stationId) !== t.stationId
    )
      fail("TERMINAL_SCOPE_MISMATCH");
    if (Date.parse(date(ctx.credentialExpiresAt)) <= now)
      fail("CREDENTIAL_EXPIRED");
    if (Date.parse(expiresAt) > Date.parse(ctx.credentialExpiresAt))
      fail("EXPIRY_EXCEEDS_AUTHORITY");
    if (!["TERMINAL_STATUS_READ", "TERMINAL_SESSION_RESUME"].includes(t.action))
      fail("HUMAN_AUTHORITY_REQUIRED");
  }
}
function envelope(ctx, record) {
  const t = target({
    action: record.action,
    stationId: record.stationId,
    terminalId: record.terminalId,
  });
  return {
    contract: "ActorIntent.v1-proposal",
    actor: actorSnapshot(ctx),
    ...t,
    intentId: id(record.intentId),
    commandId: id(record.commandId),
    expiresAt: date(record.expiresAt),
  };
}
function normalize(e) {
  closed(e, [
    "contract",
    "actor",
    "action",
    "stationId",
    "terminalId",
    "intentId",
    "commandId",
    "expiresAt",
  ]);
  if (e.contract !== "ActorIntent.v1-proposal") fail("INVALID_CONTRACT");
  closed(e.actor, ["kind", "subjectId", "generation", "permissions"]);
  return {
    contract: e.contract,
    actor: actorSnapshot(e.actor),
    ...target({
      action: e.action,
      stationId: e.stationId,
      terminalId: e.terminalId,
    }),
    intentId: id(e.intentId),
    commandId: id(e.commandId),
    expiresAt: date(e.expiresAt),
  };
}
function digest(v) {
  return createHash("sha256").update(JSON.stringify(v)).digest("hex");
}
function validate(candidate, persisted, current, now = Date.now()) {
  const a = normalize(candidate),
    b = normalize(persisted);
  if (digest(a) !== digest(b)) fail("PERSISTED_INTENT_CHANGED");
  if (JSON.stringify(subject(a.actor)) !== JSON.stringify(subject(current)))
    fail("ACTOR_BINDING_MISMATCH");
  access(
    current,
    target({
      action: a.action,
      stationId: a.stationId,
      terminalId: a.terminalId,
    }),
    a.expiresAt,
    now,
  );
  return a;
}
// Reference adapter for a PRIVATE laboratory caller, not FuelFlow persistence.
// Never stores JWT, CSRF, credentials, response or provider commandId.
function read(file) {
  let v;
  try {
    v = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    fail("CALLER_STATE_UNAVAILABLE");
  }
  closed(v, [
    "version",
    "state",
    "callerOperationId",
    "owner",
    "action",
    "stationId",
    "terminalId",
    "expiresAt",
    "intentId",
    "checksum",
  ]);
  const { checksum, ...fields } = v;
  if (checksum !== digest(fields)) fail("CALLER_STATE_CHANGED");
  if (v.version !== 1 || !["PENDING", "READY"].includes(v.state))
    fail("INVALID_CALLER_STATE");
  id(v.callerOperationId);
  closed(v.owner, ["kind", "subjectId", "generation"]);
  subject(v.owner);
  date(v.expiresAt);
  target({
    action: v.action,
    stationId: v.stationId,
    terminalId: v.terminalId,
  });
  if (v.state === "READY") id(v.intentId);
  else if (v.intentId !== null) fail("INVALID_CALLER_STATE");
  return fields;
}
function checkReference(v, current, request, now = Date.now()) {
  if (JSON.stringify(v.owner) !== JSON.stringify(subject(current)))
    fail("ACTOR_BINDING_MISMATCH");
  const t = target(request);
  if (
    JSON.stringify(t) !==
    JSON.stringify(
      target({
        action: v.action,
        stationId: v.stationId,
        terminalId: v.terminalId,
      }),
    )
  )
    fail("REQUEST_CHANGED");
  access(current, t, v.expiresAt, now);
}
function write(file, fields, initial = false) {
  const bytes = JSON.stringify({ ...fields, checksum: digest(fields) });
  if (initial) fs.writeFileSync(file, bytes, { mode: 0o600, flag: "wx" });
  else {
    const temp = file + "." + randomUUID() + ".tmp";
    try {
      fs.writeFileSync(temp, bytes, { mode: 0o600, flag: "wx" });
      fs.renameSync(temp, file);
    } finally {
      if (fs.existsSync(temp)) fs.unlinkSync(temp);
    }
  }
}
function prepareReference(
  file,
  current,
  request,
  expiresAt,
  callerOperationId = randomUUID(),
) {
  const t = target(request);
  access(current, t, expiresAt);
  const v = {
    version: 1,
    state: "PENDING",
    callerOperationId: id(callerOperationId),
    owner: subject(current),
    ...t,
    expiresAt: date(expiresAt),
    intentId: null,
  };
  write(file, v, true);
  return v.callerOperationId;
}
function acknowledgeReference(file, current, request, reply) {
  const v = read(file);
  checkReference(v, current, request);
  if (v.state !== "PENDING") fail("REFERENCE_ALREADY_ACKNOWLEDGED");
  const expiry = date(reply.expiresAt);
  if (Date.parse(expiry) > Date.parse(v.expiresAt)) fail("EXPIRY_EXTENSION");
  write(file, {
    ...v,
    state: "READY",
    intentId: id(reply.intentId),
    expiresAt: expiry,
  });
}
function recoverReference(file, current, request, now = Date.now()) {
  const v = read(file);
  checkReference(v, current, request, now);
  if (v.state !== "READY") fail("PREPARE_OUTCOME_UNKNOWN");
  return { intentId: v.intentId, callerOperationId: v.callerOperationId };
}
module.exports = {
  envelope,
  validate,
  prepareReference,
  acknowledgeReference,
  recoverReference,
};

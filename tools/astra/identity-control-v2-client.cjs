// PRIVATE LAB ONLY. No import from FuelFlow, Gateway or public Identity.
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const hash = (value) =>
  crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const uuid =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
function owner(actor) {
  if (
    !actor ||
    actor.kind !== "human" ||
    !uuid.test(actor.subjectId) ||
    !Number.isInteger(actor.generation)
  )
    throw Error("VERIFIED_CONTROL_REQUIRED");
  return { userId: actor.subjectId, authVersion: actor.generation };
}
function create(file, verifiedActor, target, expiresAt) {
  const state = {
    version: 2,
    owner: owner(verifiedActor),
    request: {
      callerOperationId: crypto.randomUUID(),
      action: "TERMINAL_CREDENTIAL_ISSUE",
      stationId: target.stationId,
      terminalId: target.terminalId,
      expiresAt,
    },
  };
  for (const k of ["stationId", "terminalId"])
    if (!uuid.test(state.request[k])) throw Error("INVALID_TARGET");
  if (
    !Number.isFinite(Date.parse(expiresAt)) ||
    Date.parse(expiresAt) <= Date.now() ||
    Date.parse(expiresAt) > Date.now() + 15 * 60000
  )
    throw Error("INVALID_EXPIRY");
  const fd = fs.openSync(file, "wx", 0o600);
  try {
    fs.writeFileSync(fd, JSON.stringify({ ...state, checksum: hash(state) }));
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  const dir = fs.openSync(path.dirname(file), "r");
  try {
    fs.fsyncSync(dir);
  } finally {
    fs.closeSync(dir);
  }
  return state.request.callerOperationId;
}
function open({
  enabled,
  origin,
  file,
  verifiedActor,
  getSession,
  transport = fetch,
}) {
  const url = new URL(origin);
  if (
    enabled !== true ||
    url.protocol !== "http:" ||
    url.hostname !== "127.0.0.1" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw Error("PRIVATE_LAB_REQUIRED");
  const read = () => {
    const value = JSON.parse(fs.readFileSync(file, "utf8")),
      { checksum, ...state } = value;
    if (checksum !== hash(state) || state.version !== 2)
      throw Error("CALLER_STATE_CHANGED");
    if (JSON.stringify(state.owner) !== JSON.stringify(owner(verifiedActor)))
      throw Error("ACTOR_BINDING_MISMATCH");
    if (Date.parse(state.request.expiresAt) <= Date.now())
      throw Error("INTENT_EXPIRED");
    return state.request;
  };
  async function post(route, body) {
    // Supplied only by a trusted Control authentication adapter, not caller JSON.
    const session = await getSession();
    const persisted = JSON.parse(fs.readFileSync(file, "utf8"));
    if (
      JSON.stringify(owner(session.verifiedActor)) !==
      JSON.stringify(persisted.owner)
    )
      throw Error("ACTOR_BINDING_MISMATCH");
    const token = session.bearer;
    const response = await transport(url.origin + "/consumer/v2/" + route, {
      method: "POST",
      redirect: "error",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer " + token,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    const result = await response.json();
    if (!response.ok) {
      const error = Error(result.code || "PRIVATE_CONSUMER_ERROR");
      error.status = response.status;
      throw error;
    }
    return result;
  }
  const prepare = async () => post("intents", read());
  return {
    prepare,
    execute: async () => {
      const reference = await prepare();
      return post("intents/execute", { intentId: reference.intentId });
    },
  };
}
module.exports = { create, open };

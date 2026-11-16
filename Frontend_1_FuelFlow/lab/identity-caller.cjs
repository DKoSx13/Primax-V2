// Private laboratory entrypoint. Never imported by FuelFlow's gateway/browser.
const { createServer } = require("node:http");
const { createHash } = require("node:crypto");
const { RemoteControl, ControlFailure } = require("./remote-control.cjs");
const uuid =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const action = "TERMINAL_CREDENTIAL_ISSUE";
class Failure extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}
function closed(value, fields) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length !== fields.length ||
    fields.some((k) => typeof value[k] !== "string") ||
    Object.keys(value).some((k) => !fields.includes(k))
  )
    throw new Failure(400, "INVALID_OPERATION");
}
function request(body) {
  closed(body, [
    "callerOperationId",
    "action",
    "stationId",
    "terminalId",
    "expiresAt",
  ]);
  if (
    body.action !== action ||
    ["callerOperationId", "stationId", "terminalId"].some(
      (k) => !uuid.test(body[k]),
    ) ||
    !Number.isFinite(Date.parse(body.expiresAt)) ||
    new Date(body.expiresAt).toISOString() !== body.expiresAt
  )
    throw new Failure(400, "INVALID_OPERATION");
  return {
    callerOperationId: body.callerOperationId.toLowerCase(),
    action: body.action,
    stationId: body.stationId.toLowerCase(),
    terminalId: body.terminalId.toLowerCase(),
    expiresAt: body.expiresAt,
  };
}
function digest(row) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        row.userId,
        row.authVersion,
        row.callerOperationId,
        row.action,
        row.stationId,
        row.terminalId,
        new Date(row.expiresAt).toISOString(),
      ]),
    )
    .digest("hex");
}
function asRequest(row) {
  return {
    callerOperationId: row.callerOperationId,
    action: row.action,
    stationId: row.stationId,
    terminalId: row.terminalId,
    expiresAt: new Date(row.expiresAt).toISOString(),
  };
}
class CallerOperations {
  constructor(db, stationId, identityOrigin, control, transport = fetch) {
    this.db = db;
    this.stationId = stationId;
    this.identityOrigin = identityOrigin;
    this.control = control;
    this.transport = transport;
  }
  async authorize(actor, target, bearer) {
    await this.control.authorize(actor, target, bearer);
  }
  async read(actor, id) {
    if (!uuid.test(id)) throw new Failure(400, "INVALID_OPERATION");
    const { rows } = await this.db.query(
      'SELECT * FROM fuelflow_lab."CallerOperation" WHERE "userId"=$1::uuid AND "callerOperationId"=$2::uuid',
      [actor.userId, id.toLowerCase()],
    );
    const row = rows[0];
    if (!row) throw new Failure(404, "OPERATION_NOT_FOUND");
    if (row.authVersion !== actor.authVersion)
      throw new Failure(403, "OPERATION_FORBIDDEN");
    if (row.fingerprint !== digest(row))
      throw new Failure(409, "OPERATION_INTEGRITY");
    if (new Date(row.expiresAt) <= new Date())
      throw new Failure(410, "OPERATION_EXPIRED");
    return row;
  }
  async admit(actor, body, bearer) {
    const input = request(body);
    await this.authorize(actor, input, bearer);
    // Read existing tombstone before enforcing creation TTL: never extend a retry.
    const { rows: previous } = await this.db.query(
      'SELECT * FROM fuelflow_lab."CallerOperation" WHERE "userId"=$1::uuid AND "callerOperationId"=$2::uuid',
      [actor.userId, input.callerOperationId],
    );
    if (!previous[0]) {
      if (Date.parse(input.expiresAt) <= Date.now())
        throw new Failure(410, "OPERATION_EXPIRED");
      if (Date.parse(input.expiresAt) > Date.now() + 15 * 60000)
        throw new Failure(400, "INVALID_EXPIRY");
      const row = {
        ...input,
        userId: actor.userId,
        authVersion: actor.authVersion,
      };
      const hash = digest(row);
      // Commit the caller request before any Identity preparation/emission RPC.
      await this.db.query(
        `INSERT INTO fuelflow_lab."CallerOperation"
        ("userId","callerOperationId","authVersion",action,"stationId","terminalId","expiresAt",fingerprint)
        VALUES ($1::uuid,$2::uuid,$3,$4,$5::uuid,$6::uuid,$7,$8)
        ON CONFLICT ("userId","callerOperationId") DO NOTHING`,
        [
          actor.userId,
          input.callerOperationId,
          actor.authVersion,
          input.action,
          input.stationId,
          input.terminalId,
          new Date(input.expiresAt),
          hash,
        ],
      );
    }
    const saved = await this.read(actor, input.callerOperationId);
    if (JSON.stringify(asRequest(saved)) !== JSON.stringify(input))
      throw new Failure(409, "OPERATION_CONFLICT");
    return saved;
  }
  async rpc(route, body, bearer) {
    let response, result;
    try {
      response = await this.transport(
        this.identityOrigin + "/consumer/v2/" + route,
        {
          method: "POST",
          redirect: "error",
          headers: {
            "content-type": "application/json",
            authorization: bearer,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(12000),
        },
      );
      result = await response.json();
    } catch {
      throw new Failure(503, "IDENTITY_UNAVAILABLE");
    }
    if (!response.ok)
      throw new Failure(
        [400, 401, 403, 404, 409, 410, 503].includes(response.status)
          ? response.status
          : 503,
        "IDENTITY_REJECTED",
      );
    return result;
  }
  async prepare(row, bearer) {
    const ref = await this.rpc("intents", asRequest(row), bearer);
    if (
      !ref ||
      !uuid.test(ref.intentId) ||
      ref.expiresAt !== new Date(row.expiresAt).toISOString()
    )
      throw new Failure(503, "IDENTITY_INVALID_REFERENCE");
    return ref;
  }
  async execute(actor, id, bearer) {
    const row = await this.read(actor, id);
    await this.authorize(actor, row, bearer);
    const ref = await this.prepare(row, bearer);
    const result = await this.rpc(
      "intents/execute",
      { intentId: ref.intentId },
      bearer,
    );
    if (
      !result ||
      result.terminalId !== row.terminalId ||
      typeof result.terminalToken !== "string" ||
      !Number.isFinite(Date.parse(result.expiresAt))
    )
      throw new Failure(503, "IDENTITY_INVALID_RESULT");
    return result;
  }
}
function createCallerServer(auth, operations) {
  return createServer(async (req, res) => {
    res.setHeader("content-type", "application/json");
    res.setHeader("cache-control", "no-store");
    try {
      if (
        req.method !== "POST" ||
        ![
          "/private/fuelflow/v1/operations",
          "/private/fuelflow/v1/operations/execute",
        ].includes(req.url)
      )
        throw new Failure(404, "NOT_FOUND");
      const adapted = Object.assign(req, {
        path: req.url,
        originalUrl: req.url,
        header: (name) => {
          const value = req.headers[name.toLowerCase()];
          return typeof value === "string" ? value : undefined;
        },
      });
      const actor = await auth.authenticate(adapted);
      let size = 0;
      const chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 2048) throw new Failure(413, "BODY_TOO_LARGE");
        chunks.push(chunk);
      }
      let body;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString());
      } catch {
        throw new Failure(400, "INVALID_OPERATION");
      }
      let result;
      if (req.url.endsWith("/execute")) {
        closed(body, ["callerOperationId"]);
        result = await operations.execute(
          actor,
          body.callerOperationId,
          req.headers.authorization,
        );
      } else {
        const row = await operations.admit(
          actor,
          body,
          req.headers.authorization,
        );
        const ref = await operations.prepare(row, req.headers.authorization);
        result = { callerOperationId: row.callerOperationId, ...ref };
      }
      res.statusCode = 200;
      res.end(JSON.stringify(result));
    } catch (error) {
      res.statusCode =
        error instanceof Failure || error instanceof ControlFailure
          ? error.status
          : 503;
      res.end(
        JSON.stringify({
          code:
            error instanceof Failure || error instanceof ControlFailure
              ? error.code
              : res.statusCode === 503
                ? "CALLER_UNAVAILABLE"
                : "ACCESS_REJECTED",
        }),
      );
    }
  });
}
function configuration(env) {
  if (
    env.FUELFLOW_IDENTITY_PRIVATE_LAB !== "enabled" ||
    env.IDENTITY_RUNTIME_PROFILE !== "synthetic"
  )
    throw Error("Private synthetic opt-in required");
  const db = new URL(env.FUELFLOW_CALLER_DATABASE_URL),
    identity = new URL(env.FUELFLOW_IDENTITY_ORIGIN);
  if (
    db.hostname !== "127.0.0.1" ||
    db.pathname !== "/synthetic" ||
    !uuid.test(env.KIOSK_STATION_ID) ||
    identity.protocol !==
      (env.FUELFLOW_SERVICE_TLS_LAB === "enabled" ? "https:" : "http:") ||
    identity.hostname !== "127.0.0.1" ||
    identity.username ||
    identity.password ||
    identity.pathname !== "/" ||
    identity.search ||
    identity.hash
  )
    throw Error("Private synthetic configuration required");
  return identity.origin;
}
async function main() {
  const identity = configuration(process.env),
    { Pool } = require("pg");
  const db = new Pool({
    connectionString: process.env.FUELFLOW_CALLER_DATABASE_URL,
    max: 5,
    connectionTimeoutMillis: 3000,
  });
  await db.query("SELECT 1");
  const transport =
    process.env.FUELFLOW_SERVICE_TLS_LAB === "enabled"
      ? require("./service-transport.cjs").serviceTransport(
          identity,
          process.env.FUELFLOW_TLS_CA_FILE,
          process.env.FUELFLOW_SERVICE_CREDENTIAL_FILE,
        )
      : fetch;
  const control = new RemoteControl(identity, transport);
  const server = createCallerServer(
    control,
    new CallerOperations(
      db,
      process.env.KIOSK_STATION_ID,
      identity,
      control,
      transport,
    ),
  );
  await new Promise((r) =>
    server.listen(Number(process.env.PORT), "127.0.0.1", r),
  );
  let stopping = false;
  async function stop() {
    if (stopping) return;
    stopping = true;
    server.close();
    server.closeAllConnections();
    await db.end();
  }
  process.on("SIGTERM", () => void stop());
  process.on("SIGINT", () => void stop());
}
module.exports = {
  CallerOperations,
  createCallerServer,
  configuration,
};
if (require.main === module)
  void main().catch(() => {
    console.error("Private FuelFlow caller failed");
    process.exitCode = 1;
  });

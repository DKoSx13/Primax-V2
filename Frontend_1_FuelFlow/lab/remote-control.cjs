// Read-only private port. No JWT decoding, signing keys, permission rules or fallback.
const uuid =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
class ControlFailure extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}
function exact(value, keys) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((k) => Object.hasOwn(value, k))
  );
}
class RemoteControl {
  constructor(origin, transport = fetch) {
    this.origin = origin;
    this.transport = transport;
  }
  async verify(headers, target = null) {
    let response, body;
    try {
      response = await this.transport(
        this.origin + "/consumer/v2/control/verify",
        {
          method: "POST",
          redirect: "error",
          headers: { ...headers, "content-type": "application/json" },
          body: JSON.stringify(target || {}),
          signal: AbortSignal.timeout(5000),
        },
      );
      body = await response.json();
    } catch {
      throw new ControlFailure(503, "CONTROL_UNAVAILABLE");
    }
    if (!response.ok)
      throw new ControlFailure(
        [400, 401, 403, 409, 410].includes(response.status) ||
        (response.status === 404 && body?.code === "TERMINAL_NOT_FOUND")
          ? response.status
          : 503,
        "CONTROL_REJECTED",
      );
    if (
      response.status !== 200 ||
      !exact(body, ["version", "actor", "target"]) ||
      body.version !== 1 ||
      !exact(body.actor, ["userId", "authVersion"]) ||
      !uuid.test(body.actor.userId) ||
      !Number.isInteger(body.actor.authVersion) ||
      body.actor.authVersion < 0
    )
      throw new ControlFailure(503, "CONTROL_INVALID_RESPONSE");
    if (target === null) {
      if (body.target !== null)
        throw new ControlFailure(503, "CONTROL_CONTEXT_MISMATCH");
    } else if (
      !exact(body.target, ["action", "stationId", "terminalId", "expiresAt"]) ||
      Object.keys(target).some((k) => body.target[k] !== target[k])
    )
      throw new ControlFailure(503, "CONTROL_CONTEXT_MISMATCH");
    return body.actor;
  }
  async authenticate(req) {
    if (!/^Bearer \S+$/i.test(req.headers.authorization || ""))
      throw new ControlFailure(401, "BEARER_REQUIRED");
    const headers = {};
    for (const name of [
      "authorization",
      "cookie",
      "x-kiosk-signature",
      "x-kiosk-timestamp",
      "x-kiosk-owner",
    ])
      if (typeof req.headers[name] === "string")
        headers[name] = req.headers[name];
    return this.verify(headers);
  }
  async authorize(actor, target, bearer) {
    const current = await this.verify(
      { authorization: bearer },
      {
        action: target.action,
        stationId: target.stationId,
        terminalId: target.terminalId,
        expiresAt: new Date(target.expiresAt).toISOString(),
      },
    );
    if (
      current.userId !== actor.userId ||
      current.authVersion !== actor.authVersion
    )
      throw new ControlFailure(403, "CONTROL_ACTOR_CHANGED");
  }
}
module.exports = { RemoteControl, ControlFailure };

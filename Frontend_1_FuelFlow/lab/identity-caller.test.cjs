const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  { randomUUID } = require("node:crypto"),
  { createServer } = require("node:http");
const {
  configuration,
  createCallerServer,
  CallerOperations,
} = require("./identity-caller.cjs");
const env = () => ({
  FUELFLOW_IDENTITY_PRIVATE_LAB: "enabled",
  IDENTITY_RUNTIME_PROFILE: "synthetic",
  FUELFLOW_CALLER_DATABASE_URL:
    "postgresql://synthetic:synthetic@127.0.0.1/synthetic",
  FUELFLOW_IDENTITY_ORIGIN: "http://127.0.0.1:1234",
  KIOSK_STATION_ID: randomUUID(),
});
test("private configuration requires synthetic opt-in and loopback-only services", () => {
  assert.equal(configuration(env()), "http://127.0.0.1:1234");
  for (const override of [
    { FUELFLOW_IDENTITY_PRIVATE_LAB: "off" },
    { IDENTITY_RUNTIME_PROFILE: "production" },
    { FUELFLOW_IDENTITY_ORIGIN: "https://example.invalid" },
    { FUELFLOW_IDENTITY_ORIGIN: "http://user:secret@127.0.0.1:1234" },
    { FUELFLOW_CALLER_DATABASE_URL: "postgresql://x:x@remote/synthetic" },
  ])
    assert.throws(() => configuration({ ...env(), ...override }));
});
test("closed admission rejects forged actor/command/action before database access", async () => {
  const app = new CallerOperations({}, randomUUID(), "http://127.0.0.1");
  const body = {
    callerOperationId: randomUUID(),
    action: "TERMINAL_CREDENTIAL_ISSUE",
    stationId: randomUUID(),
    terminalId: randomUUID(),
    expiresAt: new Date(Date.now() + 60000).toISOString(),
  };
  for (const extra of [
    { actor: "forged" },
    { commandId: randomUUID() },
    { action: "TERMINAL_RECOVERY_APPROVE" },
  ])
    await assert.rejects(
      app.admit({}, { ...body, ...extra }),
      (e) => e.status === 400,
    );
});
test("private server authenticates before handling the body and exposes no legacy/bootstrap route", async () => {
  let calls = 0;
  const server = createCallerServer(
    {
      authenticate: async () => {
        calls++;
        const { ControlFailure } = require("./remote-control.cjs");
        throw new ControlFailure(401, "BEARER_REQUIRED");
      },
    },
    {},
  );
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    const base = "http://127.0.0.1:" + server.address().port;
    assert.equal(
      (
        await fetch(base + "/private/fuelflow/v1/operations", {
          method: "POST",
          body: "invalid",
        })
      ).status,
      401,
    );
    assert.equal(calls, 1);
    assert.equal(
      (await fetch(base + "/api/kiosk/terminal-bootstrap", { method: "POST" }))
        .status,
      404,
    );
    assert.equal(calls, 1);
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
});
test("Identity error performs one RPC and never turns an unavailable receipt into new issuance", async () => {
  let calls = 0;
  const server = createServer((q, s) => {
    calls++;
    s.writeHead(503, { "content-type": "application/json" });
    s.end("{}");
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    const app = new CallerOperations(
      {},
      randomUUID(),
      "http://127.0.0.1:" + server.address().port,
    );
    await assert.rejects(
      app.rpc("intents", {}, "Bearer transient"),
      (e) => e.status === 503,
    );
    assert.equal(calls, 1);
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
});

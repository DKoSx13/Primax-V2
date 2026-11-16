const { test } = require("node:test"),
  assert = require("node:assert/strict");
const { createConsumerServer } = require("../dist/operational/consumer/server");
const { randomUUID } = require("node:crypto");
async function withServer(enable, run) {
  const actor = { userId: randomUUID() },
    calls = [];
  const server = createConsumerServer(
    { authenticate: async () => actor },
    {
      prepareV2: async (a, r) => {
        assert.equal(a, actor);
        calls.push(r);
        return { intentId: randomUUID() };
      },
      prepare: async () => ({ intentId: "legacy" }),
      execute: async () => ({ issued: true }),
    },
    enable,
  );
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const send = async (route, body) => {
    const r = await fetch("http://127.0.0.1:" + server.address().port + route, {
      method: "POST",
      body: JSON.stringify(body),
    });
    return { status: r.status, body: await r.json() };
  };
  try {
    await run(send, calls);
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
}
const request = () => ({
  callerOperationId: randomUUID(),
  action: "TERMINAL_CREDENTIAL_ISSUE",
  stationId: randomUUID(),
  terminalId: randomUUID(),
  expiresAt: new Date(Date.now() + 60000).toISOString(),
});
test("V2 private HTTP is disabled by default and never replaces V1", () =>
  withServer(false, async (send, calls) => {
    assert.equal((await send("/consumer/v2/intents", request())).status, 404);
    assert.equal(
      (await send("/consumer/v1/intents", { terminalId: randomUUID() })).status,
      200,
    );
    assert.equal(calls.length, 0);
  }));
test("V2 accepts closed preparation fields and passes verified actor rather than accepting user data", () =>
  withServer(true, async (send, calls) => {
    const body = request();
    assert.equal((await send("/consumer/v2/intents", body)).status, 200);
    assert.deepEqual(calls, [body]);
    for (const extra of [
      "actor",
      "userId",
      "commandId",
      "intentId",
      "permissions",
    ])
      assert.equal(
        (await send("/consumer/v2/intents", { ...body, [extra]: "forged" }))
          .status,
        400,
      );
    assert.equal(calls.length, 1);
  }));
test("V2 execute uses existing recovery operation and rejects substituted command fields", () =>
  withServer(true, async (send) => {
    assert.equal(
      (await send("/consumer/v2/intents/execute", { intentId: randomUUID() }))
        .status,
      200,
    );
    assert.equal(
      (
        await send("/consumer/v2/intents/execute", {
          intentId: randomUUID(),
          commandId: randomUUID(),
        })
      ).status,
      400,
    );
  }));

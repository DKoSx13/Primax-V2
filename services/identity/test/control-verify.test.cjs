const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  { randomUUID } = require("node:crypto");
const { createConsumerServer } = require("../dist/operational/consumer/server");
async function fixture(enabled, run) {
  const actor = { userId: randomUUID(), authVersion: 1 };
  let checked = 0;
  const s = createConsumerServer(
    { authenticate: async () => actor },
    {
      verifyControl: async (a, t) => {
        assert.equal(a, actor);
        checked++;
      },
    },
    true,
    enabled,
  );
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const call = async (body) => {
    const r = await fetch(
      "http://127.0.0.1:" + s.address().port + "/consumer/v2/control/verify",
      { method: "POST", body: JSON.stringify(body) },
    );
    return { status: r.status, body: await r.json() };
  };
  try {
    await run(call, actor, () => checked);
  } finally {
    s.closeAllConnections();
    await new Promise((r) => s.close(r));
  }
}
test("remote Control query is disabled unless explicitly opted in", () =>
  fixture(false, async (call) => assert.equal((await call({})).status, 404)));
test("identity-only and bound target decisions are read-only and never accept client actor", () =>
  fixture(true, async (call, actor, count) => {
    assert.deepEqual((await call({})).body, {
      version: 1,
      actor,
      target: null,
    });
    const target = {
      action: "TERMINAL_CREDENTIAL_ISSUE",
      stationId: randomUUID(),
      terminalId: randomUUID(),
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    };
    assert.deepEqual((await call(target)).body, { version: 1, actor, target });
    assert.equal(count(), 1);
    assert.equal((await call({ ...target, userId: randomUUID() })).status, 400);
    assert.equal(count(), 1);
  }));

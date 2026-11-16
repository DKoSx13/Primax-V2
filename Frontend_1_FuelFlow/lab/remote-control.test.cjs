const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  { createServer } = require("node:http"),
  { randomUUID } = require("node:crypto");
const { RemoteControl } = require("./remote-control.cjs");
const actor = { userId: randomUUID(), authVersion: 1 };
const target = {
  action: "TERMINAL_CREDENTIAL_ISSUE",
  stationId: randomUUID(),
  terminalId: randomUUID(),
  expiresAt: new Date(Date.now() + 60000).toISOString(),
};
async function server(responder, run) {
  let calls = 0;
  const s = createServer(async (q, r) => {
    let raw = "";
    for await (const chunk of q) raw += chunk;
    calls++;
    responder(JSON.parse(raw), q, r);
  });
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  try {
    await run(
      new RemoteControl("http://127.0.0.1:" + s.address().port),
      () => calls,
    );
  } finally {
    s.closeAllConnections();
    await new Promise((r) => s.close(r));
  }
}
const req = { headers: { authorization: "Bearer transient-human" } };
const reply = (r, body, status = 200) => {
  r.writeHead(status, { "content-type": "application/json" });
  r.end(JSON.stringify(body));
};
test("remote principal is verified per request without local JWT or permission cache", () =>
  server(
    (body, q, r) =>
      reply(r, {
        version: 1,
        actor,
        target: Object.keys(body).length ? body : null,
      }),
    async (port, count) => {
      assert.deepEqual(await port.authenticate(req), actor);
      await port.authorize(actor, target, req.headers.authorization);
      await port.authenticate(req);
      assert.equal(count(), 3);
    },
  ));
test("missing bearer fails before network; remote denials and unknown endpoint fail closed", async () => {
  await assert.rejects(
    new RemoteControl("http://127.0.0.1:1").authenticate({ headers: {} }),
    (e) => e.status === 401,
  );
  for (const status of [401, 403, 503, 404])
    await server(
      (b, q, r) => reply(r, { code: "NOT_FOUND" }, status),
      async (port, count) => {
        await assert.rejects(
          port.authenticate(req),
          (e) => e.status === (status === 404 ? 503 : status),
        );
        assert.equal(count(), 1);
      },
    );
});
test("wrong station/terminal/action/expiry and actor generation responses cannot authorize target", async () => {
  for (const field of Object.keys(target))
    await server(
      (body, q, r) =>
        reply(r, {
          version: 1,
          actor,
          target: { ...target, [field]: "altered" },
        }),
      async (port) => {
        await assert.rejects(
          port.authorize(actor, target, req.headers.authorization),
          (e) => e.status === 503,
        );
      },
    );
  await server(
    (b, q, r) =>
      reply(r, { version: 1, actor: { ...actor, authVersion: 2 }, target }),
    async (port) => {
      await assert.rejects(
        port.authorize(actor, target, req.headers.authorization),
        (e) => e.status === 403,
      );
    },
  );
});
test("malformed or excessive response authority is rejected rather than trusted", async () => {
  for (const body of [
    {
      version: 1,
      actor: { ...actor, permissions: ["SYSTEM_ADMIN"] },
      target: null,
    },
    { version: 1, actor: { ...actor, authVersion: -1 }, target: null },
    { version: 2, actor, target: null },
    { version: 1, actor, target: null, allow: true },
  ])
    await server(
      (b, q, r) => reply(r, body),
      async (port) => {
        await assert.rejects(port.authenticate(req), (e) => e.status === 503);
      },
    );
});
test("remote down sends no fallback or retry", () =>
  server(
    (b, q, r) => r.destroy(),
    async (port, count) => {
      await assert.rejects(port.authenticate(req), (e) => e.status === 503);
      assert.equal(count(), 1);
    },
  ));

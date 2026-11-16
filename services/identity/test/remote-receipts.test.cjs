const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID, randomBytes } = require("node:crypto");
const {
  createOperationalServer,
} = require("../dist/operational/remote/http-server");
const {
  RemoteOperationalSessions,
} = require("../dist/operational/remote/http-client");
const {
  parseCommand,
  fingerprint,
  fromReply,
} = require("../dist/operational/remote/contract");
const key = randomBytes(32).toString("hex"),
  stationId = randomUUID();
function request() {
  return {
    version: 1,
    commandId: randomUUID(),
    command: { contractVersion: 1, stationId, terminalId: randomUUID() },
  };
}
function reply(r) {
  return {
    version: 1,
    commandId: r.commandId,
    state: "COMMITTED",
    result: {
      terminalId: r.command.terminalId,
      terminalToken: "a".repeat(64),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    },
  };
}
async function fixture(t, service) {
  const server = createOperationalServer(service, {
    apiKey: key,
    callerId: "identity-lab",
    stationId,
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => {
    server.closeAllConnections();
    return new Promise((r) => server.close(r));
  });
  return "http://127.0.0.1:" + server.address().port;
}
test("remote command validates version, UUID, unknown fields and canonical fingerprint without retaining previous secret", () => {
  const r = request();
  const normalized = parseCommand({
    ...r,
    command: { ...r.command, terminalId: r.command.terminalId.toUpperCase() },
  });
  assert.equal(fingerprint(normalized.command), fingerprint(r.command));
  assert.throws(() => parseCommand({ ...r, version: 2 }));
  assert.throws(() => parseCommand({ ...r, commandId: "bad" }));
  assert.throws(() => parseCommand({ ...r, sql: "SELECT 1" }));
  assert.throws(() =>
    parseCommand({ ...r, command: { ...r.command, actor: "admin" } }),
  );
  assert.notEqual(
    fingerprint(r.command),
    fingerprint({ ...r.command, previousCredential: "b".repeat(64) }),
  );
  assert.equal(
    parseCommand({ ...r, command: { ...r.command, terminalId: null } }).command
      .terminalId,
    undefined,
  );
});
test("private HTTP authenticates before parsing and enforces station before executing", async (t) => {
  let calls = 0;
  const origin = await fixture(t, {
    execute: async (c, r) => {
      calls++;
      return reply(r);
    },
    query: async (c, r) => reply(r),
  });
  const post = (body, apiKey = key) =>
    fetch(origin + "/operational/v1/commands", {
      method: "POST",
      headers: { "x-operational-key": apiKey },
      body: JSON.stringify(body),
    });
  assert.equal((await post("bad", "wrong")).status, 401);
  assert.equal(
    (
      await post({
        ...request(),
        command: { contractVersion: 1, stationId: randomUUID() },
      })
    ).status,
    403,
  );
  assert.equal(calls, 0);
  assert.equal((await post(request())).status, 200);
  assert.equal(calls, 1);
});
test("remote adapter preserves result contract and never follows redirects or retries a POST", async (t) => {
  let execute = 0,
    queries = 0;
  const origin = await fixture(t, {
    execute: async (c, r) => {
      execute++;
      return reply(r);
    },
    query: async (c, r) => {
      queries++;
      return reply(r);
    },
  });
  const r = request(),
    client = new RemoteOperationalSessions(origin, key);
  const result = await client.execute(r);
  assert.ok(result.expiresAt instanceof Date);
  assert.equal(result.terminalId, r.command.terminalId);
  assert.equal(execute, 1);
  assert.equal(queries, 0);
  assert.throws(() => new RemoteOperationalSessions("http://example.com", key));
  assert.throws(() =>
    fromReply({ ...reply(r), commandId: randomUUID() }, r.commandId),
  );
});
test("unavailable provider yields 503 without an in-memory credential fallback", async (t) => {
  const server = require("node:http").createServer((q, s) => s.destroy());
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  let count = 0;
  server.on("request", () => count++);
  const client = new RemoteOperationalSessions(
    "http://127.0.0.1:" + server.address().port,
    key,
    1000,
  );
  await assert.rejects(client.execute(request()), (e) => e.getStatus() === 503);
  assert.equal(count, 2); // one POST + one query, no replay
});

test("redirect responses cannot forward the service credential or replay a command", async (t) => {
  let received = 0,
    followed = 0;
  const server = require("node:http").createServer((req, res) => {
    received++;
    if (req.url === "/sink") {
      followed++;
      res.end("{}");
      return;
    }
    res.writeHead(302, { location: "/sink" });
    res.end();
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const client = new RemoteOperationalSessions(
    "http://127.0.0.1:" + server.address().port,
    key,
  );
  await assert.rejects(client.execute(request()), (e) => e.getStatus() === 503);
  assert.equal(received, 2);
  assert.equal(followed, 0);
});

test("consumer lookup distinguishes authenticated receipt absence from uncertain failure", async (t) => {
  const { ContractFailure } = require("../dist/operational/remote/contract");
  let code = "RECEIPT_NOT_FOUND",
    status = 404,
    posts = 0;
  const origin = await fixture(t, {
    execute: async (c, r) => {
      posts++;
      return reply(r);
    },
    query: async () => {
      throw new ContractFailure(status, code);
    },
  });
  const client = new RemoteOperationalSessions(origin, key),
    r = request();
  assert.equal(await client.lookup(r), undefined);
  status = 503;
  code = "PROVIDER_UNAVAILABLE";
  await assert.rejects(client.lookup(r), (e) => e.getStatus() === 503);
  status = 404;
  code = "UNKNOWN_ROUTE";
  await assert.rejects(client.lookup(r), (e) => e.getStatus() === 503);
  assert.equal(posts, 0);
});

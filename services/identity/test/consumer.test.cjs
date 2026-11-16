const { test } = require("node:test"),
  assert = require("node:assert/strict");
const { ConsumerOperations } = require("../dist/operational/consumer/intent");
const actor = { userId: "verified-user" };
function fixture(lookup) {
  const calls = [];
  const command = { commandId: "persisted-command" };
  const journal = {
    create: async () => {
      calls.push("commit-intent");
      return { intentId: "handle" };
    },
    read: async (a, id) => {
      calls.push("read:" + id);
      assert.equal(a, actor);
      return command;
    },
  };
  const remote = {
    lookup: async (c) => {
      calls.push("query");
      assert.equal(c, command);
      return lookup();
    },
    execute: async (c) => {
      calls.push("post");
      assert.equal(c.commandId, "persisted-command");
      return "issued";
    },
  };
  return {
    calls,
    journal,
    remote,
    app: new ConsumerOperations(journal, remote),
  };
}
test("new intent commits without a remote call; identical preparations remain explicit new intents", async () => {
  const f = fixture(() => undefined);
  await f.app.prepare(actor, "terminal");
  assert.deepEqual(f.calls, ["commit-intent"]);
});
test("consumer resolves the durable receipt before posting, reusing persisted command ID", async () => {
  const f = fixture(() => undefined);
  assert.equal(await f.app.execute(actor, "handle"), "issued");
  assert.deepEqual(f.calls, ["read:handle", "query", "post"]);
});
test("confirmed receipt is returned without another POST or local credential cache", async () => {
  const f = fixture(() => "confirmed");
  assert.equal(await f.app.execute(actor, "handle"), "confirmed");
  assert.deepEqual(f.calls, ["read:handle", "query"]);
});
test("uncertain lookup must fail closed; it cannot authorize an issuance", async () => {
  const f = fixture(() => {
    throw Error("uncertain");
  });
  await assert.rejects(f.app.execute(actor, "handle"));
  assert.deepEqual(f.calls, ["read:handle", "query"]);
});
test("journal/actor rejection prevents every remote call", async () => {
  const f = fixture(() => undefined);
  f.journal.read = async () => {
    throw Error("wrong owner");
  };
  await assert.rejects(f.app.execute(actor, "other"));
  assert.deepEqual(f.calls, []);
});

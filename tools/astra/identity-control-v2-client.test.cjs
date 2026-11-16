const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  { randomUUID } = require("node:crypto");
const c = require("./identity-control-v2-client.cjs");
function fixture(run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "v2-caller-unit-")),
    file = path.join(dir, "state");
  const actor = { kind: "human", subjectId: randomUUID(), generation: 1 },
    target = { stationId: randomUUID(), terminalId: randomUUID() };
  return Promise.resolve()
    .then(() => run({ file, actor, target }))
    .finally(() => {
      for (const f of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir, f));
      fs.rmdirSync(dir);
    });
}
test("durable caller reference exists before any HTTP, is exclusive and contains no bearer", () =>
  fixture(async ({ file, actor, target }) => {
    const id = c.create(
      file,
      actor,
      target,
      new Date(Date.now() + 60000).toISOString(),
    );
    assert.throws(() =>
      c.create(file, actor, target, new Date(Date.now() + 60000).toISOString()),
    );
    let calls = 0;
    const caller = c.open({
      enabled: true,
      origin: "http://127.0.0.1:1234",
      file,
      verifiedActor: actor,
      getSession: async () => ({
        verifiedActor: actor,
        bearer: "transient-secret",
      }),
      transport: async (url, options) => {
        calls++;
        const onDisk = JSON.parse(fs.readFileSync(file));
        assert.equal(onDisk.request.callerOperationId, id);
        assert.equal(JSON.parse(options.body).callerOperationId, id);
        assert.ok(!fs.readFileSync(file, "utf8").includes("transient-secret"));
        return { ok: true, json: async () => ({ intentId: randomUUID() }) };
      },
    });
    await caller.prepare();
    await caller.prepare();
    assert.equal(calls, 2);
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  }));
test("caller requires private opt-in, same verified human generation and unchanged reference", () =>
  fixture(async ({ file, actor, target }) => {
    c.create(file, actor, target, new Date(Date.now() + 60000).toISOString());
    const args = {
      enabled: true,
      origin: "http://127.0.0.1:1234",
      file,
      verifiedActor: actor,
      getSession: async () => ({ verifiedActor: actor, bearer: "" }),
    };
    assert.throws(() => c.open({ ...args, enabled: false }));
    assert.throws(() => c.open({ ...args, origin: "https://example.invalid" }));
    assert.throws(() =>
      c.create(
        file,
        { kind: "terminal" },
        target,
        new Date(Date.now() + 60000).toISOString(),
      ),
    );
    await assert.rejects(
      c.open({ ...args, verifiedActor: { ...actor, generation: 2 } }).prepare(),
      /ACTOR_BINDING_MISMATCH/,
    );
    await assert.rejects(
      c
        .open({
          ...args,
          getSession: async () => ({
            verifiedActor: { ...actor, subjectId: randomUUID() },
            bearer: "different-session",
          }),
        })
        .prepare(),
      /ACTOR_BINDING_MISMATCH/,
    );
    const state = JSON.parse(fs.readFileSync(file));
    state.request.terminalId = randomUUID();
    fs.writeFileSync(file, JSON.stringify(state));
    await assert.rejects(c.open(args).prepare(), /CALLER_STATE_CHANGED/);
  }));
test("failed HTTP sends one request only and preserves original nonce", () =>
  fixture(async ({ file, actor, target }) => {
    const nonce = c.create(
      file,
      actor,
      target,
      new Date(Date.now() + 60000).toISOString(),
    );
    let calls = 0;
    const caller = c.open({
      enabled: true,
      origin: "http://127.0.0.1:1234",
      file,
      verifiedActor: actor,
      getSession: async () => ({ verifiedActor: actor, bearer: "" }),
      transport: async () => {
        calls++;
        throw Error("lost");
      },
    });
    await assert.rejects(caller.execute());
    assert.equal(calls, 1);
    assert.equal(
      JSON.parse(fs.readFileSync(file)).request.callerOperationId,
      nonce,
    );
  }));

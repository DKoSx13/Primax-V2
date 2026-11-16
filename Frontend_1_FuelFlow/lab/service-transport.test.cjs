const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { serviceTransport } = require("./service-transport.cjs");
test("secure transport refuses HTTP, foreign hosts, URL credentials and redirects by configuration", () => {
  for (const origin of [
    "http://127.0.0.1:1",
    "https://example.invalid",
    "https://user:key@127.0.0.1:1",
    "https://127.0.0.1:1/path",
    "https://127.0.0.1:1?x=y",
  ])
    assert.throws(
      () => serviceTransport(origin, "absent-ca", "absent-key"),
      /Private HTTPS required/,
    );
});
test("secure transport requires CA and never falls back if trust material is missing", () =>
  assert.throws(
    () =>
      serviceTransport(
        "https://127.0.0.1:1",
        "/absent-private-lab-ca",
        "absent-key",
      ),
    (e) => e.code === "ENOENT",
  ));
test("foreign destination and malformed technical credentials fail before network", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "service-client-unit-"));
  try {
    const ca = path.join(dir, "ca"),
      key = path.join(dir, "key");
    fs.writeFileSync(ca, "not-used-for-network");
    fs.writeFileSync(
      key,
      JSON.stringify({ serviceId: "invented", keyId: "invalid", key: "wrong" }),
      { mode: 0o600 },
    );
    const post = serviceTransport("https://127.0.0.1:1", ca, key);
    await assert.rejects(
      post("https://127.0.0.1:2", { headers: {} }),
      /Transport origin mismatch/,
    );
    await assert.rejects(
      post("https://127.0.0.1:1", { headers: {} }),
      /Invalid synthetic service credential/,
    );
  } finally {
    for (const f of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir, f));
    fs.rmdirSync(dir);
  }
});

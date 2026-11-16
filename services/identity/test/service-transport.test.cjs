const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  { createHash, randomUUID } = require("node:crypto");
const {
  ServiceTransport,
} = require("../dist/operational/consumer/service-transport");
function fixture() {
  const key = "ab".repeat(32),
    station = randomUUID(),
    keyId = randomUUID(),
    seen = new Set();
  let inserts = 0;
  const credential = {
    keyId,
    serviceId: "fuelflow-private",
    stationId: station,
    secretDigest: createHash("sha256").update(key).digest("hex"),
    routes: ["/consumer/v2/control/verify"],
    notBefore: new Date(Date.now() - 10000),
    expiresAt: new Date(Date.now() + 60000),
    revokedAt: null,
  };
  const tx = {
    $queryRaw: async () => [credential],
    $executeRaw: async (strings, ...params) => {
      inserts++;
      const nonce = params[1];
      if (seen.has(nonce)) return 0;
      seen.add(nonce);
      return 1;
    },
  };
  const port = new ServiceTransport({ atomic: async (fn) => fn(tx) }, station);
  const req = () => ({
    socket: { encrypted: true },
    url: "/consumer/v2/control/verify",
    headers: {
      "x-identity-service": "fuelflow-private",
      "x-identity-key-id": keyId,
      "x-identity-service-key": key,
      "x-identity-request-nonce": randomUUID(),
      "x-identity-issued-at": String(Date.now()),
      "x-identity-expires-at": String(Date.now() + 30000),
    },
  });
  return { port, req, credential, station, inserts: () => inserts };
}
test("technical identity is separate and nonce cannot be reused", async () => {
  const f = fixture(),
    r = f.req();
  assert.deepEqual(await f.port.authenticate(r), {
    serviceId: "fuelflow-private",
    stationId: f.station,
  });
  await assert.rejects(
    f.port.authenticate(r),
    (e) => e.code === "SERVICE_REPLAY",
  );
});
test("invalid/expired/revoked service credentials fail before consuming nonce", async () => {
  for (const change of ["secret", "expired", "revoked", "future"]) {
    const f = fixture(),
      r = f.req();
    if (change === "secret")
      r.headers["x-identity-service-key"] = "cd".repeat(32);
    if (change === "expired") f.credential.expiresAt = new Date(0);
    if (change === "revoked") f.credential.revokedAt = new Date();
    if (change === "future")
      f.credential.notBefore = new Date(Date.now() + 100000);
    await assert.rejects(f.port.authenticate(r), (e) => e.status === 401);
    assert.equal(f.inserts(), 0);
  }
});
test("TLS and service route/station are mandatory independently of human authority", async () => {
  for (const change of ["tls", "route", "station"]) {
    const f = fixture(),
      r = f.req();
    if (change === "tls") r.socket.encrypted = false;
    if (change === "route") f.credential.routes = [];
    if (change === "station") f.credential.stationId = randomUUID();
    await assert.rejects(f.port.authenticate(r));
    assert.equal(f.inserts(), 0);
  }
});
test("expired/future/extended request windows fail closed", async () => {
  for (const change of ["expired", "future", "extended"]) {
    const f = fixture(),
      r = f.req();
    if (change === "expired") {
      r.headers["x-identity-issued-at"] = String(Date.now() - 60000);
      r.headers["x-identity-expires-at"] = String(Date.now() - 30000);
    }
    if (change === "future") {
      r.headers["x-identity-issued-at"] = String(Date.now() + 10000);
      r.headers["x-identity-expires-at"] = String(Date.now() + 30000);
    }
    if (change === "extended")
      r.headers["x-identity-expires-at"] = String(Date.now() + 31000);
    await assert.rejects(f.port.authenticate(r), (e) => e.status === 401);
    assert.equal(f.inserts(), 0);
  }
});

test("service station scope resolves the persisted intent before any receipt lookup or issuance", async () => {
  const { ConsumerOperations } = require("../dist/operational/consumer/intent");
  let calls = 0;
  const app = new ConsumerOperations(
    {
      read: async () => ({
        commandId: randomUUID(),
        command: { stationId: "station-a" },
      }),
    },
    {
      lookup: async () => {
        calls++;
      },
      execute: async () => {
        calls++;
      },
    },
  );
  await assert.rejects(
    app.execute({}, randomUUID(), "station-b"),
    (e) => e.status === 403,
  );
  assert.equal(calls, 0);
});

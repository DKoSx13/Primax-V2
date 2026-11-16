const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const { ConfigService } = require("@nestjs/config");
const {
  OperationalSessionCoordinator,
} = require("../dist/operational/coordinator");

test("operational adapter records the exact frozen SQL unit provenance", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../src/compatibility/kiosk/kiosk.service.ts"),
    "utf8",
  );
  const method = source.slice(
    source.indexOf("  async bootstrapTerminal("),
    source.indexOf("  private async recoveryEvidence("),
  );
  const unit = method.slice(
    method.indexOf("    const terminals ="),
    method.indexOf("    const session = await this.create(true);"),
  );
  assert.equal(
    require("../dist/operational/prisma-sessions").LEGACY_BOOTSTRAP_UNIT_SHA256,
    crypto.createHash("sha256").update(unit).digest("hex"),
  );
  const materialized = fs.readFileSync(
    path.join(__dirname, "../src/operational/prisma-sessions.ts"),
    "utf8",
  );
  assert.ok(
    materialized.includes(
      unit.replace(
        "const previous = req.header('x-terminal-session') || '';",
        "const previous = command.previousCredential || '';",
      ),
    ),
    "Entire frozen SQL unit must remain materialized, not only its hash",
  );
});

function fixture({ failure, redisFailure } = {}) {
  const calls = [];
  const kiosk = {
    verifyGateway: () => calls.push("signature"),
    limitTechnical: async () => calls.push("limit"),
  };
  const operations = {
    issueOrResume: async (input) => {
      calls.push("transaction");
      assert.equal(input.stationId, "trusted-station");
      assert.equal(input.contractVersion, 1);
      assert.equal(input.previousCredential, "previous");
      if (failure) throw Error("synthetic SQL rollback");
      return {
        terminalId: "terminal",
        terminalToken: "opaque",
        expiresAt: new Date(1000),
      };
    },
  };
  const sessions = {
    issue: async () => {
      calls.push("session");
      if (redisFailure) throw Error("synthetic Redis error");
      return {
        token: "session",
        csrfToken: "csrf",
        authenticated: true,
        expiresAt: 2000,
        stationId: "trusted-station",
        ttl: 1800,
      };
    },
  };
  const coordinator = new OperationalSessionCoordinator(
    kiosk,
    new ConfigService({ KIOSK_STATION_ID: "trusted-station" }),
    operations,
    sessions,
  );
  const req = {
    header: (name) => (name === "x-terminal-session" ? "previous" : undefined),
  };
  return { calls, coordinator, req, kiosk };
}
test("coordinator verifies signature and rate before SQL, then creates Redis session after commit", async () => {
  const f = fixture();
  const result = await f.coordinator.bootstrap(f.req, "terminal");
  assert.deepEqual(f.calls, ["signature", "limit", "transaction", "session"]);
  assert.equal(result.terminalToken, "opaque");
  assert.equal(result.token, "session");
});
test("SQL error never creates a Redis session or retries the command", async () => {
  const f = fixture({ failure: true });
  await assert.rejects(f.coordinator.bootstrap(f.req));
  assert.deepEqual(f.calls, ["signature", "limit", "transaction"]);
});
test("post-commit session failure is reported without replay or a fictitious SQL rollback", async () => {
  const f = fixture({ redisFailure: true });
  await assert.rejects(f.coordinator.bootstrap(f.req));
  assert.deepEqual(f.calls, ["signature", "limit", "transaction", "session"]);
});
test("invalid gateway signature never reaches the operational provider", async () => {
  const f = fixture();
  f.kiosk.verifyGateway = () => {
    throw Error("invalid signature");
  };
  await assert.rejects(f.coordinator.bootstrap(f.req));
  assert.deepEqual(f.calls, []);
});

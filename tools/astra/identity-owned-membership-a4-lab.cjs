// Fresh-resource A.4 runner. No URLs/volumes from the environment or existing containers.
const { execFileSync } = require("node:child_process");
const { randomBytes, createHash } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "../..");
const runId = "a4-" + randomBytes(12).toString("hex");
const pg = runId + "-pg", network = runId + "-net";
const adminPassword = randomBytes(32).toString("hex");
const writerPassword = randomBytes(32).toString("hex");
const toolsImage = "primax-v2-backend-test:latest";
const pgImage = "postgres:17.6-bookworm";
const docker = (args, options = {}) => execFileSync("docker", args, {
  cwd: root, encoding: "utf8", timeout: 60000, stdio: ["pipe", "pipe", "pipe"], ...options,
});
const originalFiles = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
const hash = (p) => createHash("sha256").update(fs.readFileSync(path.join(root, p))).digest("hex");
const baseline = Object.fromEntries(originalFiles.map((p) => [p, hash(p)]));
const evidenceArg = process.argv.find((a) => a.startsWith("--evidence="));
assert.ok(process.argv.slice(2).every((a) => a === evidenceArg), "Only --evidence is accepted; external URLs/resources are forbidden");
const evidenceName = evidenceArg?.slice(11) || `identity-a4-phase2-${runId}.json`;
assert.match(evidenceName, /^identity-a4-phase2-[a-z0-9-]+\.json$/);
const evidencePath = path.join(root, "Docs/astra/evidence", evidenceName);
assert.ok(!fs.existsSync(evidencePath), "Evidence must be new");
let pgCreated = false, netCreated = false, stage = "preflight";
const result = { runId, baseCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(), checks: [], success: false };

function psql(database, sql) {
  return docker(["exec", "-i", pg, "psql", "-X", "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1", "--single-transaction"], { input: sql });
}
function schema(database, initialize) {
  const ddl = fs.readFileSync(path.join(root, "services/identity/lab/owned-membership-a4.sql"), "utf8");
  const setup = `\nREVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA identity_a4_private FROM PUBLIC;
GRANT USAGE ON SCHEMA identity_a4_private TO a4_writer;
GRANT SELECT ON ALL TABLES IN SCHEMA identity_a4_private TO a4_writer;
GRANT INSERT ON identity_a4_private."MembershipIdentity",identity_a4_private."MembershipCode",identity_a4_private."AllocationReceipt" TO a4_writer;
GRANT UPDATE(value) ON identity_a4_private."MembershipNumberCounter" TO a4_writer;
CREATE SCHEMA a4_sentinel;
CREATE TABLE a4_sentinel.secret(value text);
INSERT INTO a4_sentinel.secret VALUES ('synthetic-unchanged');
${initialize ? 'INSERT INTO identity_a4_private."MembershipNumberCounter" VALUES (1,0);' : ''}`;
  psql(database, ddl + setup);
}
function worker(database, mode, payload) {
  const url = (username, password) => `postgresql://${username}:${password}@${pg}:5432/${database}?schema=identity_a4_private&connection_limit=12&pool_timeout=30`;
  const env = { ...process.env, A4_RUN_ID: runId, A4_SYNTHETIC: "true", A4_DATABASE_URL: url("a4_writer", writerPassword), A4_ADMIN_URL: url("postgres", adminPassword) };
  const args = ["run", "-i", "--rm", "--pull", "never", "--name", runId + "-" + mode, "--label", "primax.a4.run=" + runId,
    "--network", network, "--read-only", "--tmpfs", "/tmp:rw,nosuid,size=128m", "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges", "--mount", `type=bind,source=${root},target=/workspace,readonly`,
    "--env", "A4_RUN_ID", "--env", "A4_SYNTHETIC", "--env", "A4_DATABASE_URL", "--env", "A4_ADMIN_URL",
    "--entrypoint", "node", toolsImage, "/workspace/tools/astra/identity-owned-membership-a4-worker.cjs", mode];
  const output = docker(args, { env, input: JSON.stringify(payload || {}), timeout: 120000 });
  return JSON.parse(output.trim());
}
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  try {
    assert.equal(docker(["info", "--format", "{{.OSType}}"] ).trim(), "linux");
    result.images = { tools: docker(["image", "inspect", toolsImage, "--format", "{{.Id}}"] ).trim(), postgres: docker(["image", "inspect", pgImage, "--format", "{{.Id}}"] ).trim() };
    // Cached images only: no installation, pull or update of dependencies.
    stage = "fresh resources";
    docker(["network", "create", "--internal", "--label", "primax.a4.run=" + runId, network]); netCreated = true;
    docker(["run", "-d", "--pull", "never", "--name", pg, "--label", "primax.a4.run=" + runId, "--network", network,
      "--tmpfs", "/var/lib/postgresql/data:rw,nosuid,size=256m", "--env", "POSTGRES_PASSWORD", "--env", "POSTGRES_DB=a4_primary", pgImage],
      { env: { ...process.env, POSTGRES_PASSWORD: adminPassword } }); pgCreated = true;
    const inspect = JSON.parse(docker(["inspect", pg]))[0];
    assert.equal(inspect.Config.Labels["primax.a4.run"], runId);
    assert.ok(inspect.Mounts.every((m) => m.Type === "tmpfs"), "No existing or persistent volumes allowed");
    assert.equal(Object.keys(inspect.HostConfig.PortBindings || {}).length, 0);
    let ready = false;
    for (let i = 0; i < 50; i++) {
      try {
        docker(["exec", pg, "pg_isready", "-U", "postgres", "-d", "a4_primary"]);
        docker(["exec", pg, "psql", "-X", "-U", "postgres", "-d", "a4_primary", "-v", "ON_ERROR_STOP=1", "-c", "SELECT 1"]);
        ready = true; break;
      } catch { await pause(300); }
    }
    assert.ok(ready, "Fresh PostgreSQL did not become ready");
    psql("a4_primary", `CREATE ROLE a4_writer LOGIN PASSWORD '${writerPassword}';`);
    schema("a4_primary", true);
    stage = "primary PostgreSQL tests";
    const primary = worker("a4_primary", "primary");
    result.checks.push(...primary.checks);
    result.typeScript = primary.typeScript; result.node = primary.node;
    stage = "fresh restore database";
    // CREATE DATABASE cannot run in a transaction; target is this run's own new PG.
    docker(["exec", pg, "psql", "-X", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", "CREATE DATABASE a4_restored;"]);
    schema("a4_restored", false);
    const restored = worker("a4_restored", "restore", primary);
    result.checks.push(...restored.checks);
    assert.equal(restored.checksum, primary.checksum);
    result.snapshotChecksum = primary.checksum;
    result.success = true;
  } catch (error) {
    const stderr = String(error.stderr || "").replaceAll(adminPassword, "[redacted]").replaceAll(writerPassword, "[redacted]");
    result.failure = { stage, code: error.code || error.status || "ERROR", detail: stderr.slice(-4000) || "See stage; no credentials or command arguments logged" };
    process.exitCode = 1;
  } finally {
    try {
      for (const [p, digest] of Object.entries(baseline)) assert.equal(hash(p), digest, "Preexisting file changed: " + p);
      result.preservedFiles = originalFiles.length;
    } catch (error) { result.success = false; result.preservationFailure = error.message; process.exitCode = 1; }
    // Stop only this run's labeled PG; preserve its stopped container, no volume deletion.
    try {
      if (pgCreated) {
        assert.equal(docker(["inspect", pg, "--format", '{{ index .Config.Labels "primax.a4.run" }}']).trim(), runId);
        docker(["stop", pg]); result.resourceState = "own PostgreSQL stopped; tmpfs is ephemeral; network retained";
      }
    } catch { result.success = false; result.cleanupFailure = "Could not stop own labeled PostgreSQL"; process.exitCode = 1; }
    result.internalNetworkCreated = netCreated;
    fs.writeFileSync(evidencePath, JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
    console.log(JSON.stringify({ success: result.success, checks: result.checks.length, evidence: path.relative(root, evidencePath), failure: result.failure }, null, 2));
  }
})();

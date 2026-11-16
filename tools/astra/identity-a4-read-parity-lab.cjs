// 3A: exclusively new synthetic PostgreSQL/network, cached tools, no public server.
const { execFileSync } = require("node:child_process");
const { randomBytes, createHash } = require("node:crypto");
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const root = path.resolve(__dirname, "../..");
assert.equal(process.argv.length, 2, "No external URL, volume or resource argument accepted");
const runId = "a4-" + randomBytes(12).toString("hex"), pg = runId + "-pg", network = runId + "-read-net";
const secrets = { admin: randomBytes(32).toString("hex"), writer: randomBytes(32).toString("hex"), reader: randomBytes(32).toString("hex") };
const toolImage = "primax-v2-backend-test:latest", pgImage = "postgres:17.6-bookworm";
const evidence = path.join(root, "Docs/astra/evidence", "identity-a4-phase3a-" + runId + ".json");
assert.equal(fs.existsSync(evidence), false);
const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
const digest = (p) => createHash("sha256").update(fs.readFileSync(path.join(root, p))).digest("hex");
const baseline = Object.fromEntries(files.map((p) => [p, digest(p)]));
const docker = (args, options = {}) => execFileSync("docker", args, { cwd: root, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], timeout: 60000, ...options });
const result = { runId, success: false, checks: [], baseCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim() };
let pgCreated = false, stage = "preflight";
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  try {
    assert.equal(docker(["info", "--format", "{{.OSType}}"] ).trim(), "linux");
    result.images = { tools: docker(["image", "inspect", toolImage, "--format", "{{.Id}}"] ).trim(), postgres: docker(["image", "inspect", pgImage, "--format", "{{.Id}}"] ).trim() };
    stage = "fresh resources";
    docker(["network", "create", "--internal", "--label", "primax.a4.read=" + runId, network]);
    docker(["run", "-d", "--pull", "never", "--name", pg, "--label", "primax.a4.read=" + runId, "--network", network,
      "--tmpfs", "/var/lib/postgresql/data:rw,nosuid,size=256m", "--env", "POSTGRES_PASSWORD", "--env", "POSTGRES_DB=a4_read", pgImage],
      { env: { ...process.env, POSTGRES_PASSWORD: secrets.admin } }); pgCreated = true;
    const info = JSON.parse(docker(["inspect", pg]))[0];
    assert.equal(info.Config.Labels["primax.a4.read"], runId);
    assert.ok(info.Mounts.every((m) => m.Type === "tmpfs"));
    assert.equal(Object.keys(info.HostConfig.PortBindings || {}).length, 0);
    const networkInfo = JSON.parse(docker(["network", "inspect", network]))[0]; assert.equal(networkInfo.Internal, true);
    let ready = false;
    for (let i = 0; i < 60; i++) {
      try { docker(["exec", pg, "psql", "-X", "-U", "postgres", "-d", "a4_read", "-v", "ON_ERROR_STOP=1", "-c", "SELECT 1"]); ready = true; break; }
      catch { await pause(300); }
    }
    assert.ok(ready, "Own fresh database not ready");
    const ddl = fs.readFileSync(path.join(root, "services/identity/lab/owned-membership-a4.sql"), "utf8");
    const setup = `\nCREATE ROLE a4_writer LOGIN PASSWORD '${secrets.writer}';
CREATE ROLE a4_reader LOGIN PASSWORD '${secrets.reader}';
REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA identity_a4_private FROM PUBLIC;
GRANT USAGE ON SCHEMA identity_a4_private TO a4_writer,a4_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA identity_a4_private TO a4_writer;
GRANT INSERT ON identity_a4_private."MembershipIdentity",identity_a4_private."MembershipCode",identity_a4_private."AllocationReceipt" TO a4_writer;
GRANT UPDATE(value) ON identity_a4_private."MembershipNumberCounter" TO a4_writer;
GRANT SELECT ON identity_a4_private."MembershipIdentity",identity_a4_private."MembershipCode" TO a4_reader;
INSERT INTO identity_a4_private."MembershipNumberCounter" VALUES (1,0);
CREATE SCHEMA a4_sentinel;
CREATE TABLE a4_sentinel.secret(value text);
INSERT INTO a4_sentinel.secret VALUES ('synthetic-unchanged');`;
    docker(["exec", "-i", pg, "psql", "-X", "-U", "postgres", "-d", "a4_read", "-v", "ON_ERROR_STOP=1", "--single-transaction"], { input: ddl + setup });
    stage = "3A worker";
    const url = (user, password) => `postgresql://${user}:${password}@${pg}:5432/a4_read?schema=identity_a4_private&connection_limit=5`;
    const env = { ...process.env, A4_READ_RUN: runId, A4_READ_SYNTHETIC: "true", A4_READ_ADMIN: url("postgres", secrets.admin),
      A4_READ_WRITER: url("a4_writer", secrets.writer), A4_READ_READER: url("a4_reader", secrets.reader) };
    const output = docker(["run", "--rm", "--pull", "never", "--name", runId + "-read-worker", "--label", "primax.a4.read=" + runId,
      "--network", network, "--read-only", "--tmpfs", "/tmp:rw,nosuid,size=128m", "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
      "--mount", `type=bind,source=${root},target=/workspace,readonly`, "--env", "A4_READ_RUN", "--env", "A4_READ_SYNTHETIC",
      "--env", "A4_READ_ADMIN", "--env", "A4_READ_WRITER", "--env", "A4_READ_READER", "--entrypoint", "node", toolImage,
      "/workspace/tools/astra/identity-a4-read-worker.cjs"], { env, timeout: 120000 });
    Object.assign(result, JSON.parse(output.trim()));
    result.isolation = { newInternalNetwork: true, publishedPorts: 0, existingVolumes: 0, readonlySources: true, separateReadRole: true };
  } catch (error) {
    let detail = String(error.stderr || "");
    for (const value of Object.values(secrets)) detail = detail.replaceAll(value, "[redacted]");
    result.success = false; result.failure = { stage, code: error.code || error.status || "ERROR", detail: detail.slice(-4500) || "Failure without raw command logging" };
    process.exitCode = 1;
  } finally {
    try { for (const [p, hash] of Object.entries(baseline)) assert.equal(digest(p), hash, "Preexisting file changed: " + p); result.preservedFiles = files.length; }
    catch (error) { result.success = false; result.preservationFailure = error.message; process.exitCode = 1; }
    try {
      if (pgCreated) {
        assert.equal(docker(["inspect", pg, "--format", '{{ index .Config.Labels "primax.a4.read" }}']).trim(), runId);
        docker(["stop", pg]); result.resources = "Own PostgreSQL stopped; own network/stopped PG retained; tmpfs ephemeral";
      }
    } catch { result.success = false; result.cleanupFailure = "Could not stop own labeled PG"; process.exitCode = 1; }
    fs.writeFileSync(evidence, JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
    console.log(JSON.stringify({ success: result.success, groups: result.checks.length, evidence: path.relative(root, evidence), failure: result.failure }, null, 2));
  }
})();

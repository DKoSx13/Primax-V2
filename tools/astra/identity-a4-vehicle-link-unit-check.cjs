// 4A: only a cached tools container, network none, read-only checkout; never a database.
const fs = require("node:fs"), path = require("node:path"), cp = require("node:child_process");
const { randomBytes } = require("node:crypto"), assert = require("node:assert/strict");
assert.equal(process.argv.length, 2);
const root = path.resolve(__dirname, "../.."), tag = randomBytes(12).toString("hex");
const files = ["services/identity/test/membership-codes.test.cjs", "services/identity/lab/owned-membership-a4-store.test.cjs",
  "services/identity/lab/membership-a4-read.test.cjs", "services/identity/lab/membership-a4-compatible-read.test.cjs", "services/identity/lab/vehicle-link-contract.test.cjs"];
const run = cp.spawnSync("docker", ["run", "--rm", "--pull", "never", "--name", "a4-4a-unit-" + tag,
  "--network", "none", "--read-only", "--tmpfs", "/tmp:rw,nosuid,size=128m", "--cap-drop", "ALL",
  "--security-opt", "no-new-privileges", "--mount", `type=bind,source=${root},target=/workspace,readonly`,
  "--entrypoint", "node", "primax-v2-backend-test:latest", "--experimental-strip-types", "--require",
  "/workspace/tools/astra/identity-a4-private-ts-register.cjs", "--test", "--test-reporter=tap", ...files.map(p => "/workspace/" + p)],
{ cwd: root, encoding: "utf8", timeout: 60000, maxBuffer: 4 * 1024 * 1024 });
const number = key => Number((run.stdout || "").match(new RegExp("^# " + key + " (\\d+)", "m"))?.[1] ?? NaN);
const result = { success: run.status === 0, status: run.status, total: number("tests"), passed: number("pass"),
  failed: number("fail"), files, baseCommit: cp.execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  isolation: { network: "none", sourcesReadOnly: true, databaseUsed: false, dependencyInstall: false },
  detail: run.status ? String(run.stdout || run.stderr || run.error).slice(-6000) : undefined };
const evidence = path.join(root, "Docs/astra/evidence", "identity-a4-phase4a-unit-" + tag + ".json");
fs.writeFileSync(evidence, JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ ...result, evidence: path.relative(root, evidence) }, null, 2));
if (!result.success) process.exitCode = 1;

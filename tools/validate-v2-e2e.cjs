// Existing suites deliberately require different dedicated local database names.
const { spawnSync } = require("node:child_process");
const { resolve } = require("node:path");
const backend = resolve(__dirname, "../Backend");
const {
  assertLocalDatabase,
} = require("../Backend/scripts/database-safety.cjs");
assertLocalDatabase();
const original = new URL(process.env.DATABASE_URL);
if (
  original.hostname !== "127.0.0.1" ||
  original.port !== "26602" ||
  original.pathname !== "/primax_v2_test"
)
  throw Error(
    "Use the dedicated V2 local PostgreSQL fixture on loopback 26602",
  );
let failed = false;
for (const [name, database, args] of [
  [
    "V2 and general regression",
    "primax_v2_test",
    [
      "--testPathIgnorePatterns=(incidents|partial-refund|v11_2-demo|inventory-reconciliation).e2e-spec.ts",
    ],
  ],
  [
    "Historical financial regression",
    "primax_v11_1",
    [
      "--runTestsByPath",
      "test/incidents.e2e-spec.ts",
      "test/partial-refund.e2e-spec.ts",
      "test/v11_2-demo.e2e-spec.ts",
    ],
  ],
  [
    "Inventory reconciliation",
    "primax_v12_1b3_test",
    ["--runTestsByPath", "test/inventory-reconciliation.e2e-spec.ts"],
  ],
]) {
  const url = new URL(original);
  url.pathname = "/" + database;
  console.log("\nLocal E2E group: " + name);
  const result = spawnSync(
    process.execPath,
    [
      resolve(backend, "scripts/local-db-command.cjs"),
      "jest",
      "--runInBand",
      "--config",
      "test/jest-e2e.config.cjs",
      ...args,
    ],
    {
      cwd: backend,
      env: {
        ...process.env,
        DATABASE_URL: url.toString(),
        DATABASE_URL_UNPOOLED: url.toString(),
      },
      stdio: "inherit",
    },
  );
  if (result.status !== 0) failed = true;
}
process.exitCode = failed ? 1 : 0;

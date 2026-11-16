// Synthetic profiling only. No AuthCore edits, database, HTTP or credentials.
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");
const { performance, monitorEventLoopDelay } = require("node:perf_hooks");
const { createRequire } = require("node:module");
const root = path.resolve(__dirname, "../.."),
  load = createRequire(path.join(root, "Backend/package.json"));
const bcrypt = load("bcryptjs"),
  { AuthService } = load("./dist/src/auth/auth.service"),
  { UnauthorizedException } = load("@nestjs/common");
const read = (file) => {
  try {
    return fs.readFileSync(file, "utf8").trim();
  } catch {
    return null;
  }
};
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function measure(operation, blockMs) {
  const lag = monitorEventLoopDelay({ resolution: 10 });
  lag.enable();
  await pause(30);
  const cpu = process.cpuUsage(),
    start = performance.now();
  let blockedWallMs = 0,
    lookups = 0,
    rounds;
  const work =
    operation === "fixture-hash"
      ? bcrypt.hash("FixtureOnly123!", 12).then((v) => {
          rounds = bcrypt.getRounds(v);
        })
      : (async () => {
          const service = new AuthService(
            {
              findByEmail: async () => {
                lookups++;
                return null;
              },
            },
            {
              signAsync: async () => {
                throw Error("Unknown user must never receive a JWT");
              },
            },
          );
          await assert.rejects(
            service.login({
              email: "synthetic-missing@example.invalid",
              password: "FixtureOnly123!",
            }),
            (e) => e instanceof UnauthorizedException,
          );
          rounds = bcrypt.getRounds(await service.dummyHash);
        })();
  if (blockMs) {
    await new Promise((r) => setImmediate(r));
    const before = performance.now();
    // Controlled scheduler starvation WITHOUT burning a CPU or loading other services.
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, blockMs);
    blockedWallMs = performance.now() - before;
  }
  await work;
  const wallMs = performance.now() - start,
    cost = process.cpuUsage(cpu);
  await pause(30);
  lag.disable();
  assert.equal(rounds, 12);
  if (operation === "unknown-user-login") assert.equal(lookups, 1);
  if (blockMs) {
    assert.ok(blockedWallMs >= blockMs - 50);
    assert.ok(wallMs > 5000);
  }
  return {
    operation,
    controlledEventLoopBlockMs: blockMs,
    measuredBlockMs: Math.round(blockedWallMs),
    wallMs: Math.round(wallMs),
    cpuMs: Math.round((cost.user + cost.system) / 1000),
    eventLoopMaxMs: Math.round(lag.max / 1e6),
    exceedsOriginal5000ms: wallMs > 5000,
    bcryptRounds: rounds,
    syntheticUserLookups: lookups,
  };
}
(async () => {
  const result = {
    kind: "Mission5.9-timeout-diagnostic",
    historicalLimitMs: 5000,
    logicalCpus: os.cpus().length,
    availableParallelism: os.availableParallelism(),
    loadBefore: os.loadavg(),
    cpuMax: read("/sys/fs/cgroup/cpu.max"),
    cpuStatBefore: read("/sys/fs/cgroup/cpu.stat"),
    samples: [],
  };
  for (const block of [0, 5300])
    for (const operation of ["fixture-hash", "unknown-user-login"])
      result.samples.push(await measure(operation, block));
  result.cpuStatAfter = read("/sys/fs/cgroup/cpu.stat");
  result.loadAfter = os.loadavg();
  result.conclusion =
    "Same unchanged cost-12 fixture/login can cross original deadline when the event loop is delayed; controlled reproduction, not proof of historical scheduling cause. Historical five timeouts remain unexplained at scheduler/process level.";
  result.success = true;
  const file = path.join(
    root,
    "Docs/astra/evidence/identity-mission5-9-timeout-diagnostic.txt",
  );
  assert.ok(!fs.existsSync(file), "Never overwrite an existing evidence");
  fs.writeFileSync(file, JSON.stringify(result, null, 2) + "\n", {
    flag: "wx",
  });
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
})().catch((e) => {
  console.error("Timeout diagnostic failed:", e.name);
  process.exitCode = 1;
});

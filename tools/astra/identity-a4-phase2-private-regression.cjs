// Preserve the phase-2 runner verbatim. Only allocate its NEW internal network
// explicitly because Docker's automatic address pools may be exhausted.
const cp = require("node:child_process"), assert = require("node:assert/strict");
assert.equal(process.argv.length, 2);
const original = cp.execFileSync;
const docker = args => original("docker", args, { encoding: "utf8", timeout: 30000 });
const subnet = require("./identity-a4-private-network.cjs")(docker);
cp.execFileSync = function (file, args, options) {
  if (file === "docker" && args[0] === "network" && args[1] === "create") {
    assert.ok(args.includes("--internal"));
    assert.ok(args.some(value => /^primax\.a4\.run=a4-[a-f0-9]{24}$/.test(value)));
    args = [...args.slice(0, 2), "--subnet", subnet, ...args.slice(2)];
  }
  return original(file, args, options);
};
require("./identity-owned-membership-a4-lab.cjs");

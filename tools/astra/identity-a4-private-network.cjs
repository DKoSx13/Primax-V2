// Select a NEW small RFC1918 subnet, without deleting/reusing Docker networks.
// Fail closed if host routes or existing Docker IPAM cannot be inspected.
const cp = require("node:child_process"), assert = require("node:assert/strict");
module.exports = function privateSubnet(docker) {
  const ids = docker(["network", "ls", "-q"]).trim().split(/\r?\n/).filter(Boolean);
  const networks = ids.length ? JSON.parse(docker(["network", "inspect", ...ids])) : [];
  const used = networks.flatMap(n => (n.IPAM.Config || []).map(c => c.Subnet)).filter(Boolean);
  if (process.platform === "win32") {
    const routes = JSON.parse(cp.execFileSync("powershell.exe", ["-NoProfile", "-Command",
      "ConvertTo-Json -Compress -InputObject @(Get-NetRoute -AddressFamily IPv4 | Select-Object -ExpandProperty DestinationPrefix)"],
    { encoding: "utf8", timeout: 15000 }));
    assert.ok(Array.isArray(routes)); used.push(...routes);
  } else {
    const routes = JSON.parse(cp.execFileSync("ip", ["-j", "-4", "route", "show", "table", "all"], { encoding: "utf8", timeout: 15000 }));
    used.push(...routes.map(r => r.dst).filter(p => p && p !== "default"));
  }
  function range(cidr) {
    if (cidr.includes(":")) return null;
    const [ip, raw = "32"] = cidr.split("/"), bits = Number(raw), octets = ip.split(".").map(Number);
    assert.ok(octets.length === 4 && octets.every(x => Number.isInteger(x) && x >= 0 && x <= 255));
    assert.ok(Number.isInteger(bits) && bits >= 0 && bits <= 32);
    if (bits === 0) return null; // The default route does not reserve all addresses.
    const size = 2 ** (32 - bits), address = octets.reduce((n, x) => n * 256 + x, 0);
    return [Math.floor(address / size) * size, Math.floor(address / size) * size + size - 1];
  }
  const occupied = used.map(range).filter(Boolean);
  for (let third = 0; third < 256; third++) {
    const cidr = `10.203.${third}.0/28`, candidate = range(cidr);
    if (!occupied.some(other => candidate[0] <= other[1] && other[0] <= candidate[1])) return cidr;
  }
  throw Error("NO_UNUSED_PRIVATE_LAB_SUBNET");
};

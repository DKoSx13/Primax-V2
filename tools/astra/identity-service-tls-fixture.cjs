const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  { execFileSync } = require("node:child_process");
module.exports = function () {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "primax-service-tls-"));
  fs.chmodSync(dir, 0o700);
  const file = (name) => path.join(dir, name),
    run = (args) => execFileSync("openssl", args, { stdio: "pipe" });
  run([
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-days",
    "1",
    "-keyout",
    file("ca.key"),
    "-out",
    file("ca.crt"),
    "-subj",
    "/CN=Primax synthetic service CA",
  ]);
  run([
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-days",
    "1",
    "-keyout",
    file("wrong-ca.key"),
    "-out",
    file("wrong-ca.crt"),
    "-subj",
    "/CN=Untrusted synthetic CA",
  ]);
  run([
    "req",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    file("server.key"),
    "-out",
    file("server.csr"),
    "-subj",
    "/CN=identity.private.lab",
  ]);
  fs.writeFileSync(
    file("server.ext"),
    "subjectAltName=IP:127.0.0.1\nextendedKeyUsage=serverAuth\nbasicConstraints=CA:FALSE\n",
  );
  for (const [name, days] of [
    ["server.crt", "1"],
    ["expired.crt", "0"],
  ])
    run([
      "x509",
      "-req",
      "-in",
      file("server.csr"),
      "-CA",
      file("ca.crt"),
      "-CAkey",
      file("ca.key"),
      "-CAcreateserial",
      "-days",
      days,
      "-extfile",
      file("server.ext"),
      "-out",
      file(name),
    ]);
  for (const name of fs.readdirSync(dir)) fs.chmodSync(file(name), 0o600);
  return {
    dir,
    file,
    cleanup: () => {
      for (const name of fs.readdirSync(dir)) fs.unlinkSync(file(name));
      fs.rmdirSync(dir);
    },
  };
};

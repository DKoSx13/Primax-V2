// Optional private HTTPS transport. Built-in TLS validation; no fallback or retry.
const https = require("node:https"),
  fs = require("node:fs"),
  { randomUUID } = require("node:crypto");
function serviceTransport(origin, caFile, credentialFile) {
  const base = new URL(origin);
  if (
    base.protocol !== "https:" ||
    base.hostname !== "127.0.0.1" ||
    base.username ||
    base.password ||
    base.pathname !== "/" ||
    base.search ||
    base.hash
  )
    throw Error("Private HTTPS required");
  const agent = new https.Agent({
    ca: fs.readFileSync(caFile),
    rejectUnauthorized: true,
    minVersion: "TLSv1.2",
    keepAlive: true,
  });
  return async function post(url, options) {
    const target = new URL(url);
    if (target.origin !== base.origin || target.protocol !== "https:")
      throw Error("Transport origin mismatch");
    const credential = JSON.parse(fs.readFileSync(credentialFile, "utf8"));
    if (
      credential.serviceId !== "fuelflow-private" ||
      !/^[a-f0-9-]{36}$/i.test(credential.keyId) ||
      !/^[a-f0-9]{64}$/.test(credential.key)
    )
      throw Error("Invalid synthetic service credential");
    const now = Date.now(),
      headers = {
        ...options.headers,
        "x-identity-service": credential.serviceId,
        "x-identity-key-id": credential.keyId,
        "x-identity-service-key": credential.key,
        "x-identity-request-nonce": randomUUID(),
        "x-identity-issued-at": String(now),
        "x-identity-expires-at": String(now + 30000),
      };
    return new Promise((resolve, reject) => {
      const req = https.request(
        target,
        { method: "POST", agent, headers, signal: options.signal },
        (res) => {
          let data = "",
            bytes = 0;
          res.on("data", (chunk) => {
            bytes += chunk.length;
            if (bytes > 65536) {
              res.destroy(Error("Response too large"));
              return;
            }
            data += chunk;
          });
          res.on("error", reject);
          res.on("end", () =>
            resolve({
              status: res.statusCode,
              ok: res.statusCode >= 200 && res.statusCode < 300,
              json: async () => JSON.parse(data),
            }),
          );
        },
      );
      req.on("error", reject);
      req.end(options.body);
    });
  };
}
module.exports = { serviceTransport };

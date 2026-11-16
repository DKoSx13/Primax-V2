// V1 laboratory double for EXISTING RPC paths, never a Commerce/Administration service.
// Fixtures contain synthetic expected responses. No SQL, balance arithmetic or relay.
const http = require("node:http");
const crypto = require("node:crypto");
exports.createContractLab = async function createContractLab(key) {
  const memberships = new Map(),
    vehicles = new Map();
  const calls = [];
  let port;
  const server = http.createServer(async (req, res) => {
    const reply = (status, body) => {
      res.writeHead(status, {
        "content-type": "application/json",
        "cache-control": "no-store",
        "x-identity-contract-version": "1",
      });
      res.end(JSON.stringify(body));
    };
    const actual = Buffer.from(req.headers["x-identity-compat-key"] || "");
    const expected = Buffer.from(key);
    if (
      actual.length !== expected.length ||
      !crypto.timingSafeEqual(actual, expected)
    )
      return reply(401, { message: "Service credential required" });
    try {
      let raw = "";
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 8192) throw Error();
      }
      const body = JSON.parse(raw);
      const operation = req.url?.replace(/^\/identity-compat\//, "");
      if (req.method !== "POST")
        return reply(405, { message: "Method not allowed" });
      if (
        [
          "finance/me",
          "finance/transactions",
          "finance/rewards",
          "finance/redemptions",
        ].includes(operation)
      ) {
        if (!/^[0-9a-f-]{36}$/i.test(body.userId || ""))
          return reply(400, { message: "Invalid userId" });
        if (
          operation !== "finance/me" &&
          (!Number.isInteger(body.query?.page) ||
            body.query.page < 1 ||
            !Number.isInteger(body.query.limit) ||
            body.query.limit < 1 ||
            body.query.limit > 100)
        )
          return reply(400, { message: "Invalid pagination" });
        calls.push(operation);
        const fixture = memberships.get(body.userId);
        if (!fixture) return reply(404, { message: "Membresía no encontrada" });
        return reply(200, operation === "finance/me" ? fixture : []);
      }
      if (operation === "finance/vehicle") {
        if (
          !/^[A-Z0-9]{3}-\d{3}$/.test(body.plate || "") ||
          !["member", "kiosk", "control", "terminal", "admin"].includes(
            body.actor?.kind,
          )
        )
          return reply(400, { message: "Invalid vehicle input" });
        calls.push(operation);
        const fixture = vehicles.get(body.plate);
        if (
          !fixture ||
          (body.actor.kind === "member" &&
            body.actor.userId !== fixture.ownerId)
        )
          return reply(404, { message: "Vehículo no encontrado" });
        return reply(200, fixture.response);
      }
      if (operation === "alerts/list") {
        calls.push(operation);
        return reply(200, []);
      }
      if (operation === "alerts/dashboard") {
        calls.push(operation);
        return reply(200, {
          summary: { _sum: { amount: null, gallons: null }, _count: 0 },
          transactions: [],
        });
      }
      // No invented implementation of alert writes or financial commands.
      return reply(404, { message: "No fixture operation" });
    } catch {
      reply(400, { message: "Invalid internal request" });
    }
  });
  const listen = async () => {
    await new Promise((resolve) =>
      server.listen(port || 0, "127.0.0.1", resolve),
    );
    port = server.address().port;
    return "http://127.0.0.1:" + port;
  };
  const stop = async () => {
    if (!server.listening) return;
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  };
  return { origin: await listen(), memberships, vehicles, calls, listen, stop };
};

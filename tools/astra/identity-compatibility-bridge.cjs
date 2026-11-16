// Synthetic private adapter host. Reuses existing implementations, no copied finance SQL.
const http = require("node:http");
const crypto = require("node:crypto");
exports.createBridge = async function createBridge({ load, url, key }) {
  const compiled = (file) => load("./dist/src/" + file);
  const { PrismaService } = compiled("prisma/prisma.service");
  const db = new PrismaService({ datasources: { db: { url } } });
  const membership = new (compiled(
    "memberships/memberships.service",
  ).MembershipsService)(
    new (compiled("memberships/memberships.repository").MembershipsRepository)(
      db,
    ),
  );
  const vehicle = new (compiled("vehicles/vehicles.service").VehiclesService)(
    new (compiled("vehicles/vehicles.repository").VehiclesRepository)(db),
  );
  const alerts = new (compiled("alerts/alerts.service").AlertsService)(db);
  const uuid = (value) => {
    if (typeof value !== "string" || !/^[0-9a-f-]{36}$/i.test(value))
      throw Error("Invalid internal input");
    return value;
  };
  const query = (input) => {
    if (
      !Number.isInteger(input?.page) ||
      input.page < 1 ||
      !Number.isInteger(input.limit) ||
      input.limit < 1 ||
      input.limit > 100
    )
      throw Error("Invalid pagination");
    return input;
  };
  const operations = {
    "finance/me": (body) => membership.me(uuid(body.userId)),
    "finance/transactions": (body) =>
      membership.transactions(uuid(body.userId), query(body.query)),
    "finance/rewards": (body) =>
      membership.rewards(uuid(body.userId), query(body.query)),
    "finance/redemptions": (body) =>
      membership.redemptions(uuid(body.userId), query(body.query)),
    "finance/vehicle": (body) => {
      if (
        !/^[A-Z0-9]{3}-\d{3}$/.test(body.plate) ||
        !["member", "kiosk", "control", "terminal", "admin"].includes(
          body.actor?.kind,
        )
      )
        throw Error("Invalid vehicle input");
      if (body.actor.kind === "member") uuid(body.actor.userId);
      return vehicle.findByPlate(body.plate, body.actor);
    },
    "alerts/list": () => alerts.list(),
    "alerts/dashboard": () => alerts.dashboard(),
    "alerts/resolve": (body) => alerts.resolve(uuid(body.id), body.actor),
    "alerts/check-plate": (body) => {
      uuid(body.operationId);
      if (
        typeof body.code !== "string" ||
        body.code.length > 30 ||
        !/^[A-Z0-9]{3}-\d{3}$/.test(body.plate)
      )
        throw Error("Invalid plate check");
      return alerts.checkPlate(body.plate, body.code, body.operationId);
    },
  };
  const diagnostics = [];
  const server = http.createServer(async (req, res) => {
    const actual = Buffer.from(req.headers["x-identity-compat-key"] || "");
    const expected = Buffer.from(key);
    const reply = (status, body) => {
      res.writeHead(status, {
        "content-type": "application/json",
        "cache-control": "no-store",
      });
      res.end(JSON.stringify(body));
    };
    if (
      actual.length !== expected.length ||
      !crypto.timingSafeEqual(actual, expected)
    )
      return reply(401, { message: "Internal key required" });
    const operation = req.url?.replace(/^\/identity-compat\//, "");
    if (req.method !== "POST" || !Object.hasOwn(operations, operation))
      return reply(404, { message: "Unknown compatibility operation" });
    const started = Date.now();
    try {
      let raw = "";
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 8192) throw Error("Too large");
      }
      const body = JSON.parse(raw);
      const result = await operations[operation](body);
      diagnostics.push({
        operation,
        status: 200,
        elapsedMs: Date.now() - started,
      });
      reply(200, result);
    } catch (error) {
      diagnostics.push({
        operation,
        elapsedMs: Date.now() - started,
        errorType: error?.constructor?.name,
        code: /^[A-Z][A-Z0-9_]{2,20}$/.test(error?.code || "")
          ? error.code
          : "UNCLASSIFIED",
      });
      const status =
        typeof error.getStatus === "function" ? error.getStatus() : 503;
      reply(
        status,
        typeof error.getResponse === "function"
          ? error.getResponse()
          : { message: "Compatibility unavailable" },
      );
    }
  });
  let port;
  async function listen() {
    await new Promise((resolve) =>
      server.listen(port || 0, "127.0.0.1", resolve),
    );
    port = server.address().port;
    return "http://127.0.0.1:" + port;
  }
  async function stop() {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  const origin = await listen();
  return {
    origin,
    diagnostics,
    stop,
    listen,
    close: async () => {
      if (server.listening) await stop();
      await db.$disconnect();
    },
  };
};

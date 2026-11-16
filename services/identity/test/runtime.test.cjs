const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { ConfigService } = require("@nestjs/config");
const { HttpException, NotFoundException } = require("@nestjs/common");
const { CompatibilityPort } = require("../dist/adapters/compatibility-port");
const root = path.resolve(__dirname, "..");

test("standalone sources never import sibling Backend or financial implementations", () => {
  function inspect(directory) {
    for (const name of fs.readdirSync(directory)) {
      const file = path.join(directory, name);
      if (fs.statSync(file).isDirectory()) inspect(file);
      else if (file.endsWith(".ts")) {
        for (const match of fs
          .readFileSync(file, "utf8")
          .matchAll(/from\s+['"]([^'"]+)['"]/g)) {
          const specifier = match[1];
          assert.ok(!specifier.includes("Backend"));
          if (specifier.startsWith("."))
            assert.ok(
              path
                .resolve(path.dirname(file), specifier)
                .startsWith(root + path.sep),
            );
        }
      }
    }
  }
  inspect(path.join(root, "src"));
  for (const folder of ["wallet", "transactions", "alerts", "payments"])
    assert.equal(
      fs.existsSync(path.join(root, "src/compatibility", folder)),
      false,
    );
});

test("AuthCore configuration, login and Redis lifecycle snapshots remain byte-identical", () => {
  const manifest = require("../compatibility-manifest.json");
  for (const file of [
    "auth/auth.module.ts",
    "auth/auth.service.ts",
    "kiosk/redis-store.ts",
  ]) {
    assert.equal(
      crypto
        .createHash("sha256")
        .update(fs.readFileSync(path.join(root, "src/compatibility", file)))
        .digest("hex"),
      manifest[file],
    );
  }
});

test("identity Prisma projection excludes financial models and preserves scalar storage types", () => {
  const { Prisma } = require("../generated/identity");
  const models = Prisma.dmmf.datamodel.models;
  assert.equal(models.length, 14);
  for (const name of [
    "Payment",
    "Transaction",
    "MembershipDebt",
    "RewardMovement",
    "FuelInventory",
  ])
    assert.equal(
      models.some((model) => model.name === name),
      false,
    );
  const user = models.find((model) => model.name === "User");
  assert.equal(
    user.fields.find((field) => field.name === "authVersion").type,
    "Int",
  );
  const boundaries = require("../prisma/boundaries.json");
  assert.ok(boundaries.externalRelationsOmittedFromClientOnly.length > 0);
  assert.ok(boundaries.sharedColumns.Membership.includes("balance"));
});

test("compatibility port uses service auth, rejects redirects and never retries", async () => {
  const original = global.fetch;
  let calls = 0;
  const port = new CompatibilityPort(
    new ConfigService({
      IDENTITY_COMPAT_URL: "http://127.0.0.1:1",
      IDENTITY_COMPAT_KEY: "synthetic-key",
    }),
  );
  global.fetch = async (url, options) => {
    calls++;
    assert.equal(url, "http://127.0.0.1:1/identity-compat/finance/me");
    assert.equal(options.headers["x-identity-compat-key"], "synthetic-key");
    assert.equal(options.redirect, "error");
    throw Error("synthetic outage");
  };
  try {
    await assert.rejects(
      port.call("finance/me", { userId: "fixture" }),
      (error) => error instanceof HttpException && error.getStatus() === 503,
    );
    assert.equal(calls, 1);
    global.fetch = async () =>
      Response.json({ message: "Vehículo no encontrado" }, { status: 404 });
    await assert.rejects(
      port.call("finance/vehicle"),
      (error) => error instanceof NotFoundException,
    );
  } finally {
    global.fetch = original;
  }
});

test("dual Prisma error boundary preserves unique-conflict classification", () => {
  const { Prisma: Native } = require("../generated/identity");
  const { Prisma } = require("@prisma/client");
  const { persistenceError } = require("../dist/persistence/errors");
  const native = new Native.PrismaClientKnownRequestError(
    "synthetic conflict",
    {
      code: "P2002",
      clientVersion: "6.19.3",
      meta: { target: ["dni"] },
    },
  );
  assert.equal(native instanceof Prisma.PrismaClientKnownRequestError, false);
  const converted = persistenceError(native);
  assert.ok(converted instanceof Prisma.PrismaClientKnownRequestError);
  assert.equal(converted.code, native.code);
  assert.deepEqual(converted.meta, native.meta);
  const arbitrary = { code: "P2034" };
  assert.equal(persistenceError(arbitrary), arbitrary);
});

test("native serialization failures retry; document conflicts do not", async () => {
  const { Prisma } = require("../generated/identity");
  const { atomic } = require("../dist/persistence/atomic");
  let attempts = 0;
  assert.equal(
    await atomic(async () => {
      if (++attempts === 1)
        throw new Prisma.PrismaClientKnownRequestError("synthetic race", {
          code: "P2034",
          clientVersion: "6.19.3",
        });
      return "committed";
    }),
    "committed",
  );
  assert.equal(attempts, 2);
  attempts = 0;
  await assert.rejects(
    atomic(async () => {
      attempts++;
      throw new Prisma.PrismaClientKnownRequestError("synthetic unique", {
        code: "P2002",
        clientVersion: "6.19.3",
        meta: { target: ["dni"] },
      });
    }),
  );
  assert.equal(attempts, 1);
});

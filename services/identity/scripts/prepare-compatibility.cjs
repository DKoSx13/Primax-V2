// Explicit maintenance operation, never run by build/start. No DB connection.
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const project = path.resolve(__dirname, ".."),
  backend = path.resolve(project, "../../Backend/src");
const map = {
  "prisma/prisma.service.ts": "persistence/compatibility-db.ts",
  "alerts/alerts.service.ts": "adapters/alerts.service.ts",
  "memberships/memberships.service.ts": "adapters/memberships.service.ts",
  "memberships/memberships.repository.ts":
    "persistence/memberships.repository.ts",
  "vehicles/vehicles.service.ts": "adapters/vehicles.service.ts",
  "vehicles/vehicles.repository.ts": "persistence/vehicles.repository.ts",
};
const nativeImporters = new Set([
  "users/users.repository.ts",
  "auth/password-reset.service.ts",
]);
const queue = [
  "auth/auth.module.ts",
  "memberships/memberships.module.ts",
  "vehicles/vehicles.module.ts",
  "health/health.module.ts",
  "setup-app.ts",
  "config/environment.ts",
  "identity-core/identity.ts",
  "identity-core/ports.ts",
  "identity-core/memory.ts",
];
const seen = new Set(),
  manifest = {};
while (queue.length) {
  const file = queue.shift();
  if (seen.has(file)) continue;
  seen.add(file);
  const source = fs.readFileSync(path.join(backend, file), "utf8");
  manifest[file] = crypto.createHash("sha256").update(source).digest("hex");
  const dest = path.join(project, "src/compatibility", file);
  const code = source.replace(
    /(from\s+['"])(\.[^'"]+)(['"])/g,
    (_, before, specifier, after) => {
      const target =
        path.relative(
          backend,
          path.resolve(backend, path.dirname(file), specifier),
        ) + ".ts";
      let override = map[target];
      if (target === "prisma/prisma.service.ts" && nativeImporters.has(file))
        override = "persistence/identity-db.ts";
      if (specifier === "@prisma/client") return _;
      let actual;
      if (override) actual = path.join(project, "src", override);
      else {
        queue.push(target);
        actual = path.join(project, "src/compatibility", target);
      }
      let relative = path
        .relative(path.dirname(dest), actual)
        .replace(/\.ts$/, "");
      if (!relative.startsWith(".")) relative = "./" + relative;
      return before + relative + after;
    },
  );
  let result = code;
  if (file === "users/membership-number.ts")
    result = result.replace(
      "from '@prisma/client'",
      "from '../../../generated/identity'",
    );
  if (file === "users/users.repository.ts") {
    result =
      "import { persistenceError } from '../../persistence/errors';\n" +
      result.replace(
        "} catch (error) {",
        "} catch (originalError) {\n        const error = persistenceError(originalError);",
      );
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, result);
}
fs.writeFileSync(
  path.join(project, "compatibility-manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);

const original = fs.readFileSync(
  path.resolve(project, "../../Backend/prisma/schema.prisma"),
  "utf8",
);
const models = new Set([
  "User",
  "MembershipNumberCounter",
  "Membership",
  "MembershipCodeAlias",
  "Vehicle",
  "PasswordReset",
  "UserPermissionGrant",
  "AdminControlAccount",
  "AdminControlGrant",
  "AdminStationAssignment",
  "AdminEmailVerification",
  "Station",
  "Terminal",
  "TerminalCredential",
]);
const blocks = [
  ...original.matchAll(/^(model|enum) (\w+) \{\n([\s\S]*?)^\}/gm),
];
const allModels = new Set(
  blocks.filter((b) => b[1] === "model").map((b) => b[2]),
);
const removed = [];
const selectedModels = blocks
  .filter((b) => b[1] === "model" && models.has(b[2]))
  .map((b) => {
    const lines = b[3].split("\n").filter((line) => {
      const field = line.trim().match(/^(\w+)\s+(\w+)(?:\[\]|\?)?/);
      if (field && allModels.has(field[2]) && !models.has(field[2])) {
        removed.push({ model: b[2], field: field[1], externalModel: field[2] });
        return false;
      }
      return true;
    });
    return `model ${b[2]} {\n${lines.join("\n")}\n}`;
  });
const usedTypes = new Set(
  [...selectedModels.join("\n").matchAll(/^\s+\w+\s+(\w+)/gm)].map(
    (match) => match[1],
  ),
);
const selected = [
  ...blocks
    .filter((b) => b[1] === "enum" && usedTypes.has(b[2]))
    .map((b) => b[0]),
  ...selectedModels,
];
const header = `// Projection only. Never migrate/db push this schema onto an existing DB.\n`;
fs.writeFileSync(
  path.join(project, "prisma/identity.prisma"),
  header +
    `generator client {\n provider = "prisma-client-js"\n output = "../generated/identity"\n}\n` +
    `datasource db {\n provider = "postgresql"\n url = env("IDENTITY_DATABASE_URL")\n}\n\n` +
    selected.join("\n\n") +
    "\n",
);
fs.writeFileSync(
  path.join(project, "prisma/compatibility.prisma"),
  header +
    original
      .replace('env("DATABASE_URL")', 'env("IDENTITY_COMPAT_DATABASE_URL")')
      .replace(/\s*directUrl = env\("DATABASE_URL_UNPOOLED"\)/, ""),
);
fs.writeFileSync(
  path.join(project, "prisma/boundaries.json"),
  JSON.stringify(
    {
      identityProjectionModels: [...models],
      externalRelationsOmittedFromClientOnly: removed,
      sharedColumns: {
        Membership: [
          "balance",
          "welcomeAvailable",
          "welcomeReservedOperationId",
          "welcomeTransactionId",
        ],
        Station: ["* reference only"],
        Terminal: ["operationalStatus", "statusVersion", "suspensionReason"],
      },
      warning:
        "No DDL generated/applied. Database foreign keys remain unchanged. Compatibility schema retained for legacy kiosk operational transactions only.",
    },
    null,
    2,
  ) + "\n",
);
console.log(
  "Prepared compatibility sources and Prisma projections; no database access",
);

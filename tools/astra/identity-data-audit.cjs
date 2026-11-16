// Static audit of the frozen compatibility schema. No database/client imports.
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const root = path.resolve(__dirname, "../..");
const schema = fs.readFileSync(
  path.join(root, "services/identity/prisma/compatibility.prisma"),
  "utf8",
);
const selected = new Set(
  JSON.parse(
    fs.readFileSync(
      path.join(root, "services/identity/prisma/boundaries.json"),
    ),
  ).identityProjectionModels,
);
const edges = [];
for (const model of schema.matchAll(/^model (\w+) \{\n([\s\S]*?)^\}/gm)) {
  for (const line of model[2].split("\n")) {
    const relation = line
      .trim()
      .match(
        /^(\w+)\s+(\w+)\??\s+.*@relation\([^\n]*fields:\s*\[([^\]]+)\][^\n]*references:\s*\[([^\]]+)\]/,
      );
    if (relation && selected.has(model[1]) !== selected.has(relation[2]))
      edges.push([model[1], relation[3], relation[2], relation[4]]);
  }
}
const lines = [
  "# Auditoría estática de relaciones de Identity",
  "",
  "Fuente: services/identity/prisma/compatibility.prisma.",
  "SHA-256: `" +
    crypto.createHash("sha256").update(schema).digest("hex") +
    "`.",
  "",
  `Se identifican **${edges.length} relaciones declaradas** que cruzan el conjunto de los 14 modelos proyectados.`,
  "Ese conjunto incluye referencias de Station/Terminal y datos compartidos; no equivale a propiedad exclusiva de Identity.",
  "La lista no sustituye inspección de constraints SQL adicionales ni enumera referencias escalares sin FK.",
  "",
  "| Tabla origen | Columnas | Tabla referenciada | Referencias |",
  "| --- | --- | --- | --- |",
];
for (const [from, fields, to, refs] of edges)
  lines.push(`| ${from} | ${fields} | ${to} | ${refs} |`);
lines.push(
  "",
  "Ninguna relación existente fue eliminada o convertida en una llamada remota.",
  "La base nueva del experimento no contiene las tablas externas: no es una migración de la base compartida.",
  "Referencias escalares relevantes adicionales: welcomeReservedOperationId, welcomeTransactionId, rotatedFromId,",
  "userId de orden/compra, operationId y actor/targetId de auditoría requieren contrato aunque no aparezcan como FK.",
  "",
);
fs.writeFileSync(
  path.join(root, "Docs/astra/identity-data-fk-audit.md"),
  lines.join("\n"),
);
console.log(
  "Static boundary audit:",
  edges.length,
  "relations; no database accessed",
);

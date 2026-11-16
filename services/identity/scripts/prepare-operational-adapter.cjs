// Explicit extraction from the project's frozen source, never from Backend.
// Build/start do not run this script. Only the PostgreSQL unit moves behind a port.
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(
  path.join(root, "src/compatibility/kiosk/kiosk.service.ts"),
  "utf8",
);
const method = source.slice(
  source.indexOf("  async bootstrapTerminal("),
  source.indexOf("  private async recoveryEvidence("),
);
const start = method.indexOf("    const terminals =");
const end = method.indexOf("    const session = await this.create(true);");
if (start < 0 || end < start) throw Error("Legacy extraction boundary changed");
const unit = method.slice(start, end);
const body = unit.replace(
  "const previous = req.header('x-terminal-session') || '';",
  "const previous = command.previousCredential || '';",
);
const output =
  `// Materialized PostgreSQL unit. Refresh only via prepare-operational-adapter.cjs.\n` +
  `import { Injectable, ConflictException } from '@nestjs/common';\n` +
  `import { createHash, randomBytes } from 'node:crypto';\n` +
  `import { PrismaService } from '../persistence/compatibility-db';\n` +
  `import { acceptsNewAttention } from '../compatibility/operations/terminal-availability';\n` +
  `import { isEmptyAttention, EMPTY_ATTENTION_IDLE_MS } from '../compatibility/operations/empty-attention';\n` +
  `import { OperationalSessionPort, OperationalSessionCommand } from './port';\n` +
  `const digest = (value: string) => createHash('sha256').update(value).digest('hex');\n` +
  `export const LEGACY_BOOTSTRAP_UNIT_SHA256 = '${crypto.createHash("sha256").update(unit).digest("hex")}';\n` +
  `@Injectable()\nexport class PrismaOperationalSessions implements OperationalSessionPort {\n` +
  `  constructor(private readonly db: PrismaService) {}\n` +
  `  async issueOrResume(command: OperationalSessionCommand) {\n` +
  `    if (command.contractVersion !== 1) throw new Error('Unsupported operational contract');\n` +
  `    const stationId = command.stationId;\n` +
  `    const requestedTerminalId = command.terminalId;\n    const requestedTerminalCode = command.terminalCode;\n` +
  body +
  `    return { terminalId, terminalToken: credential.terminalToken, expiresAt: credential.expiresAt };\n  }\n}\n`;
fs.mkdirSync(path.join(root, "src/operational"), { recursive: true });
fs.writeFileSync(path.join(root, "src/operational/prisma-sessions.ts"), output);
console.log("Extracted complete legacy PostgreSQL unit; no database access");

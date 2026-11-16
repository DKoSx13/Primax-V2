import { createHash } from "node:crypto";
import { OperationalSessionCommand, OperationalSessionResult } from "../port";

export interface RemoteCommand {
  version: 1;
  commandId: string;
  command: OperationalSessionCommand;
}
export interface ReceiptReply {
  version: 1;
  commandId: string;
  state: "COMMITTED";
  result: { terminalId: string; terminalToken: string; expiresAt: string };
}
export class ContractFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message = code,
  ) {
    super(message);
  }
}
export const uuid =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
function keys(
  value: unknown,
  allowed: string[],
): asserts value is Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((k) => !allowed.includes(k))
  )
    throw new ContractFailure(400, "INVALID_COMMAND");
}
export function parseCommand(value: unknown): RemoteCommand {
  keys(value, ["version", "commandId", "command"]);
  keys(value.command, [
    "contractVersion",
    "stationId",
    "terminalId",
    "terminalCode",
    "previousCredential",
  ]);
  const c = value.command;
  if (
    value.version !== 1 ||
    typeof value.commandId !== "string" ||
    !uuid.test(value.commandId) ||
    c.contractVersion !== 1 ||
    typeof c.stationId !== "string" ||
    !uuid.test(c.stationId) ||
    (c.terminalId != null &&
      (typeof c.terminalId !== "string" || !uuid.test(c.terminalId))) ||
    (c.terminalCode != null &&
      (typeof c.terminalCode !== "string" ||
        !/^[A-Z0-9-]{3,30}$/.test(c.terminalCode))) ||
    (c.previousCredential !== undefined &&
      (typeof c.previousCredential !== "string" ||
        c.previousCredential.length > 8192))
  )
    throw new ContractFailure(400, "INVALID_COMMAND");
  return {
    version: 1,
    commandId: value.commandId.toLowerCase(),
    command: {
      contractVersion: 1,
      stationId: c.stationId.toLowerCase(),
      terminalId:
        c.terminalId == null ? undefined : String(c.terminalId).toLowerCase(),
      terminalCode: c.terminalCode == null ? undefined : String(c.terminalCode),
      previousCredential: c.previousCredential as string | undefined,
    },
  };
}
export function fingerprint(c: OperationalSessionCommand) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        1,
        c.stationId.toLowerCase(),
        c.terminalId?.toLowerCase() || "",
        c.terminalCode || "",
        createHash("sha256")
          .update(c.previousCredential || "")
          .digest("hex"),
      ]),
    )
    .digest("hex");
}
export function fromReply(
  value: unknown,
  id: string,
): OperationalSessionResult {
  const r = value as ReceiptReply;
  if (
    r?.version !== 1 ||
    r.commandId !== id ||
    r.state !== "COMMITTED" ||
    !uuid.test(r.result?.terminalId || "") ||
    !/^[a-f0-9]{64}$/.test(r.result?.terminalToken || "") ||
    typeof r.result?.expiresAt !== "string" ||
    !Number.isFinite(Date.parse(r.result.expiresAt))
  )
    throw new ContractFailure(503, "INVALID_PROVIDER_REPLY");
  return { ...r.result, expiresAt: new Date(r.result.expiresAt) };
}

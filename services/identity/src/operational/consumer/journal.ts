import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../persistence/compatibility-db";
import {
  ContractFailure,
  fingerprint,
  uuid,
  RemoteCommand,
} from "../remote/contract";
import {
  ConsumerActor,
  ConsumerIntentStore,
  PrepareV2,
  ControlTarget,
} from "./intent";

type Row = {
  intentId: string;
  commandId: string;
  userId: string;
  authVersion: number;
  stationId: string;
  terminalId: string;
  action: string;
  fingerprint: string;
  expiresAt: Date;
  callerOperationId?: string | null;
  permissions?: string[] | null;
};
const action = "TERMINAL_CREDENTIAL_ISSUE";
function envelope(row: Row): RemoteCommand {
  return {
    version: 1,
    commandId: row.commandId,
    command: {
      contractVersion: 1,
      stationId: row.stationId,
      terminalId: row.terminalId,
      previousCredential: "",
    },
  };
}
function digest(row: Row) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        1,
        row.intentId,
        row.commandId,
        row.userId,
        row.authVersion,
        row.action,
        row.expiresAt.toISOString(),
        fingerprint(envelope(row).command),
        ...(row.callerOperationId
          ? ["human", row.callerOperationId, row.permissions]
          : []),
      ]),
    )
    .digest("hex");
}
export class PrismaConsumerJournal implements ConsumerIntentStore {
  constructor(
    private readonly db: PrismaService,
    private readonly stationId: string,
  ) {}
  private async authorize(tx: Prisma.TransactionClient, actor: ConsumerActor) {
    if (
      !actor.permissions.includes("ADMIN_TERMINAL_MANAGE") ||
      (!actor.global && !actor.stationIds.includes(this.stationId))
    )
      throw new ContractFailure(403, "INTENT_FORBIDDEN");
    const user = await tx.user.findUnique({ where: { id: actor.userId } });
    if (!user?.active || user.authVersion !== actor.authVersion)
      throw new ContractFailure(401, "ACTOR_REVOKED");
  }
  /** Read-only authorization query: same AuthCore actor and journal policy; never creates an intent. */
  async verifyTarget(
    actor: ConsumerActor,
    target: ControlTarget,
  ): Promise<void> {
    if (
      target.action !== action ||
      !uuid.test(target.stationId) ||
      !uuid.test(target.terminalId) ||
      !Number.isFinite(Date.parse(target.expiresAt)) ||
      new Date(target.expiresAt).toISOString() !== target.expiresAt
    )
      throw new ContractFailure(400, "INVALID_TARGET");
    if (target.stationId !== this.stationId)
      throw new ContractFailure(403, "INTENT_FORBIDDEN");
    if (Date.parse(target.expiresAt) <= Date.now())
      throw new ContractFailure(410, "INTENT_EXPIRED");
    await this.db.atomic(async (tx) => {
      await this.authorize(tx, actor);
      const terminal = await tx.terminal.findUnique({
        where: { id: target.terminalId },
      });
      if (!terminal || terminal.stationId !== this.stationId)
        throw new ContractFailure(404, "TERMINAL_NOT_FOUND");
      if (terminal.revokedAt || terminal.lifecycle === "REVOCADA")
        throw new ContractFailure(409, "TERMINAL_UNAVAILABLE");
    });
  }
  async create(actor: ConsumerActor, terminalId: string) {
    if (!uuid.test(terminalId))
      throw new ContractFailure(400, "INVALID_TERMINAL");
    return this.db.atomic(async (tx) => {
      await this.authorize(tx, actor);
      const terminal = await tx.terminal.findUnique({
        where: { id: terminalId },
      });
      if (!terminal || terminal.stationId !== this.stationId)
        throw new ContractFailure(404, "TERMINAL_NOT_FOUND");
      const row: Row = {
        intentId: randomUUID(),
        commandId: randomUUID(),
        userId: actor.userId,
        authVersion: actor.authVersion,
        stationId: this.stationId,
        terminalId: terminal.id,
        action,
        fingerprint: "",
        expiresAt: new Date(Date.now() + 15 * 60000),
      };
      row.fingerprint = digest(row);
      await tx.$executeRaw`INSERT INTO "IdentityConsumerIntent"
        ("intentId","commandId","userId","authVersion","stationId","terminalId",action,fingerprint,"expiresAt")
        VALUES (${row.intentId}::uuid,${row.commandId}::uuid,${row.userId}::uuid,${row.authVersion},${row.stationId}::uuid,
          ${row.terminalId}::uuid,${row.action},${row.fingerprint},${row.expiresAt})`;
      return { intentId: row.intentId, expiresAt: row.expiresAt };
    });
  }
  async createV2(actor: ConsumerActor, request: PrepareV2) {
    if (
      !uuid.test(request.callerOperationId) ||
      !uuid.test(request.terminalId) ||
      !uuid.test(request.stationId) ||
      request.action !== action ||
      !Number.isFinite(Date.parse(request.expiresAt)) ||
      new Date(request.expiresAt).toISOString() !== request.expiresAt
    )
      throw new ContractFailure(400, "INVALID_INTENT");
    request = {
      ...request,
      callerOperationId: request.callerOperationId.toLowerCase(),
      stationId: request.stationId.toLowerCase(),
      terminalId: request.terminalId.toLowerCase(),
    };
    if (request.stationId !== this.stationId)
      throw new ContractFailure(403, "INTENT_FORBIDDEN");
    return this.db.atomic(async (tx) => {
      await this.authorize(tx, actor);
      const terminal = await tx.terminal.findUnique({
        where: { id: request.terminalId },
      });
      if (!terminal || terminal.stationId !== this.stationId)
        throw new ContractFailure(404, "TERMINAL_NOT_FOUND");
      // Lookup before TTL validation preserves tombstones and never extends a retry.
      const find = () => tx.$queryRaw<
        Row[]
      >`SELECT * FROM "IdentityConsumerIntent"
        WHERE "userId"=${actor.userId}::uuid AND "callerOperationId"=${request.callerOperationId}::uuid`;
      const check = (row: Row) => {
        if (row.authVersion !== actor.authVersion)
          throw new ContractFailure(403, "INTENT_FORBIDDEN");
        if (
          row.fingerprint !== digest(row) ||
          row.action !== request.action ||
          row.stationId !== request.stationId ||
          row.terminalId !== request.terminalId ||
          row.expiresAt.toISOString() !== request.expiresAt
        )
          throw new ContractFailure(409, "INTENT_CONFLICT");
        if (row.expiresAt <= new Date())
          throw new ContractFailure(410, "INTENT_EXPIRED");
        return { intentId: row.intentId, expiresAt: row.expiresAt };
      };
      const prior = (await find())[0];
      if (prior) return check(prior);
      const expiresAt = new Date(request.expiresAt);
      if (expiresAt <= new Date())
        throw new ContractFailure(410, "INTENT_EXPIRED");
      if (expiresAt.getTime() > Date.now() + 15 * 60000)
        throw new ContractFailure(400, "INVALID_EXPIRY");
      const row: Row = {
        intentId: randomUUID(),
        commandId: randomUUID(),
        userId: actor.userId,
        authVersion: actor.authVersion,
        stationId: this.stationId,
        terminalId: terminal.id,
        action,
        fingerprint: "",
        expiresAt,
        callerOperationId: request.callerOperationId,
        permissions: [...new Set(actor.permissions)].sort(),
      };
      row.fingerprint = digest(row);
      await tx.$executeRaw`INSERT INTO "IdentityConsumerIntent"
        ("intentId","commandId","userId","authVersion","stationId","terminalId",action,fingerprint,"expiresAt","callerOperationId",permissions)
        VALUES (${row.intentId}::uuid,${row.commandId}::uuid,${row.userId}::uuid,${row.authVersion},${row.stationId}::uuid,
          ${row.terminalId}::uuid,${row.action},${row.fingerprint},${row.expiresAt},${row.callerOperationId}::uuid,${row.permissions}::text[])
        ON CONFLICT ("userId","callerOperationId") DO NOTHING`;
      const saved = (await find())[0];
      if (!saved) throw new ContractFailure(503, "INTENT_UNAVAILABLE");
      return check(saved);
    });
  }
  async read(actor: ConsumerActor, intentId: string) {
    if (!uuid.test(intentId)) throw new ContractFailure(400, "INVALID_INTENT");
    return this.db.atomic(async (tx) => {
      await this.authorize(tx, actor);
      const rows = await tx.$queryRaw<
        Row[]
      >`SELECT * FROM "IdentityConsumerIntent" WHERE "intentId"=${intentId}::uuid`;
      const row = rows[0];
      if (!row || row.userId !== actor.userId)
        throw new ContractFailure(404, "INTENT_NOT_FOUND");
      if (
        row.authVersion !== actor.authVersion ||
        row.stationId !== this.stationId
      )
        throw new ContractFailure(403, "INTENT_FORBIDDEN");
      if (row.expiresAt <= new Date())
        throw new ContractFailure(410, "INTENT_EXPIRED");
      if (row.action !== action || row.fingerprint !== digest(row))
        throw new ContractFailure(409, "INTENT_INTEGRITY");
      const terminal = await tx.terminal.findUnique({
        where: { id: row.terminalId },
      });
      if (!terminal || terminal.stationId !== row.stationId)
        throw new ContractFailure(409, "TERMINAL_SCOPE_CHANGED");
      return envelope(row);
    });
  }
}

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../persistence/compatibility-db";
import { PrismaOperationalSessions } from "../prisma-sessions";
import { acceptsNewAttention } from "../../compatibility/operations/terminal-availability";
import {
  ContractFailure,
  fingerprint,
  fromReply,
  parseCommand,
  ReceiptReply,
  RemoteCommand,
} from "./contract";

type Receipt = {
  callerId: string;
  commandId: string;
  fingerprint: string;
  terminalId: string;
  credentialId: string;
  keyId: string;
  nonce: string;
  ciphertext: string;
  tag: string;
};
/** Provider-local single SQL unit. The original adapter receives the ALREADY OPEN tx;
 * no nested transaction and no HTTP/Redis call can occur inside this callback.
 */
export class DurableOperationalProvider {
  constructor(
    private readonly db: PrismaService,
    private readonly key: Buffer,
    private readonly keyId = "lab-v1",
  ) {
    if (key.length !== 32) throw Error("Invalid receipt encryption key");
  }
  private aad(caller: string, request: RemoteCommand, digest: string) {
    return Buffer.from(
      JSON.stringify([1, caller, request.commandId.toLowerCase(), digest]),
    );
  }
  private async read(
    tx: Prisma.TransactionClient,
    caller: string,
    request: RemoteCommand,
  ) {
    const rows = await tx.$queryRaw<
      Receipt[]
    >`SELECT * FROM "IdentityOperationalReceipt"
      WHERE "callerId"=${caller} AND "commandId"=${request.commandId}::uuid`;
    return rows[0];
  }
  private async reveal(
    tx: Prisma.TransactionClient,
    caller: string,
    request: RemoteCommand,
    row: Receipt,
  ): Promise<ReceiptReply> {
    const digest = fingerprint(request.command);
    if (row.fingerprint !== digest)
      throw new ContractFailure(409, "COMMAND_CONFLICT");
    // A receipt is not an authorization cache and must never resurrect a rotated credential.
    await tx.$queryRaw`SELECT id FROM "Terminal" WHERE id=${row.terminalId}::uuid FOR UPDATE`;
    const credential = await tx.terminalCredential.findUnique({
      where: { id: row.credentialId },
      include: { terminal: true },
    });
    const active = await tx.terminalOperation.findFirst({
      where: { terminalId: row.terminalId, closedAt: null },
    });
    if (
      !credential ||
      credential.revokedAt ||
      credential.expiresAt <= new Date() ||
      credential.terminal.lifecycle !== "REGISTRADA" ||
      credential.terminal.revokedAt ||
      credential.terminal.stationId !== request.command.stationId ||
      (!acceptsNewAttention(credential.terminal.operationalStatus) &&
        credential.terminal.operationalStatus !== "EN_USO" &&
        !active)
    )
      throw new ContractFailure(409, "CREDENTIAL_UNAVAILABLE");
    if (row.keyId !== this.keyId)
      throw new ContractFailure(503, "RECEIPT_KEY_UNAVAILABLE");
    let reply: ReceiptReply;
    try {
      const cipher = createDecipheriv(
        "aes-256-gcm",
        this.key,
        Buffer.from(row.nonce, "base64"),
      );
      cipher.setAAD(this.aad(caller, request, digest));
      cipher.setAuthTag(Buffer.from(row.tag, "base64"));
      reply = JSON.parse(
        Buffer.concat([
          cipher.update(Buffer.from(row.ciphertext, "base64")),
          cipher.final(),
        ]).toString(),
      );
    } catch {
      throw new ContractFailure(503, "RECEIPT_UNAVAILABLE");
    }
    const result = fromReply(reply, request.commandId.toLowerCase());
    if (
      result.terminalId !== row.terminalId ||
      createHash("sha256").update(result.terminalToken).digest("hex") !==
        credential.tokenHash ||
      result.expiresAt.getTime() !== credential.expiresAt.getTime()
    )
      throw new ContractFailure(503, "RECEIPT_UNAVAILABLE");
    return reply;
  }
  async execute(caller: string, input: RemoteCommand): Promise<ReceiptReply> {
    const request = parseCommand(input);
    request.commandId = request.commandId.toLowerCase();
    return this.db.atomic(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${caller + ":" + request.commandId},0))::text`;
      const prior = await this.read(tx, caller, request);
      if (prior) return this.reveal(tx, caller, request, prior);
      // The validated SQL body stays byte-identical; only its atomic boundary is supplied here.
      const bound = {
        terminal: tx.terminal,
        atomic: async <T>(
          work: (unit: Prisma.TransactionClient) => Promise<T>,
        ) => work(tx),
      } as unknown as PrismaService;
      const result = await new PrismaOperationalSessions(bound).issueOrResume(
        request.command,
      );
      const credential = await tx.terminalCredential.findUniqueOrThrow({
        where: {
          tokenHash: createHash("sha256")
            .update(result.terminalToken)
            .digest("hex"),
        },
      });
      const reply: ReceiptReply = {
        version: 1,
        commandId: request.commandId,
        state: "COMMITTED",
        result: { ...result, expiresAt: result.expiresAt.toISOString() },
      };
      const digest = fingerprint(request.command),
        nonce = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", this.key, nonce);
      cipher.setAAD(this.aad(caller, request, digest));
      const ciphertext = Buffer.concat([
        cipher.update(JSON.stringify(reply)),
        cipher.final(),
      ]);
      await tx.$executeRaw`INSERT INTO "IdentityOperationalReceipt"
        ("callerId","commandId",fingerprint,"terminalId","credentialId","keyId",nonce,ciphertext,tag)
        VALUES (${caller},${request.commandId}::uuid,${digest},${result.terminalId}::uuid,${credential.id}::uuid,
        ${this.keyId},${nonce.toString("base64")},${ciphertext.toString("base64")},${cipher.getAuthTag().toString("base64")})`;
      return reply;
    });
  }
  async query(caller: string, input: RemoteCommand): Promise<ReceiptReply> {
    const request = parseCommand(input);
    request.commandId = request.commandId.toLowerCase();
    return this.db.atomic(async (tx) => {
      const receipt = await this.read(tx, caller, request);
      if (!receipt) throw new ContractFailure(404, "RECEIPT_NOT_FOUND");
      return this.reveal(tx, caller, request, receipt);
    });
  }
}

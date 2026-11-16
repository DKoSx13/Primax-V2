import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { PrismaService } from "../../persistence/compatibility-db";
import { ContractFailure, uuid } from "../remote/contract";
type Credential = {
  keyId: string;
  serviceId: string;
  secretDigest: string;
  stationId: string;
  routes: string[];
  notBefore: Date;
  expiresAt: Date;
  revokedAt: Date | null;
};
export class ServiceTransport {
  constructor(
    private readonly db: PrismaService,
    private readonly stationId: string,
  ) {}
  async authenticate(req: IncomingMessage) {
    if (!(req.socket as { encrypted?: boolean }).encrypted)
      throw new ContractFailure(401, "SERVICE_TLS_REQUIRED");
    const header = (name: string) =>
      typeof req.headers[name] === "string"
        ? (req.headers[name] as string)
        : "";
    const service = header("x-identity-service"),
      keyId = header("x-identity-key-id"),
      secret = header("x-identity-service-key"),
      nonce = header("x-identity-request-nonce");
    const issued = header("x-identity-issued-at"),
      expires = header("x-identity-expires-at");
    if (
      service !== "fuelflow-private" ||
      !uuid.test(keyId) ||
      !uuid.test(nonce) ||
      !/^[a-f0-9]{64}$/.test(secret) ||
      !/^\d{13}$/.test(issued) ||
      !/^\d{13}$/.test(expires)
    )
      throw new ContractFailure(401, "SERVICE_UNAUTHORIZED");
    const i = Number(issued),
      e = Number(expires);
    if (
      e <= i ||
      e - i > 30000 ||
      i > Date.now() + 5000 ||
      e <= Date.now() - 5000
    )
      throw new ContractFailure(401, "SERVICE_REQUEST_EXPIRED");
    if (
      ![
        "/consumer/v2/control/verify",
        "/consumer/v2/intents",
        "/consumer/v2/intents/execute",
      ].includes(req.url || "")
    )
      throw new ContractFailure(403, "SERVICE_ROUTE_FORBIDDEN");
    return this.db.atomic(async (tx) => {
      if (i > Date.now() + 5000 || e <= Date.now() - 5000)
        throw new ContractFailure(401, "SERVICE_REQUEST_EXPIRED");
      const rows = await tx.$queryRaw<
        Credential[]
      >`SELECT * FROM "IdentityServiceCredential" WHERE "keyId"=${keyId}::uuid`;
      const row = rows[0],
        hash = createHash("sha256").update(secret).digest();
      if (
        !row ||
        row.serviceId !== service ||
        !/^[a-f0-9]{64}$/.test(row.secretDigest) ||
        !timingSafeEqual(hash, Buffer.from(row.secretDigest, "hex")) ||
        row.revokedAt ||
        row.notBefore > new Date() ||
        row.expiresAt <= new Date()
      )
        throw new ContractFailure(401, "SERVICE_UNAUTHORIZED");
      if (
        row.stationId !== this.stationId ||
        !row.routes.includes(req.url || "")
      )
        throw new ContractFailure(403, "SERVICE_SCOPE_FORBIDDEN");
      const inserted =
        await tx.$executeRaw`INSERT INTO "IdentityServiceNonce" ("keyId",nonce,"issuedAt","expiresAt") VALUES (${keyId}::uuid,${nonce}::uuid,${new Date(i)},${new Date(e)}) ON CONFLICT ("keyId",nonce) DO NOTHING`;
      if (inserted !== 1) throw new ContractFailure(409, "SERVICE_REPLAY");
      return { serviceId: row.serviceId, stationId: row.stationId };
    });
  }
}

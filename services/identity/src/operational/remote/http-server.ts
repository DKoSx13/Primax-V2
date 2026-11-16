import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import {
  ContractFailure,
  parseCommand,
  ReceiptReply,
  RemoteCommand,
} from "./contract";

export interface ReceiptService {
  execute(caller: string, request: RemoteCommand): Promise<ReceiptReply>;
  query(caller: string, request: RemoteCommand): Promise<ReceiptReply>;
}
export function createOperationalServer(
  service: ReceiptService,
  options: { apiKey: string; callerId: string; stationId: string },
) {
  if (!/^[a-f0-9]{64}$/.test(options.apiKey))
    throw Error("Invalid internal key");
  return createServer(async (req, res) => {
    res.setHeader("cache-control", "no-store");
    res.setHeader("content-type", "application/json");
    try {
      const supplied = Buffer.from(
          String(req.headers["x-operational-key"] || ""),
        ),
        expected = Buffer.from(options.apiKey);
      if (
        supplied.length !== expected.length ||
        !timingSafeEqual(supplied, expected)
      )
        throw new ContractFailure(401, "SERVICE_UNAUTHORIZED");
      if (
        req.method !== "POST" ||
        ![
          "/operational/v1/commands",
          "/operational/v1/receipts/query",
        ].includes(req.url || "")
      )
        throw new ContractFailure(404, "NOT_FOUND");
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 16384) throw new ContractFailure(413, "BODY_TOO_LARGE");
        chunks.push(Buffer.from(chunk));
      }
      let body: unknown;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString());
      } catch {
        throw new ContractFailure(400, "INVALID_COMMAND");
      }
      const command = parseCommand(body);
      if (command.command.stationId !== options.stationId)
        throw new ContractFailure(403, "STATION_FORBIDDEN");
      const reply =
        req.url === "/operational/v1/commands"
          ? await service.execute(options.callerId, command)
          : await service.query(options.callerId, command);
      res.statusCode = 200;
      res.end(JSON.stringify(reply));
    } catch (error) {
      // No request bodies, credentials, receipt payloads or Prisma errors in logs/replies.
      let failure =
        error instanceof ContractFailure
          ? error
          : new ContractFailure(503, "PROVIDER_UNAVAILABLE");
      const business = error as { getStatus?: () => number; message?: string };
      if (business.getStatus?.() === 409)
        failure = new ContractFailure(
          409,
          "OPERATION_REJECTED",
          business.message,
        );
      res.statusCode = failure.status;
      res.end(JSON.stringify({ code: failure.code, message: failure.message }));
    }
  });
}

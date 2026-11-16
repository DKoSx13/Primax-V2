import { createServer, type RequestListener } from "node:http";
import {
  createServer as createSecureServer,
  type ServerOptions,
} from "node:https";
import type { ServiceTransport } from "./service-transport";
import { Request } from "express";
import { ConsumerAuthenticator } from "./auth";
import { ConsumerOperations, PrepareV2, ControlTarget } from "./intent";
import { ContractFailure, uuid } from "../remote/contract";

export function createConsumerServer(
  auth: ConsumerAuthenticator,
  operations: ConsumerOperations,
  enableV2 = false,
  enableControlVerify = false,
  secure?: { tls: ServerOptions; service: ServiceTransport },
) {
  const handler: RequestListener = async (req, res) => {
    res.setHeader("cache-control", "no-store");
    res.setHeader("content-type", "application/json");
    try {
      if (
        req.method !== "POST" ||
        ![
          "/consumer/v1/intents",
          "/consumer/v1/intents/execute",
          ...(enableV2 && enableControlVerify
            ? ["/consumer/v2/control/verify"]
            : []),
          ...(enableV2
            ? ["/consumer/v2/intents", "/consumer/v2/intents/execute"]
            : []),
        ].includes(req.url || "")
      )
        throw new ContractFailure(404, "NOT_FOUND");
      const service = secure
        ? await secure.service.authenticate(req)
        : undefined;
      const adapted = Object.assign(req, {
        path: req.url,
        originalUrl: req.url,
        header: (name: string) => {
          const v = req.headers[name.toLowerCase()];
          return typeof v === "string" ? v : undefined;
        },
      }) as unknown as Request;
      const actor = await auth.authenticate(adapted);
      let bytes = 0;
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 2048) throw new ContractFailure(413, "BODY_TOO_LARGE");
        chunks.push(Buffer.from(chunk));
      }
      let body: Record<string, unknown>;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString());
      } catch {
        throw new ContractFailure(400, "INVALID_INTENT");
      }
      if (req.url === "/consumer/v2/control/verify") {
        const fields = ["action", "stationId", "terminalId", "expiresAt"];
        if (!body || Array.isArray(body) || typeof body !== "object")
          throw new ContractFailure(400, "INVALID_TARGET");
        let target: ControlTarget | null = null;
        if (Object.keys(body).length) {
          if (
            Object.keys(body).length !== fields.length ||
            fields.some((k) => typeof body[k] !== "string") ||
            Object.keys(body).some((k) => !fields.includes(k))
          )
            throw new ContractFailure(400, "INVALID_TARGET");
          target = body as unknown as ControlTarget;
          await operations.verifyControl(actor, target);
        }
        res.statusCode = 200;
        res.end(
          JSON.stringify({
            version: 1,
            actor: { userId: actor.userId, authVersion: actor.authVersion },
            target,
          }),
        );
        return;
      }
      if (req.url === "/consumer/v2/intents") {
        const fields = [
          "callerOperationId",
          "action",
          "stationId",
          "terminalId",
          "expiresAt",
        ];
        if (
          !body ||
          Array.isArray(body) ||
          Object.keys(body).length !== fields.length ||
          fields.some((k) => typeof body[k] !== "string") ||
          Object.keys(body).some((k) => !fields.includes(k))
        )
          throw new ContractFailure(400, "INVALID_INTENT");
        const result = await operations.prepareV2(
          actor,
          body as unknown as PrepareV2,
        );
        res.statusCode = 200;
        res.end(JSON.stringify(result));
        return;
      }
      const field =
        req.url === "/consumer/v1/intents" ? "terminalId" : "intentId";
      if (
        !body ||
        Array.isArray(body) ||
        Object.keys(body).length !== 1 ||
        typeof body[field] !== "string" ||
        !uuid.test(body[field] as string)
      )
        throw new ContractFailure(400, "INVALID_INTENT");
      const result =
        field === "terminalId"
          ? await operations.prepare(actor, body[field] as string)
          : await operations.execute(
              actor,
              body[field] as string,
              service?.stationId,
            );
      res.statusCode = 200;
      res.end(JSON.stringify(result));
    } catch (error) {
      const known = error as { getStatus?: () => number; message?: string };
      const status =
        error instanceof ContractFailure
          ? error.status
          : known?.getStatus?.() || 503;
      res.statusCode = status;
      res.end(
        JSON.stringify({
          code:
            error instanceof ContractFailure
              ? error.code
              : status === 503
                ? "CONSUMER_UNAVAILABLE"
                : "ACCESS_REJECTED",
        }),
      );
    }
  };
  return secure
    ? createSecureServer({ ...secure.tls, minVersion: "TLSv1.2" }, handler)
    : createServer(handler);
}

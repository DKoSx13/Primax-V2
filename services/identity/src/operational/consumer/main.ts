import "reflect-metadata";
import { readFileSync } from "node:fs";
import { ServiceTransport } from "./service-transport";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../persistence/compatibility-db";
import { RemoteOperationalSessions } from "../remote/http-client";
import { ConsumerOperations } from "./intent";
import { PrismaConsumerJournal } from "./journal";
import { ConsumerAuthenticator } from "./auth";
import { createConsumerServer } from "./server";
import { uuid } from "../remote/contract";
async function main() {
  if (
    process.env.IDENTITY_CONSUMER_LAB !== "enabled" ||
    process.env.IDENTITY_RUNTIME_PROFILE !== "synthetic"
  )
    throw Error("Synthetic consumer opt-in required");
  const url = new URL(String(process.env.IDENTITY_COMPAT_DATABASE_URL)),
    station = String(process.env.KIOSK_STATION_ID);
  if (
    url.hostname !== "127.0.0.1" ||
    url.pathname !== "/synthetic" ||
    !uuid.test(station) ||
    String(process.env.JWT_SECRET || "").length < 32
  )
    throw Error("Synthetic configuration required");
  const config = new ConfigService({ ...process.env, APP_MODE: "local" }),
    db = new PrismaService(config);
  const server = createConsumerServer(
    new ConsumerAuthenticator(db, config),
    new ConsumerOperations(
      new PrismaConsumerJournal(db, station),
      new RemoteOperationalSessions(
        String(process.env.OPERATIONAL_ORIGIN),
        String(process.env.OPERATIONAL_API_KEY),
      ),
    ),
    process.env.IDENTITY_CONSUMER_V2_LAB === "enabled",
    process.env.IDENTITY_CONTROL_VERIFY_LAB === "enabled",
    process.env.IDENTITY_SERVICE_TLS_LAB === "enabled"
      ? {
          tls: {
            key: readFileSync(String(process.env.IDENTITY_TLS_KEY_FILE)),
            cert: readFileSync(String(process.env.IDENTITY_TLS_CERT_FILE)),
          },
          service: new ServiceTransport(db, station),
        }
      : undefined,
  );
  await db.$connect();
  await new Promise<void>((resolve) =>
    server.listen(Number(process.env.PORT), "127.0.0.1", resolve),
  );
  let stopping = false;
  async function stop() {
    if (stopping) return;
    stopping = true;
    server.close();
    server.closeAllConnections();
    await db.$disconnect();
  }
  process.on("SIGTERM", () => void stop());
  process.on("SIGINT", () => void stop());
}
void main().catch(() => {
  console.error("Synthetic consumer startup failed");
  process.exitCode = 1;
});

import "reflect-metadata";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../persistence/compatibility-db";
import { DurableOperationalProvider } from "./receipt-provider";
import { createOperationalServer } from "./http-server";
import { uuid } from "./contract";

async function main() {
  if (
    process.env.IDENTITY_RUNTIME_PROFILE !== "synthetic" ||
    process.env.IDENTITY_RECEIPT_LAB !== "enabled"
  )
    throw Error("Synthetic receipt opt-in required");
  const url = new URL(String(process.env.IDENTITY_COMPAT_DATABASE_URL));
  if (url.hostname !== "127.0.0.1" || url.pathname !== "/synthetic")
    throw Error("Synthetic PostgreSQL required");
  const key = String(process.env.OPERATIONAL_RECEIPT_KEY || ""),
    stationId = String(process.env.KIOSK_STATION_ID || "");
  if (!/^[a-f0-9]{64}$/.test(key) || !uuid.test(stationId))
    throw Error("Invalid provider configuration");
  const db = new PrismaService(
    new ConfigService({ IDENTITY_COMPAT_DATABASE_URL: url.href }),
  );
  const server = createOperationalServer(
    new DurableOperationalProvider(db, Buffer.from(key, "hex")),
    {
      apiKey: String(process.env.OPERATIONAL_API_KEY),
      callerId: "identity-lab",
      stationId,
    },
  );
  await db.$connect();
  await new Promise<void>((resolve) =>
    server.listen(Number(process.env.PORT), "127.0.0.1", resolve),
  );
  let stopping = false;
  async function close() {
    if (stopping) return;
    stopping = true;
    server.close();
    server.closeAllConnections();
    await db.$disconnect();
  }
  process.on("SIGTERM", () => void close());
  process.on("SIGINT", () => void close());
}
void main().catch(() => {
  console.error("Synthetic operational provider startup failed");
  process.exitCode = 1;
});

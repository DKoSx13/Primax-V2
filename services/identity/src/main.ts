import "reflect-metadata";
import { Global, Module } from "@nestjs/common";
import { NestFactory, APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AuthModule } from "./compatibility/auth/auth.module";
import { MembershipsModule } from "./compatibility/memberships/memberships.module";
import { VehiclesModule } from "./compatibility/vehicles/vehicles.module";
import { HealthModule } from "./compatibility/health/health.module";
import { setupApp } from "./compatibility/setup-app";
import { validateEnvironment } from "./compatibility/config/environment";
import { IdentityDatabase } from "./persistence/identity-db";
import { PrismaService } from "./persistence/compatibility-db";
import { CompatibilityPort } from "./adapters/compatibility-port";
import { RemoteFinancialReads } from "./adapters/financial-reads";
import { AlertsService } from "./adapters/alerts.service";

@Global()
@Module({
  providers: [
    IdentityDatabase,
    PrismaService,
    CompatibilityPort,
    RemoteFinancialReads,
    AlertsService,
  ],
  exports: [
    IdentityDatabase,
    PrismaService,
    CompatibilityPort,
    RemoteFinancialReads,
    AlertsService,
  ],
})
class Dependencies {}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      validate: (env) => {
        if (env.IDENTITY_RUNTIME_PROFILE !== "synthetic")
          throw Error("Only synthetic runtime authorized");
        for (const key of [
          "IDENTITY_DATABASE_URL",
          "IDENTITY_COMPAT_DATABASE_URL",
        ]) {
          const url = new URL(String(env[key]));
          if (url.hostname !== "127.0.0.1" || url.pathname !== "/synthetic")
            throw Error("Only loopback synthetic PostgreSQL allowed");
        }
        const bridge = new URL(String(env.IDENTITY_COMPAT_URL));
        if (
          bridge.origin !== env.IDENTITY_COMPAT_URL ||
          bridge.hostname !== "127.0.0.1" ||
          bridge.protocol !== "http:"
        )
          throw Error("Invalid synthetic bridge");
        if (String(env.IDENTITY_COMPAT_KEY ?? "").length < 32)
          throw Error("Compatibility key required");
        return validateEnvironment({
          ...env,
          DATABASE_URL: env.IDENTITY_DATABASE_URL,
        });
      },
    }),
    Dependencies,
    AuthModule,
    MembershipsModule,
    VehiclesModule,
    HealthModule,
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 120,
        skipIf: (ctx) =>
          Boolean(ctx.switchToHttp().getRequest().headers["x-kiosk-signature"]),
      },
    ]),
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
class IdentityRuntime {}

async function main() {
  const app = await NestFactory.create(IdentityRuntime, { bodyParser: false });
  setupApp(app);
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT ?? 3000), "127.0.0.1");
}
void main().catch(() => {
  console.error("Identity runtime startup failed");
  process.exitCode = 1;
});

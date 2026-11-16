// Opt-in lab composition. Never imported by a production entrypoint.
const { createRequire } = require("node:module");
const path = require("node:path");
const load = createRequire(
  path.resolve(__dirname, "../../Backend/package.json"),
);
if (!/^primax-m5-[a-z0-9-]+$/.test(process.env.IDENTITY_SYNTHETIC_LAB || ""))
  throw Error("Synthetic lab marker required");
const url = new URL(process.env.DATABASE_URL);
if (url.hostname !== "127.0.0.1" || url.pathname !== "/synthetic")
  throw Error("Only loopback synthetic database allowed");
load("reflect-metadata");
const { Module } = load("@nestjs/common");
const { NestFactory, APP_GUARD } = load("@nestjs/core");
const { ConfigModule } = load("@nestjs/config");
const { ThrottlerModule, ThrottlerGuard } = load("@nestjs/throttler");
const compiled = (file) => load("./dist/src/" + file);
const { validateEnvironment } = compiled("config/environment");
class IdentityLab {}
Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      validate: validateEnvironment,
    }),
    compiled("prisma/prisma.module").PrismaModule,
    compiled("identity-adapters/identity-http.module").IdentityHttpModule,
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
})(IdentityLab);
(async () => {
  const app = await NestFactory.create(IdentityLab, { bodyParser: false });
  compiled("setup-app").setupApp(app);
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT), "127.0.0.1");
})().catch(() => {
  console.error("Synthetic Identity composition failed");
  process.exitCode = 1;
});

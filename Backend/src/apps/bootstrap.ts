import 'reflect-metadata';
import { Logger, Module, Type } from '@nestjs/common';
import { NestFactory, APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { validateEnvironment } from '../config/environment';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { AlertsModule } from '../alerts/alerts.module';
import { AuthCoreModule } from '../auth/auth.module';
import { HealthModule } from '../health/health.module';
import { setupApp } from '../setup-app';
import { randomUUID } from 'node:crypto';
import { Request, Response, NextFunction } from 'express';

/** Each entry point supplies only its business modules. No AppModule import. */
export async function bootstrapDomain(name: string, domains: Type<unknown>[]) {
  @Module({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
      PrismaModule, AlertsModule, AuthCoreModule, HealthModule,
      ThrottlerModule.forRoot([{ ttl: 60000, limit: 120,
        skipIf: ctx => Boolean(ctx.switchToHttp().getRequest().headers['x-kiosk-signature']),
      }]),
      ...domains,
    ],
    providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
  })
  class DomainApplication {}
  const app = await NestFactory.create(DomainApplication, { bodyParser: false });
  const config = app.get(ConfigService);
  const logger = new Logger(name);
  // Resolve existing station by stable business code; never change persisted IDs.
  if (config.get('APP_MODE') === 'local' && !config.get('KIOSK_STATION_ID')) {
    const station = await app.get(PrismaService).station.findUnique({
      where: { code: config.get('KIOSK_STATION_CODE', 'PRIMAX-SUR') },
    });
    if (!station) throw new Error('Demo station missing; run automatic seed first');
    config.set('KIOSK_STATION_ID', station.id);
  }
  app.use((req: Request, res: Response, next: NextFunction) => {
    const incoming = req.header('x-request-id') || '';
    const id = /^[a-zA-Z0-9-]{1,80}$/.test(incoming) ? incoming : randomUUID();
    res.setHeader('X-Request-Id', id);
    res.setHeader('X-Service-Name', name);
    res.on('finish', () => {
      if (res.statusCode >= 500) logger.error(JSON.stringify({ requestId: id, status: res.statusCode }));
    });
    next();
  });
  setupApp(app);
  app.enableShutdownHooks();
  await app.listen(config.getOrThrow<number>('PORT'), '0.0.0.0');
}

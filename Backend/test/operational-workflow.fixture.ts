import 'reflect-metadata';
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../src/prisma/prisma.service';
import { KioskStore } from '../src/kiosk/redis-store';
import { KioskService } from '../src/kiosk/kiosk.service';
import { AlertsService } from '../src/alerts/alerts.service';
import { OperationsModule } from '../src/operations/operations.module';
import { AssistanceModule } from '../src/assistance/assistance.module';
import { TransactionsModule } from '../src/transactions/transactions.module';
import { setupApp } from '../src/setup-app';

/** Actual modules, DI, AccessGuard and engines; no operational bootstrap/init/seed. */
export async function operationalFixture(db: PrismaService, config: ConfigService, store: KioskStore, jwt: JwtService) {
  @Global()
  @Module({ providers: [{ provide: PrismaService, useValue: db }, { provide: ConfigService, useValue: config },
    { provide: AlertsService, useValue: new AlertsService(db) }], exports: [PrismaService, ConfigService, AlertsService] })
  class Dependencies {}
  const kiosk = new KioskService(config, store, db);
  const module = await Test.createTestingModule({ imports: [Dependencies, OperationsModule, AssistanceModule, TransactionsModule] })
    .overrideProvider(KioskStore).useValue(store)
    .overrideProvider(KioskService).useValue(kiosk)
    .overrideProvider(JwtService).useValue(jwt).compile();
  const app = module.createNestApplication({ logger: false });
  setupApp(app); await app.init();
  // An explicit listener avoids Supertest close-callback coupling between racing requests.
  await app.listen(0, '127.0.0.1');
  return { app, module, jwt, kiosk };
}

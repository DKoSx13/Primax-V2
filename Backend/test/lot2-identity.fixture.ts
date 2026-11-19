import 'reflect-metadata';
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../src/prisma/prisma.service';
import { KioskStore } from '../src/kiosk/redis-store';
import { KioskService } from '../src/kiosk/kiosk.service';
import { AuthModule } from '../src/auth/auth.module';
import { MembershipsModule } from '../src/memberships/memberships.module';
import { VehiclesModule } from '../src/vehicles/vehicles.module';
import { AlertsModule } from '../src/alerts/alerts.module';
import { FuelsModule } from '../src/fuels/fuels.module';
import { StationsModule } from '../src/stations/stations.module';
import { BenefitsModule } from '../src/benefits/benefits.module';
import { PrivateCatalogController } from '../src/catalog-reader/private-catalog.controller';
import { setupApp } from '../src/setup-app';

export async function lot2Fixture(db: PrismaService, config: ConfigService, store: KioskStore, jwt: JwtService) {
  @Global()
  @Module({ providers: [{ provide: PrismaService, useValue: db }, { provide: ConfigService, useValue: config }], exports: [PrismaService, ConfigService] })
  class Dependencies {}
  const kiosk = new KioskService(config, store, db);
  const module = await Test.createTestingModule({ imports: [Dependencies, AlertsModule, AuthModule, MembershipsModule, VehiclesModule, FuelsModule, StationsModule, BenefitsModule], controllers: [PrivateCatalogController] })
    .overrideProvider(KioskStore).useValue(store).overrideProvider(KioskService).useValue(kiosk).overrideProvider(JwtService).useValue(jwt).compile();
  const app = module.createNestApplication({ logger: false }); setupApp(app); await app.init(); await app.listen(0, '127.0.0.1');
  return { app, module, jwt, kiosk };
}

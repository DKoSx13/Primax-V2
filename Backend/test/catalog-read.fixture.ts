import 'reflect-metadata';
import { Global, Module, UnauthorizedException } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'node:crypto';
import type { Actor } from '../src/auth/access';
import { AccessGuard } from '../src/auth/access.guard';
import { PrismaService } from '../src/prisma/prisma.service';
import { CatalogReader } from '../src/catalog-reader/catalog-reader';
import { PrivateCatalogController } from '../src/catalog-reader/private-catalog.controller';
import { FuelsController } from '../src/fuels/fuels.controller';
import { FuelsService } from '../src/fuels/fuels.service';
import { FuelsRepository } from '../src/fuels/fuels.repository';
import { FuelsModule } from '../src/fuels/fuels.module';
import { StationsController } from '../src/stations/stations.controller';
import { StationsService } from '../src/stations/stations.service';
import { StationsRepository } from '../src/stations/stations.repository';
import { StationsModule } from '../src/stations/stations.module';
import { BenefitsController } from '../src/benefits/benefits.controller';
import { BenefitsService } from '../src/benefits/benefits.service';
import { BenefitsRepository } from '../src/benefits/benefits.repository';
import { BenefitsModule } from '../src/benefits/benefits.module';
import { UsersRepository } from '../src/users/users.repository';
import { UsersService } from '../src/users/users.service';
import { setupApp } from '../src/setup-app';

/** Test composition only; never imported by an operational entrypoint. */
export async function catalogReadFixture(db: PrismaService, legacy: boolean, options: {
  reader?: CatalogReader; kioskAuthorize?: () => Promise<Actor>;
} = {}) {
  const config = new ConfigService({ APP_MODE: 'production', CORS_ORIGINS: 'http://localhost' });
  const jwt = new JwtService({ secret: randomBytes(48).toString('hex'),
    signOptions: { expiresIn: '1h', issuer: 'primax-v6', audience: 'primax-prime', algorithm: 'HS256' },
    verifyOptions: { issuer: 'primax-v6', audience: 'primax-prime', algorithms: ['HS256'] } });
  const users = new UsersService(new UsersRepository(db));
  const kiosk = { authorize: options.kioskAuthorize || (async () => { throw new UnauthorizedException('Synthetic kiosk rejected'); }) };
  const guard = new AccessGuard(new Reflector(), config, jwt, users, kiosk as never, db);
  const reader = options.reader || new CatalogReader(config);
  const fuels = new FuelsRepository(db), stations = new StationsRepository(db), benefits = new BenefitsRepository(db);
  // Frozen selectors preceding the extractions. Controllers/repositories are unchanged.
  @Module({ controllers: [FuelsController, StationsController, BenefitsController], providers: [
    { provide: FuelsService, useValue: {
      list: () => reader.enabled() ? reader.read('fuels') : fuels.list(),
      inventory: () => reader.enabled() ? reader.read('fuels/inventory') : fuels.inventory(),
    } },
    { provide: StationsService, useValue: { list: () => reader.enabled() ? reader.read('stations') : stations.list() } },
    { provide: BenefitsService, useValue: { list: () => reader.enabled() ? reader.read('benefits') : benefits.list() } },
  ], exports: [FuelsService, StationsService] })
  class LegacyCatalog {}
  @Global()
  @Module({ providers: [{ provide: PrismaService, useValue: db }, { provide: ConfigService, useValue: config }],
    exports: [PrismaService, ConfigService] })
  class Dependencies {}
  const module = await Test.createTestingModule({
    imports: [Dependencies, ...(legacy ? [LegacyCatalog] : [FuelsModule, StationsModule, BenefitsModule])],
    controllers: [PrivateCatalogController], providers: [{ provide: APP_GUARD, useValue: guard }],
  }).overrideProvider(CatalogReader).useValue(reader).compile();
  const app = module.createNestApplication({ logger: false }); setupApp(app); await app.init();
  return { app, token: (id: string, version = 0) => jwt.signAsync({ sub: id, ver: version }) };
}

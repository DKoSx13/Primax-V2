import 'reflect-metadata';
import { Global, Module, UnauthorizedException } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'node:crypto';
import { AccessGuard } from '../src/auth/access.guard';
import { PrismaService } from '../src/prisma/prisma.service';
import { UsersService } from '../src/users/users.service';
import { UsersRepository } from '../src/users/users.repository';
import { KioskService } from '../src/kiosk/kiosk.service';
import { VehiclesController } from '../src/vehicles/vehicles.controller';
import { VehiclesService } from '../src/vehicles/vehicles.service';
import { VehiclesRepository } from '../src/vehicles/vehicles.repository';
import { VehiclesModule } from '../src/vehicles/vehicles.module';
import { setupApp } from '../src/setup-app';
import type { Actor } from '../src/identity-core/domain';
import type { PaginationDto } from '../src/common/pagination.dto';

/** Test composition only; it does not import or replace AuthCoreModule. */
export async function vehicleListFixture(db: PrismaService, legacy: boolean, options: {
  config?: ConfigService; kiosk?: KioskService;
} = {}) {
  const config = options.config || new ConfigService({ APP_MODE: 'production', CORS_ORIGINS: 'http://localhost' });
  const jwt = new JwtService({ secret: randomBytes(48).toString('hex'),
    signOptions: { expiresIn: '1h', issuer: 'primax-v6', audience: 'primax-prime', algorithm: 'HS256' },
    verifyOptions: { issuer: 'primax-v6', audience: 'primax-prime', algorithms: ['HS256'] } });
  const kiosk = options.kiosk || { authorize: async () => { throw new UnauthorizedException('Synthetic unauthorized session'); } } as unknown as KioskService;
  const guard = new AccessGuard(new Reflector(), config, jwt, new UsersService(new UsersRepository(db)), kiosk, db);
  const repo = new VehiclesRepository(db);
  @Module({ controllers: [VehiclesController], providers: [{ provide: VehiclesService, useValue: {
    // Exact list selector at the reference commit; reuses the unchanged repository.
    list: (actor: Actor, query: PaginationDto) => actor.kind === 'member' ? repo.list(actor.userId, query) : [],
  } }] })
  class LegacyVehicleList {}
  @Global()
  @Module({ providers: [{ provide: PrismaService, useValue: db }, { provide: ConfigService, useValue: config }],
    exports: [PrismaService, ConfigService] })
  class Dependencies {}
  const module = await Test.createTestingModule({ imports: [Dependencies, legacy ? LegacyVehicleList : VehiclesModule],
    providers: [{ provide: APP_GUARD, useValue: guard }] }).compile();
  const app = module.createNestApplication({ logger: false }); setupApp(app); await app.init();
  return { app, jwt, token: (id: string, version = 0) => jwt.signAsync({ sub: id, ver: version }) };
}

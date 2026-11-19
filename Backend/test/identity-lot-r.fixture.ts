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
import { MembershipsModule } from '../src/memberships/memberships.module';
import { MembershipsController } from '../src/memberships/memberships.controller';
import { MembershipsService } from '../src/memberships/memberships.service';
import { VehiclesModule } from '../src/vehicles/vehicles.module';
import { setupApp } from '../src/setup-app';

/** Test composition only; it does not import or replace AuthCoreModule. */
export async function lotRFixture(db: PrismaService, legacy: boolean, options: {
  config?: ConfigService; kiosk?: KioskService; reference?: { membership: object; vehicle: object };
} = {}) {
  const config = options.config || new ConfigService({ APP_MODE: 'production', CORS_ORIGINS: 'http://localhost' });
  const jwt = new JwtService({ secret: randomBytes(48).toString('hex'),
    signOptions: { expiresIn: '1h', issuer: 'primax-v6', audience: 'primax-prime', algorithm: 'HS256' },
    verifyOptions: { issuer: 'primax-v6', audience: 'primax-prime', algorithms: ['HS256'] } });
  const kiosk = options.kiosk || { authorize: async () => { throw new UnauthorizedException('Synthetic unauthorized session'); } } as unknown as KioskService;
  const guard = new AccessGuard(new Reflector(), config, jwt, new UsersService(new UsersRepository(db)), kiosk, db);
  if (legacy && !options.reference) throw new Error('Frozen reference providers required');
  @Module({ controllers: [VehiclesController, MembershipsController], providers: [
    { provide: VehiclesService, useValue: options.reference?.vehicle },
    { provide: MembershipsService, useValue: options.reference?.membership },
  ] })
  class LegacyVehicleList {}
  @Global()
  @Module({ providers: [{ provide: PrismaService, useValue: db }, { provide: ConfigService, useValue: config }],
    exports: [PrismaService, ConfigService] })
  class Dependencies {}
  const module = await Test.createTestingModule({ imports: [Dependencies, ...(legacy ? [LegacyVehicleList] : [VehiclesModule, MembershipsModule])],
    providers: [{ provide: APP_GUARD, useValue: guard }] }).compile();
  const app = module.createNestApplication({ logger: false }); setupApp(app); await app.init();
  return { app, jwt, token: (id: string, version = 0) => jwt.signAsync({ sub: id, ver: version }) };
}

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
import { ControlCustomersController } from '../src/control/control-customers.controller';
import { ControlCustomersService } from '../src/control/control-customers.service';
import { AdministrativeListsModule } from '../services/administration/src/bootstrap/administrative-lists.module';
import { setupApp } from '../src/setup-app';

/** Focused HTTP test composition: actual controller, guard, pipe and new DI module. */
export async function administrativeFixture(db: PrismaService, reference?: object) {
  const config = new ConfigService({ APP_MODE: 'production', CORS_ORIGINS: 'http://localhost' });
  const jwt = new JwtService({ secret: randomBytes(48).toString('hex'),
    signOptions: { expiresIn: '1h', issuer: 'primax-v6', audience: 'primax-prime', algorithm: 'HS256' },
    verifyOptions: { issuer: 'primax-v6', audience: 'primax-prime', algorithms: ['HS256'] } });
  const kiosk = { authorize: async () => { throw new UnauthorizedException('Synthetic unauthorized session'); } } as unknown as KioskService;
  const guard = new AccessGuard(new Reflector(), config, jwt, new UsersService(new UsersRepository(db)), kiosk, db);
  @Global()
  @Module({ providers: [{ provide: PrismaService, useValue: db }, { provide: ConfigService, useValue: config }],
    exports: [PrismaService, ConfigService] })
  class Dependencies {}
  const module = await Test.createTestingModule({ imports: [Dependencies, ...(reference ? [] : [AdministrativeListsModule])],
    controllers: [ControlCustomersController], providers: [
      reference ? { provide: ControlCustomersService, useValue: reference } : ControlCustomersService,
      { provide: APP_GUARD, useValue: guard },
    ] }).compile();
  const app = module.createNestApplication({ logger: false }); setupApp(app); await app.init();
  return { app, jwt, token: (id: string, version = 0) => jwt.signAsync({ sub: id, ver: version }) };
}

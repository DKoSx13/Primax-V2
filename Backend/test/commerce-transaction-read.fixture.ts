import 'reflect-metadata';
import { Global, Module } from '@nestjs/common';
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
import { AlertsService } from '../src/alerts/alerts.service';
import { TransactionsController } from '../src/transactions/transactions.controller';
import { TransactionsService } from '../src/transactions/transactions.service';
import { TransactionsModule } from '../src/transactions/transactions.module';
import { setupApp } from '../src/setup-app';

/** Focused HTTP composition. Current arm uses the real TransactionsModule. */
export async function transactionReadFixture(db: PrismaService, config: ConfigService, kiosk: KioskService, reference?: object) {
  const jwt = new JwtService({ secret: randomBytes(48).toString('hex'),
    signOptions: { expiresIn: '1h', issuer: 'primax-v6', audience: 'primax-prime', algorithm: 'HS256' },
    verifyOptions: { issuer: 'primax-v6', audience: 'primax-prime', algorithms: ['HS256'] } });
  const guard = new AccessGuard(new Reflector(), config, jwt, new UsersService(new UsersRepository(db)), kiosk, db);
  @Global()
  @Module({ providers: [
    { provide: PrismaService, useValue: db }, { provide: ConfigService, useValue: config },
    { provide: AlertsService, useValue: { checkAuthorization: () => { throw new Error('Unexpected write route'); } } },
  ], exports: [PrismaService, ConfigService, AlertsService] })
  class Dependencies {}
  const module = await Test.createTestingModule({ imports: [Dependencies, ...(reference ? [] : [TransactionsModule])],
    controllers: reference ? [TransactionsController] : [], providers: [
      ...(reference ? [{ provide: TransactionsService, useValue: reference }] : []),
      { provide: APP_GUARD, useValue: guard },
    ] }).compile();
  const app = module.createNestApplication({ logger: false }); setupApp(app); await app.init();
  return { app, jwt, token: (id: string, version = 0) => jwt.signAsync({ sub: id, ver: version }) };
}

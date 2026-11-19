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
import { TransactionsModule } from '../src/transactions/transactions.module';
import { TransactionsService } from '../src/transactions/transactions.service';
import { TransactionsRepository } from '../src/transactions/transactions.repository';
import { PAYMENT_PROVIDER, PaymentProvider } from '../src/payments/payment-provider';
import { setupApp } from '../src/setup-app';

/** Real transaction module/engine, guard and alerts; no operational bootstrap. */
export async function orderFixture(db: PrismaService, config: ConfigService, kiosk: KioskService, provider?: PaymentProvider) {
  const jwt = new JwtService({ secret: randomBytes(48).toString('hex'),
    signOptions: { expiresIn: '1h', issuer: 'primax-v6', audience: 'primax-prime', algorithm: 'HS256' },
    verifyOptions: { issuer: 'primax-v6', audience: 'primax-prime', algorithms: ['HS256'] } });
  const guard = new AccessGuard(new Reflector(), config, jwt, new UsersService(new UsersRepository(db)), kiosk, db);
  @Global()
  @Module({ providers: [{ provide: PrismaService, useValue: db }, { provide: ConfigService, useValue: config },
    { provide: AlertsService, useValue: new AlertsService(db) }], exports: [PrismaService, ConfigService, AlertsService] })
  class Dependencies {}
  const builder = Test.createTestingModule({ imports: [Dependencies, TransactionsModule],
    providers: [{ provide: APP_GUARD, useValue: guard }] });
  if(provider) builder.overrideProvider(PAYMENT_PROVIDER).useValue(provider);
  const module = await builder.compile();
  const app = module.createNestApplication({ logger: false }); setupApp(app); await app.init();
  return { app, jwt, engine: module.get(TransactionsService), repository: module.get(TransactionsRepository), module };
}

import 'reflect-metadata';
import { Global, INestApplication, Module, UnauthorizedException } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import request from 'supertest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import ts from 'typescript';
import { AccessGuard } from '../auth/access.guard';
import { CatalogReader } from '../catalog-reader/catalog-reader';
import { PrivateCatalogController } from '../catalog-reader/private-catalog.controller';
import { PrismaService } from '../prisma/prisma.service';
import { StationsService } from '../stations/stations.service';
import { setupApp } from '../setup-app';
import { FuelsController } from './fuels.controller';
import { FuelsModule } from './fuels.module';
import { FuelsRepository } from './fuels.repository';
import { FuelsService } from './fuels.service';
import { ListFuels } from '../../services/catalog/src/application/use-cases/list-fuels';
import { ExistingFuelListReader } from '../../services/catalog/src/adapters/outbound/existing-fuel-list.reader';

const stationA = '11111111-1111-4111-8111-111111111111';
const stationB = '22222222-2222-4222-8222-222222222222';
const rows = [
  { id: '33333333-3333-4333-8333-333333333333', code: 'DIESEL', name: 'Synthetic Diesel',
    pricePerGallon: new Prisma.Decimal('21.30'), active: true,
    createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date('2026-01-02T00:00:00Z') },
  { id: '44444444-4444-4444-8444-444444444444', code: 'PREMIUM', name: 'Synthetic Premium',
    pricePerGallon: new Prisma.Decimal('23.50'), active: true,
    createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date('2026-01-02T00:00:00Z') },
];

function fixture(http = false) {
  const db = {
    fuel: { findMany: jest.fn().mockResolvedValue(rows) },
    fuelInventory: { findMany: jest.fn().mockResolvedValue([
      { stationId: stationA }, { stationId: stationB },
    ]) },
  };
  const repo = new FuelsRepository(db as unknown as PrismaService);
  const reader = { enabled: jest.fn(() => http), read: jest.fn().mockResolvedValue(rows) };
  // Frozen behavior of FuelsService.list at the reference commit.
  const legacy = () => reader.enabled() ? reader.read('fuels') : repo.list();
  const current = new ListFuels(new ExistingFuelListReader(repo, reader as unknown as CatalogReader));
  return { db, repo, reader, legacy, current };
}

describe('single Catalog read extraction: before/after', () => {
  it.each([false, true])('preserves the same result object and selected dependency (http=%s)', async http => {
    const f = fixture(http);
    expect(await f.legacy()).toBe(rows);
    expect(await f.current.execute()).toBe(rows);
    expect(f.db.fuel.findMany).toHaveBeenCalledTimes(http ? 0 : 2);
    expect(f.reader.read).toHaveBeenCalledTimes(http ? 2 : 0);
    if (http) expect(f.reader.read).toHaveBeenCalledWith('fuels');
    else expect(f.db.fuel.findMany).toHaveBeenCalledWith({ where: { active: true }, orderBy: { code: 'asc' } });
    expect(f.db.fuelInventory.findMany).not.toHaveBeenCalled();
  });

  it.each([false, true])('preserves empty arrays and dependency failures without fallback/retry (http=%s)', async http => {
    const f = fixture(http);
    const dependency = http ? f.reader.read : f.db.fuel.findMany;
    dependency.mockResolvedValue([]);
    expect(await f.legacy()).toEqual([]);
    expect(await f.current.execute()).toEqual([]);
    const error = new Error('synthetic unavailable');
    dependency.mockRejectedValue(error);
    await expect(f.legacy()).rejects.toBe(error);
    await expect(f.current.execute()).rejects.toBe(error);
    expect(dependency).toHaveBeenCalledTimes(4);
    expect(http ? f.db.fuel.findMany : f.reader.read).not.toHaveBeenCalled();
  });

  it('does not normalize decimal/date values, mutate rows or discard additional fields', async () => {
    const result = Object.freeze([{ ...rows[0], futureReadField: 'preserved' }]);
    const query = new ListFuels({ list: async () => result as unknown as typeof rows });
    expect(await query.execute()).toBe(result);
    expect(JSON.stringify(await query.execute())).toBe(JSON.stringify(result));
    expect(result[0].pricePerGallon).toBe(rows[0].pricePerGallon);
    expect(result[0].createdAt).toBe(rows[0].createdAt);
  });
});

async function httpFixture(legacy: boolean, http: boolean) {
  const f = fixture(http);
  const config = new ConfigService({ APP_MODE: 'production', CORS_ORIGINS: 'http://localhost' });
  const kiosk = { authorize: jest.fn(async () => { throw new UnauthorizedException('Synthetic signed request rejected'); }) };
  const guard = new AccessGuard(new Reflector(), config, {} as never, {} as never, kiosk as never, f.db as never);
  @Global()
  @Module({ providers: [{ provide: PrismaService, useValue: f.db }, { provide: ConfigService, useValue: config }],
    exports: [PrismaService, ConfigService] })
  class FixtureDependencies {}
  @Module({ controllers: [FuelsController], providers: [{ provide: FuelsService, useValue: {
    list: f.legacy,
    inventory: () => f.reader.enabled() ? f.reader.read('fuels/inventory') : f.repo.inventory(),
  } }], exports: [FuelsService] })
  class LegacyFuelsModule {}
  const module = await Test.createTestingModule({
    imports: [FixtureDependencies, legacy ? LegacyFuelsModule : FuelsModule],
    controllers: [PrivateCatalogController],
    providers: [
      { provide: StationsService, useValue: { list: async () => [] } },
      { provide: APP_GUARD, useValue: guard },
    ],
  }).overrideProvider(CatalogReader).useValue(f.reader).compile();
  const app = module.createNestApplication({ logger: false });
  setupApp(app);
  await app.init();
  return { ...f, app, kiosk };
}

describe('real Nest composition and HTTP parity, mocked persistence only', () => {
  const apps: INestApplication[] = [];
  afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())); });

  it.each([false, true])('preserves GET JSON, empty results, public access and method (http=%s)', async http => {
    const old = await httpFixture(true, http), current = await httpFixture(false, http);
    apps.push(old.app, current.app);
    for (const f of [old, current]) {
      const response = await request(f.app.getHttpServer()).get('/api/v1/fuels?stationId=ignored').expect(200);
      expect(response.body).toEqual(JSON.parse(JSON.stringify(rows)));
      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(f.kiosk.authorize).not.toHaveBeenCalled();
      if (!http) expect(f.db.fuel.findMany).toHaveBeenCalledWith({ where: { active: true }, orderBy: { code: 'asc' } });
      f.db.fuel.findMany.mockResolvedValue([]);
      f.reader.read.mockResolvedValue([]);
      await request(f.app.getHttpServer()).get('/api/v1/fuels').expect(200, []);
      await request(f.app.getHttpServer()).post('/api/v1/fuels').expect(404);
    }
  });

  it('retains existing guard rejection before invoking the fuel query', async () => {
    for (const legacy of [true, false]) {
      const f = await httpFixture(legacy, false); apps.push(f.app);
      await request(f.app.getHttpServer()).get('/api/v1/fuels').set('x-kiosk-signature', 'synthetic-invalid').expect(401);
      expect(f.kiosk.authorize).toHaveBeenCalledTimes(1);
      expect(f.db.fuel.findMany).not.toHaveBeenCalled();
      await request(f.app.getHttpServer()).get('/api/v1/control/catalog/inventory').expect(401);
      await request(f.app.getHttpServer()).get('/api/v1/control/catalog/inventory').set('x-kiosk-signature', 'synthetic-invalid').expect(403);
      expect(f.db.fuelInventory.findMany).not.toHaveBeenCalled();
    }
  });

  it('retains inventory selection and its no-store header, without invoking the extracted query', async () => {
    for (const legacy of [true, false]) {
      const f = await httpFixture(legacy, false); apps.push(f.app);
      const response = await request(f.app.getHttpServer()).get('/api/v1/fuels/inventory').expect(200);
      expect(response.body).toEqual([{ stationId: stationA }, { stationId: stationB }]);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(f.db.fuelInventory.findMany).toHaveBeenCalledWith({ include: { fuel: true, station: true } });
      expect(f.db.fuel.findMany).not.toHaveBeenCalled();
    }
  });

  it('retains HTTP dependency failure status and error envelope', async () => {
    for (const legacy of [true, false]) {
      const f = await httpFixture(legacy, true); apps.push(f.app);
      f.reader.read.mockImplementation(() => new CatalogReader(new ConfigService({})).read('fuels'));
      const response = await request(f.app.getHttpServer()).get('/api/v1/fuels').expect(503);
      expect(response.body).toMatchObject({ statusCode: 503, message: 'Catalog configuration missing', path: '/api/v1/fuels' });
      expect(response.body.timestamp).toEqual(expect.any(String));
      expect(f.reader.read).toHaveBeenCalledTimes(1);
      expect(f.db.fuel.findMany).not.toHaveBeenCalled();
    }
  });

  it('retains authenticated station scope and rejects a kiosk without a station', async () => {
    for (const legacy of [true, false]) {
      const f = await httpFixture(legacy, false); apps.push(f.app);
      f.kiosk.authorize.mockImplementationOnce(async () => ({ kind: 'kiosk', stationId: stationA }) as never);
      await request(f.app.getHttpServer()).get('/api/v1/fuels/inventory?stationId=' + stationB)
        .set('x-kiosk-signature', 'synthetic-authorized').expect(200, [{ stationId: stationA }]);
      f.kiosk.authorize.mockImplementationOnce(async () => ({ kind: 'kiosk' }) as never);
      await request(f.app.getHttpServer()).get('/api/v1/fuels/inventory')
        .set('x-kiosk-signature', 'synthetic-authorized').expect(403);
      expect(f.db.fuel.findMany).not.toHaveBeenCalled();
    }
  });
});

it('application imports only its own ports/models; domain has no framework dependencies', () => {
  const root = resolve(__dirname, '../../services/catalog/src');
  const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? walk(resolve(dir, entry.name)) : [resolve(dir, entry.name)]);
  for (const layer of ['application', 'domain']) {
    for (const file of walk(resolve(root, layer)).filter(file => file.endsWith('.ts'))) {
      const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
      const inspect = (node: ts.Node) => {
        if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
          const specifier = node.moduleSpecifier;
          if (specifier && ts.isStringLiteral(specifier)) {
            expect(specifier.text.startsWith('.')).toBe(true);
            expect(resolve(file, '..', specifier.text).startsWith(resolve(root, layer) + sep)).toBe(true);
          }
        }
        ts.forEachChild(node, inspect);
      };
      inspect(source);
    }
  }
});

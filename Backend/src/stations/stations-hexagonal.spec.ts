import 'reflect-metadata';
import { Global, Module, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { Actor } from '../auth/access';
import { AccessGuard } from '../auth/access.guard';
import { CatalogReader } from '../catalog-reader/catalog-reader';
import { PrivateCatalogController } from '../catalog-reader/private-catalog.controller';
import { FuelsService } from '../fuels/fuels.service';
import { PrismaService } from '../prisma/prisma.service';
import { setupApp } from '../setup-app';
import { StationsController } from './stations.controller';
import { StationsRepository } from './stations.repository';
import { StationsService } from './stations.service';
import { StationsModule } from './stations.module';
import { ListStations } from '../../services/catalog/src/application/use-cases/list-stations';
import { ExistingStationListReader } from '../../services/catalog/src/adapters/outbound/existing-station-list.reader';

const a = '11111111-1111-4111-8111-111111111111';
const b = '22222222-2222-4222-8222-222222222222';
const inactive = '33333333-3333-4333-8333-333333333333';
const absent = '44444444-4444-4444-8444-444444444444';
const userId = '55555555-5555-4555-8555-555555555555';
const rows = [a, b].map((id, i) => ({ id, code: 'SYNTHETIC-' + i,
  name: 'Synthetic station ' + i, address: 'Synthetic test location ' + i, active: true,
  createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date('2026-01-02T00:00:00Z') }));
const jsonRows = JSON.parse(JSON.stringify(rows));

function fixture(http: boolean) {
  const db = { station: { findMany: jest.fn().mockResolvedValue(rows) } };
  const repo = new StationsRepository(db as unknown as PrismaService);
  const reader = { enabled: jest.fn(() => http), read: jest.fn().mockResolvedValue(jsonRows) };
  // Original selector at a6cf8c6; the repository and controllers remain unchanged.
  const legacy = () => reader.enabled() ? reader.read('stations') : repo.list();
  const current = new ListStations(new ExistingStationListReader(repo, reader as unknown as CatalogReader));
  return { db, repo, reader, legacy, current };
}

describe('station read through a port', () => {
  it.each([false, true])('preserves values, object identity, ordering and selected dependency (http=%s)', async http => {
    const f = fixture(http), expected = http ? jsonRows : rows;
    expect(await f.legacy()).toBe(expected);
    expect(await f.current.execute()).toBe(expected);
    expect(f.db.station.findMany).toHaveBeenCalledTimes(http ? 0 : 2);
    expect(f.reader.read).toHaveBeenCalledTimes(http ? 2 : 0);
    if (http) expect(f.reader.read).toHaveBeenCalledWith('stations');
    else expect(f.db.station.findMany).toHaveBeenCalledWith({ where: { active: true }, orderBy: { code: 'asc' } });
  });

  it.each([false, true])('preserves empty results and errors with no retry/fallback (http=%s)', async http => {
    const f = fixture(http), dependency = http ? f.reader.read : f.db.station.findMany;
    dependency.mockResolvedValue([]);
    expect(await f.legacy()).toEqual([]);
    expect(await f.current.execute()).toEqual([]);
    const error = new Error('Synthetic dependency failure');
    dependency.mockRejectedValue(error);
    await expect(f.legacy()).rejects.toBe(error);
    await expect(f.current.execute()).rejects.toBe(error);
    expect(dependency).toHaveBeenCalledTimes(4);
    expect(http ? f.db.station.findMany : f.reader.read).not.toHaveBeenCalled();
  });

  it('uses a pure port without mutation, serialization or field projection', async () => {
    const result = Object.freeze([{ ...rows[0], extraReadField: 'preserved' }]);
    const query = new ListStations({ list: async () => result as unknown as typeof rows });
    expect(await query.execute()).toBe(result);
    expect((await query.execute())[0].createdAt).toBe(rows[0].createdAt);
    expect(JSON.stringify(await query.execute())).toBe(JSON.stringify(result));
  });
});

function accessState() {
  return { global: false, active: true, version: 1, payloadVersion: 1, approved: true, validToken: true,
    permissions: ['ADMIN_CONTROL_ACCESS', 'ADMIN_INVENTORY_VIEW'], stations: [a],
    kioskActor: { kind: 'kiosk', stationId: a } as Actor, kioskRejected: false };
}

async function httpFixture(legacy: boolean, http: boolean) {
  const f = fixture(http), state = accessState();
  const config = new ConfigService({ APP_MODE: 'production', CORS_ORIGINS: 'http://localhost' });
  const db = { ...f.db,
    userPermissionGrant: { findFirst: jest.fn(async () => state.global ? { id: 'synthetic-grant' } : null) },
    adminControlAccount: { findUnique: jest.fn(async () => ({ status: state.approved ? 'APPROVED' : 'PENDING',
      emailVerifiedAt: new Date('2026-01-01T00:00:00Z'), role: 'ENCARGADO', stations: state.stations.map(stationId => ({ stationId })) })) },
    adminControlGrant: { findMany: jest.fn(async () => state.permissions.map(permission => ({ permission }))) },
  };
  const jwt = { verifyAsync: jest.fn(async () => {
    if (!state.validToken) throw new Error('Synthetic invalid token');
    return { sub: userId, ver: state.payloadVersion };
  }) };
  const users = { findById: jest.fn(async () => ({ id: userId, active: state.active, authVersion: state.version })) };
  const kiosk = { authorize: jest.fn(async () => {
    if (state.kioskRejected) throw new UnauthorizedException('Synthetic rejected kiosk');
    return state.kioskActor;
  }) };
  const guard = new AccessGuard(new Reflector(), config, jwt as never, users as never, kiosk as never, db as never);
  @Global()
  @Module({ providers: [{ provide: PrismaService, useValue: db }, { provide: ConfigService, useValue: config }],
    exports: [PrismaService, ConfigService] })
  class FixtureDependencies {}
  @Module({ controllers: [StationsController], providers: [{ provide: StationsService, useValue: { list: f.legacy } }],
    exports: [StationsService] })
  class LegacyStationsModule {}
  const module = await Test.createTestingModule({
    imports: [FixtureDependencies, legacy ? LegacyStationsModule : StationsModule],
    controllers: [PrivateCatalogController], providers: [
      { provide: FuelsService, useValue: { inventory: jest.fn(async () => { throw new Error('Outside this station test'); }) } },
      { provide: APP_GUARD, useValue: guard },
    ],
  }).overrideProvider(CatalogReader).useValue(f.reader).compile();
  const app = module.createNestApplication({ logger: false });
  setupApp(app); await app.init();
  function reset() {
    Object.assign(state, accessState());
    jest.clearAllMocks();
    f.db.station.findMany.mockReset().mockResolvedValue(rows);
    f.reader.read.mockReset().mockResolvedValue(jsonRows);
  }
  return { ...f, db, state, jwt, users, kiosk, app, legacy, http, reset };
}

type Case = { name: string; path?: string; auth?: 'bearer' | 'cookie' | 'signed';
  state?: Partial<ReturnType<typeof accessState>>; status: number; expected?: unknown; noRead?: boolean; message?: string };
const publicRoute = '/api/v1/stations';
const privateRoute = '/api/v1/control/catalog/stations';
const cases: Case[] = [
  { name: 'anonymous public catalogue', path: publicRoute, status: 200, expected: jsonRows },
  { name: 'Bearer on Public does not become administrative scope', path: publicRoute, auth: 'bearer', status: 200, expected: jsonRows },
  { name: 'Control cookie on Public does not become administrative scope', path: publicRoute, auth: 'cookie', status: 200, expected: jsonRows },
  { name: 'public search parameters remain ignored', path: publicRoute + '?stationId=invalid&q=anything&extra=value', status: 200, expected: jsonRows },
  { name: 'signed kiosk is limited to A even when querying B', path: publicRoute + '?stationId=' + b, auth: 'signed', status: 200, expected: [jsonRows[0]] },
  { name: 'signed kiosk rejection precedes query', path: publicRoute, auth: 'signed', state: { kioskRejected: true }, status: 401, noRead: true },
  { name: 'kiosk without station cannot see all stations', path: publicRoute, auth: 'signed', state: { kioskActor: { kind: 'kiosk' } }, status: 403, message: 'Station required' },
  { name: 'authorized actor without matching active row gets an empty list', path: publicRoute, auth: 'signed', state: { kioskActor: { kind: 'kiosk', stationId: absent } }, status: 200, expected: [] },
  { name: 'anonymous Control access rejected', status: 401, noRead: true },
  { name: 'invalid Control token rejected', auth: 'bearer', state: { validToken: false }, status: 401, noRead: true },
  { name: 'inactive Control user rejected', auth: 'bearer', state: { active: false }, status: 401, noRead: true },
  { name: 'old authVersion rejected', auth: 'bearer', state: { payloadVersion: 0 }, status: 401, noRead: true },
  { name: 'member without approved Control account rejected', auth: 'bearer', state: { approved: false }, status: 403, noRead: true },
  { name: 'missing Control access permission rejected', auth: 'bearer', state: { permissions: ['ADMIN_INVENTORY_VIEW'] }, status: 403, noRead: true },
  { name: 'missing inventory permission rejected', auth: 'bearer', state: { permissions: ['ADMIN_CONTROL_ACCESS'] }, status: 403, noRead: true, message: 'Permiso administrativo insuficiente' },
  { name: 'no assigned active stations rejected', auth: 'bearer', state: { stations: [] }, status: 403, noRead: true, message: 'No hay estaciones asignadas' },
  { name: 'kiosk cannot enter Control', auth: 'signed', status: 403, noRead: true },
  { name: 'staff only sees assigned A', auth: 'bearer', status: 200, expected: [jsonRows[0]] },
  { name: 'Control cookie preserves staff scope', auth: 'cookie', status: 200, expected: [jsonRows[0]] },
  { name: 'assigned UUID filter retains A', path: privateRoute + '?stationId=' + a, auth: 'bearer', status: 200, expected: [jsonRows[0]] },
  { name: 'cross-station B is rejected before data read', path: privateRoute + '?stationId=' + b, auth: 'bearer', status: 403, noRead: true, message: 'Estación fuera de alcance' },
  { name: 'unassigned nonexistent UUID also rejected', path: privateRoute + '?stationId=' + absent, auth: 'bearer', status: 403, noRead: true },
  { name: 'global administrator sees both active stations', auth: 'bearer', state: { global: true }, status: 200, expected: jsonRows },
  { name: 'global administrator filters B', path: privateRoute + '?stationId=' + b, auth: 'bearer', state: { global: true }, status: 200, expected: [jsonRows[1]] },
  { name: 'global nonexistent station returns empty not 404', path: privateRoute + '?stationId=' + absent, auth: 'bearer', state: { global: true }, status: 200, expected: [] },
  { name: 'global inactive station absent from active projection', path: privateRoute + '?stationId=' + inactive, auth: 'bearer', state: { global: true }, status: 200, expected: [] },
  { name: 'assigned UUID without active row returns empty', path: privateRoute + '?stationId=' + absent, auth: 'bearer', state: { stations: [absent] }, status: 200, expected: [] },
  ...['stationId=', 'stationId=invalid', `stationId=${a}&stationId=${b}`, 'q=search', 'stationId=' + a + '&extra=value'].map(query =>
    ({ name: 'private invalid filter ' + query, path: privateRoute + '?' + query, auth: 'bearer' as const, status: 400, noRead: true })),
];

describe('station HTTP before/after with real controllers, AccessGuard and validation', () => {
  let fixtures: Awaited<ReturnType<typeof httpFixture>>[] = [];
  beforeAll(async () => { for (const http of [false, true]) for (const legacy of [true, false]) fixtures.push(await httpFixture(legacy, http)); });
  afterAll(async () => { await Promise.all(fixtures.map(f => f.app.close())); fixtures = []; });
  beforeEach(() => fixtures.forEach(f => f.reset()));

  it.each(cases)('$name', async c => {
    const bodies: unknown[] = [];
    for (const f of fixtures) {
      Object.assign(f.state, c.state);
      const req = request(f.app.getHttpServer()).get(c.path || privateRoute);
      if (c.auth === 'bearer') req.set('Authorization', 'Bearer synthetic-control');
      if (c.auth === 'cookie') req.set('Cookie', 'primax_control=synthetic-control');
      if (c.auth === 'signed') req.set('x-kiosk-signature', 'synthetic-signed');
      const response = await req.expect(c.status);
      expect(response.headers['content-type']).toMatch(/application\/json/);
      if (c.status === 200) expect(response.body).toEqual(c.expected);
      else {
        expect(response.body).toMatchObject({ statusCode: c.status, path: (c.path || privateRoute).split('?')[0], timestamp: expect.any(String) });
        if (c.message) expect(response.body.message).toBe(c.message);
      }
      const { timestamp: _timestamp, ...withoutTime } = response.body;
      bodies.push(c.status === 200 ? response.body : withoutTime);
      if (c.noRead) { expect(f.db.station.findMany).not.toHaveBeenCalled(); expect(f.reader.read).not.toHaveBeenCalled(); }
      if ((c.path || '').startsWith(publicRoute)) expect(f.jwt.verifyAsync).not.toHaveBeenCalled();
    }
    for (const body of bodies) expect(body).toEqual(bodies[0]);
  });

  it('preserves assignment lookup constraints, active-only data query and no relationships', async () => {
    for (const f of fixtures) {
      await request(f.app.getHttpServer()).get(privateRoute).set('Authorization', 'Bearer synthetic-control').expect(200);
      expect(f.db.adminControlAccount.findUnique).toHaveBeenCalledWith({ where: { userId }, include: {
        stations: { where: { endedAt: null, station: { active: true } }, select: { stationId: true } },
      } });
      if (!f.http) expect(f.db.station.findMany).toHaveBeenCalledWith({ where: { active: true }, orderBy: { code: 'asc' } });
      else expect(f.reader.read).toHaveBeenCalledWith('stations');
    }
  });

  it('preserves empty arrays, 503 dependency errors and lack of fallback', async () => {
    const bodies: unknown[] = [];
    for (const f of fixtures) {
      f.db.station.findMany.mockResolvedValue([]); f.reader.read.mockResolvedValue([]);
      await request(f.app.getHttpServer()).get(publicRoute).expect(200, []);
      const dependency = f.http ? f.reader.read : f.db.station.findMany;
      dependency.mockRejectedValue(new ServiceUnavailableException('Catalog unavailable'));
      const response = await request(f.app.getHttpServer()).get(publicRoute).expect(503);
      const { timestamp: _timestamp, ...body } = response.body; bodies.push(body);
      expect(body).toMatchObject({ statusCode: 503, message: 'Catalog unavailable', path: publicRoute });
      expect(dependency).toHaveBeenCalledTimes(2);
      expect(f.http ? f.db.station.findMany : f.reader.read).not.toHaveBeenCalled();
    }
    bodies.forEach(body => expect(body).toEqual(bodies[0]));
  });

  it('does not introduce POST or a by-id route', async () => {
    for (const f of fixtures) {
      await request(f.app.getHttpServer()).post(publicRoute).expect(404);
      await request(f.app.getHttpServer()).get(publicRoute + '/' + a).expect(404);
      expect(f.db.station.findMany).not.toHaveBeenCalled(); expect(f.reader.read).not.toHaveBeenCalled();
    }
  });
});

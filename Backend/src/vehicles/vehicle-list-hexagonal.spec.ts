import request from 'supertest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import ts from 'typescript';
import { vehicleListFixture } from '../../test/vehicle-list.fixture';
import { PrismaService } from '../prisma/prisma.service';
import { VehiclesRepository } from './vehicles.repository';
import { ListVehicles } from '../../services/identity/src/application/use-cases/list-vehicles';
import { ExistingVehicleListReader } from '../../services/identity/src/adapters/outbound/existing-vehicle-list.reader';
import type { Actor } from '../identity-core/domain';

const a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222';
const inactive = '33333333-3333-4333-8333-333333333333';
const noVehicles = '44444444-4444-4444-8444-444444444444';
const stale = '55555555-5555-4555-8555-555555555555';
const absent = '66666666-6666-4666-8666-666666666666';
const rows = [
  { id: a, plate: 'AAA-001', label: 'Synthetic A', membershipId: a,
    createdAt: new Date('2026-01-01Z'), updatedAt: new Date('2026-01-02Z') },
  { id: b, plate: 'AAA-002', label: 'Synthetic A2', membershipId: a,
    createdAt: new Date('2026-01-01Z'), updatedAt: new Date('2026-01-02Z') },
];

it('preserves the trusted actor id, exact ORM query, pagination and object identity', async () => {
  const db = { vehicle: { findMany: jest.fn().mockResolvedValue(rows) } };
  const query = new ListVehicles(new ExistingVehicleListReader(new VehiclesRepository(db as never)));
  const page = { page: 2, limit: 1 };
  expect(await query.execute({ kind: 'member', userId: a }, page)).toBe(rows);
  expect(db.vehicle.findMany).toHaveBeenCalledTimes(1);
  expect(db.vehicle.findMany).toHaveBeenCalledWith({ where: { membership: { userId: a } }, orderBy: { plate: 'asc' }, take: 1, skip: 1 });
});

it('preserves synchronous empty output for non-members without reading persistence', () => {
  const reader = { list: jest.fn() }, query = new ListVehicles(reader);
  for (const actor of [{ kind: 'kiosk' }, { kind: 'admin', adminUser: 'synthetic' },
    { kind: 'control', userId: a, role: 'staff', permissions: [], stationIds: [], global: false }] as Actor[]) {
    const result = query.execute(actor, { page: 1, limit: 20 });
    expect(result).toEqual([]); expect(result).not.toBeInstanceOf(Promise);
  }
  expect(reader.list).not.toHaveBeenCalled();
});

it('preserves empty results and original errors without mutation or retries', async () => {
  const error = new Error('Synthetic persistence failure');
  const read = jest.fn().mockResolvedValueOnce([]).mockRejectedValueOnce(error);
  const query = new ListVehicles({ list: read });
  expect(await query.execute({ kind: 'member', userId: a }, { page: 1, limit: 20 })).toEqual([]);
  await expect(query.execute({ kind: 'member', userId: a }, { page: 1, limit: 20 })).rejects.toBe(error);
  expect(read).toHaveBeenCalledTimes(2);
});

describe('vehicle list HTTP before/after with real JWT/guard, mocked persistence', () => {
  const users = [a, b, inactive, noVehicles, stale].map(id => ({ id, active: id !== inactive, authVersion: id === stale ? 1 : 0 }));
  const db = { user: { findUnique: jest.fn(async ({ where }: { where: { id: string } }) => users.find(u => u.id === where.id) || null) },
    vehicle: { findMany: jest.fn(async (q: { where: { membership: { userId: string } }; skip: number; take: number }) => {
      const own = q.where.membership.userId === a ? rows : q.where.membership.userId === b ? [{ ...rows[0], id: noVehicles, plate: 'BBB-001', membershipId: b }] : [];
      return own.slice(q.skip, q.skip + q.take);
    }) } };
  let apps: Awaited<ReturnType<typeof vehicleListFixture>>[] = [];
  beforeAll(async () => { for (const legacy of [true, false]) apps.push(await vehicleListFixture(db as unknown as PrismaService, legacy)); });
  afterAll(async () => { await Promise.all(apps.map(f => f.app.close())); apps = []; });
  beforeEach(() => jest.clearAllMocks());

  const cases = [
    { name: 'anonymous', status: 401 },
    { name: 'invalid token', token: 'invalid', status: 401 },
    { name: 'Control cookie only', cookie: true, status: 401 },
    { name: 'kiosk key only', key: true, status: 401 },
    { name: 'unauthorized signed session', signed: true, status: 401 },
    { name: 'inactive user', user: inactive, status: 403 },
    { name: 'missing persisted user', user: absent, status: 403 },
    { name: 'stale authVersion', user: stale, status: 401 },
    { name: 'owner A', user: a, status: 200, plates: ['AAA-001', 'AAA-002'] },
    { name: 'owner B cannot see A', user: b, status: 200, plates: ['BBB-001'] },
    { name: 'no vehicles', user: noVehicles, status: 200, plates: [] },
    { name: 'pagination', user: a, query: '?page=2&limit=1', status: 200, plates: ['AAA-002'] },
    { name: 'page without rows', user: a, query: '?page=99&limit=1', status: 200, plates: [] },
    { name: 'spoofed owner header ignored', user: a, headerOwner: b, status: 200, plates: ['AAA-001', 'AAA-002'] },
    ...['userId=' + b, 'membershipId=' + b, 'plate=BBB-001', 'sort=desc', 'page=0', 'page=-1', 'page=1.5', 'page=abc',
      'page=1&page=2', 'limit=0', 'limit=101', 'limit=1&limit=2', 'limit='].map(query => ({ name: query, user: a, query: '?' + query, status: 400 })),
  ];
  it.each(cases)('$name', async c => {
    const bodies: unknown[] = [];
    for (const f of apps) {
      const req = request(f.app.getHttpServer()).get('/api/v1/vehicles' + (c.query || ''));
      if (c.user) req.set('Authorization', 'Bearer ' + await f.token(c.user));
      if ('token' in c && c.token) req.set('Authorization', 'Bearer ' + c.token);
      if ('cookie' in c) req.set('Cookie', 'primax_control=synthetic-invalid');
      if ('key' in c) req.set('x-kiosk-key', 'synthetic-invalid');
      if ('signed' in c) req.set('x-kiosk-signature', 'synthetic-invalid');
      if ('headerOwner' in c && c.headerOwner) req.set('x-user-id', c.headerOwner);
      const response = await req.expect(c.status);
      if (c.status === 200) {
        expect(Array.isArray(response.body)).toBe(true);
        expect(response.body.map((r: { plate: string }) => r.plate)).toEqual('plates' in c ? c.plates : []);
        for (const row of response.body) expect(Object.keys(row).sort()).toEqual(['id', 'plate', 'label', 'membershipId', 'createdAt', 'updatedAt'].sort());
        bodies.push(response.body);
      } else {
        expect(response.body).toMatchObject({ statusCode: c.status, path: '/api/v1/vehicles', timestamp: expect.any(String) });
        const { timestamp: _timestamp, ...body } = response.body; bodies.push(body);
        expect(db.vehicle.findMany).not.toHaveBeenCalled();
      }
    }
    expect(bodies[0]).toEqual(bodies[1]);
  });

  it('rejects expired tokens and wrong audience before reading vehicles', async () => {
    for (const f of apps) {
      for (const token of [await f.jwt.signAsync({ sub: a }, { expiresIn: -1 }),
        await f.jwt.signAsync({ sub: a }, { audience: 'synthetic-other' })]) {
        await request(f.app.getHttpServer()).get('/api/v1/vehicles').set('Authorization', 'Bearer ' + token).expect(401);
      }
    }
    expect(db.vehicle.findMany).not.toHaveBeenCalled();
  });
});

it('application depends only on its ports/read model and the existing pure Actor contract', () => {
  const root = resolve(__dirname, '../../services/identity/src/application');
  const actor = resolve(__dirname, '../identity-core/domain');
  const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(resolve(d, e.name)) : [resolve(d, e.name)]);
  for (const file of walk(root).filter(f => f.endsWith('.ts'))) {
    const ast = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node) => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const specifier = node.moduleSpecifier.text, target = resolve(file, '..', specifier);
        expect(specifier.startsWith('.')).toBe(true);
        expect(target.startsWith(root + sep) || target === actor).toBe(true);
      }
      ts.forEachChild(node, visit);
    };
    visit(ast);
  }
  expect(readFileSync(actor + '.ts', 'utf8')).not.toMatch(/(?:@nestjs|@prisma|require\()/);
});

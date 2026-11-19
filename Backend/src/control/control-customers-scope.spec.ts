import { AdministrativeDetailsAdapter } from '../../services/administration/src/adapters/inbound/administrative-details.adapter';
import { AdministrativeDetails } from '../../services/administration/src/application/use-cases/administrative-details';
import { LegacyAdministrativeDetails, LegacyAdministrativeDetailViews } from '../../services/administration/src/adapters/outbound/legacy-administrative-details';
import { AdministrativeListsAdapter } from '../../services/administration/src/adapters/inbound/administrative-lists.adapter';
import { AdministrativeLists } from '../../services/administration/src/application/use-cases/administrative-lists';
import { LegacyAdministrativeLists, LegacyAdministrativeViews } from '../../services/administration/src/adapters/outbound/legacy-administrative-lists';
import 'reflect-metadata';
import { BadRequestException, ForbiddenException, NotFoundException, ValidationPipe } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Actor } from '../auth/access';
import { PrismaService } from '../prisma/prisma.service';
import { ControlCustomersService } from './control-customers.service';
import { ControlCustomersController } from './control-customers.controller';

type Row = Record<string, unknown>;
type ControlActor = Extract<Actor, { kind: 'control' }>;
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const permissions = ['ADMIN_CUSTOMER_VIEW', 'ADMIN_MEMBERSHIP_VIEW', 'ADMIN_VEHICLE_VIEW'];
const scoped: ControlActor = { kind: 'control', userId: 'synthetic-operator', role: 'ENCARGADO', permissions, global: false, stationIds: [A] };
const object = (value: unknown): Row => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Unsupported mock query shape');
  return value as Row;
};

// Small semantic Prisma-filter mock, independent of the service's query layout.
// Both vulnerable OR spreads and corrected AND conditions are evaluated as supplied.
// Unsupported shapes fail rather than silently accepting a permissive mock.
function matches(row: Row, input: unknown): boolean {
  if (input === undefined) return true;
  return Object.entries(object(input)).every(([key, condition]) => {
    if (key === 'AND' || key === 'OR') {
      const predicates = Array.isArray(condition) ? condition : [condition];
      return key === 'AND' ? predicates.every((p) => matches(row, p)) : predicates.some((p) => matches(row, p));
    }
    const actual = row[key];
    if (condition === null || typeof condition !== 'object') return actual === condition;
    const filter = object(condition);
    if ('in' in filter) return (filter.in as unknown[]).includes(actual);
    if ('contains' in filter) {
      if (typeof actual !== 'string') return false;
      const value = String(filter.contains);
      return filter.mode === 'insensitive' ? actual.toLowerCase().includes(value.toLowerCase()) : actual.includes(value);
    }
    if ('some' in filter) return Array.isArray(actual) && actual.some((v) => matches(object(v), filter.some));
    if ('is' in filter) return actual !== null && actual !== undefined && matches(object(actual), filter.is);
    return actual !== null && actual !== undefined && matches(object(actual), filter);
  });
}
function selected(rows: Row[], args: Row): Row[] {
  let result = rows.filter((row) => matches(row, args.where));
  if (args.orderBy) {
    const order = object(args.orderBy);
    result = [...result].sort((left, right) => {
      for (const [key, direction] of Object.entries(order)) {
        const l = left[key] instanceof Date ? (left[key] as Date).getTime() : String(left[key]);
        const r = right[key] instanceof Date ? (right[key] as Date).getTime() : String(right[key]);
        if (l !== r) return (l < r ? -1 : 1) * (direction === 'desc' ? -1 : 1);
      }
      return 0;
    });
  }
  const skip = Number(args.skip ?? 0);
  result = result.slice(skip, args.take === undefined ? undefined : skip + Number(args.take));
  return result.map((row) => {
    const projection = args.select ? object(args.select) : args.include ? object(args.include) : {};
    const output: Row = args.select ? {} : { ...row };
    for (const [key, rule] of Object.entries(projection)) {
      if (rule === true) output[key] = row[key];
      else if (rule && typeof rule === 'object') {
        output[key] = Array.isArray(row[key]) ? selected(row[key] as Row[], object(rule))
          : row[key] == null ? row[key] : selected([object(row[key])], object(rule))[0];
      }
    }
    return output;
  });
}
function member(tag: string, stations: string[], status = 'ACTIVE', timestamp = 1): Row {
  const createdAt = new Date(2026, 0, 1, 0, 0, timestamp);
  const user = { id: 'user-' + tag, name: 'Common Client ' + tag, email: `client-${tag.toLowerCase()}@synthetic.invalid`, active: true, createdAt };
  const transactions = stations.slice(0, 1).map((stationId) => ({ stationId, createdAt }));
  const authorizations = stations.slice(1).map((stationId) => ({ stationId, createdAt }));
  const vehicles = stations.map((stationId, i) => ({
    id: `vehicle-${tag}-${i}`, plate: `${tag.padEnd(3, 'X').slice(0, 3)}-${String(i + 1).padStart(3, '0')}`,
    label: 'Synthetic', transactions: [{ stationId, createdAt }], authorizations: [],
    membership: { id: 'member-' + tag, number: 'COMMON-' + tag, status, user },
  }));
  return { id: 'member-' + tag, userId: user.id, number: 'COMMON-' + tag, status,
    balance: new Prisma.Decimal('12.00'), createdAt, updatedAt: createdAt, user, vehicles, transactions, authorizations };
}
function fixture(rows = [member('A', [A]), member('B', [B], 'SUSPENDED', 2), member('AB', [B, A], 'ACTIVE', 3), member('C', [C], 'ACTIVE', 4), member('NONE', [], 'ACTIVE', 5)]) {
  const findMany = jest.fn(async (args: Row) => selected(rows, args));
  const findFirst = jest.fn(async (args: Row) => selected(rows, args)[0] ?? null);
  const findUnique = jest.fn(async (args: Row) => selected(rows, args)[0] ?? null);
  const vehicles = rows.flatMap((row) => row.vehicles as Row[]);
  const vehicleFindMany = jest.fn(async (args: Row) => selected(vehicles, args));
  const count = jest.fn();
  const db = {
    membership: { findMany, findFirst, findUnique, count },
    vehicle: { findMany: vehicleFindMany },
    rewardMovement: { aggregate: jest.fn().mockResolvedValue({ _sum: { points: 0 } }) },
    transaction: { findMany: jest.fn().mockResolvedValue([]) },
    fuelAuthorization: { findMany: jest.fn().mockResolvedValue([]) },
  };
  return { service: new ControlCustomersService(db as unknown as PrismaService, new AdministrativeListsAdapter(new AdministrativeLists<LegacyAdministrativeViews>(new LegacyAdministrativeLists(db as unknown as PrismaService))), new AdministrativeDetailsAdapter(new AdministrativeDetails<LegacyAdministrativeDetailViews>(new LegacyAdministrativeDetails(db as unknown as PrismaService)))), findMany, findFirst, count, db, rows };
}

describe('Control station scope survives search predicates (synthetic semantic mocks)', () => {
  it.each([undefined, '', '   '])('keeps activity scope without meaningful q=%s', async (q) => {
    const { service } = fixture();
    expect((await service.customers(scoped, { q })).map((r) => r.id).sort()).toEqual(['user-A', 'user-AB']);
    expect((await service.memberships(scoped, { q })).map((r) => r.id).sort()).toEqual(['member-A', 'member-AB']);
  });
  it.each(['COMMON-B', 'Client B', 'CLIENT-B@SYNTHETIC.INVALID'])('does not disclose station B through q=%s', async (q) => {
    const { service } = fixture();
    expect(await service.customers(scoped, { q })).toEqual([]);
    expect(await service.memberships(scoped, { q })).toEqual([]);
  });
  it('searches within one or several assigned stations, including authorization-only activity', async () => {
    const { service } = fixture();
    expect((await service.memberships(scoped, { q: 'common' })).map((r) => r.id).sort()).toEqual(['member-A', 'member-AB']);
    const multiple = { ...scoped, stationIds: [A, B] };
    expect((await service.customers(multiple, { q: 'Common' })).map((r) => r.id).sort()).toEqual(['user-A', 'user-AB', 'user-B']);
    expect((await service.memberships(multiple, { q: 'Common' })).map((r) => r.id).sort()).toEqual(['member-A', 'member-AB', 'member-B']);
  });
  it('combines explicit station, status and q without dropping any predicate', async () => {
    const { service } = fixture();
    const multiple = { ...scoped, stationIds: [A, B] };
    expect(await service.memberships(multiple, { stationId: A, status: 'SUSPENDED', q: 'COMMON' })).toEqual([]);
    expect((await service.memberships(multiple, { stationId: B, status: 'SUSPENDED', q: 'COMMON' })).map((r) => r.id)).toEqual(['member-B']);
    expect(await service.customers(multiple, { stationId: A, q: 'COMMON-B' })).toEqual([]);
  });
  it('preserves permitted global reads and applies an explicit station filter to global searches', async () => {
    const { service } = fixture();
    const global = { ...scoped, global: true, stationIds: [] };
    expect(await service.memberships(global, { q: 'COMMON' })).toHaveLength(5);
    expect(await service.customers(global, { q: 'COMMON' })).toHaveLength(5);
    expect((await service.memberships(global, { stationId: A, q: 'COMMON' })).map((r) => r.id).sort()).toEqual(['member-A', 'member-AB']);
    const row = (await service.customers(global, { q: 'COMMON-B' }))[0];
    expect(row.email).toBe('client-b@synthetic.invalid');
    expect(row.membership?.balance).toBe('12.00');
  });
  it('keeps nested vehicle filters, email masking and conditional membership fields', async () => {
    const { service } = fixture();
    const row = (await service.customers(scoped, { q: 'COMMON-AB' }))[0];
    expect(row.vehicles).toHaveLength(1);
    expect(row.vehicles[0].id).toBe('vehicle-AB-1');
    expect(row.email).not.toContain('@synthetic.invalid');
    expect(row.membership?.balance).toBeUndefined();
    const restricted = { ...scoped, permissions: ['ADMIN_CUSTOMER_VIEW'] };
    const hidden = (await service.customers(restricted, { q: 'COMMON-AB' }))[0];
    expect(hidden.membership).toBeNull(); expect(hidden.vehicles).toEqual([]);
  });
  it('keeps vehicle search and detail lookups within scope', async () => {
    const { service } = fixture();
    expect(await service.vehicles(scoped, { q: 'Client B' })).toEqual([]);
    expect((await service.customer(scoped, 'user-A')).id).toBe('user-A');
    expect((await service.membership(scoped, 'member-A'))?.id).toBe('member-A');
    await expect(service.customer(scoped, 'user-B')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.membership(scoped, 'member-B')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.membership(scoped, 'unknown')).rejects.toBeInstanceOf(NotFoundException);
  });
  it.each([[], undefined, null, [''], [undefined]])('fails closed for missing/malformed assignments %j', async (stationIds) => {
    const { service, findMany } = fixture();
    const invalid = { ...scoped, stationIds } as unknown as ControlActor;
    await expect(service.customers(invalid, { q: 'COMMON' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.memberships(invalid, { q: 'COMMON' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(findMany).not.toHaveBeenCalled();
  });
  it.each([undefined, 'true', 1])('does not treat malformed global=%s as global authority', async (global) => {
    const { service, findMany } = fixture();
    const invalid = { ...scoped, global } as unknown as ControlActor;
    await expect(service.memberships(invalid, { q: 'COMMON' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(findMany).not.toHaveBeenCalled();
  });
  it('rejects missing permissions and explicit foreign stations before querying', async () => {
    const { service, findMany } = fixture();
    await expect(service.customers({ ...scoped, permissions: [] }, { q: 'COMMON' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.memberships({ ...scoped, permissions: [] }, { q: 'COMMON' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.customers(scoped, { stationId: B, q: 'COMMON' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.memberships(scoped, { stationId: B, q: 'COMMON' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(findMany).not.toHaveBeenCalled();
  });
  it('propagates provider errors instead of retrying an unscoped query', async () => {
    const { service, findMany } = fixture();
    const unavailable = Error('synthetic persistence unavailable');
    findMany.mockRejectedValueOnce(unavailable);
    await expect(service.customers(scoped, { q: 'COMMON' })).rejects.toBe(unavailable);
    expect(findMany).toHaveBeenCalledTimes(1);
  });
  it('applies scope before take=100 and returned lengths reveal no foreign matches', async () => {
    const rows = [
      ...Array.from({ length: 105 }, (_, i) => member(`A${i}`, [A], 'ACTIVE', i + 1)),
      ...Array.from({ length: 105 }, (_, i) => member(`B${i}`, [B], 'ACTIVE', i + 201)),
    ];
    const { service, findMany, count } = fixture(rows);
    const members = await service.memberships(scoped, { q: 'COMMON' });
    const customers = await service.customers(scoped, { q: 'COMMON' });
    const vehicles = await service.vehicles(scoped, { q: 'Synthetic' });
    expect(members).toHaveLength(100); expect(customers).toHaveLength(100);
    expect(vehicles).toHaveLength(100);
    expect(vehicles.every((r) => r.id.startsWith('vehicle-A'))).toBe(true);
    expect(members.every((r) => r.id.startsWith('member-A'))).toBe(true);
    expect(customers.every((r) => r.id.startsWith('user-A'))).toBe(true);
    expect(members[0].id).toBe('member-A104');
    expect(await service.memberships(scoped, { q: 'COMMON-B' })).toEqual([]);
    expect(count).not.toHaveBeenCalled();
    for (const [args] of findMany.mock.calls) {
      expect(args.take).toBe(100); expect(args.skip).toBeUndefined();
    }
    expect(members).not.toHaveProperty('total');
  });
  it('does not add pagination/count API parameters or mutate synthetic records', async () => {
    const { service, rows } = fixture(); const before = JSON.stringify(rows);
    await service.customers(scoped, { q: 'COMMON' }); await service.memberships(scoped, { q: 'COMMON' });
    expect(JSON.stringify(rows)).toBe(before);
    const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
    for (const method of ['customers', 'memberships']) {
      const types = Reflect.getMetadata('design:paramtypes', ControlCustomersController.prototype, method);
      await expect(pipe.transform({ page: '1', limit: '10' }, { type: 'query', metatype: types[1] })).rejects.toBeInstanceOf(BadRequestException);
    }
  });
});

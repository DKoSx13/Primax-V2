import { createHmac, randomUUID } from 'node:crypto';
import { hash } from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { ControlService } from '../src/control/control.service';
import { ControlOperationsService } from '../src/control/control-operations.service';
import { InventoryReconciliationService } from '../src/inventory/inventory-reconciliation';
import { OperationsService } from '../src/operations/operations.service';
import { KioskService } from '../src/kiosk/kiosk.service';

const suite = process.env.TERMINAL_REFACTOR_TEST === 'true' ? describe : describe.skip;
suite('final terminal operation on isolated local PostgreSQL', () => {
  let db: PrismaService;
  let control: ControlService;
  let terminals: ControlOperationsService;
  let operations: OperationsService;
  let stationId: string;
  let otherStationId: string;
  let terminalId: string;
  let rootId: string;
  let adminId: string;
  let encargadoId: string;
  let clientId: string;
  const password = 'Primax123';

  beforeAll(async () => {
    const target = new URL(process.env.DATABASE_URL!);
    if (target.hostname !== '127.0.0.1' || target.port !== '26602' || target.pathname !== '/primax_refactor_validation')
      throw Error('Dedicated local refactor database required');
    db = new PrismaService();
    await db.$connect();
    control = new ControlService(db, new JwtService({ secret: 'local-refactor-test-secret' }), {} as never, {} as never);
    terminals = new ControlOperationsService(db, new InventoryReconciliationService(db));
    operations = new OperationsService(db);
    const suffix = randomUUID().slice(0, 8);
    stationId = (await db.station.create({ data: { code: `REF-${suffix}`, name: 'Refactor Station', address: 'Local only' } })).id;
    otherStationId = (await db.station.create({ data: { code: `OTHER-${suffix}`, name: 'Other Station', address: 'Local only' } })).id;
    const pump = await db.pump.create({ data: { stationId, code: `P-${suffix}`, name: 'Test Pump' } });
    terminalId = (await db.terminal.create({ data: { stationId, code: `T-${suffix}` } })).id;
    await db.terminalPumpAssignment.create({ data: { stationId, terminalId, pumpId: pump.id } });
    const passwordHash = await hash(password, 12);
    const createUser = async (label: string) => (await db.user.create({ data: { email: `${label}-${suffix}@primax.test`, name: label, passwordHash } })).id;
    rootId = await createUser('root');
    adminId = await createUser('admin');
    encargadoId = await createUser('encargado');
    clientId = await createUser('client');
    await db.userPermissionGrant.create({ data: { userId: rootId, permission: 'SYSTEM_ADMIN', reason: 'Local test' } });
    for (const [userId, role, grants] of [
      [adminId, 'ADMIN', ['ADMIN_CONTROL_ACCESS', 'ADMIN_DASHBOARD_VIEW', 'ADMIN_TERMINAL_VIEW', 'ADMIN_TERMINAL_MANAGE']],
      [encargadoId, 'ENCARGADO', ['ADMIN_CONTROL_ACCESS', 'ADMIN_DASHBOARD_VIEW', 'ADMIN_TERMINAL_VIEW', 'ADMIN_TERMINAL_MANAGE']],
    ] as const) {
      const account = await db.adminControlAccount.create({ data: { userId, role, status: 'APPROVED', emailVerifiedAt: new Date() } });
      await db.adminStationAssignment.create({ data: { userId, accountId: account.id, stationId, reason: 'Local test' } });
      for (const permission of grants) await db.adminControlGrant.create({ data: { userId, permission, reason: 'Local test' } });
    }
  });

  afterAll(async () => { await db?.$disconnect(); });
  const actor = (userId: string, role: string, permissions: string[], stationIds = [stationId], global = false) =>
    ({ kind: 'control' as const, userId, role, permissions, stationIds, global });

  it('has only the final Control roles in sessions; client cannot enter Control', async () => {
    const root = await control.login((await db.user.findUniqueOrThrow({ where: { id: rootId } })).email, password);
    const admin = await control.login((await db.user.findUniqueOrThrow({ where: { id: adminId } })).email, password);
    const encargado = await control.login((await db.user.findUniqueOrThrow({ where: { id: encargadoId } })).email, password);
    expect(root.context.roles).toEqual(['SUPER_ADMIN']);
    expect(admin.context.roles).toEqual(['ADMIN']);
    expect(encargado.context.roles).toEqual(['ENCARGADO']);
    await expect(control.login((await db.user.findUniqueOrThrow({ where: { id: clientId } })).email, password)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('enforces grant and station scope, audits state changes, and starts without a shift', async () => {
    const manage = ['ADMIN_TERMINAL_MANAGE'];
    await expect(terminals.terminalStatus(actor(encargadoId, 'ENCARGADO', []), terminalId, 'ENABLE')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(terminals.terminalStatus(actor(encargadoId, 'ENCARGADO', manage, [otherStationId]), terminalId, 'ENABLE')).rejects.toBeInstanceOf(ForbiddenException);
    await terminals.terminalStatus(actor(encargadoId, 'ENCARGADO', manage), terminalId, 'ENABLE');
    expect((await operations.terminalMe(terminalId)).canStart).toBe(true);
    const operationId = randomUUID();
    const operation = await operations.startOperation(terminalId, operationId);
    expect(operation.enablementId).toBeNull();
    await terminals.terminalStatus(actor(adminId, 'ADMIN', manage), terminalId, 'SUSPEND', 'Falla técnica');
    expect((await operations.terminalMe(terminalId)).canStart).toBe(false);
    await expect(operations.startOperation(terminalId, randomUUID())).rejects.toThrow('Terminal no disponible');
    await operations.closeOperation(terminalId, operationId);
    expect((await db.terminal.findUniqueOrThrow({ where: { id: terminalId } })).operationalStatus).toBe('BLOQUEADA');
    await terminals.terminalStatus(actor(rootId, 'SUPER_ADMIN', manage, [], true), terminalId, 'ENABLE');
    expect((await operations.terminalMe(terminalId)).canStart).toBe(true);
    expect(await db.operationalAuditEvent.count({ where: { terminalId, action: 'TERMINAL_ENABLED' } })).toBe(2);
    expect(await db.operationalAuditEvent.count({ where: { terminalId, action: 'TERMINAL_SUSPENDED', actorUserId: adminId } })).toBe(1);
  });

  it('bootstraps a technical session without a human shift and preserves an active operation during suspension', async () => {
    const values: Record<string, string> = {
      APP_MODE: 'local', KIOSK_GATEWAY_SECRET: 'local-refactor-gateway-secret',
      KIOSK_STATION_ID: stationId, KIOSK_OPERATOR_USER: 'local-operator',
      KIOSK_OPERATOR_PASSWORD_HASH: 'unused-for-bootstrap',
    };
    const config = { get: (key: string, fallback?: string) => values[key] ?? fallback,
      getOrThrow: (key: string) => values[key] ?? (() => { throw Error(key); })() };
    const store = { limit: async () => true, key: (key: string) => key,
      command: async () => 'OK' };
    const kiosk = new KioskService(config as never, store as never, db);
    const signedRequest = (technical = '') => {
      const timestamp = String(Date.now());
      const body = { terminalId };
      const path = '/api/v1/kiosk/session/terminal-bootstrap';
      const signature = createHmac('sha256', values.KIOSK_GATEWAY_SECRET)
        .update(JSON.stringify(['POST', path, timestamp, body, '', '', technical, '']))
        .digest('hex');
      const headers: Record<string, string> = { 'x-kiosk-time': timestamp,
        'x-kiosk-signature': signature, 'x-terminal-session': technical };
      return { method: 'POST', originalUrl: path, body,
        header: (name: string) => headers[name.toLowerCase()] || '' } as never;
    };
    const session = await kiosk.bootstrapTerminal(signedRequest(), terminalId);
    expect(session.authenticated).toBe(true);
    expect(session.terminalToken).toMatch(/^[a-f0-9]{64}$/);
    expect((await operations.terminalMe(terminalId)).canStart).toBe(true);
    const operationId = randomUUID();
    expect((await operations.startOperation(terminalId, operationId)).enablementId).toBeNull();
    await terminals.terminalStatus(actor(encargadoId, 'ENCARGADO', ['ADMIN_TERMINAL_MANAGE']), terminalId, 'SUSPEND', 'Problema durante venta');
    const resumed = await kiosk.bootstrapTerminal(signedRequest(session.terminalToken), terminalId);
    expect(resumed.terminalToken).toBe(session.terminalToken);
    expect((await operations.terminalMe(terminalId)).prepared).toBe(true);
    await expect(operations.startOperation(terminalId, randomUUID())).rejects.toThrow('Terminal no disponible');
    await operations.closeOperation(terminalId, operationId);
    await expect(kiosk.bootstrapTerminal(signedRequest(session.terminalToken), terminalId)).rejects.toThrow('temporalmente no disponible');
    await terminals.terminalStatus(actor(encargadoId, 'ENCARGADO', ['ADMIN_TERMINAL_MANAGE']), terminalId, 'ENABLE');
    expect((await kiosk.bootstrapTerminal(signedRequest(session.terminalToken), terminalId)).terminalToken).toBe(session.terminalToken);
  });
});

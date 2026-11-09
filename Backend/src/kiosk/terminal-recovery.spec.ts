import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { Request } from 'express';
import { KioskService } from './kiosk.service';

const stationId = '11111111-1111-4111-8111-111111111111';
const terminalId = '22222222-2222-4222-8222-222222222222';
const operationId = '33333333-3333-4333-8333-333333333333';
const owner = '44444444-4444-4444-8444-444444444444';
const userId = '55555555-5555-4555-8555-555555555555';
const money = (n: number) => new Prisma.Decimal(n);

function fixture() {
  const values = new Map<string, string>();
  const store = {
    key: (s: string) => s,
    limit: jest.fn(async () => true),
    command: jest.fn(async (verb: string, key: string, value?: string, ...args: string[]) => {
      if (verb === 'GET') return values.get(key) ?? null;
      if (verb === 'GETDEL') { const prior = values.get(key) ?? null; values.delete(key); return prior; }
      if (verb === 'DEL') return Number(values.delete(key));
      if (verb === 'SET') { if (args.includes('NX') && values.has(key)) return null; values.set(key, value!); return 'OK'; }
      throw Error(`Unexpected Redis command ${verb}`);
    }),
  };
  const operation = { id: '66666666-6666-4666-8666-666666666666', operationId, stationId, terminalId,
    pumpId: '77777777-7777-4777-8777-777777777777', status: 'ACTIVE', closedAt: null,
    terminal: { id: terminalId, code: 'PRIMAX-SUR-T02', lifecycle: 'REGISTRADA', stationId } };
  const order = { id: '88888888-8888-4888-8888-888888888888', operationId, status: 'PENDING', paymentId: '99999999-9999-4999-8999-999999999999',
    transactionId: null, userId: null, method: 'YAPE', amount: money(12), providerId: 'demo:88888888-8888-4888-8888-888888888888' };
  const payment = { id: order.paymentId, status: 'PENDING', transactionId: null, method: 'YAPE', amount: money(12), refundedAmount: money(0), provider: 'DEMO' };
  const reservation = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', status: 'PENDING_PAYMENT', authorizationId: null,
    transactionId: null, stationId, terminalOperationId: operation.id };
  const db = {
    atomic: async (work: (tx: unknown) => Promise<unknown>) => work(db),
    $queryRaw: jest.fn(async () => [{ id: terminalId }]),
    terminal: { findUniqueOrThrow: jest.fn(async () => operation.terminal), findUnique: jest.fn(async () => operation.terminal) },
    terminalOperation: { findUnique: jest.fn(async () => operation), findUniqueOrThrow: jest.fn(async () => operation) },
    terminalCredential: { findFirst: jest.fn(async () => null), updateMany: jest.fn(async () => ({ count: 1 })) },
    userPermissionGrant: { findFirst: jest.fn(async () => ({ permission: 'SYSTEM_ADMIN' })) },
    user: { findUnique: jest.fn(async () => ({ active: true })) },
    onlineOrder: { findMany: jest.fn(async () => [order]), findUnique: jest.fn(async () => order) },
    payment: { findMany: jest.fn(async () => [payment]) },
    fuelAuthorization: { findMany: jest.fn(async () => []) },
    inventoryReservation: { findMany: jest.fn(async () => [reservation]) },
    transaction: { findMany: jest.fn(async () => []) },
    receipt: { findUnique: jest.fn(async () => null) },
    paymentEvent: { findMany: jest.fn(async () => [{ eventKey: `demo-intent:${order.id}`, kind: 'DEMO_PENDING',
      detail: JSON.stringify({ id: order.providerId, order_number: order.id, amount: 1200, currency_code: 'PEN', state: 'pending' }) }]) },
    operationalAuditEvent: { create: jest.fn(async () => ({})) },
  };
  const service = new KioskService(new ConfigService({ KIOSK_STATION_ID: stationId, KIOSK_GATEWAY_SECRET: 'x'.repeat(32) }), store as never, db as never);
  jest.spyOn(service, 'verifyGateway').mockImplementation(() => undefined);
  jest.spyOn(service, 'limitTechnical').mockResolvedValue(undefined);
  const actor = { kind: 'control' as const, userId, role: 'SUPER_ADMIN', global: true, stationIds: [],
    permissions: ['ADMIN_TERMINAL_MANAGE', 'ADMIN_INCIDENT_MANAGE'] };
  const request = { header: (name: string) => name === 'x-terminal-owner' ? owner : '' } as Request;
  return { service, db, store, values, operation, order, payment, reservation, actor, request };
}

describe('exceptional terminal recovery', () => {
  it('requires an explicit SUPER_ADMIN privilege and a matching active operation', async () => {
    const f = fixture();
    await expect(f.service.issueRecoveryTicket({ ...f.actor, role: 'ENCARGADO' }, operationId, 'Session lost')).rejects.toThrow('SUPER_ADMIN');
    expect(f.db.operationalAuditEvent.create).not.toHaveBeenCalled();
    f.operation.status = 'CLOSED';
    await expect(f.service.issueRecoveryTicket(f.actor, operationId, 'Session lost')).rejects.toThrow('cambió de estado');
  });

  it('grants one scoped credential after rechecking evidence and revokes old credentials', async () => {
    const f = fixture();
    const grant = await f.service.issueRecoveryTicket(f.actor, operationId, 'Browser was lost');
    const result = await f.service.exchangeRecoveryTicket(f.request, grant.ticket, 'PRIMAX-SUR-T02');
    expect(result.operationId).toBe(operationId);
    expect(result.terminalToken).toMatch(/^[a-f0-9]{64}$/);
    expect(f.db.terminalCredential.updateMany).toHaveBeenCalledTimes(1);
    expect(f.db.operationalAuditEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'TERMINAL_RECOVERY_GRANTED', actorUserId: userId }) }));
    expect(await f.service.recoveryCredential(result.terminalToken, owner)).toMatchObject({ operationId, terminalId });
    await expect(f.service.recoveryCredential(result.terminalToken, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')).rejects.toThrow();
    await expect(f.service.exchangeRecoveryTicket(f.request, grant.ticket, 'PRIMAX-SUR-T02')).rejects.toThrow();
    expect(f.db.onlineOrder.findMany).toHaveBeenCalled();
    expect(f.db.payment.findMany).toHaveBeenCalled();
    expect(f.db.inventoryReservation.findMany).toHaveBeenCalled();
  });

  it('rejects a changed payment or the wrong terminal before revocation', async () => {
    const f = fixture();
    const grant = await f.service.issueRecoveryTicket(f.actor, operationId, 'Browser was lost');
    await expect(f.service.exchangeRecoveryTicket(f.request, grant.ticket, 'PRIMAX-SUR-T01')).rejects.toThrow('incompatible');
    f.payment.status = 'CAPTURED';
    await expect(f.service.exchangeRecoveryTicket(f.request, grant.ticket, 'PRIMAX-SUR-T02')).rejects.toThrow('Estado financiero');
    expect(f.db.terminalCredential.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a provider confirmation that arrived after the recovery request', async () => {
    const f = fixture();
    const grant = await f.service.issueRecoveryTicket(f.actor, operationId, 'Browser was lost');
    f.db.paymentEvent.findMany.mockResolvedValueOnce([{ eventKey: `demo-confirm:${f.order.id}`, kind: 'DEMO_PAID',
      detail: JSON.stringify({ id: f.order.providerId, order_number: f.order.id, amount: 1200, currency_code: 'PEN', state: 'paid' }) }] as never);
    await expect(f.service.exchangeRecoveryTicket(f.request, grant.ticket, 'PRIMAX-SUR-T02')).rejects.toThrow('Estado financiero');
    expect(f.db.terminalCredential.updateMany).not.toHaveBeenCalled();
  });

  it('rechecks the administrator grant when the ticket is exchanged', async () => {
    const f = fixture();
    const grant = await f.service.issueRecoveryTicket(f.actor, operationId, 'Browser was lost');
    f.db.userPermissionGrant.findFirst.mockResolvedValueOnce(null as never);
    await expect(f.service.exchangeRecoveryTicket(f.request, grant.ticket, 'PRIMAX-SUR-T02')).rejects.toThrow('revocada');
    expect(f.db.terminalCredential.updateMany).not.toHaveBeenCalled();
  });

  it('recovers an already settled sale while preserving its receipt', async () => {
    const f = fixture();
    const authId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const saleId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    f.order.status = 'CAPTURED';
    f.payment.status = 'CAPTURED'; f.payment.transactionId = saleId as never;
    f.reservation.status = 'CLOSED'; f.reservation.authorizationId = authId as never; f.reservation.transactionId = saleId as never;
    f.db.fuelAuthorization.findMany.mockResolvedValue([{ id: authId, status: 'SETTLED', paymentId: f.payment.id,
      stationId, terminalId, pumpId: f.operation.pumpId, terminalOperationId: f.operation.id, dispensedAmount: money(12) }] as never);
    f.db.transaction.findMany.mockResolvedValue([{ id: saleId, status: 'PAID', authorizationId: authId,
      stationId, terminalId, pumpId: f.operation.pumpId, terminalOperationId: f.operation.id }] as never);
    f.db.receipt.findUnique.mockResolvedValue({ id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', number: 'EB01-0008' } as never);
    f.db.paymentEvent.findMany.mockResolvedValue([{ eventKey: `demo-confirm:${f.order.id}`, kind: 'DEMO_PAID',
      detail: JSON.stringify({ id: f.order.providerId, order_number: f.order.id, amount: 1200, currency_code: 'PEN', state: 'paid' }) }] as never);
    const grant = await f.service.issueRecoveryTicket(f.actor, operationId, 'Browser was lost');
    const result = await f.service.exchangeRecoveryTicket(f.request, grant.ticket, 'PRIMAX-SUR-T02');
    expect(result.evidence).toMatchObject({ kind: 'SETTLED_SALE', receiptNumber: 'EB01-0008' });
    expect(f.db.payment.findMany).toHaveBeenCalled();
    expect(f.db.receipt.findUnique).toHaveBeenCalled();
  });

  it('allows only one concurrent exchange of the same ticket', async () => {
    const f = fixture();
    const grant = await f.service.issueRecoveryTicket(f.actor, operationId, 'Browser was lost');
    const outcomes = await Promise.allSettled([
      f.service.exchangeRecoveryTicket(f.request, grant.ticket, 'PRIMAX-SUR-T02'),
      f.service.exchangeRecoveryTicket(f.request, grant.ticket, 'PRIMAX-SUR-T02'),
    ]);
    expect(outcomes.filter(x => x.status === 'fulfilled')).toHaveLength(1);
  });

  it('rejects a ticket after its Redis expiry', async () => {
    const f = fixture();
    const grant = await f.service.issueRecoveryTicket(f.actor, operationId, 'Browser was lost');
    f.values.clear();
    await expect(f.service.exchangeRecoveryTicket(f.request, grant.ticket, 'PRIMAX-SUR-T02')).rejects.toThrow('vencida o utilizada');
    expect(f.db.terminalCredential.updateMany).not.toHaveBeenCalled();
  });

  it('limits the recovered kiosk session to cancelling its original pending order', async () => {
    const f = fixture();
    const grant = await f.service.issueRecoveryTicket(f.actor, operationId, 'Browser was lost');
    const result = await f.service.exchangeRecoveryTicket(f.request, grant.ticket, 'PRIMAX-SUR-T02');
    const req = { method: 'POST', originalUrl: '/api/v1/kiosk/session/authorize', body: {},
      header: (name: string) => ({ 'x-kiosk-session': result.token, 'x-csrf-token': result.csrfToken,
        'x-terminal-session': result.terminalToken, 'x-terminal-owner': owner }[name] ?? '') } as Request;
    await expect(f.service.authorize(req, { method: 'POST', path: `/api/v1/online-orders/${f.order.id}/cancel` })).resolves.toMatchObject({ stationId });
    await expect(f.service.authorize(req, { method: 'POST', path: '/api/v1/online-orders', body: {} })).rejects.toThrow('limitada');
    await expect(f.service.authorize(req, { method: 'GET', path: `/api/v1/online-orders/${f.order.id}` })).rejects.toThrow('limitada');
    await expect(f.service.authorize(req, { method: 'POST', path: `/api/v1/online-orders/${f.order.id}/demo-confirm` })).rejects.toThrow('limitada');
    await expect(f.service.authorize(req, { method: 'GET', path: '/api/v1/online-orders/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' })).rejects.toThrow('limitada');
  });
});

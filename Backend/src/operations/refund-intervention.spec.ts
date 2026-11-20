import { Prisma } from '@prisma/client';
import { ControlPaymentsService } from './control-payments';

function fixture() {
  const amount = new Prisma.Decimal(20);
  const operation = { id: 'row', operationId: 'op', stationId: 'station', terminalId: 'terminal', status: 'ACTIVE' };
  const payment = { id: 'payment', status: 'REFUNDED', amount, refundedAmount: amount, transactionId: null, method: 'YAPE' };
  const order = { id: 'order', status: 'REFUNDED', paymentId: payment.id, amount, transactionId: null, method: 'YAPE' };
  const reservation = { terminalOperationId: operation.id, stationId: operation.stationId, source: 'TERMINAL',
    status: 'CANCELLED', authorizationId: null, transactionId: null, initialLiters: amount, releasedLiters: amount,
    consumedLiters: new Prisma.Decimal(0), remainingLiters: new Prisma.Decimal(0) };
  const db = {
    terminalOperation: {findUnique: jest.fn().mockResolvedValue(operation), updateMany: jest.fn()},
    payment: {findUnique: jest.fn().mockResolvedValue(payment)}, onlineOrder: {findUnique: jest.fn().mockResolvedValue(order)},
    paymentEvent: {findUnique: jest.fn().mockResolvedValue({kind:'REFUNDED', orderId:'order', paymentId:'payment'})},
    inventoryReservation: {findUnique: jest.fn().mockResolvedValue(reservation)},
    transaction: {findFirst: jest.fn()}, fuelAuthorization: {findUnique: jest.fn(), findFirst: jest.fn()},
    operationalIncident: {findMany: jest.fn(), upsert: jest.fn().mockResolvedValue({id:'incident'})},
    operationalAuditEvent: {create: jest.fn()}, atomic: jest.fn(),
  };
  db.atomic.mockImplementation(work => work(db));
  const service = new ControlPaymentsService(db as never, {} as never, {} as never);
  const actor = {kind:'control' as const,userId:'manager',permissions:['ADMIN_INCIDENT_VIEW','ADMIN_INCIDENT_MANAGE'],stationIds:['station'],global:false};
  const escalate = () => service.act(actor as never, 'op', {action:'ESCALATE'});
  return { db, payment, order, reservation, actor, escalate };
}

describe('staff escalation after confirmed pre-dispense refund', () => {
  it('makes only the active operation eligible for manual resolution', async () => {
    const f = fixture();
    await f.escalate();
    expect(f.db.terminalOperation.updateMany).toHaveBeenCalledWith({
      where: {id:'row', status:'ACTIVE', closedAt:null},
      data: {status:'INTERVENTION_REQUIRED',version:{increment:1}},
    });
  });
  it.each(['partial','pending','other payment','event missing','wrong terminal operation','inventory consumed','authorization','sale'])(
    'keeps the ordinary incident workflow for %s', async condition => {
      const f = fixture();
      if (condition === 'partial') f.payment.refundedAmount = new Prisma.Decimal(1);
      if (condition === 'pending') f.order.status = 'REFUNDING';
      if (condition === 'other payment') f.order.paymentId = 'another';
      if (condition === 'event missing') f.db.paymentEvent.findUnique.mockResolvedValue(null);
      if (condition === 'wrong terminal operation') f.reservation.terminalOperationId = 'other';
      if (condition === 'inventory consumed') f.reservation.consumedLiters = new Prisma.Decimal(1);
      if (condition === 'authorization') f.db.fuelAuthorization.findFirst.mockResolvedValue({id:'auth'});
      if (condition === 'sale') f.db.transaction.findFirst.mockResolvedValue({id:'sale'});
      await f.escalate();
      expect(f.db.terminalOperation.updateMany).not.toHaveBeenCalled();
      expect(f.db.operationalIncident.upsert).toHaveBeenCalledTimes(1);
    });
  it.each(['permission','station'])('rejects missing %s before writes', async condition => {
    const f = fixture();
    if (condition === 'permission') f.actor.permissions.pop();
    else f.actor.stationIds = ['other'];
    await expect(f.escalate()).rejects.toMatchObject({status:403});
    expect(f.db.atomic).not.toHaveBeenCalled();
  });
});

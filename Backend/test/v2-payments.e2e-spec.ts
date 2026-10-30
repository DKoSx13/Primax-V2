import { randomUUID } from 'node:crypto';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { PrismaService } from '../src/prisma/prisma.service';
import { OperationsService } from '../src/operations/operations.service';
import { SupervisorPaymentsService } from '../src/operations/supervisor-payments';
import { OnlineOrdersService } from '../src/payments/online-orders';
import { DemoWalletProvider } from '../src/payments/demo-provider';
import {
  PaymentProvider,
  ProviderOrder,
} from '../src/payments/payment-provider';
import { CreateAuthorizationDto } from '../src/transactions/create-authorization.dto';
import { CreateTransactionDto } from '../src/transactions/create-transaction.dto';
import { Actor } from '../src/auth/access';

const suite = process.env.V2_LOCAL_TESTS === 'true' ? describe : describe.skip;
suite('V2 payments on dedicated local PostgreSQL', () => {
  let db: PrismaService,
    ops: OperationsService,
    orders: OnlineOrdersService,
    recovery: SupervisorPaymentsService;
  let stationId: string, fuelId: string, userId: string, shiftId: string;
  let actor: Extract<Actor, { kind: 'control' }>;
  const original = {
    APP_MODE: process.env.APP_MODE,
    PAYMENT_ENV: process.env.PAYMENT_ENV,
    DEMO_WALLET_ENABLED: process.env.DEMO_WALLET_ENABLED,
  };
  beforeAll(async () => {
    const target = new URL(process.env.DATABASE_URL!);
    if (
      target.host !== '127.0.0.1:26602' ||
      target.pathname !== '/primax_v2_test'
    )
      throw Error('Dedicated V2 local DB required');
    Object.assign(process.env, {
      APP_MODE: 'local',
      PAYMENT_ENV: 'demo',
      DEMO_WALLET_ENABLED: 'true',
    });
    db = new PrismaService();
    await db.$connect();
    ops = new OperationsService(db);
    orders = new OnlineOrdersService(db, new DemoWalletProvider(db));
    recovery = new SupervisorPaymentsService(db, orders, ops);
    const suffix = randomUUID().slice(0, 20);
    stationId = (
      await db.station.create({
        data: {
          code: 'PAY-' + suffix,
          name: 'Payments V2 local',
          address: 'Local test',
        },
      })
    ).id;
    fuelId = (
      await db.fuel.create({
        data: { code: 'P-' + suffix, name: 'V2 test', pricePerGallon: 20 },
      })
    ).id;
    userId = (
      await db.user.create({
        data: {
          email: suffix + '@payments.test',
          name: 'Supervisor',
          passwordHash: 'not-used',
        },
      })
    ).id;
    await db.supervisorStationAssignment.create({
      data: { userId, stationId, reason: 'Local payment test' },
    });
    shiftId = (await ops.openShift(userId, stationId)).id;
    await db.fuelInventory.create({
      data: { stationId, fuelId, liters: 100000 },
    });
    await db.inventoryActivation.update({
      where: { stationId_fuelId: { stationId, fuelId } },
      data: { status: 'RECONCILED', reconciledAt: new Date() },
    });
    actor = {
      kind: 'control',
      userId,
      role: 'SUPERVISOR',
      permissions: [],
      stationIds: [],
      global: false,
    };
  });
  afterAll(async () => {
    await db?.$disconnect();
    for (const [k, v] of Object.entries(original)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });
  async function operation() {
    const code = randomUUID().slice(0, 20);
    const pump = await db.pump.create({
      data: { stationId, code, name: 'Local' },
    });
    const terminal = await db.terminal.create({
      data: { stationId, code, operationalStatus: 'DISPONIBLE' },
    });
    await db.terminalPumpAssignment.create({
      data: { stationId, terminalId: terminal.id, pumpId: pump.id },
    });
    await ops.enable(userId, terminal.id, shiftId);
    const operationId = randomUUID();
    await ops.startOperation(terminal.id, operationId);
    const authorization = plainToInstance(CreateAuthorizationDto, {
      operationId,
      stationId,
      fuelId,
      mode: 'PREPAGO',
      paymentMethod: 'YAPE',
      plate: 'ABC-123',
      unitPrice: '20.00',
      amount: '50.00',
      receiptType: 'BOLETA',
    });
    return { operationId, authorization, terminalId: terminal.id };
  }
  it('rejects cash on every new V2 DTO while retaining historical enum/data', async () => {
    const f = await operation();
    for (const dto of [
      plainToInstance(CreateAuthorizationDto, {
        ...f.authorization,
        paymentMethod: 'EFECTIVO',
      }),
      plainToInstance(CreateTransactionDto, {
        ...f.authorization,
        paymentMethod: 'EFECTIVO',
      }),
    ])
      expect(
        (await validate(dto)).some((e) => e.property === 'paymentMethod'),
      ).toBe(true);
    const historical = await db.payment.create({
      data: {
        amount: 10,
        method: 'EFECTIVO',
        status: 'CAPTURED',
        provider: 'HISTORICAL',
      },
    });
    expect(
      (await db.payment.findUniqueOrThrow({ where: { id: historical.id } }))
        .method,
    ).toBe('EFECTIVO');
    await expect(
      orders.create(
        {
          operationId: f.operationId,
          method: 'EFECTIVO',
          authorization: { ...f.authorization, paymentMethod: 'EFECTIVO' },
        } as never,
        { kind: 'kiosk', stationId },
      ),
    ).rejects.toThrow('no permitido');
  });
  it('keeps pending orders pending without putting stock in review and safely reselects once', async () => {
    const f = await operation();
    const dto = {
      operationId: f.operationId,
      method: 'YAPE' as const,
      authorization: f.authorization,
    };
    const order = await orders.create(dto, { kind: 'kiosk', stationId });
    expect(
      (await orders.status(order.id, { kind: 'kiosk', stationId })).status,
    ).toBe('PENDING');
    expect(
      (
        await db.inventoryReservation.findUniqueOrThrow({
          where: { operationId: f.operationId },
        })
      ).status,
    ).toBe('PENDING_PAYMENT');
    const changed = {
      operationId: f.operationId,
      method: 'PLIN' as const,
      authorization: { ...f.authorization, paymentMethod: 'PLIN' as const },
    };
    await orders.reselect(order.id, changed, { kind: 'kiosk', stationId });
    expect(
      (
        await db.payment.findUniqueOrThrow({
          where: { operationId: f.operationId },
        })
      ).status,
    ).toBe('PENDING');
    expect(
      await db.payment.count({ where: { operationId: f.operationId } }),
    ).toBe(1);
    expect(
      (await recovery.detail(actor, f.operationId)).allowedActions,
    ).toContain('RESELECT');
    await recovery.act(actor, f.operationId, { action: 'CANCEL' });
    expect(
      (
        await db.terminalOperation.findUniqueOrThrow({
          where: { operationId: f.operationId },
        })
      ).status,
    ).toBe('CLOSED');
    expect(
      (
        await db.payment.findUniqueOrThrow({
          where: { operationId: f.operationId },
        })
      ).status,
    ).toBe('CANCELLED');
  });
  it('repeated/concurrent provider confirmation captures one payment and blocks unsafe reselection/cancel', async () => {
    const f = await operation();
    const order = await orders.create(
      {
        operationId: f.operationId,
        method: 'YAPE',
        authorization: f.authorization,
      },
      { kind: 'kiosk', stationId },
    );
    await Promise.all([
      orders.confirmDemo(
        order.id,
        { amount: '50.00', currency: 'PEN' },
        { kind: 'kiosk', stationId },
      ),
      orders.confirmDemo(
        order.id,
        { amount: '50.00', currency: 'PEN' },
        { kind: 'kiosk', stationId },
      ),
    ]);
    expect(
      await db.paymentEvent.count({
        where: { eventKey: 'capture:' + order.id },
      }),
    ).toBe(1);
    expect((await recovery.detail(actor, f.operationId)).payment?.status).toBe(
      'CAPTURED',
    );
    await expect(
      recovery.act(actor, f.operationId, { action: 'CANCEL' }),
    ).rejects.toThrow('no segura');
    await expect(
      orders.reselect(
        order.id,
        {
          operationId: f.operationId,
          method: 'PLIN',
          authorization: { ...f.authorization, paymentMethod: 'PLIN' },
        },
        { kind: 'kiosk', stationId },
      ),
    ).rejects.toThrow();
    const outsider = { ...actor, userId: randomUUID() };
    await expect(recovery.detail(outsider, f.operationId)).rejects.toThrow(
      'fuera',
    );
  });
  it('records one incident on ambiguous provider response and never creates another charge on retry', async () => {
    const f = await operation();
    let calls = 0;
    const provider: PaymentProvider = {
      create: async () => {
        calls++;
        throw Error('timeout');
      },
      get: async () => {
        throw Error('timeout');
      },
    };
    const uncertain = new OnlineOrdersService(db, provider);
    const dto = {
      operationId: f.operationId,
      method: 'YAPE' as const,
      authorization: f.authorization,
      customer: {
        first_name: 'Local',
        last_name: 'Test',
        email: 'local@test.test',
        phone_number: '999999999',
      },
    };
    await expect(
      uncertain.create(dto, { kind: 'kiosk', stationId }),
    ).rejects.toThrow('timeout');
    const existing = await uncertain.create(dto, { kind: 'kiosk', stationId });
    expect(existing.status).toBe('CREATING');
    expect(calls).toBe(1);
    const incidents = await db.operationalIncident.findMany({
      where: { operationId: f.operationId },
    });
    expect(incidents).toHaveLength(1);
    expect(
      (
        await db.payment.findUniqueOrThrow({
          where: { operationId: f.operationId },
        })
      ).status,
    ).toBe('PENDING');
    await recovery.act(actor, f.operationId, {
      action: 'ESCALATE',
      observation: 'Revisar proveedor',
    });
    expect(
      await db.operationalIncident.count({
        where: { operationId: f.operationId },
      }),
    ).toBe(1);
  });
  it('confirmed provider rejection releases stock and creates incidence without marking paid', async () => {
    const f = await operation();
    let remote: ProviderOrder;
    const provider: PaymentProvider = {
      create: async (id, amount) =>
        (remote = {
          id: 'mock:' + id,
          order_number: id,
          amount,
          currency_code: 'PEN',
          state: 'pending',
        }),
      get: async () => ({ ...remote, state: 'rejected' }),
    };
    const external = new OnlineOrdersService(db, provider);
    const order = await external.create(
      {
        operationId: f.operationId,
        method: 'YAPE',
        authorization: f.authorization,
        customer: {
          first_name: 'Local',
          last_name: 'Test',
          email: 'local@test.test',
          phone_number: '999999999',
        },
      },
      { kind: 'kiosk', stationId },
    );
    expect(
      (await external.status(order.id, { kind: 'kiosk', stationId })).status,
    ).toBe('FAILED');
    expect(
      (
        await db.payment.findUniqueOrThrow({
          where: { operationId: f.operationId },
        })
      ).status,
    ).toBe('REJECTED');
    expect(
      (
        await db.inventoryReservation.findUniqueOrThrow({
          where: { operationId: f.operationId },
        })
      ).status,
    ).toBe('CANCELLED');
    expect(
      await db.operationalIncident.count({
        where: { operationId: f.operationId },
      }),
    ).toBe(1);
  });
});

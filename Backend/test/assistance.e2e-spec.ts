import { randomUUID, createHash, randomBytes } from 'node:crypto';
import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { AssistanceService } from '../src/assistance/assistance.service';
import {
  ControlAssistanceController,
  TerminalAssistanceController,
} from '../src/assistance/assistance.controller';
import { Actor } from '../src/auth/access';
import { AccessGuard } from '../src/auth/access.guard';
import { UsersService } from '../src/users/users.service';
import { KioskService } from '../src/kiosk/kiosk.service';
import { setupApp } from '../src/setup-app';

const suite = process.env.V2_LOCAL_TESTS === 'true' ? describe : describe.skip;
suite('V2 assistance: real PostgreSQL, HTTP validation and AccessGuard', () => {
  let db: PrismaService;
  let service: AssistanceService;
  let app: INestApplication;
  let terminal: Extract<Actor, { kind: 'terminal' }>;
  let otherTerminal: typeof terminal;
  let a: Extract<Actor, { kind: 'control' }>;
  let b: typeof a;
  let admin: typeof a;
  let root: typeof a;
  let token: string;
  let adminToken: string;
  const secret = 'v2-assistance-local-test-secret-32-chars';
  const terminalToken = randomBytes(32).toString('hex');
  const seed = randomUUID().slice(0, 24);
  beforeAll(async () => {
    const target = new URL(process.env.DATABASE_URL!);
    if (
      target.hostname !== '127.0.0.1' ||
      target.port !== '26602' ||
      target.pathname !== '/primax_v2_test'
    )
      throw Error('Dedicated local V2 database required');
    db = new PrismaService();
    await db.$connect();
    service = new AssistanceService(db);
    const station = await db.station.create({
      data: { code: seed, name: 'V2 local A', address: 'Local tests' },
    });
    const stationB = await db.station.create({
      data: {
        code: randomUUID().slice(0, 24),
        name: 'V2 local B',
        address: 'Local tests',
      },
    });
    const user = async () =>
      db.user.create({
        data: {
          email: randomUUID() + '@local.test',
          name: 'Supervisor',
          passwordHash: 'not-a-login-hash',
        },
      });
    const [ua, ub, uc, ur] = await Promise.all([
      user(),
      user(),
      user(),
      user(),
    ]);
    const actor = (userId: string): typeof a => ({
      kind: 'control',
      userId,
      role: 'SUPERVISOR',
      permissions: [],
      stationIds: [],
      global: false,
    });
    a = actor(ua.id);
    b = actor(ub.id);
    admin = {
      ...actor(uc.id),
      role: 'ADMIN',
      permissions: ['ADMIN_CONTROL_ACCESS', 'ADMIN_INCIDENT_VIEW'],
      stationIds: [station.id],
    };
    root = {
      ...actor(ur.id),
      role: 'SUPER_ADMIN',
      permissions: ['ADMIN_INCIDENT_VIEW'],
      global: true,
    };
    await db.supervisorStationAssignment.createMany({
      data: [ua, ub].map((u) => ({
        userId: u.id,
        stationId: station.id,
        reason: 'Local V2 test',
      })),
    });
    const account = await db.adminControlAccount.create({
      data: {
        userId: uc.id,
        role: 'ADMIN',
        status: 'APPROVED',
        emailVerifiedAt: new Date(),
      },
    });
    await db.adminControlGrant.createMany({
      data: admin.permissions.map((permission) => ({
        userId: uc.id,
        permission: permission as 'ADMIN_INCIDENT_VIEW',
        reason: 'Local test',
      })),
    });
    await db.adminStationAssignment.create({
      data: {
        accountId: account.id,
        userId: uc.id,
        stationId: station.id,
        reason: 'Local test',
      },
    });
    const makeTerminal = async (stationId: string) => {
      const pump = await db.pump.create({
        data: { stationId, code: '03', name: 'Local' },
      });
      const t = await db.terminal.create({
        data: { stationId, code: 'V2-LOCAL' },
      });
      await db.terminalPumpAssignment.create({
        data: { stationId, terminalId: t.id, pumpId: pump.id },
      });
      return {
        kind: 'terminal' as const,
        terminalId: t.id,
        stationId,
        credentialId: randomUUID(),
      };
    };
    terminal = await makeTerminal(station.id);
    otherTerminal = await makeTerminal(stationB.id);
    await db.terminalCredential.create({
      data: {
        terminalId: terminal.terminalId,
        tokenHash: createHash('sha256').update(terminalToken).digest('hex'),
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    const jwt = new JwtService({ secret });
    token = await jwt.signAsync({ sub: ua.id, ver: 0 });
    adminToken = await jwt.signAsync({ sub: uc.id, ver: 0 });
    const config = {
      get: (key: string) => (key === 'APP_MODE' ? 'local' : undefined),
      getOrThrow: () => 'http://localhost',
    } as unknown as ConfigService;
    const module = await Test.createTestingModule({
      controllers: [ControlAssistanceController, TerminalAssistanceController],
      providers: [
        AssistanceService,
        { provide: PrismaService, useValue: db },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    app = module.createNestApplication();
    const kiosk = {
      verifyGateway: (req: { header: (name: string) => string }) => {
        if (req.header('x-kiosk-signature') !== 'local-test-signature')
          throw new UnauthorizedException();
      },
      limitTechnical: async () => undefined,
    } as unknown as KioskService;
    app.useGlobalGuards(
      new AccessGuard(
        new Reflector(),
        config,
        jwt,
        {
          findById: (id: string) => db.user.findUnique({ where: { id } }),
        } as unknown as UsersService,
        kiosk,
        db,
      ),
    );
    setupApp(app);
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
    await db?.$disconnect();
  });
  const create = (
    reason: 'AYUDA_GENERAL' | 'OTRO' | 'ERROR_PAGO' = 'AYUDA_GENERAL',
  ) => service.create(terminal, { requestId: randomUUID(), reason });
  const post = (path: string, body: object) =>
    request(app.getHttpServer())
      .post('/api/v1' + path)
      .set('x-kiosk-signature', 'local-test-signature')
      .set('x-terminal-session', terminalToken)
      .send(body);

  it('validates reason, UUID and rejects forged scope/financial fields through HTTP', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/terminal/assistance')
      .send({ requestId: randomUUID(), reason: 'OTRO' })
      .expect(401);
    for (const extra of [
      { reason: 'FAKE' },
      { stationId: otherTerminal.stationId },
      { assignedSupervisorId: a.userId },
      { status: 'RESUELTA' },
      { paymentStatus: 'CAPTURED' },
    ])
      await post('/terminal/assistance', {
        requestId: randomUUID(),
        reason: 'OTRO',
        ...extra,
      }).expect(400);
    const response = await post('/terminal/assistance', {
      requestId: randomUUID(),
      reason: 'OTRO',
      observation: 'Necesito ayuda',
    }).expect(201);
    expect(response.body.status).toBe('PENDIENTE');
    expect(response.body.terminalId).toBeUndefined();
  });
  it('derives station/pump/terminal, allows help before operation and preserves idempotency', async () => {
    const dto = {
      requestId: randomUUID(),
      reason: 'OTRO' as const,
      observation: 'Otro motivo',
    };
    const [x, y] = await Promise.all([
      service.create(terminal, dto),
      service.create(terminal, dto),
    ]);
    expect(x.id).toBe(y.id);
    const detail = await service.detail(a, x.id);
    expect(detail).toMatchObject({
      stationId: terminal.stationId,
      terminalId: terminal.terminalId,
      reason: 'OTRO',
      observation: 'Otro motivo',
    });
    expect(detail.pumpId).toBeTruthy();
    expect(detail.events).toHaveLength(1);
    await expect(
      service.create(terminal, { ...dto, reason: 'ERROR_PAGO' }),
    ).rejects.toThrow('otro contexto');
    await expect(
      service.create(terminal, {
        ...dto,
        requestId: randomUUID(),
        operationId: randomUUID(),
      }),
    ).rejects.toThrow('fuera');
  });
  it('accepts exactly one simultaneous Supervisor and returns 409 to the second', async () => {
    const row = await create();
    const results = await Promise.allSettled([
      service.act(a, row.id, { action: 'ACCEPT' }),
      service.act(b, row.id, { action: 'ACCEPT' }),
    ]);
    expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    const loser = results.find(
      (x) => x.status === 'rejected',
    ) as PromiseRejectedResult;
    expect(loser.reason.getStatus()).toBe(409);
    expect(loser.reason.message).toMatch(/ya está siendo atendida/);
    const detail = await service.detail(a, row.id);
    expect([a.userId, b.userId]).toContain(detail.assignedSupervisorId);
    expect(detail.acceptedAt).toBeInstanceOf(Date);
    expect(
      detail.events.filter((e) => e.action === 'ASSISTANCE_ACCEPT'),
    ).toHaveLength(1);
  });
  it('enforces station scope, grants, assigned owner and blocks Admin from acting as Supervisor', async () => {
    const row = await create();
    await service.act(a, row.id, { action: 'ACCEPT' });
    await expect(
      service.act(b, row.id, {
        action: 'RESOLVE',
        result: 'No soy responsable',
      }),
    ).rejects.toThrow('responsable');
    await expect(
      service.act(admin, row.id, { action: 'RESOLVE', result: 'Admin' }),
    ).rejects.toThrow('asignación');
    expect((await service.list(admin, {})).some((r) => r.id === row.id)).toBe(
      true,
    );
    await expect(
      service.list(admin, { stationId: otherTerminal.stationId }),
    ).rejects.toThrow('alcance');
    const outsider = await service.create(otherTerminal, {
      requestId: randomUUID(),
      reason: 'AYUDA_GENERAL',
    });
    await expect(service.detail(a, outsider.id)).rejects.toThrow('alcance');
    await expect(
      service.detail({ ...admin, permissions: [] }, row.id),
    ).rejects.toThrow('alcance');
    expect((await service.detail(root, outsider.id)).id).toBe(outsider.id);
    await expect(service.cancel(otherTerminal, row.id)).rejects.toThrow(
      'no encontrada',
    );
    await request(app.getHttpServer())
      .post('/api/v1/control/assistance/' + row.id + '/actions')
      .set('authorization', 'Bearer ' + adminToken)
      .send({ action: 'ACCEPT' })
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/v1/control/assistance?stationId=' + otherTerminal.stationId)
      .set('authorization', 'Bearer ' + token)
      .expect(403);
  });
  it('records notes, result, resolution, escalation incident and immutable audit', async () => {
    const row = await create();
    await service.act(a, row.id, { action: 'ACCEPT' });
    await service.act(a, row.id, {
      action: 'NOTE',
      observation: 'Cliente atendido',
    });
    await expect(service.act(a, row.id, { action: 'RESOLVE' })).rejects.toThrow(
      'resultado',
    );
    await service.act(a, row.id, {
      action: 'RESOLVE',
      result: 'Ayuda completada',
    });
    const detail = await service.detail(admin, row.id);
    expect(detail.status).toBe('RESUELTA');
    expect(detail.resolvedAt).toBeInstanceOf(Date);
    expect(detail.events).toHaveLength(4);
    await expect(
      db.operationalAuditEvent.update({
        where: { id: detail.events[0].id },
        data: { action: 'TAMPER' },
      }),
    ).rejects.toThrow('append-only');
    await expect(
      db.operationalAuditEvent.delete({ where: { id: detail.events[0].id } }),
    ).rejects.toThrow('append-only');
    await expect(service.cancel(terminal, row.id)).rejects.toThrow('finalizó');
    const escalated = await create('ERROR_PAGO');
    await service.act(a, escalated.id, { action: 'ACCEPT' });
    await service.act(a, escalated.id, {
      action: 'ESCALATE',
      result: 'Requiere soporte',
      observation: 'Pago en revisión',
    });
    const escalation = await service.detail(admin, escalated.id);
    expect(escalation.escalatedAt).toBeInstanceOf(Date);
    expect(escalation.incidents).toHaveLength(1);
    expect(escalation.incidents[0].context).toMatchObject({
      assignedSupervisorId: a.userId,
    });
  });
  it.each([false, true])(
    'cancels pending/in-attention (%s), preserving assignment and audit',
    async (accepted) => {
      const row = await create();
      if (accepted) await service.act(a, row.id, { action: 'ACCEPT' });
      const cancelled = await service.cancel(terminal, row.id);
      expect(cancelled.status).toBe('CANCELADA_POR_CLIENTE');
      expect(cancelled.cancelledAt).toBeInstanceOf(Date);
      expect(await service.cancel(terminal, row.id)).toEqual(cancelled);
      await expect(
        service.act(b, row.id, { action: 'ACCEPT' }),
      ).rejects.toThrow('finalizó');
    },
  );
  it('serializes cancellation racing acceptance without orphan audits', async () => {
    const row = await create();
    await Promise.allSettled([
      service.act(a, row.id, { action: 'ACCEPT' }),
      service.cancel(terminal, row.id),
    ]);
    const detail = await service.detail(a, row.id);
    expect(detail.status).toBe('CANCELADA_POR_CLIENTE');
    expect(
      detail.events.filter((e) => e.action === 'ASSISTANCE_CANCELLED'),
    ).toHaveLength(1);
  });
});

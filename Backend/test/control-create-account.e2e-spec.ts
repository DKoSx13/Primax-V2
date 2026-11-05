import { randomUUID } from 'node:crypto';
import { json } from 'express';
import { compare, hash } from 'bcryptjs';
import { ConfigService } from '@nestjs/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AccessGuard } from '../src/auth/access.guard';
import { RecoveryDelivery } from '../src/auth/recovery-delivery';
import { UsersService } from '../src/users/users.service';
import { KioskService } from '../src/kiosk/kiosk.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { ControlController } from '../src/control/control.controller';
import { ControlService } from '../src/control/control.service';
import { HttpErrorFilter } from '../src/common/http-error.filter';

const isolated = process.env.CONTROL_TEST_DATABASE_URL;
const suite = isolated ? describe : describe.skip;

suite('POST /api/v1/control/accounts on isolated PostgreSQL', () => {
  let db: PrismaService;
  let app: INestApplication;
  let jwt: JwtService;
  let rootToken: string;
  let adminToken: string;
  let encargadoToken: string;
  const rootId = randomUUID();
  const stationId = randomUUID();
  const inactiveStationId = randomUUID();
  const tag = randomUUID().slice(0, 8);
  const password = 'LocalControlTest!123';
  const permissions = ['ADMIN_CONTROL_ACCESS', 'ADMIN_DASHBOARD_VIEW', 'ADMIN_INCIDENT_VIEW'];
  const payload = (role: string, email: string) => ({ name: `Test ${role}`, email, password, role, stationIds: [stationId], permissions });
  const post = (token: string, body: Record<string, unknown>) => request(app.getHttpServer()).post('/api/v1/control/accounts').set('Authorization', `Bearer ${token}`).send(body);
  const sign = (userId: string) => jwt.signAsync({ sub: userId, ver: 0 });

  beforeAll(async () => {
    const target = new URL(isolated!);
    if (target.protocol !== 'postgresql:' || target.hostname !== '127.0.0.1' || target.port !== '26544' || target.pathname !== '/primax_control_test' || target.search)
      throw new Error('Only the dedicated local PostgreSQL fixture is allowed');
    process.env.DATABASE_URL = isolated;
    process.env.DATABASE_URL_UNPOOLED = isolated;
    db = new PrismaService();
    await db.$connect();
    jwt = new JwtService({ secret: 'local-control-integration-secret-32', signOptions: { issuer: 'primax-v6', audience: 'primax-prime', algorithm: 'HS256' }, verifyOptions: { issuer: 'primax-v6', audience: 'primax-prime', algorithms: ['HS256'] } });
    const config = { get: (key: string) => key === 'APP_MODE' ? 'local' : undefined, getOrThrow: (key: string) => key === 'JWT_SECRET' ? 'local-control-integration-secret-32' : undefined };
    const module = await Test.createTestingModule({
      controllers: [ControlController],
      providers: [
        ControlService, AccessGuard,
        { provide: PrismaService, useValue: db },
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: config },
        { provide: RecoveryDelivery, useValue: { mode: 'disabled' } },
        { provide: UsersService, useValue: { findById: (id: string) => db.user.findUnique({ where: { id } }) } },
        { provide: KioskService, useValue: {} },
      ],
    }).compile();
    app = module.createNestApplication();
    app.use(json());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new HttpErrorFilter());
    app.useGlobalGuards(module.get(AccessGuard));
    await app.init();
    const passwordHash = await hash(password, 4);
    await db.user.createMany({ data: [
      { id: rootId, email: `root-${tag}@primax.test`, name: 'Root local', passwordHash },
    ] });
    await db.userPermissionGrant.create({ data: { userId: rootId, permission: 'SYSTEM_ADMIN', reason: 'Local integration fixture' } });
    await db.station.createMany({ data: [
      { id: stationId, code: `IT-${tag}`, name: 'Primax local', address: 'Local only', active: true },
      { id: inactiveStationId, code: `IX-${tag}`, name: 'Inactive local', address: 'Local only', active: false },
    ] });
    rootToken = await sign(rootId);
  });

  afterAll(async () => {
    if (app) await app.close();
    if (db) await db.$disconnect();
  });

  it.each(['ADMIN', 'ENCARGADO'])('creates %s with scope, grants, bcrypt and audit', async (role) => {
    const email = `${role.toLowerCase()}-${tag}@primax.test`;
    const response = await post(rootToken, payload(role, email)).expect(201);
    const userId = response.body.id as string;
    expect(response.body).not.toHaveProperty('password');
    expect(response.body).not.toHaveProperty('passwordHash');
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.passwordHash).not.toBe(password);
    expect(user.passwordHash).toMatch(/^\$2[aby]\$12\$/);
    expect(await compare(password, user.passwordHash)).toBe(true);
    const account = await db.adminControlAccount.findUniqueOrThrow({ where: { userId } });
    expect(account).toMatchObject({ role, status: 'APPROVED', approvedByUserId: rootId });
    expect(account.emailVerifiedAt).toBeInstanceOf(Date);
    const assignments = await db.adminStationAssignment.findMany({ where: { userId, endedAt: null }, include: { station: true } });
    expect(assignments.map((row) => row.stationId)).toEqual([stationId]);
    expect(assignments[0].station.active).toBe(true);
    const grants = await db.adminControlGrant.findMany({ where: { userId, revokedAt: null } });
    expect(grants.map((row) => row.permission).sort()).toEqual([...permissions].sort());
    expect(grants.every((row) => row.grantedByUserId === rootId)).toBe(true);
    const audit = await db.operationalAuditEvent.findFirstOrThrow({ where: { action: 'ADMIN_ACCOUNT_CREATED', targetId: userId } });
    expect(audit.actorUserId).toBe(rootId);
    expect(audit.details).toMatchObject({ role, stationIds: [stationId], permissions });
    if (role === 'ADMIN') adminToken = await sign(userId);
    else encargadoToken = await sign(userId);
  });

  it('newly created account can log in and receives its scoped Control session', async () => {
    const email = `admin-${tag}@primax.test`;
    const login = await request(app.getHttpServer()).post('/api/v1/control/login').send({ email, password }).expect(200);
    expect(login.body.role).toBe('ADMIN');
    expect(login.body.global).toBe(false);
    expect(login.body.stations.map((row: { id: string }) => row.id)).toEqual([stationId]);
    expect(login.body.permissions).toEqual(expect.arrayContaining(['ADMIN_CONTROL_ACCESS', 'ADMIN_DASHBOARD_VIEW']));
  });

  it('rejects duplicate email, SUPER_ADMIN, inactive or missing station, and missing base grants', async () => {
    await post(rootToken, payload('ADMIN', `admin-${tag}@primax.test`)).expect(409);
    await post(rootToken, payload('SUPER_ADMIN', `super-${tag}@primax.test`)).expect(400);
    await post(rootToken, payload('SUPERVISOR', `invalid-${tag}@primax.test`)).expect(400);
    await post(rootToken, { ...payload('ADMIN', `inactive-${tag}@primax.test`), stationIds: [inactiveStationId] }).expect(400);
    await post(rootToken, { ...payload('ADMIN', `missing-${tag}@primax.test`), stationIds: [randomUUID()] }).expect(400);
    await post(rootToken, { ...payload('ADMIN', `nogrant-${tag}@primax.test`), permissions: ['ADMIN_CONTROL_ACCESS'] }).expect(400);
  });

  it.each(['ADMIN', 'ENCARGADO'])('denies actor %s', async (role) => {
    const token = role === 'ADMIN' ? adminToken : encargadoToken;
    await post(token, payload('ADMIN', `denied-${role.toLowerCase()}-${tag}@primax.test`)).expect(403);
  });

  it('rolls back user, account, grants, assignments and audit on an insert failure', async () => {
    const email = `rollback-${tag}@primax.test`;
    const before = await Promise.all([
      db.user.count(), db.adminControlAccount.count(), db.adminControlGrant.count(),
      db.adminStationAssignment.count(), db.operationalAuditEvent.count(),
    ]);
    await db.$executeRawUnsafe('CREATE FUNCTION control_it_fail_grant() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION \'forced local integration failure\'; END $$');
    await db.$executeRawUnsafe('CREATE TRIGGER control_it_fail_grant_trigger BEFORE INSERT ON "AdminControlGrant" FOR EACH ROW EXECUTE FUNCTION control_it_fail_grant()');
    try {
      await post(rootToken, payload('ADMIN', email)).expect(500);
    } finally {
      await db.$executeRawUnsafe('DROP TRIGGER control_it_fail_grant_trigger ON "AdminControlGrant"');
      await db.$executeRawUnsafe('DROP FUNCTION control_it_fail_grant()');
    }
    const after = await Promise.all([
      db.user.count(), db.adminControlAccount.count(), db.adminControlGrant.count(),
      db.adminStationAssignment.count(), db.operationalAuditEvent.count(),
    ]);
    expect(after).toEqual(before);
    expect(await db.user.findUnique({ where: { email } })).toBeNull();
  });
});

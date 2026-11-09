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
    if ((target.host !== '127.0.0.1:26602' && !(process.env.APP_MODE === 'local' && target.host === 'postgres:5432')) || target.pathname !== '/primax_refactor_validation')
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

  it('starts automatically and rejects the obsolete administrative switch',async()=>{
    await expect(terminals.terminals(actor(encargadoId,'ENCARGADO',['ADMIN_TERMINAL_VIEW'],[otherStationId]),stationId)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(terminals.terminalStatus(actor(encargadoId,'ENCARGADO',[]),terminalId,'ENABLE')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(terminals.terminalStatus(actor(encargadoId,'ENCARGADO',['ADMIN_TERMINAL_MANAGE']),terminalId,'SUSPEND','Reason')).rejects.toThrow('solo lectura');
    expect((await operations.terminalMe(terminalId)).canStart).toBe(true);
    const id=randomUUID();expect((await operations.startOperation(terminalId,id)).enablementId).toBeNull();
    await expect(operations.startOperation(terminalId,randomUUID())).rejects.toThrow('Terminal no disponible');
    await operations.closeOperation(terminalId,id);
    expect((await operations.terminalMe(terminalId)).canStart).toBe(true);
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
        .update(JSON.stringify(['POST', path, timestamp, body, '', '', technical, '', '']))
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
    await db.terminal.update({where:{id:terminalId},data:{operationalStatus:'ASISTENCIA'}}); // Real fault fixture, not an administrative toggle.
    const resumed = await kiosk.bootstrapTerminal(signedRequest(session.terminalToken), terminalId);
    expect(resumed.terminalToken).toBe(session.terminalToken);
    expect((await operations.terminalMe(terminalId)).prepared).toBe(true);
    await expect(operations.startOperation(terminalId, randomUUID())).rejects.toThrow('Terminal no disponible');
    await operations.closeOperation(terminalId, operationId);
    await expect(kiosk.bootstrapTerminal(signedRequest(session.terminalToken), terminalId)).rejects.toThrow('temporalmente no disponible');
    await db.terminal.update({where:{id:terminalId},data:{operationalStatus:'DISPONIBLE'}}); // Hardware fault resolved in this isolated fixture.
    expect((await kiosk.bootstrapTerminal(signedRequest(session.terminalToken), terminalId)).terminalToken).toBe(session.terminalToken);
  });
  it('recovers abandoned empty attention, preserves a legitimate session and protects paid evidence',async()=>{
    const config={get:(key:string,fallback?:string)=>({KIOSK_STATION_ID:stationId,KIOSK_GATEWAY_SECRET:'local-refactor-gateway-secret'}[key]??fallback),getOrThrow:(key:string)=>({KIOSK_STATION_ID:stationId,KIOSK_GATEWAY_SECRET:'local-refactor-gateway-secret'}[key])};
    const kiosk=new KioskService(config as never,{limit:async()=>true,key:(k:string)=>k,command:async()=> 'OK'} as never,db);
    jest.spyOn(kiosk,'verifyGateway').mockImplementation(()=>{});
    jest.spyOn(kiosk,'limitTechnical').mockResolvedValue(undefined);
    const req=(token='')=>({header:()=>token}) as never;
    const session=await kiosk.bootstrapTerminal(req(),terminalId);
    const abandoned=randomUUID();await operations.startOperation(terminalId,abandoned);
    const old=new Date(Date.now()-10*60*1000);
    await db.terminalOperation.update({where:{operationId:abandoned},data:{openedAt:old}});
    await db.terminalCredential.updateMany({where:{terminalId},data:{lastUsedAt:old}});
    const recovered=await kiosk.bootstrapTerminal(req(),terminalId);
    expect(recovered.terminalToken).not.toBe(session.terminalToken);
    expect((await db.terminalOperation.findUniqueOrThrow({where:{operationId:abandoned}})).closedAt).not.toBeNull();
    expect(await db.operationalAuditEvent.count({where:{terminalId,action:'ABANDONED_EMPTY_ATTENTION_CLOSED'}})).toBe(1);
    expect((await operations.terminalMe(terminalId)).canStart).toBe(true);
    const legitimate=randomUUID();await operations.startOperation(terminalId,legitimate);
    expect((await kiosk.bootstrapTerminal(req(recovered.terminalToken),terminalId)).terminalToken).toBe(recovered.terminalToken);
    const me=await operations.terminalMe(terminalId);
    expect(me.activeOperationId).toBe(legitimate);expect(me.emptyAttention).toBe(true);
    await expect(kiosk.bootstrapTerminal(req(),terminalId)).rejects.toThrow('atención reciente');
    const payment=await db.payment.create({data:{operationId:legitimate,amount:'20',method:'TARJETA',status:'CAPTURED'}});
    await db.terminalOperation.update({where:{operationId:legitimate},data:{openedAt:old}});
    await db.terminalCredential.updateMany({where:{terminalId},data:{lastUsedAt:old}});
    await expect(kiosk.bootstrapTerminal(req(),terminalId)).rejects.toThrow('intervención autorizada');
    await expect(operations.closeOperation(terminalId,legitimate)).rejects.toThrow('intervención autorizada');
    expect((await db.terminalOperation.findUniqueOrThrow({where:{operationId:legitimate}})).closedAt).toBeNull();
    expect((await db.payment.findUniqueOrThrow({where:{id:payment.id}})).status).toBe('CAPTURED');
    expect(await db.terminalOperation.count({where:{terminalId,closedAt:null}})).toBe(1);
    const before=await db.terminalCredential.findFirstOrThrow({where:{terminalId,revokedAt:null}});
    await operations.terminalMe(terminalId,before.id);
    expect((await db.terminalCredential.findUniqueOrThrow({where:{id:before.id}})).lastUsedAt!.getTime()).toBeGreaterThan(old.getTime());
  });
});

import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { KioskService } from './kiosk.service';

describe('technical credential renewal', () => {
  function fixture(previous?: { terminalId: string; revokedAt: null; expiresAt: Date }, active = false) {
    const terminalId = '11111111-1111-4111-8111-111111111111';
    const db = {
      terminal: {
        findMany: jest.fn(async () => [{ id: terminalId, operationalStatus: 'DISPONIBLE' }]),
        findUniqueOrThrow: jest.fn(async () => ({ id: terminalId, lifecycle: 'REGISTRADA', operationalStatus: 'EN_USO' })),
        update: jest.fn(),
      },
      terminalCredential: {
        findUnique: jest.fn(async () => previous),
        updateMany: jest.fn(async () => ({ count: 1 })),
        create: jest.fn(async () => ({ id: 'credential' })),
        update: jest.fn(),
        aggregate: jest.fn(async () => ({ _max: { lastUsedAt: null as Date | null } })),
      },
      terminalOperation: { findFirst: jest.fn(async () => active ? { id: 'operation', operationId: terminalId, status: 'ACTIVE', terminalId, openedAt: new Date() } : null), update: jest.fn() },
      fuelAuthorization: { findFirst: jest.fn(async () => null as unknown) },
      transaction: { findFirst: jest.fn(async () => null as unknown) },
      payment: { findFirst: jest.fn(async () => null as unknown) },
      onlineOrder: { findFirst: jest.fn(async () => null as unknown) },
      inventoryReservation: { findFirst: jest.fn(async () => null as unknown) },
      operationalIncident: { findFirst: jest.fn(async () => null as unknown) },
      operationalAuditEvent: { create: jest.fn() },
      $queryRaw: jest.fn(),
      atomic: async (work: (client: unknown) => Promise<unknown>) => work(db),
    };
    const store = { command: jest.fn(async () => 'OK'), limit: jest.fn(async () => true), key: (key: string) => key };
    const service = new KioskService(new ConfigService({ KIOSK_STATION_ID: terminalId, KIOSK_GATEWAY_SECRET: 'x'.repeat(32) }), store as never, db as never);
    jest.spyOn(service, 'verifyGateway').mockImplementation(() => undefined);
    jest.spyOn(service, 'limitTechnical').mockResolvedValue(undefined);
    const req = { header: () => 'a'.repeat(64) } as unknown as Request;
    return { service, db, req, terminalId };
  }
  it('revokes expired credentials before inserting and audits the replacement', async () => {
    const f = fixture({ terminalId: '11111111-1111-4111-8111-111111111111', revokedAt: null, expiresAt: new Date(0) });
    const result = await f.service.bootstrapTerminal(f.req);
    expect(result.terminalToken).toMatch(/^[a-f0-9]{64}$/);
    expect(f.db.terminalCredential.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { terminalId: f.terminalId, revokedAt: null } }));
    expect(f.db.terminalCredential.create).toHaveBeenCalledTimes(1);
    expect(f.db.operationalAuditEvent.create).toHaveBeenCalledTimes(1);
  });
  it('preserves an unexpired matching browser credential', async () => {
    const f = fixture({ terminalId: '11111111-1111-4111-8111-111111111111', revokedAt: null, expiresAt: new Date(Date.now() + 60000) });
    expect((await f.service.bootstrapTerminal(f.req)).terminalToken).toBe('a'.repeat(64));
    expect(f.db.terminalCredential.updateMany).not.toHaveBeenCalled();
  });
  it('never replaces credentials while a recent attention is open', async () => {
    const f = fixture(undefined, true);
    await expect(f.service.bootstrapTerminal(f.req)).rejects.toThrow('atención reciente');
    expect(f.db.terminalCredential.updateMany).not.toHaveBeenCalled();
    expect(f.db.terminalCredential.create).not.toHaveBeenCalled();
  });
  it('closes only an abandoned empty attention and audits before replacing credentials', async () => {
    const f=fixture(undefined,true);
    const active=await f.db.terminalOperation.findFirst();active!.openedAt=new Date(0);
    f.db.terminalOperation.findFirst.mockResolvedValue(active);
    await f.service.bootstrapTerminal(f.req);
    expect(f.db.terminalOperation.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({status:'CLOSED'}) }));
    expect(f.db.operationalAuditEvent.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({action:'ABANDONED_EMPTY_ATTENTION_CLOSED'})}));
    expect(f.db.terminalCredential.create).toHaveBeenCalledTimes(1);
  });
  it.each(['fuelAuthorization','transaction','payment','onlineOrder','inventoryReservation','operationalIncident'] as const)(
    'never expires an old attention with %s evidence',async domain=>{
      const f=fixture(undefined,true);const active=await f.db.terminalOperation.findFirst();active!.openedAt=new Date(0);
      f.db.terminalOperation.findFirst.mockResolvedValue(active);
      f.db[domain].findFirst.mockResolvedValue({id:'critical'});
      await expect(f.service.bootstrapTerminal(f.req)).rejects.toThrow('intervención autorizada');
      expect(f.db.terminalOperation.update).not.toHaveBeenCalled();
      expect(f.db.terminalCredential.create).not.toHaveBeenCalled();
    });
  it('credential heartbeat prevents another browser from taking over an idle-looking selection',async()=>{
    const f=fixture(undefined,true);const active=await f.db.terminalOperation.findFirst();active!.openedAt=new Date(0);
    f.db.terminalOperation.findFirst.mockResolvedValue(active);
    f.db.terminalCredential.aggregate.mockResolvedValue({_max:{lastUsedAt:new Date()}});
    await expect(f.service.bootstrapTerminal(f.req)).rejects.toThrow('atención reciente');
    expect(f.db.terminalOperation.update).not.toHaveBeenCalled();
  });
  it('original credential resumes a financial operation without changing it',async()=>{
    const f=fixture({terminalId:'11111111-1111-4111-8111-111111111111',revokedAt:null,expiresAt:new Date(Date.now()+60000)},true);
    f.db.payment.findFirst.mockResolvedValue({id:'paid'});
    expect((await f.service.bootstrapTerminal(f.req)).terminalToken).toBe('a'.repeat(64));
    expect(f.db.terminalOperation.update).not.toHaveBeenCalled();
    expect(f.db.terminalCredential.create).not.toHaveBeenCalled();
  });
});

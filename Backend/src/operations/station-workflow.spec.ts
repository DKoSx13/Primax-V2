import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { OperationsService } from './operations.service';
import { SupervisorController } from './operations.controller';
import { ControlStationController, StationHandoffController } from './station-workflow.controller';

const userId = '11111111-1111-4111-8111-111111111111';
const stationId = '22222222-2222-4222-8222-222222222222';
const terminalId = '33333333-3333-4333-8333-333333333333';
const shiftId = '44444444-4444-4444-8444-444444444444';

function fixture() {
  const terminal = { id: terminalId, stationId, code: 'T-01', lifecycle: 'REGISTRADA', operationalStatus: 'BLOQUEADA' };
  const tx = {
    terminal: { findUnique: jest.fn().mockResolvedValue(terminal), findUniqueOrThrow: jest.fn().mockResolvedValue(terminal), update: jest.fn().mockResolvedValue({}) },
    supervisorStationAssignment: { findFirst: jest.fn().mockResolvedValue({ id: 'assignment' }) },
    supervisorShift: { findFirst: jest.fn().mockResolvedValue({ id: shiftId, stationId, status: 'ABIERTO' }) },
    terminalPumpAssignment: { findFirst: jest.fn().mockResolvedValue({ id: 'pump-assignment', pump: { id: 'pump', code: 'S-01', name: 'Surtidor' } }) },
    terminalEnablement: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'enablement' }) },
    terminalOperation: { findFirst: jest.fn().mockResolvedValue(null) },
    operationalAuditEvent: { create: jest.fn().mockResolvedValue({}) },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
  const db = { ...tx, atomic: jest.fn(async (work: (value: typeof tx) => unknown) => work(tx)) };
  return { db, tx, service: new OperationsService(db as never), terminal };
}

describe('Incremento 01: preparación segura de estación', () => {
  it('prepara una terminal asignada con turno abierto y audita el inicio', async () => {
    const f = fixture();
    const result = await f.service.prepareStation(userId, terminalId);
    expect(result).toMatchObject({ stationId, terminalId, shiftId, prepared: true, alreadyPrepared: false });
    expect(f.tx.terminalEnablement.create).toHaveBeenCalledTimes(1);
    expect(f.tx.terminal.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ operationalStatus: 'DISPONIBLE' }) }));
    expect(f.tx.operationalAuditEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'STATION_PREPARED', actorUserId: userId, stationId, terminalId }) }));
  });

  it('recupera la preparación del mismo turno sin duplicar habilitación ni operación', async () => {
    const f = fixture();
    f.tx.terminalEnablement.findFirst.mockResolvedValue({ id: 'existing', shiftId });
    f.tx.terminal.findUniqueOrThrow.mockResolvedValue({ ...f.terminal, operationalStatus: 'DISPONIBLE' });
    expect(await f.service.prepareStation(userId, terminalId)).toMatchObject({ prepared: true, alreadyPrepared: true });
    expect(f.tx.terminalEnablement.create).not.toHaveBeenCalled();
    expect(f.tx.terminalOperation.findFirst).not.toHaveBeenCalled();
    expect(f.tx.terminal.update).not.toHaveBeenCalled();
  });

  it('requiere asignación, turno abierto, surtidor y terminal sin bloqueo administrativo', async () => {
    for (const reason of ['assignment', 'shift', 'pump', 'blocked']) {
      const f = fixture();
      if (reason === 'assignment') f.tx.supervisorStationAssignment.findFirst.mockResolvedValue(null);
      if (reason === 'shift') f.tx.supervisorShift.findFirst.mockResolvedValue(null);
      if (reason === 'pump') f.tx.terminalPumpAssignment.findFirst.mockResolvedValue(null);
      if (reason === 'blocked') f.tx.terminal.findUniqueOrThrow.mockResolvedValue({ ...f.terminal, operationalStatus: 'FUERA_DE_SERVICIO' });
      await expect(f.service.prepareStation(userId, terminalId)).rejects.toThrow();
      expect(f.tx.terminalEnablement.create).not.toHaveBeenCalled();
    }
  });

  it('deniega las antiguas rutas de bloqueo/restauración del Supervisor', () => {
    const controller = new SupervisorController({ block: jest.fn(), restore: jest.fn() } as never);
    expect(() => controller.block()).toThrow(ForbiddenException);
    expect(() => controller.restore()).toThrow(ForbiddenException);
  });

  it('emite un pase breve para FuelFlow solo después de preparar la estación', async () => {
    const operations = { prepareStation: jest.fn().mockResolvedValue({ stationId, terminalId, prepared: true }) };
    const store = { key: (suffix: string) => suffix, command: jest.fn().mockResolvedValue('OK') };
    const controller = new ControlStationController(operations as never, store as never);
    const result = await controller.start({ kind: 'control', userId, role: 'SUPERVISOR', permissions: [], stationIds: [], global: false }, terminalId);
    expect(result.handoffTicket).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(store.command).toHaveBeenCalledWith('SET', expect.stringMatching(/^control-handoff:[a-f0-9]{64}$/), expect.any(String), 'EX', 90, 'NX');
  });

  it('consume el pase una sola vez y nunca entrega credenciales en la respuesta de Control', async () => {
    const operations = { prepareStation: jest.fn().mockResolvedValue({ stationId, terminalId }), issueCredential: jest.fn().mockResolvedValue({ token: 'a'.repeat(64), terminalId, expiresAt: new Date() }) };
    const store = { key: (suffix: string) => suffix, command: jest.fn().mockResolvedValueOnce(JSON.stringify({ userId, stationId, terminalId })).mockResolvedValueOnce(null) };
    const kiosk = { verifyGateway: jest.fn(), limitTechnical: jest.fn(), handoffSupervisor: jest.fn().mockResolvedValue({ token: 'b'.repeat(43), csrfToken: 'c'.repeat(43), authenticated: true, stationId }) };
    const db = { terminalCredential: { findUnique: jest.fn() } };
    const controller = new StationHandoffController(operations as never, kiosk as never, store as never, db as never);
    const request = { header: () => '' } as never;
    const body = { ticket: 't'.repeat(43) };
    expect(await controller.redeem(request, body)).toMatchObject({ terminalToken: 'a'.repeat(64), authenticated: true });
    await expect(controller.redeem(request, body)).rejects.toThrow(UnauthorizedException);
    expect(operations.issueCredential).toHaveBeenCalledTimes(1);
  });
});

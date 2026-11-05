import { ControlOperationsService } from '../control/control-operations.service';
import { OperationsService } from './operations.service';

const userId = '11111111-1111-4111-8111-111111111111';
const stationId = '22222222-2222-4222-8222-222222222222';
const terminalId = '33333333-3333-4333-8333-333333333333';
const assignment = { id: 'assignment', stationId, terminalId, pumpId: 'pump', endedAt: null, pump: { active: true, stationId } };

function fixture(status = 'BLOQUEADA') {
  const terminal = { id: terminalId, stationId, lifecycle: 'REGISTRADA', operationalStatus: status };
  const tx = {
    terminal: { findUnique: jest.fn().mockResolvedValue(terminal), findUniqueOrThrow: jest.fn().mockResolvedValue(terminal), update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...terminal, ...data })) },
    terminalPumpAssignment: { findFirst: jest.fn().mockResolvedValue(assignment) },
    terminalOperation: { findFirst: jest.fn().mockResolvedValue(null), findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'operation', ...data })) },
    operationalAuditEvent: { create: jest.fn() },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
  const db = { ...tx, atomic: jest.fn(async (work: (value: typeof tx) => unknown) => work(tx)) };
  return { tx, control: new ControlOperationsService(db as never, {} as never), operations: new OperationsService(db as never) };
}

const actor = (permissions: string[], stationIds = [stationId], role = 'ENCARGADO') =>
  ({ kind: 'control' as const, userId, role, permissions, stationIds, global: false });

describe('terminal control without shifts', () => {
  it.each(['ENCARGADO', 'ADMIN'])('%s with grant enables and audits', async (role) => {
    const f = fixture();
    const result = await f.control.terminalStatus(actor(['ADMIN_TERMINAL_MANAGE'], [stationId], role), terminalId, 'ENABLE');
    expect(result.operationalStatus).toBe('DISPONIBLE');
    expect(f.tx.operationalAuditEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'TERMINAL_ENABLED', actorUserId: userId }) }));
  });

  it('Encargado with grant suspends with reason and audits', async () => {
    const f = fixture('DISPONIBLE');
    const result = await f.control.terminalStatus(actor(['ADMIN_TERMINAL_MANAGE']), terminalId, 'SUSPEND', 'Falla de surtidor');
    expect(result).toMatchObject({ operationalStatus: 'BLOQUEADA', suspensionReason: 'Falla de surtidor' });
    expect(f.tx.operationalAuditEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'TERMINAL_SUSPENDED' }) }));
  });

  it('denies missing grant, other station, and missing reason', async () => {
    const f = fixture('DISPONIBLE');
    await expect(f.control.terminalStatus(actor([]), terminalId, 'SUSPEND', 'Falla')).rejects.toThrow();
    await expect(f.control.terminalStatus(actor(['ADMIN_TERMINAL_MANAGE'], []), terminalId, 'SUSPEND', 'Falla')).rejects.toThrow();
    await expect(f.control.terminalStatus(actor(['ADMIN_TERMINAL_MANAGE']), terminalId, 'SUSPEND')).rejects.toThrow();
    expect(f.tx.terminal.update).not.toHaveBeenCalled();
  });

  it('allows a new FuelFlow operation only when enabled without a shift', async () => {
    const enabled = fixture('DISPONIBLE');
    await enabled.operations.startOperation(terminalId, '44444444-4444-4444-8444-444444444444');
    expect(enabled.tx.terminalOperation.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.not.objectContaining({ enablementId: expect.anything() }) }));
    const blocked = fixture('BLOQUEADA');
    await expect(blocked.operations.startOperation(terminalId, '55555555-5555-4555-8555-555555555555')).rejects.toThrow('Terminal no disponible');
    expect(blocked.tx.terminalOperation.create).not.toHaveBeenCalled();
  });

  it('lets an existing operation resume while suspension blocks new starts', async () => {
    const f = fixture('ASISTENCIA');
    f.tx.terminal.findUnique.mockResolvedValue({
      id: terminalId, stationId, lifecycle: 'REGISTRADA', operationalStatus: 'ASISTENCIA',
      assignments: [assignment], operations: [{ id: 'active' }],
    });
    expect(await f.operations.terminalMe(terminalId)).toMatchObject({ prepared: true, canStart: false });
  });
});

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

describe('automatic availability with safety boundaries', () => {
  it.each(['ENCARGADO','ADMIN'])('%s cannot enable or disable FuelFlow from Control', async role => {
    const f=fixture();
    for(const action of ['ENABLE','SUSPEND'] as const)
      await expect(f.control.terminalStatus(actor(['ADMIN_TERMINAL_MANAGE'],[stationId],role),terminalId,action,'Reason')).rejects.toThrow('solo lectura');
    expect(f.tx.terminal.update).not.toHaveBeenCalled();
  });
  it('retains administrative authentication and grants', async()=>{
    await expect(fixture().control.terminalStatus(actor([]),terminalId,'SUSPEND')).rejects.toThrow();
  });
  it.each(['DISPONIBLE','BLOQUEADA'])('starts with %s without administrative activation',async status=>{
    const f=fixture(status);await f.operations.startOperation(terminalId,'44444444-4444-4444-8444-444444444444');
    expect(f.tx.terminalOperation.create).toHaveBeenCalledTimes(1);
  });
  it.each(['ASISTENCIA','FUERA_DE_SERVICIO'])('keeps real safety state %s blocked',async status=>{
    const f=fixture(status);await expect(f.operations.startOperation(terminalId,'operation')).rejects.toThrow('Terminal no disponible');
    expect(f.tx.terminalOperation.create).not.toHaveBeenCalled();
  });
  it('does not start two operations or use an inactive pump',async()=>{
    const f=fixture('DISPONIBLE');f.tx.terminalOperation.findFirst.mockResolvedValue({id:'active'});
    await expect(f.operations.startOperation(terminalId,'operation')).rejects.toThrow('activa');
    f.tx.terminalOperation.findFirst.mockResolvedValue(null);f.tx.terminalPumpAssignment.findFirst.mockResolvedValue(null);
    await expect(f.operations.startOperation(terminalId,'operation')).rejects.toThrow('surtidor');
  });
  it('allows recovery of an existing attention while blocking a new unsafe one',async()=>{
    const f=fixture('ASISTENCIA');f.tx.terminal.findUnique.mockResolvedValue({id:terminalId,stationId,lifecycle:'REGISTRADA',operationalStatus:'ASISTENCIA',assignments:[assignment],operations:[{id:'active'}]});
    expect(await f.operations.terminalMe(terminalId)).toMatchObject({prepared:true,canStart:false});
  });
});

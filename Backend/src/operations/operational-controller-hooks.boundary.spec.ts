import { ControlTerminalRecoveryController, OperationalAdminController, TerminalController } from './operations.controller';

describe('Original operational controller hooks', () => {
  const actor = { kind: 'terminal' as const, terminalId: 'terminal', stationId: 'station', credentialId: 'credential' };
  const req = { header: () => 'owner' } as never;
  it('awaits owner touch before terminalMe and preserves both arguments', async () => {
    const events: string[] = [], result = { synthetic: true };
    const kiosk = { touchTerminalOwner: jest.fn(async () => { events.push('touch'); }) };
    const engine = { terminalMe: jest.fn(async () => { events.push('engine'); return result; }) };
    const controller = new TerminalController(engine as never, kiosk as never);
    expect(await controller.me(actor, req)).toBe(result);
    expect(events).toEqual(['touch', 'engine']); expect(engine.terminalMe.mock.calls[0]).toEqual(['terminal', 'credential']);
  });
  it('rejects recovered open before ownership or motor', async () => {
    const kiosk = { assertTerminalOwner: jest.fn() }, engine = { startOperation: jest.fn() };
    const controller = new TerminalController(engine as never, kiosk as never);
    await expect(controller.open({ ...actor, recoveredOperationId: 'operation' }, req, { operationId: 'other' })).rejects.toThrow();
    expect(kiosk.assertTerminalOwner).not.toHaveBeenCalled(); expect(engine.startOperation).not.toHaveBeenCalled();
  });
  it('keeps recovery release after committed close, including an unknown post-hook failure without retry', async () => {
    const events: string[] = [], error = Error('Redis release unavailable');
    const engine = { closeOperation: jest.fn(async () => { events.push('close'); return { closedAt: new Date() }; }) };
    const kiosk = { assertTerminalOwner: jest.fn(async () => { events.push('owner'); }), releaseClosedRecovery: jest.fn(async () => { events.push('release'); throw error; }) };
    const controller = new TerminalController(engine as never, kiosk as never);
    await expect(controller.close({ ...actor, recoveredOperationId: 'operation' }, req, 'operation')).rejects.toBe(error);
    expect(events).toEqual(['owner', 'close', 'release']); expect(engine.closeOperation).toHaveBeenCalledTimes(1);
    expect(engine.closeOperation.mock.calls[0]).toEqual(['terminal', 'operation']);
  });
  it('retains trimmed ticket reason and best effort denied audit without replacing original error', async () => {
    const error = Error('Original denial'), control = { kind: 'control', userId: 'root' } as never;
    const engine = { issueRecoveryTicket: jest.fn(async () => { throw error; }) };
    const kiosk = { auditRecoveryDenied: jest.fn(async () => { throw Error('Audit unavailable'); }) };
    const controller = new ControlTerminalRecoveryController(engine as never, kiosk as never);
    await expect(controller.recoveryTicket(control, 'operation', { reason: '  Synthetic reason  ' })).rejects.toBe(error);
    expect(engine.issueRecoveryTicket.mock.calls[0]).toEqual([control, 'operation', 'Synthetic reason']);
    expect(kiosk.auditRecoveryDenied.mock.calls[0]).toEqual([control, 'operation', 'Synthetic reason', error]);
    expect(engine.issueRecoveryTicket).toHaveBeenCalledTimes(1);
  });
  it('retains explicit undefined audit actor for original demo administrative actor', async () => {
    const engine = { grantAdmin: jest.fn(async () => ({ synthetic: true })) };
    const controller = new OperationalAdminController(engine as never);
    await controller.grant({ kind: 'admin', adminUser: 'synthetic' }, { userId: 'target', reason: 'Synthetic reason' });
    expect(engine.grantAdmin.mock.calls[0]).toEqual(['target', 'Synthetic reason', undefined]);
  });
});

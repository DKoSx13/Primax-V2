import { AccessGuard } from '../auth/access.guard';

const oldToken = 'a'.repeat(64);
const recoveryToken = 'b'.repeat(64);
const terminalId = '22222222-2222-4222-8222-222222222222';
const operationId = '33333333-3333-4333-8333-333333333333';
const stationId = '11111111-1111-4111-8111-111111111111';

function fixture(token: string, credential: unknown) {
  const db = {
    terminalCredential: { findUnique: jest.fn(async () => credential) },
    terminal: { findUnique: jest.fn(async () => ({ id: terminalId, stationId, lifecycle: 'REGISTRADA' })) },
    terminalOperation: { findUnique: jest.fn(async () => ({ operationId, terminalId, closedAt: null })) },
  };
  const kiosk = {
    verifyGateway: jest.fn(), limitTechnical: jest.fn(),
    recoveryCredential: jest.fn(async () => ({ terminalId, stationId, operationId })),
  };
  const guard = new AccessGuard(
    { getAllAndOverride: () => 'terminal' } as never, {} as never, {} as never,
    {} as never, kiosk as never, db as never,
  );
  const req = {
    header: (name: string) => ({ 'x-kiosk-signature': 'signed', 'x-terminal-session': token,
      'x-terminal-owner': '44444444-4444-4444-8444-444444444444' }[name] ?? ''),
  } as { actor?: unknown; header: (name: string) => string };
  const context = { getHandler: () => null, getClass: () => null,
    switchToHttp: () => ({ getRequest: () => req }) } as never;
  return { guard, context, db, kiosk, req };
}

it('rejects a previously issued credential after revocation', async () => {
  const f = fixture(oldToken, { revokedAt: new Date(), expiresAt: new Date(Date.now() + 60_000),
    terminal: { lifecycle: 'REGISTRADA', revokedAt: null } });
  await expect(f.guard.canActivate(f.context)).rejects.toThrow('revocada o vencida');
  expect(f.kiosk.recoveryCredential).not.toHaveBeenCalled();
});

it('accepts only an active operation-scoped recovery credential', async () => {
  const f = fixture(recoveryToken, null);
  await expect(f.guard.canActivate(f.context)).resolves.toBe(true);
  expect(f.req.actor).toMatchObject({ kind: 'terminal', terminalId, recoveredOperationId: operationId });
  f.db.terminalOperation.findUnique.mockResolvedValueOnce({ operationId, terminalId, closedAt: new Date() } as never);
  await expect(f.guard.canActivate(f.context)).rejects.toThrow('ya no válida');
});

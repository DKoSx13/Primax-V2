import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const families = [
  ['identity-security-operations', 'IdentitySecurityOperations', ['register', 'login', 'forgot', 'verify', 'reset'], 2],
  ['kiosk-session-operations', 'KioskSessionOperations', ['status', 'login', 'logout', 'bootstrapTerminal', 'exchangeRecoveryTicket', 'authorize'], 1],
  ['admin-identity-workflows', 'AdminIdentityWorkflows', ['list', 'dashboard', 'resolve', 'checkPlate'], 1],
] as const;

// Incremental runs cover installed families; the final inventory requires all three.
for (const [file, name, methods, count] of families) {
  const source = resolve('services/identity/src/bootstrap', file + '.composition.ts');
  if (!existsSync(source)) continue;
  describe(name + ' compatibility delegation', () => {
    it.each([...methods])('retains arguments, promise identity and unknown errors without retries: %s', async method => {
      const value = { synthetic: true }, error = Error('Original outcome unknown');
      const promise = Promise.resolve(value);
      const engine = Object.fromEntries(methods.map(m => [m, jest.fn(() => promise)]));
      const boundary = require(source)['compose' + name](...Array.from({ length: count }, () => engine));
      const args = [{ synthetic: 'request/DTO/actor' }, 'identifier', undefined];
      const returned = boundary[method](...args);
      expect(returned).toBe(promise);
      expect(await returned).toBe(value);
      expect(engine[method]).toHaveBeenCalledTimes(1);
      expect(engine[method].mock.calls[0]).toEqual(args);
      args.forEach((arg, i) => expect(engine[method].mock.calls[0][i]).toBe(arg));
      engine[method].mockImplementationOnce(() => Promise.reject(error));
      await expect(boundary[method](...args)).rejects.toBe(error);
      expect(engine[method]).toHaveBeenCalledTimes(2);
      engine[method].mockImplementationOnce(() => { throw error; });
      expect(() => boundary[method](...args)).toThrow(error);
      expect(engine[method]).toHaveBeenCalledTimes(3);
    });
    it('keeps application and ports independent of engines, framework and transport', () => {
      for (const dir of ['ports', 'use-cases'])
        expect(readFileSync(resolve('services/identity/src/application', dir, file + '.ts'), 'utf8'))
          .not.toMatch(/@nestjs|@prisma|TransactionClient|\bRequest\b|\bResponse\b|\b(fetch|axios|HttpService)\b|src\/auth|src\/kiosk|src\/alerts/);
    });
  });
}

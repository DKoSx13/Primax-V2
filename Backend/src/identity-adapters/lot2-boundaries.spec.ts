import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const families = [
  ['profile-operations', 'ProfileOperations', ['updateProfile'], 1],
  ['vehicle-linking', 'VehicleLinking', ['create'], 1],
  ['plate-recognition', 'PlateRecognition', ['recognize'], 1],
] as const;

for (const [file, name, methods, count] of families) {
  const source = resolve('services/identity/src/bootstrap', file + '.composition.ts');
  if (!existsSync(source)) throw new Error('Missing eligible boundary: ' + file);
  describe(name + ' uses the existing injected engine', () => {
    it.each([...methods])('preserves exact arguments, result, error and no retry: %s', async method => {
      const result = { synthetic: true }, error = Error('Unknown original outcome');
      const engine = Object.fromEntries(methods.map(m => [m, jest.fn(async (..._args: unknown[]) => result)]));
      const compose = require(source)['compose' + name];
      const boundary = compose(...Array.from({ length: count }, () => engine));
      const args = [{ synthetic: 'request or actor' }, 'identifier', undefined];
      expect(await boundary[method](...args)).toBe(result);
      expect(engine[method]).toHaveBeenCalledTimes(1);
      expect(engine[method].mock.calls[0]).toEqual(args);
      args.forEach((arg, i) => expect(engine[method].mock.calls[0][i]).toBe(arg));
      engine[method].mockRejectedValueOnce(error);
      await expect(boundary[method](...args)).rejects.toBe(error);
      expect(engine[method]).toHaveBeenCalledTimes(2);
    });
    it('keeps application and ports independent of framework, persistence and transport', () => {
      for (const dir of ['ports', 'use-cases'])
        expect(readFileSync(resolve('services/identity/src/application', dir, file + '.ts'), 'utf8'))
          .not.toMatch(/@nestjs|@prisma|TransactionClient|\bRequest\b|\bResponse\b|\b(fetch|axios|HttpService)\b/);
    });
  });
}

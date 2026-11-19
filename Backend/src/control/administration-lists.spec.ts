import { AdministrativeLists } from '../../services/administration/src/application/use-cases/administrative-lists';
import { AdministrativeActor } from '../../services/administration/src/application/ports/administrative-lists';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Administrative list application boundary', () => {
  const actor: AdministrativeActor = { kind: 'control', userId: 'synthetic', role: 'ENCARGADO', permissions: [], stationIds: [], global: false };
  const filters = { q: 'unchanged', stationId: 'synthetic' };
  it.each(['customers', 'memberships', 'vehicles'] as const)('delegates %s without altering context, result or errors', async method => {
    const result = [{ sample: new Date('2026-01-01'), optional: undefined }];
    const source = { customers: jest.fn(), memberships: jest.fn(), vehicles: jest.fn() };
    source[method].mockResolvedValue(result);
    const application = new AdministrativeLists(source);
    expect(await application[method](actor, filters)).toBe(result);
    expect(source[method]).toHaveBeenCalledWith(actor, filters);
    const error = new Error('Original error'); source[method].mockRejectedValue(error);
    await expect(application[method](actor, filters)).rejects.toBe(error);
  });
  it('keeps application independent of Nest, Prisma and HTTP', () => {
    for (const file of ['ports/administrative-lists.ts', 'use-cases/administrative-lists.ts']) {
      const text = readFileSync(resolve('services/administration/src/application', file), 'utf8');
      expect(text).not.toMatch(/@nestjs|@prisma|PrismaService|\b(fetch|axios|HttpService)\b/);
    }
  });
});

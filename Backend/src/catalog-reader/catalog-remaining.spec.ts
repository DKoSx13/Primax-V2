import { Prisma } from '@prisma/client';
import { ServiceUnavailableException } from '@nestjs/common';
import request from 'supertest';
import { catalogReadFixture } from '../../test/catalog-read.fixture';
import { PrismaService } from '../prisma/prisma.service';
import { CatalogReader } from './catalog-reader';
import { ListBenefits } from '../../services/catalog/src/application/use-cases/list-benefits';
import { ReadInventory } from '../../services/catalog/src/application/use-cases/read-inventory';
import { ExistingBenefitListReader } from '../../services/catalog/src/adapters/outbound/existing-benefit-list.reader';
import { ExistingInventoryReader } from '../../services/catalog/src/adapters/outbound/existing-inventory.reader';
import { BenefitsRepository } from '../benefits/benefits.repository';
import { FuelsRepository } from '../fuels/fuels.repository';

const a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222';
const benefit = { id: a, code: 'SYNTHETIC', title: 'Synthetic', description: 'Fixture', category: 'TEST',
  pointsCost: 17, active: true, createdAt: new Date('2026-01-01Z'), updatedAt: new Date('2026-01-01Z') };
const inventories = [a, b].map(stationId => ({ stationId, fuelId: a, liters: new Prisma.Decimal('12.123456'),
  reservedLiters: new Prisma.Decimal('0.000001'), updatedAt: new Date('2026-01-01Z'),
  fuel: { id: a, active: false }, station: { id: stationId, active: false } }));
function data() { return {
  benefit: { findMany: jest.fn().mockResolvedValue([benefit]) },
  fuelInventory: { findMany: jest.fn().mockResolvedValue(inventories) },
}; }

describe('grouped remaining reads', () => {
  it.each([false, true])('keeps selection, exact queries and values (http=%s)', async http => {
    const db = data(), reader = { enabled: () => http, read: jest.fn(async (route: string) => route === 'benefits' ? [benefit] : inventories) };
    const benefits = new ListBenefits(new ExistingBenefitListReader(new BenefitsRepository(db as never), reader as unknown as CatalogReader));
    const inventory = new ReadInventory(new ExistingInventoryReader(new FuelsRepository(db as never), reader as unknown as CatalogReader));
    expect(await benefits.execute()).toEqual([benefit]);
    expect(await inventory.execute()).toBe(inventories);
    expect((await inventory.execute())[0].liters).toBe(inventories[0].liters);
    if (http) {
      expect(reader.read).toHaveBeenCalledWith('benefits'); expect(reader.read).toHaveBeenCalledWith('fuels/inventory');
      expect(db.benefit.findMany).not.toHaveBeenCalled(); expect(db.fuelInventory.findMany).not.toHaveBeenCalled();
    } else {
      expect(db.benefit.findMany).toHaveBeenCalledWith({ where: { active: true }, orderBy: { code: 'asc' } });
      expect(db.fuelInventory.findMany).toHaveBeenCalledWith({ include: { fuel: true, station: true } });
      expect(reader.read).not.toHaveBeenCalled();
    }
  });

  it('passes empty arrays and original rejection through pure ports', async () => {
    const error = new Error('Synthetic read failure');
    expect(await new ListBenefits({ list: async () => [] }).execute()).toEqual([]);
    expect(await new ReadInventory({ inventory: async () => [] }).execute()).toEqual([]);
    await expect(new ListBenefits({ list: async () => { throw error; } }).execute()).rejects.toBe(error);
    await expect(new ReadInventory({ inventory: async () => { throw error; } }).execute()).rejects.toBe(error);
  });

  it.each([false, true])('preserves HTTP inventory scope, public metadata and errors (http=%s)', async http => {
    const db = data();
    const reader = { enabled: () => http, read: jest.fn(async (route: string) => route === 'benefits' ? [benefit] : inventories) };
    const apps = [];
    try {
      for (const legacy of [true, false]) {
        const f = await catalogReadFixture(db as unknown as PrismaService, legacy, {
          reader: reader as unknown as CatalogReader, kioskAuthorize: async () => ({ kind: 'kiosk', stationId: a }),
        }); apps.push(f.app);
        await request(f.app.getHttpServer()).get('/api/v1/benefits?extra=ignored').expect(200, JSON.parse(JSON.stringify([benefit])));
        const response = await request(f.app.getHttpServer()).get('/api/v1/fuels/inventory').expect(200, JSON.parse(JSON.stringify(inventories)));
        expect(response.headers['cache-control']).toBe('no-store');
        await request(f.app.getHttpServer()).get('/api/v1/fuels/inventory?stationId=' + b)
          .set('x-kiosk-signature', 'synthetic').expect(200, JSON.parse(JSON.stringify([inventories[0]])));
        await request(f.app.getHttpServer()).get('/api/v1/control/catalog/inventory').expect(401);
        await request(f.app.getHttpServer()).get('/api/v1/control/catalog/inventory').set('x-kiosk-signature', 'synthetic').expect(403);
        if (http) {
          reader.read.mockRejectedValueOnce(new ServiceUnavailableException('Catalog unavailable'));
          await request(f.app.getHttpServer()).get('/api/v1/benefits').expect(503);
        }
      }
    } finally { await Promise.all(apps.map(app => app.close())); }
  });
});

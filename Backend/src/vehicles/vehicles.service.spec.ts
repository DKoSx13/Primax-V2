import { VehicleLookupAdapter } from '../../services/identity/src/adapters/inbound/vehicle-lookup.adapter';
import { LookupVehicle } from '../../services/identity/src/application/use-cases/lookup-vehicle';
import { LegacyVehicleLookup, LegacyVehicleView } from '../../services/identity/src/adapters/outbound/legacy-vehicle-lookup';
import { Prisma } from '@prisma/client';
import { NotFoundException } from '@nestjs/common';
import { VehiclesRepository } from './vehicles.repository';
import { VehiclesService } from './vehicles.service';
import { VehicleListReadAdapter } from '../../services/identity/src/adapters/inbound/vehicle-list-read.adapter';
describe('VehiclesService', () => {
  const repo = { findByPlate: jest.fn() };
  const service = new VehiclesService(repo as unknown as VehiclesRepository, new VehicleListReadAdapter({ execute: jest.fn() }), new VehicleLookupAdapter(new LookupVehicle<LegacyVehicleView>(new LegacyVehicleLookup(repo as unknown as VehiclesRepository))));
  beforeEach(() =>
    repo.findByPlate.mockResolvedValue({
      id: 'v',
      plate: 'ABC-123',
      label: 'Mi auto',
      membership: {
        id: 'm',
        number: 'PRIME-001',
        codeAliases: [],
        userId: 'u',
        status: 'ACTIVE',
        user: { name: 'Diego' },
        balance: new Prisma.Decimal(0),
        debts: [],
      },
    }),
  );
  it('normaliza y encuentra la placa', async () => {
    expect(
      (await service.findByPlate(' abc123 ', { kind: 'kiosk' })).plate,
    ).toBe('ABC-123');
    expect(repo.findByPlate).toHaveBeenCalledWith('ABC-123');
  });
  it('rechaza vehículo inexistente', async () => {
    repo.findByPlate.mockResolvedValueOnce(null);
    await expect(
      service.findByPlate('ZZZ-123', { kind: 'kiosk' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
  it('oculta vehículos de otros socios', async () => {
    await expect(
      service.findByPlate('ABC-123', { kind: 'member', userId: 'other' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

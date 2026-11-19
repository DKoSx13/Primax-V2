import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Actor } from '../../../../../src/identity-core/domain';
import { normalizePlate } from '../../../../../src/vehicles/plate.dto';
import { VehiclesRepository } from '../../../../../src/vehicles/vehicles.repository';

@Injectable()
export class LegacyVehicleLookup {
  constructor(private readonly repo: VehiclesRepository) {}
  async findByPlate(plate: string, actor: Actor) {
    const vehicle = await this.repo.findByPlate(
      normalizePlate(plate) as string,
    );
    if (
      !vehicle ||
      (actor.kind === 'member' && vehicle.membership?.userId !== actor.userId)
    )
      throw new NotFoundException('Vehículo no encontrado');
    return {
      id: vehicle.id,
      plate: vehicle.plate,
      label: vehicle.label,
      membership: vehicle.membership
        ? {
            id: vehicle.membership.id,
            number: vehicle.membership.number,
            legacyNumbers: vehicle.membership.codeAliases.map(alias => alias.code),
            status: vehicle.membership.status,
            name: vehicle.membership.user.name,
            balance: vehicle.membership.balance.toFixed(2),
            dni: vehicle.membership.dni,
            ruc: vehicle.membership.ruc,
            businessName: vehicle.membership.businessName,
            pendingBalance: vehicle.membership.debts
              .reduce(
                (sum, d) => sum.plus(d.amountPending),
                new Prisma.Decimal(0),
              )
              .toFixed(2),
          }
        : null,
    };
  }
}
export type LegacyVehicleView = Awaited<ReturnType<LegacyVehicleLookup['findByPlate']>>;

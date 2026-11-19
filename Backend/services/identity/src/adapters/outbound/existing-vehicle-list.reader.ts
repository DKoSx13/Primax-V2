import { Injectable } from '@nestjs/common';
import { VehiclesRepository } from '../../../../../src/vehicles/vehicles.repository';
import type { VehicleListReader } from '../../application/ports/vehicle-list-reader';
import type { VehiclePage } from '../../application/vehicle-read-model';

@Injectable()
export class ExistingVehicleListReader implements VehicleListReader {
  constructor(private readonly repo: VehiclesRepository) {}
  list(ownerUserId: string, page: VehiclePage) { return this.repo.list(ownerUserId, page); }
}

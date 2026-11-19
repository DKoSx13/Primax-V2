import { Inject, Injectable } from '@nestjs/common';
import { VEHICLE_LOOKUP } from '../../application/ports/vehicle-lookup';
import type { VehicleLookupQuery } from '../../application/ports/vehicle-lookup';
import type { VehicleListActor } from '../../application/ports/list-vehicles-query';
import type { LegacyVehicleView } from '../outbound/legacy-vehicle-lookup';

@Injectable()
export class VehicleLookupAdapter {
  constructor(@Inject(VEHICLE_LOOKUP) private readonly query: VehicleLookupQuery<LegacyVehicleView>) {}
  findByPlate(plate: string, actor: VehicleListActor) { return this.query.findByPlate(plate, actor); }
}

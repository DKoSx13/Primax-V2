import type { VehicleLookupSource, VehicleLookupQuery } from '../ports/vehicle-lookup';
import type { VehicleListActor } from '../ports/list-vehicles-query';

export class LookupVehicle<V> implements VehicleLookupQuery<V> {
  constructor(private readonly source: VehicleLookupSource<V>) {}
  findByPlate(plate: string, actor: VehicleListActor) { return this.source.findByPlate(plate, actor); }
}

import type { VehicleListActor } from './list-vehicles-query';

export interface VehicleLookupSource<V> {
  findByPlate(plate: string, actor: VehicleListActor): Promise<V>;
}
export type VehicleLookupQuery<V> = VehicleLookupSource<V>;
export const VEHICLE_LOOKUP = Symbol('identity.vehicle-lookup');

import type { Actor } from '../../../../../src/identity-core/domain';
import type { VehiclePage, VehicleListResult } from '../vehicle-read-model';

/** Actor is supplied by the existing authenticated controller context. */
export type VehicleListActor = Actor;
export const LIST_VEHICLES_QUERY = Symbol('identity.list-vehicles');
export interface ListVehiclesQuery {
  execute(actor: VehicleListActor, page: VehiclePage): VehicleListResult;
}

import type { VehiclesService } from '../../../../src/vehicles/vehicles.service';
import { VehicleLinking } from '../application/use-cases/vehicle-linking';
import { VehicleLinkingAdapter } from '../adapters/inbound/vehicle-linking.adapter';
import { ExistingVehicleLinking, ExistingVehicleLinkingArguments, ExistingVehicleLinkingViews } from '../adapters/outbound/existing-vehicle-linking';

/** Compose wrappers around existing Nest-injected instances; never instantiate engines. */
export function composeVehicleLinking(vehicle: VehiclesService) {
  return new VehicleLinkingAdapter(new VehicleLinking<ExistingVehicleLinkingArguments, ExistingVehicleLinkingViews>(new ExistingVehicleLinking(vehicle)));
}

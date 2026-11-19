import type { VehiclesService } from '../../../../../src/vehicles/vehicles.service';
import type { VehicleLinkingPort } from '../../application/ports/vehicle-linking';

export type ExistingVehicleLinkingArguments = {
  create: Parameters<VehiclesService['create']>;
};
export type ExistingVehicleLinkingViews = {
  create: Awaited<ReturnType<VehiclesService['create']>>;
};

export class ExistingVehicleLinking implements VehicleLinkingPort<ExistingVehicleLinkingArguments, ExistingVehicleLinkingViews> {
  constructor(private readonly vehicle: VehiclesService) {}
  create(...args: ExistingVehicleLinkingArguments['create']) { return this.vehicle.create(...args); }
}

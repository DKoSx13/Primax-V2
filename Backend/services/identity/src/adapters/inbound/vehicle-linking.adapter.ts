import type { VehicleLinkingPort } from '../../application/ports/vehicle-linking';
import type { ExistingVehicleLinkingArguments, ExistingVehicleLinkingViews } from '../outbound/existing-vehicle-linking';

export class VehicleLinkingAdapter {
  constructor(private readonly engine: VehicleLinkingPort<ExistingVehicleLinkingArguments, ExistingVehicleLinkingViews>) {}
  create(...args: ExistingVehicleLinkingArguments['create']) { return this.engine.create(...args); }
}

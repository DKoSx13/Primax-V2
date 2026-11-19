import type { VehicleLinkingPort, VehicleLinkingArguments, VehicleLinkingViews } from '../ports/vehicle-linking';

export class VehicleLinking<I extends VehicleLinkingArguments, V extends VehicleLinkingViews> implements VehicleLinkingPort<I, V> {
  constructor(private readonly engine: VehicleLinkingPort<I, V>) {}
  create(...args: I['create']) { return this.engine.create(...args); }
}

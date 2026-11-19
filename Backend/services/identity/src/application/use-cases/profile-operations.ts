import type { ProfileOperationsPort, ProfileOperationsArguments, ProfileOperationsViews } from '../ports/profile-operations';

export class ProfileOperations<I extends ProfileOperationsArguments, V extends ProfileOperationsViews> implements ProfileOperationsPort<I, V> {
  constructor(private readonly engine: ProfileOperationsPort<I, V>) {}
  updateProfile(...args: I['updateProfile']) { return this.engine.updateProfile(...args); }
}

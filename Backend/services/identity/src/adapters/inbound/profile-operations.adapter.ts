import type { ProfileOperationsPort } from '../../application/ports/profile-operations';
import type { ExistingProfileOperationsArguments, ExistingProfileOperationsViews } from '../outbound/existing-profile-operations';

export class ProfileOperationsAdapter {
  constructor(private readonly engine: ProfileOperationsPort<ExistingProfileOperationsArguments, ExistingProfileOperationsViews>) {}
  updateProfile(...args: ExistingProfileOperationsArguments['updateProfile']) { return this.engine.updateProfile(...args); }
}

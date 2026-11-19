import type { MembershipsService } from '../../../../../src/memberships/memberships.service';
import type { ProfileOperationsPort } from '../../application/ports/profile-operations';

export type ExistingProfileOperationsArguments = {
  updateProfile: Parameters<MembershipsService['updateProfile']>;
};
export type ExistingProfileOperationsViews = {
  updateProfile: Awaited<ReturnType<MembershipsService['updateProfile']>>;
};

export class ExistingProfileOperations implements ProfileOperationsPort<ExistingProfileOperationsArguments, ExistingProfileOperationsViews> {
  constructor(private readonly member: MembershipsService) {}
  updateProfile(...args: ExistingProfileOperationsArguments['updateProfile']) { return this.member.updateProfile(...args); }
}

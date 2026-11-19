import type { MembershipsService } from '../../../../src/memberships/memberships.service';
import { ProfileOperations } from '../application/use-cases/profile-operations';
import { ProfileOperationsAdapter } from '../adapters/inbound/profile-operations.adapter';
import { ExistingProfileOperations, ExistingProfileOperationsArguments, ExistingProfileOperationsViews } from '../adapters/outbound/existing-profile-operations';

/** Compose wrappers around existing Nest-injected instances; never instantiate engines. */
export function composeProfileOperations(member: MembershipsService) {
  return new ProfileOperationsAdapter(new ProfileOperations<ExistingProfileOperationsArguments, ExistingProfileOperationsViews>(new ExistingProfileOperations(member)));
}

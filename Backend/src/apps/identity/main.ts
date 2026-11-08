import { bootstrapDomain } from '../bootstrap';
import { AuthModule } from '../../auth/auth.module';
import { MembershipsModule } from '../../memberships/memberships.module';
import { VehiclesModule } from '../../vehicles/vehicles.module';

void bootstrapDomain('identity-service', [AuthModule, MembershipsModule, VehiclesModule]);

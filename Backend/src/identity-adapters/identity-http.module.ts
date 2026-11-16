import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AlertsModule } from '../alerts/alerts.module';
import { MembershipsModule } from '../memberships/memberships.module';
import { VehiclesModule } from '../vehicles/vehicles.module';
import { HealthModule } from '../health/health.module';

/** Opt-in compatibility composition; no active entrypoint imports this module.
 * Host supplies Config, Prisma and throttling. Alerts remains an explicit legacy
 * dependency for AdminController; this does not extract Administration/Commerce.
 */
@Module({
  imports: [
    AuthModule,
    AlertsModule,
    MembershipsModule,
    VehiclesModule,
    HealthModule,
  ],
})
export class IdentityHttpModule {}

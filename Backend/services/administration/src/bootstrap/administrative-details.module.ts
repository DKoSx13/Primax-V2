import { Module } from '@nestjs/common';
import { ADMINISTRATIVE_DETAILS } from '../application/ports/administrative-details';
import { AdministrativeDetails } from '../application/use-cases/administrative-details';
import { AdministrativeDetailsAdapter } from '../adapters/inbound/administrative-details.adapter';
import { LegacyAdministrativeDetails, LegacyAdministrativeDetailViews } from '../adapters/outbound/legacy-administrative-details';

@Module({ providers: [
  LegacyAdministrativeDetails,
  { provide: ADMINISTRATIVE_DETAILS, inject: [LegacyAdministrativeDetails],
    useFactory: (source: LegacyAdministrativeDetails) => new AdministrativeDetails<LegacyAdministrativeDetailViews>(source) },
  AdministrativeDetailsAdapter,
], exports: [AdministrativeDetailsAdapter] })
export class AdministrativeDetailsModule {}

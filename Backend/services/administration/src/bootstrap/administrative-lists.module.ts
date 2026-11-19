import { Module } from '@nestjs/common';
import { LegacyAdministrativeLists, LegacyAdministrativeViews } from '../adapters/outbound/legacy-administrative-lists';
import { AdministrativeListsAdapter } from '../adapters/inbound/administrative-lists.adapter';
import { ADMINISTRATIVE_LISTS } from '../application/ports/administrative-lists';
import { AdministrativeLists } from '../application/use-cases/administrative-lists';
@Module({ providers: [LegacyAdministrativeLists,
  { provide: ADMINISTRATIVE_LISTS, inject: [LegacyAdministrativeLists],
    useFactory: (source: LegacyAdministrativeLists) => new AdministrativeLists<LegacyAdministrativeViews>(source) },
  AdministrativeListsAdapter], exports: [AdministrativeListsAdapter] })
export class AdministrativeListsModule {}

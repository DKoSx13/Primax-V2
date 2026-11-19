import { Inject, Injectable } from '@nestjs/common';
import { ADMINISTRATIVE_LISTS } from '../../application/ports/administrative-lists';
import type { AdministrativeActor, AdministrativeFilters, AdministrativeListQuery } from '../../application/ports/administrative-lists';
import type { LegacyAdministrativeViews } from '../outbound/legacy-administrative-lists';
@Injectable()
export class AdministrativeListsAdapter {
  constructor(@Inject(ADMINISTRATIVE_LISTS) private readonly query: AdministrativeListQuery<LegacyAdministrativeViews>) {}
  customers(actor: AdministrativeActor, filters: AdministrativeFilters) { return this.query.customers(actor, filters); }
  memberships(actor: AdministrativeActor, filters: AdministrativeFilters) { return this.query.memberships(actor, filters); }
  vehicles(actor: AdministrativeActor, filters: AdministrativeFilters) { return this.query.vehicles(actor, filters); }
}

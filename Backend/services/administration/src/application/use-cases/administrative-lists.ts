import type { AdministrativeActor, AdministrativeFilters, AdministrativeViews, AdministrativeListSource, AdministrativeListQuery } from '../ports/administrative-lists';
export class AdministrativeLists<V extends AdministrativeViews> implements AdministrativeListQuery<V> {
  constructor(private readonly source: AdministrativeListSource<V>) {}
  customers(actor: AdministrativeActor, filters: AdministrativeFilters) { return this.source.customers(actor, filters); }
  memberships(actor: AdministrativeActor, filters: AdministrativeFilters) { return this.source.memberships(actor, filters); }
  vehicles(actor: AdministrativeActor, filters: AdministrativeFilters) { return this.source.vehicles(actor, filters); }
}

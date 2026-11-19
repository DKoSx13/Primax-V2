import type { Actor } from '../../../../../src/identity-core/domain';
export type AdministrativeActor = Extract<Actor, { kind: 'control' }>;
export interface AdministrativeFilters { stationId?: string; q?: string; status?: string }
export interface AdministrativeViews { customers: unknown; memberships: unknown; vehicles: unknown }
export interface AdministrativeListSource<V extends AdministrativeViews> {
  customers(actor: AdministrativeActor, filters: AdministrativeFilters): Promise<V['customers']>;
  memberships(actor: AdministrativeActor, filters: AdministrativeFilters): Promise<V['memberships']>;
  vehicles(actor: AdministrativeActor, filters: AdministrativeFilters): Promise<V['vehicles']>;
}
export type AdministrativeListQuery<V extends AdministrativeViews> = AdministrativeListSource<V>;
export const ADMINISTRATIVE_LISTS = Symbol('administration.customer-lists');

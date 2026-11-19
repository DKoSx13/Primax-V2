import type { AdministrativeActor } from './administrative-lists';

export interface AdministrativeDetailViews {
  customer: unknown;
  membership: unknown;
  transaction: unknown;
  receipt: unknown;
}
export interface AdministrativeDetailSource<V extends AdministrativeDetailViews> {
  customer(actor: AdministrativeActor, userId: string): Promise<V['customer']>;
  membership(actor: AdministrativeActor, membershipId: string): Promise<V['membership']>;
  transaction(actor: AdministrativeActor, transactionId: string): Promise<V['transaction']>;
  receipt(actor: AdministrativeActor, transactionId: string): Promise<V['receipt']>;
}
export type AdministrativeDetailQuery<V extends AdministrativeDetailViews> = AdministrativeDetailSource<V>;
export const ADMINISTRATIVE_DETAILS = Symbol('administration.customer-details');

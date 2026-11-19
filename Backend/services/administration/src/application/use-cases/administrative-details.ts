import type { AdministrativeActor } from '../ports/administrative-lists';
import type { AdministrativeDetailViews, AdministrativeDetailSource, AdministrativeDetailQuery } from '../ports/administrative-details';

export class AdministrativeDetails<V extends AdministrativeDetailViews> implements AdministrativeDetailQuery<V> {
  constructor(private readonly source: AdministrativeDetailSource<V>) {}
  customer(actor: AdministrativeActor, userId: string) { return this.source.customer(actor, userId); }
  membership(actor: AdministrativeActor, membershipId: string) { return this.source.membership(actor, membershipId); }
  transaction(actor: AdministrativeActor, transactionId: string) { return this.source.transaction(actor, transactionId); }
  receipt(actor: AdministrativeActor, transactionId: string) { return this.source.receipt(actor, transactionId); }
}

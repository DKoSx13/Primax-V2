import { Inject, Injectable } from '@nestjs/common';
import { ADMINISTRATIVE_DETAILS } from '../../application/ports/administrative-details';
import type { AdministrativeDetailQuery } from '../../application/ports/administrative-details';
import type { AdministrativeActor } from '../../application/ports/administrative-lists';
import type { LegacyAdministrativeDetailViews } from '../outbound/legacy-administrative-details';

@Injectable()
export class AdministrativeDetailsAdapter {
  constructor(@Inject(ADMINISTRATIVE_DETAILS) private readonly query: AdministrativeDetailQuery<LegacyAdministrativeDetailViews>) {}
  customer(actor: AdministrativeActor, userId: string) { return this.query.customer(actor, userId); }
  membership(actor: AdministrativeActor, membershipId: string) { return this.query.membership(actor, membershipId); }
  transaction(actor: AdministrativeActor, transactionId: string) { return this.query.transaction(actor, transactionId); }
  receipt(actor: AdministrativeActor, transactionId: string) { return this.query.receipt(actor, transactionId); }
}

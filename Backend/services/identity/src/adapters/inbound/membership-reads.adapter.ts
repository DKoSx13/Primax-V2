import { Inject, Injectable } from '@nestjs/common';
import { MEMBERSHIP_READS } from '../../application/ports/membership-reads';
import type { MembershipReadQuery, MemberPage } from '../../application/ports/membership-reads';
import type { LegacyMemberViews } from '../outbound/legacy-membership-reads';

@Injectable()
export class MembershipReadsAdapter {
  constructor(@Inject(MEMBERSHIP_READS) private readonly query: MembershipReadQuery<LegacyMemberViews>) {}
  me(userId: string) { return this.query.me(userId); }
  transactions(userId: string, page: MemberPage) { return this.query.transactions(userId, page); }
  rewards(userId: string, page: MemberPage) { return this.query.rewards(userId, page); }
  redemptions(userId: string, page: MemberPage) { return this.query.redemptions(userId, page); }
}

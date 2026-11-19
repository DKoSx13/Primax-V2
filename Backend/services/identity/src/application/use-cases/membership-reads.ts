import type { MemberPage, MemberViews, MembershipReadSource, MembershipReadQuery } from '../ports/membership-reads';

export class MembershipReads<V extends MemberViews> implements MembershipReadQuery<V> {
  constructor(private readonly source: MembershipReadSource<V>) {}
  me(userId: string) { return this.source.me(userId); }
  transactions(userId: string, page: MemberPage) { return this.source.transactions(userId, page); }
  rewards(userId: string, page: MemberPage) { return this.source.rewards(userId, page); }
  redemptions(userId: string, page: MemberPage) { return this.source.redemptions(userId, page); }
}

export interface MemberPage { page: number; limit: number }
/** Generic compatibility views retain the established representation without ORM types. */
export interface MemberViews { me: unknown; transactions: unknown; rewards: unknown; redemptions: unknown }
export interface MembershipReadSource<V extends MemberViews> {
  me(userId: string): Promise<V['me']>;
  transactions(userId: string, page: MemberPage): Promise<V['transactions']>;
  rewards(userId: string, page: MemberPage): Promise<V['rewards']>;
  redemptions(userId: string, page: MemberPage): Promise<V['redemptions']>;
}
export type MembershipReadQuery<V extends MemberViews> = MembershipReadSource<V>;
export const MEMBERSHIP_READS = Symbol('identity.membership-reads');

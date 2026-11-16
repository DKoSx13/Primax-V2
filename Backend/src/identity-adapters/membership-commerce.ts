import type { Prisma } from '@prisma/client';
import type { CommerceMemberships } from '../identity-core/ports';
import type { MembershipsRepository } from '../memberships/memberships.repository';

/** Transitional read adapter; all SQL and Decimal arithmetic stay outside Identity.
 * Uses the facade's existing balance snapshot, preserving its consistency semantics.
 * No writes, new transaction, rounding rules or financial authority are introduced.
 */
export class LegacyMembershipCommerce implements CommerceMemberships {
  constructor(
    private readonly repo: Pick<
      MembershipsRepository,
      'balance' | 'reserved' | 'pending'
    >,
    private readonly balanceSnapshot: Prisma.Decimal,
  ) {}
  async summary(membershipId: string) {
    const balance = await this.repo.balance(membershipId);
    const reserved = await this.repo.reserved(membershipId);
    const pending = await this.repo.pending(membershipId);
    return {
      pendingBalance: pending.toFixed(2),
      balance: this.balanceSnapshot.toFixed(2),
      reserved: reserved.toFixed(2),
      available: this.balanceSnapshot.toFixed(2),
      total: this.balanceSnapshot.plus(reserved).toFixed(2),
      points: balance._sum.points ?? 0,
    };
  }
}

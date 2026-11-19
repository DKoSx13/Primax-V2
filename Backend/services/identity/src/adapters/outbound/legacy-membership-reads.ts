import { Injectable, NotFoundException } from '@nestjs/common';
import { PaginationDto } from '../../../../../src/common/pagination.dto';
import { MembershipsRepository } from '../../../../../src/memberships/memberships.repository';
import { transactionResponse } from '../../../../../src/transactions/transaction.model';
import { LegacyMembershipCommerce } from '../../../../../src/identity-adapters/membership-commerce';
import type { CommerceMemberships } from '../../../../../src/identity-core/ports';
@Injectable()
export class LegacyMembershipReads {
  constructor(private readonly repo: MembershipsRepository) {}
  forUser(userId: string) { return readOwnMembership(this.repo, userId); }
  async me(userId: string) {
    const membership = await this.forUser(userId);
    const commerce: CommerceMemberships = new LegacyMembershipCommerce(
      this.repo,
      membership.balance,
    );
    return {
      ...membership,
      ...(await commerce.summary(membership.id)),
    };
  }
  async transactions(userId: string, query: PaginationDto) {
    return (
      await this.repo.transactions((await this.forUser(userId)).id, query)
    ).map(transactionResponse);
  }
  async rewards(userId: string, query: PaginationDto) {
    return this.repo.rewards((await this.forUser(userId)).id, query);
  }
  async redemptions(userId: string, query: PaginationDto) {
    return this.repo.redemptions((await this.forUser(userId)).id, query);
  }
}

export async function readOwnMembership(repo: MembershipsRepository, userId: string) {
    const membership = await repo.findForUser(userId);
    if (!membership) throw new NotFoundException('Membresía no encontrada');
    return membership;
  }

export type LegacyMemberViews = {
  me: Awaited<ReturnType<LegacyMembershipReads['me']>>;
  transactions: Awaited<ReturnType<LegacyMembershipReads['transactions']>>;
  rewards: Awaited<ReturnType<LegacyMembershipReads['rewards']>>;
  redemptions: Awaited<ReturnType<LegacyMembershipReads['redemptions']>>;
};

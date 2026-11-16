import { ProfileDto } from './profile.dto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PaginationDto } from '../common/pagination.dto';
import { MembershipsRepository } from './memberships.repository';
import { transactionResponse } from '../transactions/transaction.model';
import { LegacyMembershipCommerce } from '../identity-adapters/membership-commerce';
import type { CommerceMemberships } from '../identity-core/ports';
@Injectable()
export class MembershipsService {
  constructor(private readonly repo: MembershipsRepository) {}
  async forUser(userId: string) {
    const membership = await this.repo.findForUser(userId);
    if (!membership) throw new NotFoundException('Membresía no encontrada');
    return membership;
  }
  async updateProfile(userId: string, dto: ProfileDto) {
    await this.forUser(userId);
    await this.repo.updateProfile(userId, dto);
    return this.me(userId);
  }
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

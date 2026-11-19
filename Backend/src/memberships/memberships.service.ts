import { ProfileDto } from './profile.dto';
import { Injectable } from '@nestjs/common';
import { PaginationDto } from '../common/pagination.dto';
import { MembershipsRepository } from './memberships.repository';
import { MembershipReadsAdapter } from '../../services/identity/src/adapters/inbound/membership-reads.adapter';
import { readOwnMembership } from '../../services/identity/src/adapters/outbound/legacy-membership-reads';
@Injectable()
export class MembershipsService {
  constructor(private readonly repo: MembershipsRepository, private readonly reads: MembershipReadsAdapter) {}
  async forUser(userId: string) { return readOwnMembership(this.repo, userId); }
  async updateProfile(userId: string, dto: ProfileDto) {
    await this.forUser(userId);
    await this.repo.updateProfile(userId, dto);
    return this.me(userId);
  }
  async me(userId: string) { return this.reads.me(userId); }
  async transactions(userId: string, query: PaginationDto) { return this.reads.transactions(userId, query); }
  async rewards(userId: string, query: PaginationDto) { return this.reads.rewards(userId, query); }
  async redemptions(userId: string, query: PaginationDto) { return this.reads.redemptions(userId, query); }
}

import { Injectable, NotFoundException } from "@nestjs/common";
import { MembershipsRepository } from "../persistence/memberships.repository";
import { ProfileDto } from "../compatibility/memberships/profile.dto";
import { PaginationDto } from "../compatibility/common/pagination.dto";
import { RemoteFinancialReads } from "./financial-reads";

@Injectable()
export class MembershipsService {
  constructor(
    private readonly repo: MembershipsRepository,
    private readonly finance: RemoteFinancialReads,
  ) {}
  async forUser(userId: string) {
    const row = await this.repo.findForUser(userId);
    if (!row) throw new NotFoundException("Membresía no encontrada");
    return row;
  }
  async me(userId: string) {
    await this.forUser(userId);
    return this.finance.membershipMe(userId);
  }
  async updateProfile(userId: string, dto: ProfileDto) {
    await this.forUser(userId);
    await this.repo.updateProfile(userId, dto);
    return this.me(userId);
  }
  transactions(userId: string, query: PaginationDto) {
    return this.finance.membershipHistory("transactions", userId, query);
  }
  rewards(userId: string, query: PaginationDto) {
    return this.finance.membershipHistory("rewards", userId, query);
  }
  redemptions(userId: string, query: PaginationDto) {
    return this.finance.membershipHistory("redemptions", userId, query);
  }
}

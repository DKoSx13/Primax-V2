import { Module } from '@nestjs/common';
import { MembershipsRepository } from '../../../../src/memberships/memberships.repository';
import { LegacyMembershipReads, LegacyMemberViews } from '../adapters/outbound/legacy-membership-reads';
import { MembershipReadsAdapter } from '../adapters/inbound/membership-reads.adapter';
import { MEMBERSHIP_READS } from '../application/ports/membership-reads';
import { MembershipReads } from '../application/use-cases/membership-reads';

@Module({ providers: [MembershipsRepository, LegacyMembershipReads,
  { provide: MEMBERSHIP_READS, inject: [LegacyMembershipReads],
    useFactory: (source: LegacyMembershipReads) => new MembershipReads<LegacyMemberViews>(source) },
  MembershipReadsAdapter], exports: [MembershipsRepository, MembershipReadsAdapter] })
export class MembershipReadsModule {}

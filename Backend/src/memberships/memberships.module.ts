import { Module } from '@nestjs/common';
import { MembershipsController } from './memberships.controller';
import { MembershipsService } from './memberships.service';
import { MembershipReadsModule } from '../../services/identity/src/bootstrap/membership-reads.module';
@Module({
  imports: [MembershipReadsModule],
  controllers: [MembershipsController],
  providers: [MembershipsService],
})
export class MembershipsModule {}

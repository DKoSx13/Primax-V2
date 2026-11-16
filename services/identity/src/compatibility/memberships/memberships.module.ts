import { Module } from '@nestjs/common';
import { MembershipsController } from './memberships.controller';
import { MembershipsService } from '../../adapters/memberships.service';
import { MembershipsRepository } from '../../persistence/memberships.repository';
@Module({
  controllers: [MembershipsController],
  providers: [MembershipsService, MembershipsRepository],
})
export class MembershipsModule {}

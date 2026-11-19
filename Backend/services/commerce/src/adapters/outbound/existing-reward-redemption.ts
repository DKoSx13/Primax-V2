import { Injectable } from '@nestjs/common';
import { RewardsService } from '../../../../../src/rewards/rewards.service';
import type { RewardRedemptionPort, RedeemCommand } from '../../application/ports/reward-redemption';

export type ExistingRewardRedemptionViews = { [K in 'redeem']: Awaited<ReturnType<RewardsService[K]>> };

@Injectable()
export class ExistingRewardRedemption implements RewardRedemptionPort<ExistingRewardRedemptionViews> {
  constructor(private readonly engine: RewardsService) {}
  redeem(userId: string, command: RedeemCommand) { return this.engine.redeem(userId, command); }
}

import { Inject, Injectable } from '@nestjs/common';
import { REWARD_REDEMPTION } from '../../application/ports/reward-redemption';
import type { RewardRedemptionPort, RedeemCommand } from '../../application/ports/reward-redemption';
import type { ExistingRewardRedemptionViews } from '../outbound/existing-reward-redemption';

@Injectable()
export class RewardRedemptionAdapter {
  constructor(@Inject(REWARD_REDEMPTION) private readonly engine: RewardRedemptionPort<ExistingRewardRedemptionViews>) {}
  redeem(userId: string, command: RedeemCommand) { return this.engine.redeem(userId, command); }
}

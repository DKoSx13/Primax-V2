import type { Provider } from '@nestjs/common';
import { REWARD_REDEMPTION } from '../application/ports/reward-redemption';
import { RewardRedemption } from '../application/use-cases/reward-redemption';
import { RewardRedemptionAdapter } from '../adapters/inbound/reward-redemption.adapter';
import { ExistingRewardRedemption, ExistingRewardRedemptionViews } from '../adapters/outbound/existing-reward-redemption';

export const rewardRedemptionProviders: Provider[] = [
  ExistingRewardRedemption,
  { provide: REWARD_REDEMPTION, inject: [ExistingRewardRedemption],
    useFactory: (engine: ExistingRewardRedemption) => new RewardRedemption<ExistingRewardRedemptionViews>(engine) },
  RewardRedemptionAdapter,
];

import type { RewardRedemptionPort, RewardRedemptionViews, RedeemCommand } from '../ports/reward-redemption';

export class RewardRedemption<V extends RewardRedemptionViews> implements RewardRedemptionPort<V> {
  constructor(private readonly engine: RewardRedemptionPort<V>) {}
  redeem(userId: string, command: RedeemCommand) { return this.engine.redeem(userId, command); }
}

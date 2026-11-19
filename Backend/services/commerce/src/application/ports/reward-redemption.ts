export interface RedeemCommand { operationId: string; benefitId: string }
export interface RewardRedemptionViews { redeem: unknown }
export interface RewardRedemptionPort<V extends RewardRedemptionViews> {
  redeem(userId: string, command: RedeemCommand): Promise<V['redeem']>;
}
export const REWARD_REDEMPTION = Symbol('commerce.reward-redemption');

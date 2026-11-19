export interface RechargeCommand { operationId: string; amount: string }
export interface WalletOperationsViews { recharge: unknown; history: unknown }
export interface WalletOperationsPort<V extends WalletOperationsViews> {
  recharge(userId: string, command: RechargeCommand): Promise<V['recharge']>;
  history(userId: string): Promise<V['history']>;
}
export const WALLET_OPERATIONS = Symbol('commerce.wallet-operations');

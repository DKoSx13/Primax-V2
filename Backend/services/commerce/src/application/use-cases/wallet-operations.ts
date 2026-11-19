import type { WalletOperationsPort, WalletOperationsViews, RechargeCommand } from '../ports/wallet-operations';

export class WalletOperations<V extends WalletOperationsViews> implements WalletOperationsPort<V> {
  constructor(private readonly engine: WalletOperationsPort<V>) {}
  recharge(userId: string, command: RechargeCommand) { return this.engine.recharge(userId, command); }
  history(userId: string) { return this.engine.history(userId); }
}

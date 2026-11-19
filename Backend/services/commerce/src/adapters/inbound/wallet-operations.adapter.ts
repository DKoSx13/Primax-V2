import { Inject, Injectable } from '@nestjs/common';
import { WALLET_OPERATIONS } from '../../application/ports/wallet-operations';
import type { WalletOperationsPort, RechargeCommand } from '../../application/ports/wallet-operations';
import type { ExistingWalletOperationsViews } from '../outbound/existing-wallet-operations';

@Injectable()
export class WalletOperationsAdapter {
  constructor(@Inject(WALLET_OPERATIONS) private readonly engine: WalletOperationsPort<ExistingWalletOperationsViews>) {}
  recharge(userId: string, command: RechargeCommand) { return this.engine.recharge(userId, command); }
  history(userId: string) { return this.engine.history(userId); }
}

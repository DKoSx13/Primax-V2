import { Injectable } from '@nestjs/common';
import { WalletService } from '../../../../../src/wallet/wallet.service';
import type { WalletOperationsPort, RechargeCommand } from '../../application/ports/wallet-operations';

export type ExistingWalletOperationsViews = { [K in 'recharge' | 'history']: Awaited<ReturnType<WalletService[K]>> };

@Injectable()
export class ExistingWalletOperations implements WalletOperationsPort<ExistingWalletOperationsViews> {
  constructor(private readonly engine: WalletService) {}
  recharge(userId: string, command: RechargeCommand) { return this.engine.recharge(userId, command); }
  history(userId: string) { return this.engine.history(userId); }
}

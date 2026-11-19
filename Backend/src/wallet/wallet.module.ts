import { walletOperationsProviders } from '../../services/commerce/src/bootstrap/wallet-operations.providers';
import { Module } from '@nestjs/common';
import { WalletController } from './wallet.controller';
import { WalletRepository } from './wallet.repository';
import { WalletService } from './wallet.service';

@Module({
  controllers: [WalletController],
  providers: [
    ...walletOperationsProviders,
    WalletService, WalletRepository,
  ],
  exports: [WalletService, WalletRepository],
})
export class WalletModule {}

import type { Provider } from '@nestjs/common';
import { WALLET_OPERATIONS } from '../application/ports/wallet-operations';
import { WalletOperations } from '../application/use-cases/wallet-operations';
import { WalletOperationsAdapter } from '../adapters/inbound/wallet-operations.adapter';
import { ExistingWalletOperations, ExistingWalletOperationsViews } from '../adapters/outbound/existing-wallet-operations';

export const walletOperationsProviders: Provider[] = [
  ExistingWalletOperations,
  { provide: WALLET_OPERATIONS, inject: [ExistingWalletOperations],
    useFactory: (engine: ExistingWalletOperations) => new WalletOperations<ExistingWalletOperationsViews>(engine) },
  WalletOperationsAdapter,
];

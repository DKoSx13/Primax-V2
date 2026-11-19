import type { Provider } from '@nestjs/common';
import { TRANSACTION_CREATION } from '../application/ports/transaction-creation';
import { CreateTransaction } from '../application/use-cases/create-transaction';
import { TransactionCreationAdapter } from '../adapters/inbound/transaction-creation.adapter';
import { ExistingTransactionCreation, ExistingTransactionCreationResult } from '../adapters/outbound/existing-transaction-creation';

export const transactionCreationProviders: Provider[] = [
  ExistingTransactionCreation,
  { provide: TRANSACTION_CREATION, inject: [ExistingTransactionCreation],
    useFactory: (engine: ExistingTransactionCreation) => new CreateTransaction<ExistingTransactionCreationResult>(engine) },
  TransactionCreationAdapter,
];

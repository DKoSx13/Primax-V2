import type { Provider } from '@nestjs/common';
import { TRANSACTION_READ } from '../application/ports/transaction-read';
import { ReadTransaction } from '../application/use-cases/read-transaction';
import { TransactionReadAdapter } from '../adapters/inbound/transaction-read.adapter';
import { LegacyTransactionRead, LegacyTransactionView } from '../adapters/outbound/legacy-transaction-read';

/** Registered in TransactionsModule to share its existing repository provider. */
export const transactionReadProviders: Provider[] = [
  LegacyTransactionRead,
  { provide: TRANSACTION_READ, inject: [LegacyTransactionRead],
    useFactory: (source: LegacyTransactionRead) => new ReadTransaction<LegacyTransactionView>(source) },
  TransactionReadAdapter,
];

import { Inject, Injectable } from '@nestjs/common';
import { TRANSACTION_READ } from '../../application/ports/transaction-read';
import type { TransactionReadSource, TransactionReaderActor } from '../../application/ports/transaction-read';
import type { LegacyTransactionView } from '../outbound/legacy-transaction-read';

@Injectable()
export class TransactionReadAdapter {
  constructor(@Inject(TRANSACTION_READ) private readonly query: TransactionReadSource<LegacyTransactionView>) {}
  get(id: string, actor: TransactionReaderActor) { return this.query.get(id, actor); }
}

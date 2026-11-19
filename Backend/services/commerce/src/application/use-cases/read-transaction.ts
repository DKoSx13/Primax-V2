import type { TransactionReadSource, TransactionReaderActor } from '../ports/transaction-read';

export class ReadTransaction<View> implements TransactionReadSource<View> {
  constructor(private readonly source: TransactionReadSource<View>) {}
  get(id: string, actor: TransactionReaderActor) { return this.source.get(id, actor); }
}

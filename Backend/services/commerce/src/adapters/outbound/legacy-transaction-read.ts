import { Injectable, NotFoundException } from '@nestjs/common';
import { TransactionsRepository } from '../../../../../src/transactions/transactions.repository';
import { transactionResponse } from '../../../../../src/transactions/transaction.model';
import type { TransactionReaderActor as Actor } from '../../application/ports/transaction-read';

@Injectable()
export class LegacyTransactionRead {
  constructor(private readonly repo: TransactionsRepository) {}
  async get(id: string, actor: Actor) {
    const transaction = await this.repo.byId(id);
    if (
      !transaction ||
      (actor.kind === 'member' &&
        transaction.membership?.userId !== actor.userId)
    )
      throw new NotFoundException('Transacción no encontrada');
    return transactionResponse(transaction);
  }
}
export type LegacyTransactionView = ReturnType<typeof transactionResponse>;

import { Injectable } from '@nestjs/common';
import { TransactionsService } from '../../../../../src/transactions/transactions.service';
import type { TransactionCreationCommand } from '../../application/ports/transaction-creation';

@Injectable()
export class ExistingTransactionCreation {
  constructor(private readonly engine: TransactionsService) {}
  create(command: TransactionCreationCommand) { return this.engine.create(command); }
}
export type ExistingTransactionCreationResult = Awaited<ReturnType<TransactionsService['create']>>;

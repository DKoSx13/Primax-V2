import { Inject, Injectable } from '@nestjs/common';
import { TRANSACTION_CREATION } from '../../application/ports/transaction-creation';
import type { TransactionCreation, TransactionCreationCommand } from '../../application/ports/transaction-creation';
import type { ExistingTransactionCreationResult } from '../outbound/existing-transaction-creation';

@Injectable()
export class TransactionCreationAdapter {
  constructor(@Inject(TRANSACTION_CREATION) private readonly command: TransactionCreation<ExistingTransactionCreationResult>) {}
  create(input: TransactionCreationCommand) { return this.command.create(input); }
}

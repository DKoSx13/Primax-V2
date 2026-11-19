import type { TransactionCreation, TransactionCreationCommand } from '../ports/transaction-creation';

export class CreateTransaction<View> implements TransactionCreation<View> {
  constructor(private readonly engine: TransactionCreation<View>) {}
  create(command: TransactionCreationCommand) { return this.engine.create(command); }
}

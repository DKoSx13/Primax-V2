import type { AdministrativeTransactions, AdministrativeTransactionsArguments, AdministrativeTransactionsViews } from '../../application/use-cases/administrative-transactions';
export type { AdministrativeTransactionsArguments, AdministrativeTransactionsViews } from '../../application/ports/administrative-transactions';

export class AdministrativeTransactionsAdapter<I extends AdministrativeTransactionsArguments, V extends AdministrativeTransactionsViews> {
  constructor(private readonly port: AdministrativeTransactions<I, V>) {}
  transactions(...args: I['transactions']) { return this.port.transactions(...args); }
}

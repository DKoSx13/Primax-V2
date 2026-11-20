import type { AdministrativeTransactionsPort, AdministrativeTransactionsArguments, AdministrativeTransactionsViews } from '../ports/administrative-transactions';

export class AdministrativeTransactions<I extends AdministrativeTransactionsArguments, V extends AdministrativeTransactionsViews> {
  constructor(private readonly port: AdministrativeTransactionsPort<I, V>) {}
  transactions(...args: I['transactions']) { return this.port.transactions(...args); }
}
export type { AdministrativeTransactionsArguments, AdministrativeTransactionsViews } from '../ports/administrative-transactions';

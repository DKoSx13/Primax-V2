import type { ControlCustomersService } from '../../../../../src/control/control-customers.service';
import type { AdministrativeTransactionsPort } from '../../application/ports/administrative-transactions';

export type ExistingAdministrativeTransactionsArguments = {
  transactions: Parameters<ControlCustomersService['transactions']>;
};
export type ExistingAdministrativeTransactionsViews = {
  transactions: Awaited<ReturnType<ControlCustomersService['transactions']>>;
};

/** One invocation of the injected original engine; no retries, writes or transaction splitting. */
export class ExistingAdministrativeTransactions implements AdministrativeTransactionsPort<ExistingAdministrativeTransactionsArguments, ExistingAdministrativeTransactionsViews> {
  constructor(private readonly customers: ControlCustomersService) {}
  transactions(...args: ExistingAdministrativeTransactionsArguments['transactions']) { return this.customers.transactions(...args); }
}

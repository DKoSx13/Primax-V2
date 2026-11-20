import type { ControlCustomersService } from '../../../../src/control/control-customers.service';
import { AdministrativeTransactions } from '../application/use-cases/administrative-transactions';
import { AdministrativeTransactionsAdapter } from '../adapters/inbound/administrative-transactions.adapter';
import { ExistingAdministrativeTransactions, ExistingAdministrativeTransactionsArguments, ExistingAdministrativeTransactionsViews } from '../adapters/outbound/existing-administrative-transactions';

export function composeAdministrativeTransactions(customers: ControlCustomersService) {
  return new AdministrativeTransactionsAdapter(new AdministrativeTransactions<ExistingAdministrativeTransactionsArguments, ExistingAdministrativeTransactionsViews>(new ExistingAdministrativeTransactions(customers)));
}

import type { ControlService } from '../../../../src/control/control.service';
import { AccountAdministration } from '../application/use-cases/account-administration';
import { AccountAdministrationAdapter } from '../adapters/inbound/account-administration.adapter';
import { ExistingAccountAdministration, ExistingAccountAdministrationArguments, ExistingAccountAdministrationViews } from '../adapters/outbound/existing-account-administration';

export function composeAccountAdministration(control: ControlService) {
  return new AccountAdministrationAdapter(new AccountAdministration<ExistingAccountAdministrationArguments, ExistingAccountAdministrationViews>(new ExistingAccountAdministration(control)));
}

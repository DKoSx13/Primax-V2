import type { ControlService } from '../../../../src/control/control.service';
import { AccountAccess } from '../application/use-cases/account-access';
import { AccountAccessAdapter } from '../adapters/inbound/account-access.adapter';
import { ExistingAccountAccess, ExistingAccountAccessArguments, ExistingAccountAccessViews } from '../adapters/outbound/existing-account-access';

export function composeAccountAccess(control: ControlService) {
  return new AccountAccessAdapter(new AccountAccess<ExistingAccountAccessArguments, ExistingAccountAccessViews>(new ExistingAccountAccess(control)));
}

import type { ControlService } from '../../../../../src/control/control.service';
import type { AccountAdministrationPort } from '../../application/ports/account-administration';

export type ExistingAccountAdministrationArguments = {
  pending: Parameters<ControlService['pending']>;
  createAdministrativeAccount: Parameters<ControlService['createAdministrativeAccount']>;
  approve: Parameters<ControlService['approve']>;
  setStatus: Parameters<ControlService['setStatus']>;
};
export type ExistingAccountAdministrationViews = {
  pending: Awaited<ReturnType<ControlService['pending']>>;
  createAdministrativeAccount: Awaited<ReturnType<ControlService['createAdministrativeAccount']>>;
  approve: Awaited<ReturnType<ControlService['approve']>>;
  setStatus: Awaited<ReturnType<ControlService['setStatus']>>;
};

/** One invocation of the injected original engine; no retries, writes or transaction splitting. */
export class ExistingAccountAdministration implements AccountAdministrationPort<ExistingAccountAdministrationArguments, ExistingAccountAdministrationViews> {
  constructor(private readonly control: ControlService) {}
  pending(...args: ExistingAccountAdministrationArguments['pending']) { return this.control.pending(...args); }
  createAdministrativeAccount(...args: ExistingAccountAdministrationArguments['createAdministrativeAccount']) { return this.control.createAdministrativeAccount(...args); }
  approve(...args: ExistingAccountAdministrationArguments['approve']) { return this.control.approve(...args); }
  setStatus(...args: ExistingAccountAdministrationArguments['setStatus']) { return this.control.setStatus(...args); }
}

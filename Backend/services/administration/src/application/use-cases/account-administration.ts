import type { AccountAdministrationPort, AccountAdministrationArguments, AccountAdministrationViews } from '../ports/account-administration';

export class AccountAdministration<I extends AccountAdministrationArguments, V extends AccountAdministrationViews> {
  constructor(private readonly port: AccountAdministrationPort<I, V>) {}
  pending(...args: I['pending']) { return this.port.pending(...args); }
  createAdministrativeAccount(...args: I['createAdministrativeAccount']) { return this.port.createAdministrativeAccount(...args); }
  approve(...args: I['approve']) { return this.port.approve(...args); }
  setStatus(...args: I['setStatus']) { return this.port.setStatus(...args); }
}
export type { AccountAdministrationArguments, AccountAdministrationViews } from '../ports/account-administration';

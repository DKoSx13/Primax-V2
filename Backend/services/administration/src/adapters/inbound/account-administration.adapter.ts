import type { AccountAdministration, AccountAdministrationArguments, AccountAdministrationViews } from '../../application/use-cases/account-administration';
export type { AccountAdministrationArguments, AccountAdministrationViews } from '../../application/ports/account-administration';

export class AccountAdministrationAdapter<I extends AccountAdministrationArguments, V extends AccountAdministrationViews> {
  constructor(private readonly port: AccountAdministration<I, V>) {}
  pending(...args: I['pending']) { return this.port.pending(...args); }
  createAdministrativeAccount(...args: I['createAdministrativeAccount']) { return this.port.createAdministrativeAccount(...args); }
  approve(...args: I['approve']) { return this.port.approve(...args); }
  setStatus(...args: I['setStatus']) { return this.port.setStatus(...args); }
}

import type { AccountAccess, AccountAccessArguments, AccountAccessViews } from '../../application/use-cases/account-access';
export type { AccountAccessArguments, AccountAccessViews } from '../../application/ports/account-access';

export class AccountAccessAdapter<I extends AccountAccessArguments, V extends AccountAccessViews> {
  constructor(private readonly port: AccountAccess<I, V>) {}
  requestAccess(...args: I['requestAccess']) { return this.port.requestAccess(...args); }
  verifyEmail(...args: I['verifyEmail']) { return this.port.verifyEmail(...args); }
  resendVerification(...args: I['resendVerification']) { return this.port.resendVerification(...args); }
  login(...args: I['login']) { return this.port.login(...args); }
  session(...args: I['session']) { return this.port.session(...args); }
}

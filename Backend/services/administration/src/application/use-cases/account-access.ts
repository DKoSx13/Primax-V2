import type { AccountAccessPort, AccountAccessArguments, AccountAccessViews } from '../ports/account-access';

export class AccountAccess<I extends AccountAccessArguments, V extends AccountAccessViews> {
  constructor(private readonly port: AccountAccessPort<I, V>) {}
  requestAccess(...args: I['requestAccess']) { return this.port.requestAccess(...args); }
  verifyEmail(...args: I['verifyEmail']) { return this.port.verifyEmail(...args); }
  resendVerification(...args: I['resendVerification']) { return this.port.resendVerification(...args); }
  login(...args: I['login']) { return this.port.login(...args); }
  session(...args: I['session']) { return this.port.session(...args); }
}
export type { AccountAccessArguments, AccountAccessViews } from '../ports/account-access';

import type { ControlService } from '../../../../../src/control/control.service';
import type { AccountAccessPort } from '../../application/ports/account-access';

export type ExistingAccountAccessArguments = {
  requestAccess: Parameters<ControlService['requestAccess']>;
  verifyEmail: Parameters<ControlService['verifyEmail']>;
  resendVerification: Parameters<ControlService['resendVerification']>;
  login: Parameters<ControlService['login']>;
  session: Parameters<ControlService['session']>;
};
export type ExistingAccountAccessViews = {
  requestAccess: Awaited<ReturnType<ControlService['requestAccess']>>;
  verifyEmail: Awaited<ReturnType<ControlService['verifyEmail']>>;
  resendVerification: Awaited<ReturnType<ControlService['resendVerification']>>;
  login: Awaited<ReturnType<ControlService['login']>>;
  session: Awaited<ReturnType<ControlService['session']>>;
};

/** One invocation of the injected original engine; no retries, writes or transaction splitting. */
export class ExistingAccountAccess implements AccountAccessPort<ExistingAccountAccessArguments, ExistingAccountAccessViews> {
  constructor(private readonly control: ControlService) {}
  requestAccess(...args: ExistingAccountAccessArguments['requestAccess']) { return this.control.requestAccess(...args); }
  verifyEmail(...args: ExistingAccountAccessArguments['verifyEmail']) { return this.control.verifyEmail(...args); }
  resendVerification(...args: ExistingAccountAccessArguments['resendVerification']) { return this.control.resendVerification(...args); }
  login(...args: ExistingAccountAccessArguments['login']) { return this.control.login(...args); }
  session(...args: ExistingAccountAccessArguments['session']) { return this.control.session(...args); }
}

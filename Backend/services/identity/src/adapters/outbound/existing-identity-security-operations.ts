import type { AuthService } from '../../../../../src/auth/auth.service';
import type { PasswordResetService } from '../../../../../src/auth/password-reset.service';
import type { IdentitySecurityOperationsPort } from '../../application/ports/identity-security-operations';

export type ExistingIdentitySecurityOperationsArguments = {
  register: Parameters<AuthService['register']>;
  login: Parameters<AuthService['login']>;
  forgot: Parameters<PasswordResetService['forgot']>;
  verify: Parameters<PasswordResetService['verify']>;
  reset: Parameters<PasswordResetService['reset']>;
};
export type ExistingIdentitySecurityOperationsViews = {
  register: Awaited<ReturnType<AuthService['register']>>;
  login: Awaited<ReturnType<AuthService['login']>>;
  forgot: Awaited<ReturnType<PasswordResetService['forgot']>>;
  verify: Awaited<ReturnType<PasswordResetService['verify']>>;
  reset: Awaited<ReturnType<PasswordResetService['reset']>>;
};

/** Delegates once to existing Nest instances; owns no state, retries or transaction. */
export class ExistingIdentitySecurityOperations implements IdentitySecurityOperationsPort<ExistingIdentitySecurityOperationsArguments, ExistingIdentitySecurityOperationsViews> {
  constructor(private readonly auth: AuthService, private readonly recovery: PasswordResetService) {}
  register(...args: ExistingIdentitySecurityOperationsArguments['register']) { return this.auth.register(...args); }
  login(...args: ExistingIdentitySecurityOperationsArguments['login']) { return this.auth.login(...args); }
  forgot(...args: ExistingIdentitySecurityOperationsArguments['forgot']) { return this.recovery.forgot(...args); }
  verify(...args: ExistingIdentitySecurityOperationsArguments['verify']) { return this.recovery.verify(...args); }
  reset(...args: ExistingIdentitySecurityOperationsArguments['reset']) { return this.recovery.reset(...args); }
}

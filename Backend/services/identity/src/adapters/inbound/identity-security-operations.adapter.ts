import type { IdentitySecurityOperationsPort } from '../../application/ports/identity-security-operations';
import type { ExistingIdentitySecurityOperationsArguments, ExistingIdentitySecurityOperationsViews } from '../outbound/existing-identity-security-operations';

export class IdentitySecurityOperationsAdapter {
  constructor(private readonly engine: IdentitySecurityOperationsPort<ExistingIdentitySecurityOperationsArguments, ExistingIdentitySecurityOperationsViews>) {}
  register(...args: ExistingIdentitySecurityOperationsArguments['register']) { return this.engine.register(...args); }
  login(...args: ExistingIdentitySecurityOperationsArguments['login']) { return this.engine.login(...args); }
  forgot(...args: ExistingIdentitySecurityOperationsArguments['forgot']) { return this.engine.forgot(...args); }
  verify(...args: ExistingIdentitySecurityOperationsArguments['verify']) { return this.engine.verify(...args); }
  reset(...args: ExistingIdentitySecurityOperationsArguments['reset']) { return this.engine.reset(...args); }
}

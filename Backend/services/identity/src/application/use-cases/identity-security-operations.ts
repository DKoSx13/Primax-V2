import type { IdentitySecurityOperationsPort, IdentitySecurityOperationsArguments, IdentitySecurityOperationsViews } from '../ports/identity-security-operations';

export class IdentitySecurityOperations<I extends IdentitySecurityOperationsArguments, V extends IdentitySecurityOperationsViews> implements IdentitySecurityOperationsPort<I, V> {
  constructor(private readonly engine: IdentitySecurityOperationsPort<I, V>) {}
  register(...args: I['register']) { return this.engine.register(...args); }
  login(...args: I['login']) { return this.engine.login(...args); }
  forgot(...args: I['forgot']) { return this.engine.forgot(...args); }
  verify(...args: I['verify']) { return this.engine.verify(...args); }
  reset(...args: I['reset']) { return this.engine.reset(...args); }
}

/** Original tuples and results are supplied by compatibility composition; no policy here. */
export interface IdentitySecurityOperationsArguments {
  register: unknown[];
  login: unknown[];
  forgot: unknown[];
  verify: unknown[];
  reset: unknown[];
}
export interface IdentitySecurityOperationsViews {
  register: unknown;
  login: unknown;
  forgot: unknown;
  verify: unknown;
  reset: unknown;
}
export interface IdentitySecurityOperationsPort<I extends IdentitySecurityOperationsArguments, V extends IdentitySecurityOperationsViews> {
  register(...args: I['register']): Promise<V['register']>;
  login(...args: I['login']): Promise<V['login']>;
  forgot(...args: I['forgot']): Promise<V['forgot']>;
  verify(...args: I['verify']): Promise<V['verify']>;
  reset(...args: I['reset']): Promise<V['reset']>;
}

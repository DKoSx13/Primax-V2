/** Explicit original operations; concrete compatibility types supplied at composition. */
export interface AccountAccessArguments {
  requestAccess: unknown[];
  verifyEmail: unknown[];
  resendVerification: unknown[];
  login: unknown[];
  session: unknown[];
}
export interface AccountAccessViews {
  requestAccess: unknown;
  verifyEmail: unknown;
  resendVerification: unknown;
  login: unknown;
  session: unknown;
}
export interface AccountAccessPort<I extends AccountAccessArguments, V extends AccountAccessViews> {
  requestAccess(...args: I['requestAccess']): Promise<V['requestAccess']>;
  verifyEmail(...args: I['verifyEmail']): Promise<V['verifyEmail']>;
  resendVerification(...args: I['resendVerification']): Promise<V['resendVerification']>;
  login(...args: I['login']): Promise<V['login']>;
  session(...args: I['session']): Promise<V['session']>;
}

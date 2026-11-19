/** Original tuples and results are supplied by compatibility composition; no policy here. */
export interface KioskSessionOperationsArguments {
  status: unknown[];
  login: unknown[];
  logout: unknown[];
  bootstrapTerminal: unknown[];
  exchangeRecoveryTicket: unknown[];
  authorize: unknown[];
}
export interface KioskSessionOperationsViews {
  status: unknown;
  login: unknown;
  logout: unknown;
  bootstrapTerminal: unknown;
  exchangeRecoveryTicket: unknown;
  authorize: unknown;
}
export interface KioskSessionOperationsPort<I extends KioskSessionOperationsArguments, V extends KioskSessionOperationsViews> {
  status(...args: I['status']): Promise<V['status']>;
  login(...args: I['login']): Promise<V['login']>;
  logout(...args: I['logout']): Promise<V['logout']>;
  bootstrapTerminal(...args: I['bootstrapTerminal']): Promise<V['bootstrapTerminal']>;
  exchangeRecoveryTicket(...args: I['exchangeRecoveryTicket']): Promise<V['exchangeRecoveryTicket']>;
  authorize(...args: I['authorize']): Promise<V['authorize']>;
}

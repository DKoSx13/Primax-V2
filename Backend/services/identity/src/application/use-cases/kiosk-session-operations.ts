import type { KioskSessionOperationsPort, KioskSessionOperationsArguments, KioskSessionOperationsViews } from '../ports/kiosk-session-operations';

export class KioskSessionOperations<I extends KioskSessionOperationsArguments, V extends KioskSessionOperationsViews> implements KioskSessionOperationsPort<I, V> {
  constructor(private readonly engine: KioskSessionOperationsPort<I, V>) {}
  status(...args: I['status']) { return this.engine.status(...args); }
  login(...args: I['login']) { return this.engine.login(...args); }
  logout(...args: I['logout']) { return this.engine.logout(...args); }
  bootstrapTerminal(...args: I['bootstrapTerminal']) { return this.engine.bootstrapTerminal(...args); }
  exchangeRecoveryTicket(...args: I['exchangeRecoveryTicket']) { return this.engine.exchangeRecoveryTicket(...args); }
  authorize(...args: I['authorize']) { return this.engine.authorize(...args); }
}

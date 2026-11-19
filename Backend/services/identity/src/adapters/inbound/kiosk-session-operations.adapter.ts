import type { KioskSessionOperationsPort } from '../../application/ports/kiosk-session-operations';
import type { ExistingKioskSessionOperationsArguments, ExistingKioskSessionOperationsViews } from '../outbound/existing-kiosk-session-operations';

export class KioskSessionOperationsAdapter {
  constructor(private readonly engine: KioskSessionOperationsPort<ExistingKioskSessionOperationsArguments, ExistingKioskSessionOperationsViews>) {}
  status(...args: ExistingKioskSessionOperationsArguments['status']) { return this.engine.status(...args); }
  login(...args: ExistingKioskSessionOperationsArguments['login']) { return this.engine.login(...args); }
  logout(...args: ExistingKioskSessionOperationsArguments['logout']) { return this.engine.logout(...args); }
  bootstrapTerminal(...args: ExistingKioskSessionOperationsArguments['bootstrapTerminal']) { return this.engine.bootstrapTerminal(...args); }
  exchangeRecoveryTicket(...args: ExistingKioskSessionOperationsArguments['exchangeRecoveryTicket']) { return this.engine.exchangeRecoveryTicket(...args); }
  authorize(...args: ExistingKioskSessionOperationsArguments['authorize']) { return this.engine.authorize(...args); }
}

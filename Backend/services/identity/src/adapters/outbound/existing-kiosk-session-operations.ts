import type { KioskService } from '../../../../../src/kiosk/kiosk.service';
import type { KioskSessionOperationsPort } from '../../application/ports/kiosk-session-operations';

export type ExistingKioskSessionOperationsArguments = {
  status: Parameters<KioskService['status']>;
  login: Parameters<KioskService['login']>;
  logout: Parameters<KioskService['logout']>;
  bootstrapTerminal: Parameters<KioskService['bootstrapTerminal']>;
  exchangeRecoveryTicket: Parameters<KioskService['exchangeRecoveryTicket']>;
  authorize: Parameters<KioskService['authorize']>;
};
export type ExistingKioskSessionOperationsViews = {
  status: Awaited<ReturnType<KioskService['status']>>;
  login: Awaited<ReturnType<KioskService['login']>>;
  logout: Awaited<ReturnType<KioskService['logout']>>;
  bootstrapTerminal: Awaited<ReturnType<KioskService['bootstrapTerminal']>>;
  exchangeRecoveryTicket: Awaited<ReturnType<KioskService['exchangeRecoveryTicket']>>;
  authorize: Awaited<ReturnType<KioskService['authorize']>>;
};

/** Delegates once to existing Nest instances; owns no state, retries or transaction. */
export class ExistingKioskSessionOperations implements KioskSessionOperationsPort<ExistingKioskSessionOperationsArguments, ExistingKioskSessionOperationsViews> {
  constructor(private readonly kiosk: KioskService) {}
  status(...args: ExistingKioskSessionOperationsArguments['status']) { return this.kiosk.status(...args); }
  login(...args: ExistingKioskSessionOperationsArguments['login']) { return this.kiosk.login(...args); }
  logout(...args: ExistingKioskSessionOperationsArguments['logout']) { return this.kiosk.logout(...args); }
  bootstrapTerminal(...args: ExistingKioskSessionOperationsArguments['bootstrapTerminal']) { return this.kiosk.bootstrapTerminal(...args); }
  exchangeRecoveryTicket(...args: ExistingKioskSessionOperationsArguments['exchangeRecoveryTicket']) { return this.kiosk.exchangeRecoveryTicket(...args); }
  authorize(...args: ExistingKioskSessionOperationsArguments['authorize']) { return this.kiosk.authorize(...args); }
}

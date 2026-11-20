import type { AdminAccessEngine } from '../../../../../src/auth/admin-access.engine';
import type { AdminAccessOperationsPort } from '../../application/ports/admin-access-operations';

/** Delegates once to the original engine; no retries or extra effects. */
export class ExistingAdminAccessOperations implements AdminAccessOperationsPort {
  constructor(private readonly engine: AdminAccessEngine) {}
  demo() { return this.engine.demo(); }
  login(dto: { username: string; password: string }) { return this.engine.login(dto); }
}

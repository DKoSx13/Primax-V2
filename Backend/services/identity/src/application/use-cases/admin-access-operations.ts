import type { AdminAccessOperationsPort } from '../ports/admin-access-operations';

export class AdminAccessOperations {
  constructor(private readonly port: AdminAccessOperationsPort) {}
  demo() { return this.port.demo(); }
  login(dto: { username: string; password: string }) { return this.port.login(dto); }
}

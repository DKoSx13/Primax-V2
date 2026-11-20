import type { AdminAccessOperations } from '../../application/use-cases/admin-access-operations';

export class AdminAccessOperationsAdapter {
  constructor(private readonly port: AdminAccessOperations) {}
  demo() { return this.port.demo(); }
  login(dto: { username: string; password: string }) { return this.port.login(dto); }
}

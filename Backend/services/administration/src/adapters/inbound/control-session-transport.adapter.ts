import type { ControlSessionTransport } from '../../application/use-cases/control-session-transport';
export class ControlSessionTransportAdapter {
  constructor(private readonly useCase: ControlSessionTransport) {}
  logout() { return this.useCase.logout(); }
}

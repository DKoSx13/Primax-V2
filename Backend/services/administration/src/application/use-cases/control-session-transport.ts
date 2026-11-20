import type { ControlSessionTransportPort } from '../ports/control-session-transport';
export class ControlSessionTransport {
  constructor(private readonly port: ControlSessionTransportPort) {}
  logout() { return this.port.logout(); }
}

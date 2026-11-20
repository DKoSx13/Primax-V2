import type { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import type { ControlSessionTransportPort } from '../../application/ports/control-session-transport';

/** Original HTTP logout effect; no authentication or persistence engine. */
export class ExistingControlSessionTransport implements ControlSessionTransportPort {
  constructor(private readonly config: ConfigService, private readonly response: Response) {}
  logout() {
    this.response.clearCookie('primax_control', {
      httpOnly: true,
      secure: this.config.get('APP_MODE') !== 'local',
      sameSite: 'strict',
      path: '/api/v1/control',
    });
    return { message: 'Sesión cerrada' };
  }
}

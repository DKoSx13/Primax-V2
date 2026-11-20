import type { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { ControlSessionTransport } from '../application/use-cases/control-session-transport';
import { ControlSessionTransportAdapter } from '../adapters/inbound/control-session-transport.adapter';
import { ExistingControlSessionTransport } from '../adapters/outbound/existing-control-session-transport';

export function composeControlSessionTransport(config: ConfigService, response: Response) {
  return new ControlSessionTransportAdapter(new ControlSessionTransport(new ExistingControlSessionTransport(config, response)));
}

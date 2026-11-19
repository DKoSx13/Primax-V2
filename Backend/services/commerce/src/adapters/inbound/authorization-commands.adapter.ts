import { Inject, Injectable } from '@nestjs/common';
import { AUTHORIZATION_COMMANDS } from '../../application/ports/authorization-commands';
import type { AuthorizationCommandEngine, AuthorizationCreationCommand, AuthorizationProgressCommand } from '../../application/ports/authorization-commands';
import type { ExistingAuthorizationViews } from '../outbound/existing-authorization-commands';

@Injectable()
export class AuthorizationCommandsAdapter {
  constructor(@Inject(AUTHORIZATION_COMMANDS) private readonly engine: AuthorizationCommandEngine<ExistingAuthorizationViews>) {}
  create(command: AuthorizationCreationCommand) { return this.engine.create(command); }
  progress(id: string, command: AuthorizationProgressCommand) { return this.engine.progress(id, command); }
  release(id: string) { return this.engine.release(id); }
  intervention(id: string) { return this.engine.intervention(id); }
}

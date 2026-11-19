import { Injectable } from '@nestjs/common';
import { AuthorizationsService } from '../../../../../src/transactions/authorizations.service';
import type { AuthorizationCreationCommand, AuthorizationProgressCommand } from '../../application/ports/authorization-commands';

@Injectable()
export class ExistingAuthorizationCommands {
  constructor(private readonly engine: AuthorizationsService) {}
  create(command: AuthorizationCreationCommand) { return this.engine.create(command); }
  progress(id: string, command: AuthorizationProgressCommand) { return this.engine.progress(id, command); }
  release(id: string) { return this.engine.release(id); }
  intervention(id: string) { return this.engine.intervention(id); }
}
export type ExistingAuthorizationViews = {
  [K in 'create' | 'progress' | 'release' | 'intervention']: Awaited<ReturnType<AuthorizationsService[K]>>;
};

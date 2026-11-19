import type { AuthorizationCommandEngine, AuthorizationCommandViews, AuthorizationCreationCommand, AuthorizationProgressCommand } from '../ports/authorization-commands';

export class AuthorizationCommands<V extends AuthorizationCommandViews> implements AuthorizationCommandEngine<V> {
  constructor(private readonly engine: AuthorizationCommandEngine<V>) {}
  create(command: AuthorizationCreationCommand) { return this.engine.create(command); }
  progress(id: string, command: AuthorizationProgressCommand) { return this.engine.progress(id, command); }
  release(id: string) { return this.engine.release(id); }
  intervention(id: string) { return this.engine.intervention(id); }
}

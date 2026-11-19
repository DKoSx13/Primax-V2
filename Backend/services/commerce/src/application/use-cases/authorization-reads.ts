import type { AuthorizationReadsPort, AuthorizationReadsViews } from '../ports/authorization-reads';

export class AuthorizationReads<V extends AuthorizationReadsViews> implements AuthorizationReadsPort<V> {
  constructor(private readonly engine: AuthorizationReadsPort<V>) {}
  status(id: string) { return this.engine.status(id); }
  pendingBefore(minutes: number) { return this.engine.pendingBefore(minutes); }
}

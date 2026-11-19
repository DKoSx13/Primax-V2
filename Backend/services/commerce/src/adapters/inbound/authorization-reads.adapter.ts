import { Inject, Injectable } from '@nestjs/common';
import { AUTHORIZATION_READS } from '../../application/ports/authorization-reads';
import type { AuthorizationReadsPort } from '../../application/ports/authorization-reads';
import type { ExistingAuthorizationReadsViews } from '../outbound/existing-authorization-reads';

@Injectable()
export class AuthorizationReadsAdapter {
  constructor(@Inject(AUTHORIZATION_READS) private readonly engine: AuthorizationReadsPort<ExistingAuthorizationReadsViews>) {}
  status(id: string) { return this.engine.status(id); }
  pendingBefore(minutes: number) { return this.engine.pendingBefore(minutes); }
}

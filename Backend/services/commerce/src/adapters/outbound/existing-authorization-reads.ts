import { Injectable } from '@nestjs/common';
import { AuthorizationsService } from '../../../../../src/transactions/authorizations.service';
import type { AuthorizationReadsPort } from '../../application/ports/authorization-reads';

export type ExistingAuthorizationReadsViews = { [K in 'status' | 'pendingBefore']: Awaited<ReturnType<AuthorizationsService[K]>> };

@Injectable()
export class ExistingAuthorizationReads implements AuthorizationReadsPort<ExistingAuthorizationReadsViews> {
  constructor(private readonly engine: AuthorizationsService) {}
  status(id: string) { return this.engine.status(id); }
  pendingBefore(minutes: number) { return this.engine.pendingBefore(minutes); }
}

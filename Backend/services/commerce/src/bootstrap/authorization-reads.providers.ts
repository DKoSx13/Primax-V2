import type { Provider } from '@nestjs/common';
import { AUTHORIZATION_READS } from '../application/ports/authorization-reads';
import { AuthorizationReads } from '../application/use-cases/authorization-reads';
import { AuthorizationReadsAdapter } from '../adapters/inbound/authorization-reads.adapter';
import { ExistingAuthorizationReads, ExistingAuthorizationReadsViews } from '../adapters/outbound/existing-authorization-reads';

export const authorizationReadsProviders: Provider[] = [
  ExistingAuthorizationReads,
  { provide: AUTHORIZATION_READS, inject: [ExistingAuthorizationReads],
    useFactory: (engine: ExistingAuthorizationReads) => new AuthorizationReads<ExistingAuthorizationReadsViews>(engine) },
  AuthorizationReadsAdapter,
];

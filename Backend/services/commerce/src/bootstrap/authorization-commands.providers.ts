import type { Provider } from '@nestjs/common';
import { AUTHORIZATION_COMMANDS } from '../application/ports/authorization-commands';
import { AuthorizationCommands } from '../application/use-cases/authorization-commands';
import { AuthorizationCommandsAdapter } from '../adapters/inbound/authorization-commands.adapter';
import { ExistingAuthorizationCommands, ExistingAuthorizationViews } from '../adapters/outbound/existing-authorization-commands';

export const authorizationCommandProviders: Provider[] = [
  ExistingAuthorizationCommands,
  { provide: AUTHORIZATION_COMMANDS, inject: [ExistingAuthorizationCommands],
    useFactory: (engine: ExistingAuthorizationCommands) => new AuthorizationCommands<ExistingAuthorizationViews>(engine) },
  AuthorizationCommandsAdapter,
];

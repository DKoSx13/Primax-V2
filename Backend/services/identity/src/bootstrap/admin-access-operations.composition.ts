import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import { AdminAccessEngine } from '../../../../src/auth/admin-access.engine';
import { AdminAccessOperations } from '../application/use-cases/admin-access-operations';
import { AdminAccessOperationsAdapter } from '../adapters/inbound/admin-access-operations.adapter';
import { ExistingAdminAccessOperations } from '../adapters/outbound/existing-admin-access-operations';

/** Reuses the injected configuration and AuthCore JWT instance. */
export function composeAdminAccessOperations(config: ConfigService, jwt: JwtService) {
  return new AdminAccessOperationsAdapter(new AdminAccessOperations(new ExistingAdminAccessOperations(new AdminAccessEngine(config, jwt))));
}

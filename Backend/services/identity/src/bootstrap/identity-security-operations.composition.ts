import type { AuthService } from '../../../../src/auth/auth.service';
import type { PasswordResetService } from '../../../../src/auth/password-reset.service';
import { IdentitySecurityOperations } from '../application/use-cases/identity-security-operations';
import { IdentitySecurityOperationsAdapter } from '../adapters/inbound/identity-security-operations.adapter';
import { ExistingIdentitySecurityOperations, ExistingIdentitySecurityOperationsArguments, ExistingIdentitySecurityOperationsViews } from '../adapters/outbound/existing-identity-security-operations';

/** Wrap existing injected engines; keep their transactions and technical effects intact. */
export function composeIdentitySecurityOperations(auth: AuthService, recovery: PasswordResetService) {
  return new IdentitySecurityOperationsAdapter(new IdentitySecurityOperations<ExistingIdentitySecurityOperationsArguments, ExistingIdentitySecurityOperationsViews>(new ExistingIdentitySecurityOperations(auth, recovery)));
}

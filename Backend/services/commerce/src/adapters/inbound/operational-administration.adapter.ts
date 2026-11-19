import { Inject, Injectable } from '@nestjs/common';
import { OPERATIONAL_ADMINISTRATION } from '../../application/ports/operational-administration';
import type { OperationalAdministrationPort } from '../../application/ports/operational-administration';
import type { ExistingOperationalAdministrationArguments, ExistingOperationalAdministrationViews } from '../outbound/existing-operational-administration';

@Injectable()
export class OperationalAdministrationAdapter {
  constructor(@Inject(OPERATIONAL_ADMINISTRATION) private readonly engine: OperationalAdministrationPort<ExistingOperationalAdministrationArguments, ExistingOperationalAdministrationViews>) {}
  grantAdmin(...args: ExistingOperationalAdministrationArguments['grantAdmin']) { return this.engine.grantAdmin(...args); }
  revokeAdminGrant(...args: ExistingOperationalAdministrationArguments['revokeAdminGrant']) { return this.engine.revokeAdminGrant(...args); }
  createPump(...args: ExistingOperationalAdministrationArguments['createPump']) { return this.engine.createPump(...args); }
  createTerminal(...args: ExistingOperationalAdministrationArguments['createTerminal']) { return this.engine.createTerminal(...args); }
  assignTerminal(...args: ExistingOperationalAdministrationArguments['assignTerminal']) { return this.engine.assignTerminal(...args); }
  endTerminalAssignment(...args: ExistingOperationalAdministrationArguments['endTerminalAssignment']) { return this.engine.endTerminalAssignment(...args); }
  revokeTerminal(...args: ExistingOperationalAdministrationArguments['revokeTerminal']) { return this.engine.revokeTerminal(...args); }
}

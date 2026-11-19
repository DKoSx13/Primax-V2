import { Injectable } from '@nestjs/common';
import { OperationsService } from '../../../../../src/operations/operations.service';
import type { OperationalAdministrationPort } from '../../application/ports/operational-administration';

export type ExistingOperationalAdministrationArguments = {
  grantAdmin: Parameters<OperationsService['grantAdmin']>;
  revokeAdminGrant: Parameters<OperationsService['revokeAdminGrant']>;
  createPump: Parameters<OperationsService['createPump']>;
  createTerminal: Parameters<OperationsService['createTerminal']>;
  assignTerminal: Parameters<OperationsService['assignTerminal']>;
  endTerminalAssignment: Parameters<OperationsService['endTerminalAssignment']>;
  revokeTerminal: Parameters<OperationsService['revokeTerminal']>;
};
export type ExistingOperationalAdministrationViews = {
  grantAdmin: Awaited<ReturnType<OperationsService['grantAdmin']>>;
  revokeAdminGrant: Awaited<ReturnType<OperationsService['revokeAdminGrant']>>;
  createPump: Awaited<ReturnType<OperationsService['createPump']>>;
  createTerminal: Awaited<ReturnType<OperationsService['createTerminal']>>;
  assignTerminal: Awaited<ReturnType<OperationsService['assignTerminal']>>;
  endTerminalAssignment: Awaited<ReturnType<OperationsService['endTerminalAssignment']>>;
  revokeTerminal: Awaited<ReturnType<OperationsService['revokeTerminal']>>;
};

@Injectable()
export class ExistingOperationalAdministration implements OperationalAdministrationPort<ExistingOperationalAdministrationArguments, ExistingOperationalAdministrationViews> {
  constructor(private readonly operations: OperationsService) {}
  grantAdmin(...args: ExistingOperationalAdministrationArguments['grantAdmin']) { return this.operations.grantAdmin(...args); }
  revokeAdminGrant(...args: ExistingOperationalAdministrationArguments['revokeAdminGrant']) { return this.operations.revokeAdminGrant(...args); }
  createPump(...args: ExistingOperationalAdministrationArguments['createPump']) { return this.operations.createPump(...args); }
  createTerminal(...args: ExistingOperationalAdministrationArguments['createTerminal']) { return this.operations.createTerminal(...args); }
  assignTerminal(...args: ExistingOperationalAdministrationArguments['assignTerminal']) { return this.operations.assignTerminal(...args); }
  endTerminalAssignment(...args: ExistingOperationalAdministrationArguments['endTerminalAssignment']) { return this.operations.endTerminalAssignment(...args); }
  revokeTerminal(...args: ExistingOperationalAdministrationArguments['revokeTerminal']) { return this.operations.revokeTerminal(...args); }
}

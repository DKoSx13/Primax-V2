import type { OperationalAdministrationPort, OperationalAdministrationArguments, OperationalAdministrationViews } from '../ports/operational-administration';

export class OperationalAdministration<I extends OperationalAdministrationArguments, V extends OperationalAdministrationViews> implements OperationalAdministrationPort<I, V> {
  constructor(private readonly engine: OperationalAdministrationPort<I, V>) {}
  grantAdmin(...args: I['grantAdmin']) { return this.engine.grantAdmin(...args); }
  revokeAdminGrant(...args: I['revokeAdminGrant']) { return this.engine.revokeAdminGrant(...args); }
  createPump(...args: I['createPump']) { return this.engine.createPump(...args); }
  createTerminal(...args: I['createTerminal']) { return this.engine.createTerminal(...args); }
  assignTerminal(...args: I['assignTerminal']) { return this.engine.assignTerminal(...args); }
  endTerminalAssignment(...args: I['endTerminalAssignment']) { return this.engine.endTerminalAssignment(...args); }
  revokeTerminal(...args: I['revokeTerminal']) { return this.engine.revokeTerminal(...args); }
}

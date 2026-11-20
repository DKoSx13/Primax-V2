import type { OperationalSupervision, OperationalSupervisionArguments, OperationalSupervisionViews } from '../../application/use-cases/operational-supervision';
export type { OperationalSupervisionArguments, OperationalSupervisionViews } from '../../application/ports/operational-supervision';

export class OperationalSupervisionAdapter<I extends OperationalSupervisionArguments, V extends OperationalSupervisionViews> {
  constructor(private readonly port: OperationalSupervision<I, V>) {}
  operations(...args: I['operations']) { return this.port.operations(...args); }
  operationDetail(...args: I['operationDetail']) { return this.port.operationDetail(...args); }
  terminals(...args: I['terminals']) { return this.port.terminals(...args); }
  terminalStatus(...args: I['terminalStatus']) { return this.port.terminalStatus(...args); }
  audit(...args: I['audit']) { return this.port.audit(...args); }
}

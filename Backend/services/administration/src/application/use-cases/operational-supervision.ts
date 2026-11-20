import type { OperationalSupervisionPort, OperationalSupervisionArguments, OperationalSupervisionViews } from '../ports/operational-supervision';

export class OperationalSupervision<I extends OperationalSupervisionArguments, V extends OperationalSupervisionViews> {
  constructor(private readonly port: OperationalSupervisionPort<I, V>) {}
  operations(...args: I['operations']) { return this.port.operations(...args); }
  operationDetail(...args: I['operationDetail']) { return this.port.operationDetail(...args); }
  terminals(...args: I['terminals']) { return this.port.terminals(...args); }
  terminalStatus(...args: I['terminalStatus']) { return this.port.terminalStatus(...args); }
  audit(...args: I['audit']) { return this.port.audit(...args); }
}
export type { OperationalSupervisionArguments, OperationalSupervisionViews } from '../ports/operational-supervision';

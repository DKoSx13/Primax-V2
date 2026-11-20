import type { ControlOperationsService } from '../../../../../src/control/control-operations.service';
import type { OperationalSupervisionPort } from '../../application/ports/operational-supervision';

export type ExistingOperationalSupervisionArguments = {
  operations: Parameters<ControlOperationsService['operations']>;
  operationDetail: Parameters<ControlOperationsService['operationDetail']>;
  terminals: Parameters<ControlOperationsService['terminals']>;
  terminalStatus: Parameters<ControlOperationsService['terminalStatus']>;
  audit: Parameters<ControlOperationsService['audit']>;
};
export type ExistingOperationalSupervisionViews = {
  operations: Awaited<ReturnType<ControlOperationsService['operations']>>;
  operationDetail: Awaited<ReturnType<ControlOperationsService['operationDetail']>>;
  terminals: Awaited<ReturnType<ControlOperationsService['terminals']>>;
  terminalStatus: Awaited<ReturnType<ControlOperationsService['terminalStatus']>>;
  audit: Awaited<ReturnType<ControlOperationsService['audit']>>;
};

/** One invocation of the injected original engine; no retries, writes or transaction splitting. */
export class ExistingOperationalSupervision implements OperationalSupervisionPort<ExistingOperationalSupervisionArguments, ExistingOperationalSupervisionViews> {
  constructor(private readonly engine: ControlOperationsService) {}
  operations(...args: ExistingOperationalSupervisionArguments['operations']) { return this.engine.operations(...args); }
  operationDetail(...args: ExistingOperationalSupervisionArguments['operationDetail']) { return this.engine.operationDetail(...args); }
  terminals(...args: ExistingOperationalSupervisionArguments['terminals']) { return this.engine.terminals(...args); }
  terminalStatus(...args: ExistingOperationalSupervisionArguments['terminalStatus']) { return this.engine.terminalStatus(...args); }
  audit(...args: ExistingOperationalSupervisionArguments['audit']) { return this.engine.audit(...args); }
}

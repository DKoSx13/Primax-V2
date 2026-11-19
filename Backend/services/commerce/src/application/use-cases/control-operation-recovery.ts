import type { ControlOperationRecoveryPort, ControlOperationRecoveryArguments, ControlOperationRecoveryViews } from '../ports/control-operation-recovery';

export class ControlOperationRecovery<I extends ControlOperationRecoveryArguments, V extends ControlOperationRecoveryViews> implements ControlOperationRecoveryPort<I, V> {
  constructor(private readonly engine: ControlOperationRecoveryPort<I, V>) {}
  issueRecoveryTicket(...args: I['issueRecoveryTicket']) { return this.engine.issueRecoveryTicket(...args); }
  resolveOperation(...args: I['resolveOperation']) { return this.engine.resolveOperation(...args); }
  cancelUnpaidOperation(...args: I['cancelUnpaidOperation']) { return this.engine.cancelUnpaidOperation(...args); }
}

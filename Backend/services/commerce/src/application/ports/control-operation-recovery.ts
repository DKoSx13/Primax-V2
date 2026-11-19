/** Transport/actor tuples are supplied at composition and never interpreted here. */
export interface ControlOperationRecoveryArguments { issueRecoveryTicket: unknown[]; resolveOperation: unknown[]; cancelUnpaidOperation: unknown[] }
export interface ControlOperationRecoveryViews { issueRecoveryTicket: unknown; resolveOperation: unknown; cancelUnpaidOperation: unknown }
export interface ControlOperationRecoveryPort<I extends ControlOperationRecoveryArguments, V extends ControlOperationRecoveryViews> {
  issueRecoveryTicket(...args: I['issueRecoveryTicket']): Promise<V['issueRecoveryTicket']>;
  resolveOperation(...args: I['resolveOperation']): Promise<V['resolveOperation']>;
  cancelUnpaidOperation(...args: I['cancelUnpaidOperation']): Promise<V['cancelUnpaidOperation']>;
}
export const CONTROL_OPERATION_RECOVERY = Symbol('commerce.control-operation-recovery');

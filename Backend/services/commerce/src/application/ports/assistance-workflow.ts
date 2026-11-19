/** Transport/actor tuples are supplied at composition and never interpreted here. */
export interface AssistanceWorkflowArguments { create: unknown[]; terminalStatus: unknown[]; cancel: unknown[]; list: unknown[]; detail: unknown[]; act: unknown[] }
export interface AssistanceWorkflowViews { create: unknown; terminalStatus: unknown; cancel: unknown; list: unknown; detail: unknown; act: unknown }
export interface AssistanceWorkflowPort<I extends AssistanceWorkflowArguments, V extends AssistanceWorkflowViews> {
  create(...args: I['create']): Promise<V['create']>;
  terminalStatus(...args: I['terminalStatus']): Promise<V['terminalStatus']>;
  cancel(...args: I['cancel']): Promise<V['cancel']>;
  list(...args: I['list']): Promise<V['list']>;
  detail(...args: I['detail']): Promise<V['detail']>;
  act(...args: I['act']): Promise<V['act']>;
}
export const ASSISTANCE_WORKFLOW = Symbol('commerce.assistance-workflow');

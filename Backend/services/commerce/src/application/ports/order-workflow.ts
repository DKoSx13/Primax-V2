/** Existing DTOs and actors are supplied at composition, never interpreted here. */
export interface OrderWorkflowInputs { create: unknown; demo: unknown; reselect: unknown; actor: unknown; event: unknown }
export interface OrderWorkflowViews { create: unknown; confirmDemo: unknown; reselect: unknown; cancel: unknown; refund: unknown; status: unknown; webhook: unknown }
export interface OrderWorkflowPort<I extends OrderWorkflowInputs, V extends OrderWorkflowViews> {
  create(command: I['create'], actor: I['actor']): Promise<V['create']>;
  confirmDemo(id: string, command: I['demo'], actor: I['actor']): Promise<V['confirmDemo']>;
  reselect(id: string, command: I['reselect'], actor: I['actor']): Promise<V['reselect']>;
  cancel(id: string, actor: I['actor']): Promise<V['cancel']>;
  refund(id: string, actor: I['actor']): Promise<V['refund']>;
  status(...args: [id: string, actor?: I['actor']]): Promise<V['status']>;
  webhook(event: I['event']): Promise<V['webhook']>;
}
export const ORDER_WORKFLOW = Symbol('commerce.order-workflow');

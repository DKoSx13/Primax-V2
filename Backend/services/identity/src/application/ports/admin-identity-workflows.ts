/** Original tuples and results are supplied by compatibility composition; no policy here. */
export interface AdminIdentityWorkflowsArguments {
  list: unknown[];
  dashboard: unknown[];
  resolve: unknown[];
  checkPlate: unknown[];
}
export interface AdminIdentityWorkflowsViews {
  list: unknown;
  dashboard: unknown;
  resolve: unknown;
  checkPlate: unknown;
}
export interface AdminIdentityWorkflowsPort<I extends AdminIdentityWorkflowsArguments, V extends AdminIdentityWorkflowsViews> {
  list(...args: I['list']): Promise<V['list']>;
  dashboard(...args: I['dashboard']): Promise<V['dashboard']>;
  resolve(...args: I['resolve']): Promise<V['resolve']>;
  checkPlate(...args: I['checkPlate']): Promise<V['checkPlate']>;
}

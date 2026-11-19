import type { AdminIdentityWorkflowsPort, AdminIdentityWorkflowsArguments, AdminIdentityWorkflowsViews } from '../ports/admin-identity-workflows';

export class AdminIdentityWorkflows<I extends AdminIdentityWorkflowsArguments, V extends AdminIdentityWorkflowsViews> implements AdminIdentityWorkflowsPort<I, V> {
  constructor(private readonly engine: AdminIdentityWorkflowsPort<I, V>) {}
  list(...args: I['list']) { return this.engine.list(...args); }
  dashboard(...args: I['dashboard']) { return this.engine.dashboard(...args); }
  resolve(...args: I['resolve']) { return this.engine.resolve(...args); }
  checkPlate(...args: I['checkPlate']) { return this.engine.checkPlate(...args); }
}

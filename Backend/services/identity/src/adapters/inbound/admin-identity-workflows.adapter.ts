import type { AdminIdentityWorkflowsPort } from '../../application/ports/admin-identity-workflows';
import type { ExistingAdminIdentityWorkflowsArguments, ExistingAdminIdentityWorkflowsViews } from '../outbound/existing-admin-identity-workflows';

export class AdminIdentityWorkflowsAdapter {
  constructor(private readonly engine: AdminIdentityWorkflowsPort<ExistingAdminIdentityWorkflowsArguments, ExistingAdminIdentityWorkflowsViews>) {}
  list(...args: ExistingAdminIdentityWorkflowsArguments['list']) { return this.engine.list(...args); }
  dashboard(...args: ExistingAdminIdentityWorkflowsArguments['dashboard']) { return this.engine.dashboard(...args); }
  resolve(...args: ExistingAdminIdentityWorkflowsArguments['resolve']) { return this.engine.resolve(...args); }
  checkPlate(...args: ExistingAdminIdentityWorkflowsArguments['checkPlate']) { return this.engine.checkPlate(...args); }
}

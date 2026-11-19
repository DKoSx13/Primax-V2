import type { AlertsService } from '../../../../../src/alerts/alerts.service';
import type { AdminIdentityWorkflowsPort } from '../../application/ports/admin-identity-workflows';

export type ExistingAdminIdentityWorkflowsArguments = {
  list: Parameters<AlertsService['list']>;
  dashboard: Parameters<AlertsService['dashboard']>;
  resolve: Parameters<AlertsService['resolve']>;
  checkPlate: Parameters<AlertsService['checkPlate']>;
};
export type ExistingAdminIdentityWorkflowsViews = {
  list: Awaited<ReturnType<AlertsService['list']>>;
  dashboard: Awaited<ReturnType<AlertsService['dashboard']>>;
  resolve: Awaited<ReturnType<AlertsService['resolve']>>;
  checkPlate: Awaited<ReturnType<AlertsService['checkPlate']>>;
};

/** Delegates once to existing Nest instances; owns no state, retries or transaction. */
export class ExistingAdminIdentityWorkflows implements AdminIdentityWorkflowsPort<ExistingAdminIdentityWorkflowsArguments, ExistingAdminIdentityWorkflowsViews> {
  constructor(private readonly alerts: AlertsService) {}
  list(...args: ExistingAdminIdentityWorkflowsArguments['list']) { return this.alerts.list(...args); }
  dashboard(...args: ExistingAdminIdentityWorkflowsArguments['dashboard']) { return this.alerts.dashboard(...args); }
  resolve(...args: ExistingAdminIdentityWorkflowsArguments['resolve']) { return this.alerts.resolve(...args); }
  checkPlate(...args: ExistingAdminIdentityWorkflowsArguments['checkPlate']) { return this.alerts.checkPlate(...args); }
}

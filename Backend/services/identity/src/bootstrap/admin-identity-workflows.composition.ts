import type { AlertsService } from '../../../../src/alerts/alerts.service';
import { AdminIdentityWorkflows } from '../application/use-cases/admin-identity-workflows';
import { AdminIdentityWorkflowsAdapter } from '../adapters/inbound/admin-identity-workflows.adapter';
import { ExistingAdminIdentityWorkflows, ExistingAdminIdentityWorkflowsArguments, ExistingAdminIdentityWorkflowsViews } from '../adapters/outbound/existing-admin-identity-workflows';

/** Wrap existing injected engines; keep their transactions and technical effects intact. */
export function composeAdminIdentityWorkflows(alerts: AlertsService) {
  return new AdminIdentityWorkflowsAdapter(new AdminIdentityWorkflows<ExistingAdminIdentityWorkflowsArguments, ExistingAdminIdentityWorkflowsViews>(new ExistingAdminIdentityWorkflows(alerts)));
}

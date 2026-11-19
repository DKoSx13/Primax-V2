import type { Provider } from '@nestjs/common';
import { ASSISTANCE_WORKFLOW } from '../application/ports/assistance-workflow';
import { AssistanceWorkflow } from '../application/use-cases/assistance-workflow';
import { AssistanceWorkflowAdapter } from '../adapters/inbound/assistance-workflow.adapter';
import { ExistingAssistanceWorkflow, ExistingAssistanceWorkflowArguments, ExistingAssistanceWorkflowViews } from '../adapters/outbound/existing-assistance-workflow';

export const assistanceWorkflowProviders: Provider[] = [
  ExistingAssistanceWorkflow,
  { provide: ASSISTANCE_WORKFLOW, inject: [ExistingAssistanceWorkflow],
    useFactory: (engine: ExistingAssistanceWorkflow) => new AssistanceWorkflow<ExistingAssistanceWorkflowArguments, ExistingAssistanceWorkflowViews>(engine) },
  AssistanceWorkflowAdapter,
];

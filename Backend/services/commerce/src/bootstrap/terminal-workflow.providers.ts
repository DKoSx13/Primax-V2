import type { Provider } from '@nestjs/common';
import { TERMINAL_WORKFLOW } from '../application/ports/terminal-workflow';
import { TerminalWorkflow } from '../application/use-cases/terminal-workflow';
import { TerminalWorkflowAdapter } from '../adapters/inbound/terminal-workflow.adapter';
import { ExistingTerminalWorkflow, ExistingTerminalWorkflowArguments, ExistingTerminalWorkflowViews } from '../adapters/outbound/existing-terminal-workflow';

export const terminalWorkflowProviders: Provider[] = [
  ExistingTerminalWorkflow,
  { provide: TERMINAL_WORKFLOW, inject: [ExistingTerminalWorkflow],
    useFactory: (engine: ExistingTerminalWorkflow) => new TerminalWorkflow<ExistingTerminalWorkflowArguments, ExistingTerminalWorkflowViews>(engine) },
  TerminalWorkflowAdapter,
];

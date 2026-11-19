import { Inject, Injectable } from '@nestjs/common';
import { TERMINAL_WORKFLOW } from '../../application/ports/terminal-workflow';
import type { TerminalWorkflowPort } from '../../application/ports/terminal-workflow';
import type { ExistingTerminalWorkflowArguments, ExistingTerminalWorkflowViews } from '../outbound/existing-terminal-workflow';

@Injectable()
export class TerminalWorkflowAdapter {
  constructor(@Inject(TERMINAL_WORKFLOW) private readonly engine: TerminalWorkflowPort<ExistingTerminalWorkflowArguments, ExistingTerminalWorkflowViews>) {}
  claimTerminal(...args: ExistingTerminalWorkflowArguments['claimTerminal']) { return this.engine.claimTerminal(...args); }
  terminalMe(...args: ExistingTerminalWorkflowArguments['terminalMe']) { return this.engine.terminalMe(...args); }
  startOperation(...args: ExistingTerminalWorkflowArguments['startOperation']) { return this.engine.startOperation(...args); }
  operation(...args: ExistingTerminalWorkflowArguments['operation']) { return this.engine.operation(...args); }
  recoveryState(...args: ExistingTerminalWorkflowArguments['recoveryState']) { return this.engine.recoveryState(...args); }
  closeOperation(...args: ExistingTerminalWorkflowArguments['closeOperation']) { return this.engine.closeOperation(...args); }
}

import type { TerminalWorkflowPort, TerminalWorkflowArguments, TerminalWorkflowViews } from '../ports/terminal-workflow';

export class TerminalWorkflow<I extends TerminalWorkflowArguments, V extends TerminalWorkflowViews> implements TerminalWorkflowPort<I, V> {
  constructor(private readonly engine: TerminalWorkflowPort<I, V>) {}
  claimTerminal(...args: I['claimTerminal']) { return this.engine.claimTerminal(...args); }
  terminalMe(...args: I['terminalMe']) { return this.engine.terminalMe(...args); }
  startOperation(...args: I['startOperation']) { return this.engine.startOperation(...args); }
  operation(...args: I['operation']) { return this.engine.operation(...args); }
  recoveryState(...args: I['recoveryState']) { return this.engine.recoveryState(...args); }
  closeOperation(...args: I['closeOperation']) { return this.engine.closeOperation(...args); }
}

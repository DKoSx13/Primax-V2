/** Transport/actor tuples are supplied at composition and never interpreted here. */
export interface TerminalWorkflowArguments { claimTerminal: unknown[]; terminalMe: unknown[]; startOperation: unknown[]; operation: unknown[]; recoveryState: unknown[]; closeOperation: unknown[] }
export interface TerminalWorkflowViews { claimTerminal: unknown; terminalMe: unknown; startOperation: unknown; operation: unknown; recoveryState: unknown; closeOperation: unknown }
export interface TerminalWorkflowPort<I extends TerminalWorkflowArguments, V extends TerminalWorkflowViews> {
  claimTerminal(...args: I['claimTerminal']): Promise<V['claimTerminal']>;
  terminalMe(...args: I['terminalMe']): Promise<V['terminalMe']>;
  startOperation(...args: I['startOperation']): Promise<V['startOperation']>;
  operation(...args: I['operation']): Promise<V['operation']>;
  recoveryState(...args: I['recoveryState']): Promise<V['recoveryState']>;
  closeOperation(...args: I['closeOperation']): Promise<V['closeOperation']>;
}
export const TERMINAL_WORKFLOW = Symbol('commerce.terminal-workflow');

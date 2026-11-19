import type { AssistanceWorkflowPort, AssistanceWorkflowArguments, AssistanceWorkflowViews } from '../ports/assistance-workflow';

export class AssistanceWorkflow<I extends AssistanceWorkflowArguments, V extends AssistanceWorkflowViews> implements AssistanceWorkflowPort<I, V> {
  constructor(private readonly engine: AssistanceWorkflowPort<I, V>) {}
  create(...args: I['create']) { return this.engine.create(...args); }
  terminalStatus(...args: I['terminalStatus']) { return this.engine.terminalStatus(...args); }
  cancel(...args: I['cancel']) { return this.engine.cancel(...args); }
  list(...args: I['list']) { return this.engine.list(...args); }
  detail(...args: I['detail']) { return this.engine.detail(...args); }
  act(...args: I['act']) { return this.engine.act(...args); }
}

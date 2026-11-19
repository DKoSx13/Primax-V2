import { Inject, Injectable } from '@nestjs/common';
import { ASSISTANCE_WORKFLOW } from '../../application/ports/assistance-workflow';
import type { AssistanceWorkflowPort } from '../../application/ports/assistance-workflow';
import type { ExistingAssistanceWorkflowArguments, ExistingAssistanceWorkflowViews } from '../outbound/existing-assistance-workflow';

@Injectable()
export class AssistanceWorkflowAdapter {
  constructor(@Inject(ASSISTANCE_WORKFLOW) private readonly engine: AssistanceWorkflowPort<ExistingAssistanceWorkflowArguments, ExistingAssistanceWorkflowViews>) {}
  create(...args: ExistingAssistanceWorkflowArguments['create']) { return this.engine.create(...args); }
  terminalStatus(...args: ExistingAssistanceWorkflowArguments['terminalStatus']) { return this.engine.terminalStatus(...args); }
  cancel(...args: ExistingAssistanceWorkflowArguments['cancel']) { return this.engine.cancel(...args); }
  list(...args: ExistingAssistanceWorkflowArguments['list']) { return this.engine.list(...args); }
  detail(...args: ExistingAssistanceWorkflowArguments['detail']) { return this.engine.detail(...args); }
  act(...args: ExistingAssistanceWorkflowArguments['act']) { return this.engine.act(...args); }
}

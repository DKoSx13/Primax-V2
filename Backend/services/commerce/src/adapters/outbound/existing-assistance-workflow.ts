import { Injectable } from '@nestjs/common';
import { AssistanceService } from '../../../../../src/assistance/assistance.service';
import type { AssistanceWorkflowPort } from '../../application/ports/assistance-workflow';

export type ExistingAssistanceWorkflowArguments = {
  create: Parameters<AssistanceService['create']>;
  terminalStatus: Parameters<AssistanceService['terminalStatus']>;
  cancel: Parameters<AssistanceService['cancel']>;
  list: Parameters<AssistanceService['list']>;
  detail: Parameters<AssistanceService['detail']>;
  act: Parameters<AssistanceService['act']>;
};
export type ExistingAssistanceWorkflowViews = {
  create: Awaited<ReturnType<AssistanceService['create']>>;
  terminalStatus: Awaited<ReturnType<AssistanceService['terminalStatus']>>;
  cancel: Awaited<ReturnType<AssistanceService['cancel']>>;
  list: Awaited<ReturnType<AssistanceService['list']>>;
  detail: Awaited<ReturnType<AssistanceService['detail']>>;
  act: Awaited<ReturnType<AssistanceService['act']>>;
};

@Injectable()
export class ExistingAssistanceWorkflow implements AssistanceWorkflowPort<ExistingAssistanceWorkflowArguments, ExistingAssistanceWorkflowViews> {
  constructor(private readonly assistance: AssistanceService) {}
  create(...args: ExistingAssistanceWorkflowArguments['create']) { return this.assistance.create(...args); }
  terminalStatus(...args: ExistingAssistanceWorkflowArguments['terminalStatus']) { return this.assistance.terminalStatus(...args); }
  cancel(...args: ExistingAssistanceWorkflowArguments['cancel']) { return this.assistance.cancel(...args); }
  list(...args: ExistingAssistanceWorkflowArguments['list']) { return this.assistance.list(...args); }
  detail(...args: ExistingAssistanceWorkflowArguments['detail']) { return this.assistance.detail(...args); }
  act(...args: ExistingAssistanceWorkflowArguments['act']) { return this.assistance.act(...args); }
}

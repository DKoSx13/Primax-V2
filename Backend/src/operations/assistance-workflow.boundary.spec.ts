import { AssistanceWorkflow } from '../../services/commerce/src/application/use-cases/assistance-workflow';
import { AssistanceWorkflowAdapter } from '../../services/commerce/src/adapters/inbound/assistance-workflow.adapter';
import { ExistingAssistanceWorkflow, ExistingAssistanceWorkflowArguments, ExistingAssistanceWorkflowViews } from '../../services/commerce/src/adapters/outbound/existing-assistance-workflow';
import { readFileSync } from 'node:fs';

describe('AssistanceWorkflow exact original invocation', () => {
  it.each(["create","terminalStatus","cancel","list","detail","act"])('preserves argument identity, arity, result and unknown rejection: %s', async method => {
    const result = { synthetic: true }, error = Error('Unknown outcome');
    const engine = Object.fromEntries(["create","terminalStatus","cancel","list","detail","act"].map(m => [m, jest.fn(async (..._args: unknown[]) => result)]));
    const adapter = new AssistanceWorkflowAdapter(new AssistanceWorkflow<ExistingAssistanceWorkflowArguments, ExistingAssistanceWorkflowViews>(new ExistingAssistanceWorkflow(engine as never)));
    const args = [{ synthetic: 'actor or request' }, 'id', { synthetic: 'command' }];
    const invoke = () => (adapter[method as keyof typeof adapter] as (...args: unknown[]) => unknown)(...args);
    expect(await invoke()).toBe(result); expect(engine[method]).toHaveBeenCalledTimes(1);
    expect(engine[method].mock.calls[0]).toEqual(args); args.forEach((a, i) => expect(engine[method].mock.calls[0][i]).toBe(a));
    engine[method].mockRejectedValueOnce(error); await expect(invoke()).rejects.toBe(error); expect(engine[method]).toHaveBeenCalledTimes(2);
  });
  it('keeps ports and application pure', () => {
    for (const dir of ['ports', 'use-cases']) expect(readFileSync('services/commerce/src/application/'+dir+'/assistance-workflow.ts','utf8')).not.toMatch(/@nestjs|@prisma|TransactionClient|Request\b|Response\b|\b(fetch|axios|HttpService)\b/);
  });
});

import { TerminalWorkflow } from '../../services/commerce/src/application/use-cases/terminal-workflow';
import { TerminalWorkflowAdapter } from '../../services/commerce/src/adapters/inbound/terminal-workflow.adapter';
import { ExistingTerminalWorkflow, ExistingTerminalWorkflowArguments, ExistingTerminalWorkflowViews } from '../../services/commerce/src/adapters/outbound/existing-terminal-workflow';
import { readFileSync } from 'node:fs';

describe('TerminalWorkflow exact original invocation', () => {
  it.each(["claimTerminal","terminalMe","startOperation","operation","recoveryState","closeOperation"])('preserves argument identity, arity, result and unknown rejection: %s', async method => {
    const result = { synthetic: true }, error = Error('Unknown outcome');
    const engine = Object.fromEntries(["claimTerminal","terminalMe","startOperation","operation","recoveryState","closeOperation"].map(m => [m, jest.fn(async (..._args: unknown[]) => result)]));
    const adapter = new TerminalWorkflowAdapter(new TerminalWorkflow<ExistingTerminalWorkflowArguments, ExistingTerminalWorkflowViews>(new ExistingTerminalWorkflow(engine as never, engine as never)));
    const args = [{ synthetic: 'actor or request' }, 'id', { synthetic: 'command' }];
    const invoke = () => (adapter[method as keyof typeof adapter] as (...args: unknown[]) => unknown)(...args);
    expect(await invoke()).toBe(result); expect(engine[method]).toHaveBeenCalledTimes(1);
    expect(engine[method].mock.calls[0]).toEqual(args); args.forEach((a, i) => expect(engine[method].mock.calls[0][i]).toBe(a));
    engine[method].mockRejectedValueOnce(error); await expect(invoke()).rejects.toBe(error); expect(engine[method]).toHaveBeenCalledTimes(2);
  });
  it('keeps ports and application pure', () => {
    for (const dir of ['ports', 'use-cases']) expect(readFileSync('services/commerce/src/application/'+dir+'/terminal-workflow.ts','utf8')).not.toMatch(/@nestjs|@prisma|TransactionClient|Request\b|Response\b|\b(fetch|axios|HttpService)\b/);
  });
});

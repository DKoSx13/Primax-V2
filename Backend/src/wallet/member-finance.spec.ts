import { WalletController } from './wallet.controller';
import { RewardsController } from '../rewards/rewards.controller';
import { AuthorizationsController } from '../transactions/authorizations.controller';
import { WalletOperations } from '../../services/commerce/src/application/use-cases/wallet-operations';
import { RewardRedemption } from '../../services/commerce/src/application/use-cases/reward-redemption';
import { AuthorizationReads } from '../../services/commerce/src/application/use-cases/authorization-reads';
import { WalletOperationsAdapter } from '../../services/commerce/src/adapters/inbound/wallet-operations.adapter';
import { RewardRedemptionAdapter } from '../../services/commerce/src/adapters/inbound/reward-redemption.adapter';
import { AuthorizationReadsAdapter } from '../../services/commerce/src/adapters/inbound/authorization-reads.adapter';
import { ExistingWalletOperations, ExistingWalletOperationsViews } from '../../services/commerce/src/adapters/outbound/existing-wallet-operations';
import { ExistingRewardRedemption, ExistingRewardRedemptionViews } from '../../services/commerce/src/adapters/outbound/existing-reward-redemption';
import { ExistingAuthorizationReads, ExistingAuthorizationReadsViews } from '../../services/commerce/src/adapters/outbound/existing-authorization-reads';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Grouped member finance and authorization reads', () => {
  function fixture() {
    const result = { synthetic: true }, error = Error('Unknown outcome');
    const engine = Object.fromEntries(['recharge', 'history', 'redeem', 'status', 'pendingBefore'].map(k => [k, jest.fn(async (..._args: unknown[]) => result)]));
    const wallet = new WalletController(new WalletOperationsAdapter(new WalletOperations<ExistingWalletOperationsViews>(new ExistingWalletOperations(engine as never))) as never);
    const rewards = new RewardsController(new RewardRedemptionAdapter(new RewardRedemption<ExistingRewardRedemptionViews>(new ExistingRewardRedemption(engine as never))) as never);
    const authorizations = new AuthorizationsController(new AuthorizationReadsAdapter(new AuthorizationReads<ExistingAuthorizationReadsViews>(new ExistingAuthorizationReads(engine as never))), {} as never, {} as never);
    return { engine, result, error, wallet, rewards, authorizations };
  }
  it.each(['recharge', 'history', 'redeem', 'status', 'pendingBefore'] as const)('preserves exact arguments, return and rejection for %s without retry', async method => {
    const f = fixture(), dto = { amount: '10.01', operationId: 'synthetic', benefitId: 'synthetic' };
    const invoke = () => {
      switch (method) {
        case 'recharge': return f.wallet.recharge({ kind: 'member', userId: 'owner' }, dto);
        case 'history': return f.wallet.wallet({ kind: 'member', userId: 'owner' });
        case 'redeem': return f.rewards.redeem({ userId: 'owner' }, dto);
        case 'status': return f.authorizations.status('authorization');
        case 'pendingBefore': return f.authorizations.pending(5);
      }
    };
    expect(await invoke()).toBe(f.result);
    expect(f.engine[method]).toHaveBeenCalledTimes(1);
    expect(f.engine[method].mock.calls[0]).toEqual(method === 'status' ? ['authorization'] : method === 'pendingBefore' ? [5] : method === 'history' ? ['owner'] : ['owner', dto]);
    if (method === 'recharge' || method === 'redeem') expect(f.engine[method].mock.calls[0][1]).toBe(dto);
    f.engine[method].mockRejectedValueOnce(f.error);
    await expect(invoke()).rejects.toBe(f.error);
    expect(f.engine[method]).toHaveBeenCalledTimes(2);
  });
  it.each([0, -1, 1.5, NaN])('keeps pending query validation before dispatch: %s', minutes => {
    const f = fixture(); expect(() => f.authorizations.pending(minutes)).toThrow();
    expect(f.engine.pendingBefore).not.toHaveBeenCalled();
  });
  it('keeps all application ports and use cases independent of framework and persistence', () => {
    for (const family of ['wallet-operations', 'reward-redemption', 'authorization-reads'])
      for (const folder of ['ports', 'use-cases'])
        expect(readFileSync(resolve('services/commerce/src/application', folder, family + '.ts'), 'utf8'))
          .not.toMatch(/@nestjs|@prisma|TransactionClient|Request\b|Response\b|\b(fetch|axios|HttpService)\b/);
  });
});

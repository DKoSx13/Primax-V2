describe('Lote 3 Administration compatibility boundaries', () => {
  it.each(['local', 'production'])('clears the original cookie once in %s and propagates transport errors', mode => {
    const { ConfigService } = require('@nestjs/config');
    const { composeControlSessionTransport } = require('../../services/administration/src/bootstrap/control-session-transport.composition');
    const clearCookie = jest.fn();
    const boundary = composeControlSessionTransport(new ConfigService({ APP_MODE: mode }), { clearCookie });
    expect(boundary.logout()).toEqual({ message: 'Sesión cerrada' });
    expect(clearCookie).toHaveBeenCalledTimes(1);
    expect(clearCookie).toHaveBeenCalledWith('primax_control', {
      httpOnly: true, secure: mode !== 'local', sameSite: 'strict', path: '/api/v1/control',
    });
    const original = new Error('original transport failure');
    clearCookie.mockImplementation(() => { throw original; });
    expect(() => boundary.logout()).toThrow(original);
    expect(clearCookie).toHaveBeenCalledTimes(2);
  });
  describe('account-access', () => {
    const { composeAccountAccess } = require('../../services/administration/src/bootstrap/account-access.composition');
    it.each(["requestAccess","verifyEmail","resendVerification","login","session"])('delegates %s exactly once with identical arguments/promise/error', async method => {
      const dto = { synthetic: true }, actor = { userId: 'synthetic' }, result = { original: true };
      const promise = Promise.resolve(result), engine = { [method]: jest.fn((..._args: unknown[]) => promise) };
      const boundary = composeAccountAccess(engine);
      expect(boundary[method](actor, dto)).toBe(promise);
      expect(await promise).toBe(result);
      expect(engine[method]).toHaveBeenCalledTimes(1);
      expect(engine[method].mock.calls[0][0]).toBe(actor); expect(engine[method].mock.calls[0][1]).toBe(dto);
      const error = new Error('original'); engine[method].mockImplementation(() => Promise.reject(error));
      await expect(boundary[method](actor, dto)).rejects.toBe(error); expect(engine[method]).toHaveBeenCalledTimes(2);
    });
  });
  describe('account-administration', () => {
    const { composeAccountAdministration } = require('../../services/administration/src/bootstrap/account-administration.composition');
    it.each(["pending","createAdministrativeAccount","approve","setStatus"])('delegates %s exactly once with identical arguments/promise/error', async method => {
      const dto = { synthetic: true }, actor = { userId: 'synthetic' }, result = { original: true };
      const promise = Promise.resolve(result), engine = { [method]: jest.fn((..._args: unknown[]) => promise) };
      const boundary = composeAccountAdministration(engine);
      expect(boundary[method](actor, dto)).toBe(promise);
      expect(await promise).toBe(result);
      expect(engine[method]).toHaveBeenCalledTimes(1);
      expect(engine[method].mock.calls[0][0]).toBe(actor); expect(engine[method].mock.calls[0][1]).toBe(dto);
      const error = new Error('original'); engine[method].mockImplementation(() => Promise.reject(error));
      await expect(boundary[method](actor, dto)).rejects.toBe(error); expect(engine[method]).toHaveBeenCalledTimes(2);
    });
  });
  describe('administrative-supervision', () => {
    const { composeAdministrativeSupervision } = require('../../services/administration/src/bootstrap/administrative-supervision.composition');
    it.each(["dashboard","incidents","incident","incidentStatus"])('delegates %s exactly once with identical arguments/promise/error', async method => {
      const dto = { synthetic: true }, actor = { userId: 'synthetic' }, result = { original: true };
      const promise = Promise.resolve(result), engine = { [method]: jest.fn((..._args: unknown[]) => promise) };
      const boundary = composeAdministrativeSupervision(engine);
      expect(boundary[method](actor, dto)).toBe(promise);
      expect(await promise).toBe(result);
      expect(engine[method]).toHaveBeenCalledTimes(1);
      expect(engine[method].mock.calls[0][0]).toBe(actor); expect(engine[method].mock.calls[0][1]).toBe(dto);
      const error = new Error('original'); engine[method].mockImplementation(() => Promise.reject(error));
      await expect(boundary[method](actor, dto)).rejects.toBe(error); expect(engine[method]).toHaveBeenCalledTimes(2);
    });
  });
  describe('operational-supervision', () => {
    const { composeOperationalSupervision } = require('../../services/administration/src/bootstrap/operational-supervision.composition');
    it.each(["operations","operationDetail","terminals","terminalStatus","audit"])('delegates %s exactly once with identical arguments/promise/error', async method => {
      const dto = { synthetic: true }, actor = { userId: 'synthetic' }, result = { original: true };
      const promise = Promise.resolve(result), engine = { [method]: jest.fn((..._args: unknown[]) => promise) };
      const boundary = composeOperationalSupervision(engine);
      expect(boundary[method](actor, dto)).toBe(promise);
      expect(await promise).toBe(result);
      expect(engine[method]).toHaveBeenCalledTimes(1);
      expect(engine[method].mock.calls[0][0]).toBe(actor); expect(engine[method].mock.calls[0][1]).toBe(dto);
      const error = new Error('original'); engine[method].mockImplementation(() => Promise.reject(error));
      await expect(boundary[method](actor, dto)).rejects.toBe(error); expect(engine[method]).toHaveBeenCalledTimes(2);
    });
  });
  describe('inventory-administration', () => {
    const { composeInventoryAdministration } = require('../../services/administration/src/bootstrap/inventory-administration.composition');
    it.each(["inventory","movements","receiveInventory","reconciliation","reconcile"])('delegates %s exactly once with identical arguments/promise/error', async method => {
      const dto = { synthetic: true }, actor = { userId: 'synthetic' }, result = { original: true };
      const promise = Promise.resolve(result), engine = { [method]: jest.fn((..._args: unknown[]) => promise) };
      const boundary = composeInventoryAdministration(engine);
      expect(boundary[method](actor, dto)).toBe(promise);
      expect(await promise).toBe(result);
      expect(engine[method]).toHaveBeenCalledTimes(1);
      expect(engine[method].mock.calls[0][0]).toBe(actor); expect(engine[method].mock.calls[0][1]).toBe(dto);
      const error = new Error('original'); engine[method].mockImplementation(() => Promise.reject(error));
      await expect(boundary[method](actor, dto)).rejects.toBe(error); expect(engine[method]).toHaveBeenCalledTimes(2);
    });
  });
  describe('inventory-reconciliation', () => {
    const { composeInventoryReconciliation } = require('../../services/administration/src/bootstrap/inventory-reconciliation.composition');
    it.each(["inspect","reconcile","activate"])('delegates %s exactly once with identical arguments/promise/error', async method => {
      const dto = { synthetic: true }, actor = { userId: 'synthetic' }, result = { original: true };
      const promise = Promise.resolve(result), engine = { [method]: jest.fn((..._args: unknown[]) => promise) };
      const boundary = composeInventoryReconciliation(engine);
      expect(boundary[method](actor, dto)).toBe(promise);
      expect(await promise).toBe(result);
      expect(engine[method]).toHaveBeenCalledTimes(1);
      expect(engine[method].mock.calls[0][0]).toBe(actor); expect(engine[method].mock.calls[0][1]).toBe(dto);
      const error = new Error('original'); engine[method].mockImplementation(() => Promise.reject(error));
      await expect(boundary[method](actor, dto)).rejects.toBe(error); expect(engine[method]).toHaveBeenCalledTimes(2);
    });
  });
  describe('administrative-transactions', () => {
    const { composeAdministrativeTransactions } = require('../../services/administration/src/bootstrap/administrative-transactions.composition');
    it.each(["transactions"])('delegates %s exactly once with identical arguments/promise/error', async method => {
      const dto = { synthetic: true }, actor = { userId: 'synthetic' }, result = { original: true };
      const promise = Promise.resolve(result), engine = { [method]: jest.fn((..._args: unknown[]) => promise) };
      const boundary = composeAdministrativeTransactions(engine);
      expect(boundary[method](actor, dto)).toBe(promise);
      expect(await promise).toBe(result);
      expect(engine[method]).toHaveBeenCalledTimes(1);
      expect(engine[method].mock.calls[0][0]).toBe(actor); expect(engine[method].mock.calls[0][1]).toBe(dto);
      const error = new Error('original'); engine[method].mockImplementation(() => Promise.reject(error));
      await expect(boundary[method](actor, dto)).rejects.toBe(error); expect(engine[method]).toHaveBeenCalledTimes(2);
    });
  });
});

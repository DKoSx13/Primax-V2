import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureTerminalOperation } from '../src/js/terminalOperation.js';
import { createTransactionsService, OPERATION_KEY } from '../src/js/transactionsService.js';

const id = '33333333-3333-4333-8333-333333333333';
test('recovers the backend empty attention when only the browser operation UUID was lost',async()=>{
  const values=new Map();const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
  const transactions=createTransactionsService({storage,uuid:()=> '44444444-4444-4444-8444-444444444444'});
  const terminal={me:async()=>({activeOperationId:id,emptyAttention:true,canStart:false}),operation:async operationId=>({operationId,status:'ACTIVE'}),start:async()=>assert.fail('must recover existing attention')};
  assert.equal((await ensureTerminalOperation({terminal,transactions})).operationId,id);
  assert.equal(transactions.current().operationId,id);
});
test('never replaces local financial evidence to resume another empty attention',()=>{
  const values=new Map([[OPERATION_KEY,JSON.stringify({operationId:'old',authorizationRequest:{amount:'20'}})]]);
  const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
  const transactions=createTransactionsService({storage});
  assert.throws(()=>transactions.resumeEmptyOperation(id),/conciliación/);
  assert.equal(transactions.current().operationId,'old');
});
test('never replaces a pending QR order when another attention is observed',()=>{
  const values=new Map([[OPERATION_KEY,JSON.stringify({operationId:'old',snapshot:{onlineOrderId:id}})]]);
  const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
  const transactions=createTransactionsService({storage});
  assert.throws(()=>transactions.resumeEmptyOperation(id),/conciliación/);
  assert.equal(transactions.current().snapshot.onlineOrderId,id);
});
test('blocks an active financial attention without a saved QR order even when its UUID matches',async()=>{
  const terminal={me:async()=>({activeOperationId:id,emptyAttention:false,canStart:false}),operation:async()=>assert.fail('must not reuse financial attention')};
  const transactions={begin:()=>({operationId:id}),current:()=>({operationId:id})};
  await assert.rejects(ensureTerminalOperation({terminal,transactions}),/Backend conserva un pago/);
});
test('financial backend attention without its local recovery snapshot requires assistance',async()=>{
  const terminal={me:async()=>({activeOperationId:id,emptyAttention:false,canStart:false}),start:async()=>assert.fail('must not open another sale')};
  await assert.rejects(ensureTerminalOperation({terminal,transactions:{begin:()=>({operationId:'other'})}}),/financiera pendiente/);
});
test('starts with the persisted operationId and recovers it after refresh', async () => {
  const calls = [];
  const transactions = { begin: () => ({ operationId: id }) };
  let exists = false;
  const terminal = {
    me: async () => ({ canStart: !exists }),
    operation: async operationId => { calls.push(['get', operationId]); if (!exists) throw Object.assign(Error('missing'), { status: 404 }); return { operationId, status: 'ACTIVE' }; },
    start: async operationId => { calls.push(['post', operationId]); exists = true; return { operationId, status: 'ACTIVE' }; },
  };
  assert.equal((await ensureTerminalOperation({ terminal, transactions })).operationId, id);
  assert.equal((await ensureTerminalOperation({ terminal, transactions })).operationId, id);
  assert.deepEqual(calls, [['get', id], ['post', id], ['get', id]]);
});
test('requires a prepared terminal before creating a new operation', async () => {
  let started = false;
  const terminal = { me: async () => ({ canStart: false }), operation: async () => { throw Object.assign(Error('missing'), { status: 404 }); }, start: async () => { started = true; } };
  await assert.rejects(ensureTerminalOperation({ terminal, transactions: { begin: () => ({ operationId: id }) } }), /temporalmente no disponible/);
  assert.equal(started, false);
});
test('closed persisted operation is discarded and a fresh operation starts; active operation is retained', async () => {
  const old = 'cc4460cb-d4c0-45eb-a240-dffcfbc042aa';
  const next = '77777777-7777-4777-8777-777777777777';
  const values = new Map([[OPERATION_KEY, JSON.stringify({ operationId: old })]]);
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const transactions = createTransactionsService({ storage, uuid: () => next });
  const calls = [];
  const terminal = {
    me: async () => ({ prepared: true, canStart: true, operationalStatus: 'DISPONIBLE' }),
    operation: async operationId => { calls.push(['get', operationId]); if (operationId === old) return { operationId, status: 'CLOSED', closedAt: '2026-10-29T16:36:45.368Z' }; throw Object.assign(Error('missing'), { status: 404 }); },
    start: async operationId => { calls.push(['post', operationId]); return { operationId, status: 'ACTIVE' }; },
  };
  assert.equal((await ensureTerminalOperation({ terminal, transactions })).operationId, next);
  assert.equal(JSON.parse(storage.getItem(OPERATION_KEY)).operationId, next);
  assert.deepEqual(calls, [['get', old], ['get', next], ['post', next]]);
  const active = { ...terminal, operation: async operationId => ({ operationId, status: 'ACTIVE' }), start: async () => { throw Error('must not start again'); } };
  assert.equal((await ensureTerminalOperation({ terminal: active, transactions })).operationId, next);
});

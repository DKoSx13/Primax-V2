// Pure diagnostic checks. No server requests, authorization creation or mutations.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {recoveryActions} from '../../Frontend_1_FuelFlow/src/js/recoveryDesk.js';
import {createTransactionsService} from '../../Frontend_1_FuelFlow/src/js/transactionsService.js';
const read=p=>JSON.parse(readFileSync(new URL('../../'+p,import.meta.url),'utf8'));
const prefix='Docs/astra/evidence/lot5-captured-diagnostic/new/';
const orphan=read(prefix+'captured-result-unknown.json').postgres;
const pending=read(prefix+'pending.json').postgres;
const view=pg=>({status:pg.operations[0].status,order:pg.orders[0],payment:pg.payments[0],reservation:pg.reservations[0],authorization:pg.authorizations[0]??null,sale:pg.transactions[0]??null,receipt:pg.receipts[0]??null});
test('actual CAPTURED without authorization or sale has no recovery desk financial actions',()=>{
 assert.deepEqual(recoveryActions(view(orphan)),{cancel:false,close:false});
});
test('actual PENDING retains existing cancellation eligibility without executing it',()=>{
 assert.deepEqual(recoveryActions(view(pending)),{cancel:true,close:false});
});
test('existing settled-sale closure differs from CAPTURED orphan and requires receipt',()=>{
 const settled=read('Docs/astra/evidence/lot5-t02-frontend-fix/flow/first-sale.json').postgres;
 assert.deepEqual(recoveryActions(view(settled)),{cancel:false,close:true});
 assert.deepEqual(recoveryActions({...view(settled),receipt:null}),{cancel:false,close:false});
});
test('order-only local snapshot does not trigger transaction reconciliation or capture',async()=>{
 const values=new Map([['fuelflow:operation:v1',JSON.stringify({operationId:orphan.operations[0].operationId,snapshot:{onlineOrderId:orphan.orders[0].id}})]]);
 const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 const before=storage.getItem('fuelflow:operation:v1');
 const svc=createTransactionsService({storage,request:async()=>assert.fail('No financial request permitted'),authorizations:{status:async()=>assert.fail('No authorization exists')}});
 assert.deepEqual(await svc.reconcile(),{action:'empty'});assert.equal(storage.getItem('fuelflow:operation:v1'),before);
});

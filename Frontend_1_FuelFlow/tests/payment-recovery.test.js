import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {releaseFailedPayment} from '../src/js/paymentRecovery.js';
test('only provider-confirmed failed/cancelled orders can close before a new payment',async()=>{
 for(const status of ['CREATING','PENDING','CAPTURED','REFUNDING','REFUNDED']){
  let closed=false,discarded=false;
  await assert.rejects(releaseFailedPayment('order',{request:async()=>({operationId:'op',status}),terminal:{close:async()=>{closed=true}},transactions:{current:()=>({operationId:'op'}),discard:()=>{discarded=true}}}));
  assert.equal(closed,false);assert.equal(discarded,false);
 }
 for(const status of ['FAILED','CANCELLED']){
  const steps=[];await releaseFailedPayment('order',{request:async()=>({operationId:'op',status}),terminal:{close:async id=>{steps.push(id)}},transactions:{current:()=>({operationId:'op'}),discard:()=>steps.push('discard')}});assert.deepEqual(steps,['op','discard']);
 }
});
test('lost close response preserves operation and prevents a new purchase',async()=>{
 let discarded=false;
 await assert.rejects(releaseFailedPayment('order',{request:async()=>({operationId:'op',status:'FAILED'}),terminal:{close:async()=>{throw Error('timeout')}},transactions:{current:()=>({operationId:'op'}),discard:()=>{discarded=true}}}));assert.equal(discarded,false);
});
test('FuelFlow offers only digital V2 methods and contains no cash handling',()=>{
 const html=readFileSync(new URL('../src/index.html',import.meta.url),'utf8');const script=readFileSync(new URL('../src/js/script.js',import.meta.url),'utf8');
 assert.deepEqual([...html.matchAll(/data-metodo="([^"]+)"/g)].map(x=>x[1]),['YAPE','PLIN','TARJETA']);
 assert.doesNotMatch(script,/EFECTIVO|panel-efectivo|confirmarPagoEfectivo/);
});

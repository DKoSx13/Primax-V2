import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createPrinter} from '../src/js/printReceipt.js';
test('receipt business flow offers only PrintAgent or no printing',()=>{
 const html=readFileSync(new URL('../src/index.html',import.meta.url),'utf8');
 const script=readFileSync(new URL('../src/js/script.js',import.meta.url),'utf8');
 assert.match(html,/id="btn-comprobante"[^>]*>Imprimir<\/button>/);
 assert.match(html,/id="btn-finalizar"[^>]*>No imprimir<\/button>/);
 assert.doesNotMatch(html+script,/window\.print\(|btn-browser-print|imprimirDesdeNavegador|Imprimir desde navegador/);
});
test('PrintAgent unavailable, rejected, unknown or malformed never change financial data',async()=>{
 for(const reply of [null,{id:'receipt-tx',status:'unknown'},{id:'receipt-tx',status:'retryable',error:'Offline'},{id:'wrong',status:'accepted'}]){
  const receipt={id:'tx',total:'50.00',state:'Pagado',paymentMethod:'YAPE'};const before=JSON.stringify(receipt);
  const printer=createPrinter(async()=>{if(!reply)throw Error('offline');return Response.json(reply)});
  await assert.rejects(printer(receipt));assert.equal(JSON.stringify(receipt),before);
 }
});

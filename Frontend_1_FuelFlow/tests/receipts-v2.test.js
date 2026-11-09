import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createPrinter} from '../src/js/printReceipt.js';
test('receipt business flow offers only PrintAgent or no printing',()=>{
 const html=readFileSync(new URL('../src/index.html',import.meta.url),'utf8');
 const script=readFileSync(new URL('../src/js/script.js',import.meta.url),'utf8');
 assert.match(html,/id="btn-comprobante"[^>]*>Imprimir y finalizar<\/button>/);
 assert.match(html,/id="btn-finalizar"[^>]*>No imprimir y finalizar<\/button>/);
 assert.doesNotMatch(html+script,/window\.print\(|btn-browser-print|imprimirDesdeNavegador|Imprimir desde navegador/);
 assert.ok(html.indexOf('id="btn-finalizar"') < html.indexOf('class="eco-digital-note"'));
 assert.match(html,/<svg class="eco-leaf"[^>]*aria-hidden="true"/);
 assert.match(html,/¡Menos papel en cada parada!/);
 for(const key of ['eco_prime_title','eco_prime_description','eco_nonprime_title','eco_nonprime_description'])
  assert.equal((script.match(new RegExp(key+':','g'))||[]).length,3);
});
test('EcoDigital promise is shown only for a numbered Prime transaction and uses the active language',()=>{
 const script=readFileSync(new URL('../src/js/script.js',import.meta.url),'utf8');
 const start=script.indexOf('function actualizarMensajeEcoDigital(');
 const end=script.indexOf('/** Pinta el ticket',start);
 const elements=new Map(['eco-title','eco-description'].map(id=>[id,{dataset:{},textContent:''}]));
 const translate=key=>({eco_prime_title:'Your choice makes a difference!',eco_prime_description:'Choose not to print and view your receipt in Primax Prime.',eco_nonprime_title:'Less paper at every stop!',eco_nonprime_description:'If you do not need a copy, choose not to print.'})[key];
 const update=vm.runInNewContext(script.slice(start,end)+'\nactualizarMensajeEcoDigital',{$:id=>elements.get(id),t:translate});
 update({membership:{id:'member'},receipt:{number:'EB01-0001'}});
 assert.equal(elements.get('eco-title').textContent,'Your choice makes a difference!');
 assert.equal(elements.get('eco-description').dataset.i18n,'eco_prime_description');
 for(const transaction of [{membership:null,receipt:{number:'EB01-0001'}},{membership:{id:'member'},receipt:null},{membership:{id:'member'},receipt:{number:''}}]){
  update(transaction);
  assert.equal(elements.get('eco-title').textContent,'Less paper at every stop!');
  assert.equal(elements.get('eco-description').dataset.i18n,'eco_nonprime_description');
 }
});
test('PrintAgent unavailable, rejected, unknown or malformed never change financial data',async()=>{
 for(const reply of [null,{id:'receipt-tx',status:'unknown'},{id:'receipt-tx',status:'retryable',error:'Offline'},{id:'wrong',status:'accepted'}]){
  const receipt={id:'tx',total:'50.00',state:'Pagado',paymentMethod:'YAPE'};const before=JSON.stringify(receipt);
  const printer=createPrinter(async()=>{if(!reply)throw Error('offline');return Response.json(reply)});
  await assert.rejects(printer(receipt));assert.equal(JSON.stringify(receipt),before);
 }
});

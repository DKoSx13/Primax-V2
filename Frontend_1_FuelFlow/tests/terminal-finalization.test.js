import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// Exercise the shipped finalization function against the actual HTML's IDs.
const source=readFileSync(new URL('../src/js/script.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../src/index.html',import.meta.url),'utf8');
const start=source.indexOf('async function finalizar()');
const end=source.indexOf('/* ===',start);
const code=source.slice(start,end);
function fixture(fail=false){
  const events=[];
  const elements=new Map([...html.matchAll(/id="([^"]+)"/g)].map(([,id])=>[id,{classList:{add(){},remove(){}},value:'',checked:true,textContent:''}]));
  const context={
    confirmedTerminal:{code:'T01'},receiptPrinting:false,receiptClosing:false,backendResult:{transaction:{id:'tx'}},state:{},
    $:id=>elements.get(id),document:{querySelectorAll:()=>[]},clearInterval(){},
    transactionsService:{current:()=>({operationId:'operation'}),assertCanFinish:id=>assert.equal(id,'tx'),finish:id=>events.push('finish:'+id)},
    terminalService:{me:async()=>({code:'T01',pumpCode:'01'}),close:async id=>{events.push('close:'+id);if(fail)throw Error('Backend unavailable');}},
    detenerProgresoAyuda(){},limpiarAuto(){},limpiarPostpago(){},actualizarMontoDisplay(){},
    mostrarPantalla:id=>events.push('screen:'+id),hablar(){},t:key=>key,actualizarEstado(){},
  };
  vm.createContext(context);vm.runInContext(code,context);
  return {context,events,elements};
}
test('successful close resets the real page without removed cash elements',async()=>{
  const f=fixture();await f.context.finalizar();
  assert.deepEqual(f.events,['close:operation','finish:tx','screen:pantalla-inicio']);
  assert.equal(f.context.backendResult,null);
});
test('failed backend closure preserves the receipt and does not clear the operation',async()=>{
  const f=fixture(true);await f.context.finalizar();
  assert.deepEqual(f.events,['close:operation']);
  assert.equal(f.context.backendResult.transaction.id,'tx');
  assert.equal(f.elements.get('print-error').textContent,'Backend unavailable');
});
test('concurrent no-print taps close once and never invoke a printer',async()=>{
  const f=fixture();let release;
  f.context.printReceipt=()=>assert.fail('no-print must not print');
  f.context.terminalService.close=async id=>{
    f.events.push('close:'+id);await new Promise(resolve=>{release=resolve;});
  };
  const first=f.context.finalizar();
  assert.equal(f.elements.get('btn-comprobante').disabled,true);
  assert.equal(await f.context.finalizar(),false);
  release();assert.equal(await first,true);
  assert.deepEqual(f.events,['close:operation','finish:tx','screen:pantalla-inicio']);
  assert.equal(f.elements.get('btn-finalizar').disabled,false);
});
function printingFixture(){
  const f=fixture();
  const start=source.indexOf('async function imprimirYFinalizar()');
  vm.runInContext(source.slice(start,source.indexOf('// Reinicia toda',start)),f.context);
  f.context.transactionsService.confirmedForPrint=async id=>({transaction:{id,receipt:{number:'EB01-0007'}}});
  f.context.pintarResumen=()=>{};
  f.context.thermalReceipt=tx=>tx.receipt;
  f.context.printReceipt=async receipt=>{f.events.push('print:'+receipt.number);return {simulation:true};};
  return f;
}
test('printing uses the confirmed receipt before closing',async()=>{
  const f=printingFixture();await f.context.imprimirYFinalizar();
  assert.deepEqual(f.events,['print:EB01-0007','close:operation','finish:tx','screen:pantalla-inicio']);
});
test('print failure preserves the operation and allows finishing without printing',async()=>{
  const f=printingFixture();f.context.printReceipt=async()=>{throw Error('Printer offline');};
  await f.context.imprimirYFinalizar();
  assert.equal(f.context.backendResult.transaction.id,'tx');
  assert.match(f.elements.get('print-error').textContent,/Printer offline/);
  assert.equal(await f.context.finalizar(),true);
  assert.deepEqual(f.events,['close:operation','finish:tx','screen:pantalla-inicio']);
});
test('a failed close after printing never displays a success message',async()=>{
  const f=printingFixture();const statuses=[];
  f.context.actualizarEstado=status=>statuses.push(status);
  f.context.terminalService.close=async()=>{throw Error('Close unavailable');};
  await f.context.imprimirYFinalizar();
  assert.equal(f.context.backendResult.transaction.id,'tx');
  assert.equal(f.elements.get('print-error').textContent,'Close unavailable');
  assert.deepEqual(statuses,[]);
});

for (const terminal of [{code:'T02',pumpCode:'02'}, {code:'T01',pumpCode:''}]) {
  test(`printing rejects changed or invalid terminal identity ${JSON.stringify(terminal)}`, async()=>{
    const f=printingFixture();
    f.context.terminalService.me=async()=>terminal;
    await f.context.imprimirYFinalizar();
    assert.deepEqual(f.events,[]);
    assert.equal(f.context.backendResult.transaction.id,'tx');
    assert.match(f.elements.get('print-error').textContent,/identidad del surtidor/);
    assert.equal(f.context.receiptPrinting,false);
    assert.equal(f.elements.get('btn-comprobante').disabled,false);
  });
}
test('terminal identity outage preserves receipt without printing or closing',async()=>{
  const f=printingFixture();
  f.context.terminalService.me=async()=>{throw Error('Terminal no disponible');};
  await f.context.imprimirYFinalizar();
  assert.deepEqual(f.events,[]);
  assert.equal(f.context.backendResult.transaction.id,'tx');
  assert.match(f.elements.get('print-error').textContent,/Terminal no disponible/);
});
test('T02 prints using the pump confirmed by the backend',async()=>{
  const f=printingFixture();
  f.context.confirmedTerminal={code:'T02'};
  f.context.terminalService.me=async()=>({code:'T02',pumpCode:'02'});
  f.context.thermalReceipt=(tx,pump)=>{assert.equal(pump,'02');return tx.receipt;};
  await f.context.imprimirYFinalizar();
  assert.deepEqual(f.events,['print:EB01-0007','close:operation','finish:tx','screen:pantalla-inicio']);
});

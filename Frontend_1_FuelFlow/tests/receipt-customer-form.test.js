import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../src/js/script.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../src/index.html',import.meta.url),'utf8');
function fixture(type='BOLETA'){
  const elements=new Map([...html.matchAll(/id="([^"]+)"/g)].map(([,id])=>[id,{value:'',textContent:'',classList:{add(){},remove(){},toggle(){}}}]));
  const events=[];
  const context={state:{tipoComprobante:type,modalidad:'PREPAGO',combustible:{nombre:'Regular',precio:15},montoPrepago:50},
    $:id=>elements.get(id),t:key=>key,hablar(){},ponerPaso(){},mostrarPantalla(){},
    marcarAuto(){},formatearPlaca:v=>v,placaValida:v=>/^[A-Z]{3}[0-9]{3}$/.test(v),
    catalogService:{vehicle:async()=>{events.push('vehicle');throw Object.assign(Error('Not found'),{status:404});}},
    irAMetodoPago:()=>events.push('payment'),
  };
  vm.createContext(context);
  const start=source.indexOf('function autocompletarPostpago()');
  const end=source.indexOf('function irAIdentificacion()',start);
  vm.runInContext(source.slice(start,end),context);
  const validationStart=source.indexOf('function dniValido(');
  const validationEnd=source.indexOf('/**',source.indexOf('async function continuarDatosOnce()',validationStart));
  vm.runInContext(source.slice(validationStart,validationEnd),context);
  return {context,elements,events};
}
test('continuing validates and retains receipt identity with no separate save action',async()=>{
  const f=fixture();f.elements.get('input-dni').value='12345678';f.elements.get('prep-input-placa').value='XYZ123';
  await f.context.continuarDatos();
  assert.equal(f.context.state.dni,'12345678');assert.equal(f.context.state.placa,'XYZ123');
  assert.deepEqual(f.events,['vehicle','payment']);
  f.context.irADatos();assert.equal(f.elements.get('input-dni').value,'12345678');
  assert.doesNotMatch(html,/save-receipt-profile/);
});
test('returning to the member form preserves edited invoice details',()=>{
  const f=fixture('FACTURA');
  f.context.state.membresiaVerificada={dni:'87654321',ruc:'20111111111',businessName:'Profile'};
  f.elements.get('input-ruc').value='20222222222';f.elements.get('input-razon').value='Receipt customer';
  f.context.irADatos();
  assert.equal(f.elements.get('input-ruc').value,'20222222222');
  assert.equal(f.elements.get('input-razon').value,'Receipt customer');
});
test('incomplete invoice cannot proceed or request vehicle data',async()=>{
  const f=fixture('FACTURA');f.elements.get('input-razon').value='Customer';
  f.elements.get('prep-input-placa').value='XYZ123';
  await f.context.continuarDatos();
  assert.deepEqual(f.events,[]);assert.equal(f.elements.get('ruc-error').textContent,'err_ruc');
});
test('starting a new attention clears personal data from a discarded operation',()=>{
  const f=fixture('FACTURA');
  const start=source.indexOf('function limpiarEstadoOperacion()');
  const end=source.indexOf('/** Limpia todo',start);
  f.context.clearInterval=()=>{};f.context.marcarEstadoOperacion=()=>{};
  f.context.backendResult={transaction:{id:'old'}};
  Object.assign(f.context.state,{dni:'12345678',ruc:'20123456789',razonSocial:'Old customer',placa:'ABC123'});
  for(const id of ['input-dni','input-ruc','input-razon','prep-input-placa'])f.elements.get(id).value='Old data';
  vm.runInContext(source.slice(start,end),f.context);
  f.context.limpiarEstadoOperacion();
  for(const field of ['dni','ruc','razonSocial','placa'])assert.equal(f.context.state[field],'');
  for(const id of ['input-dni','input-ruc','input-razon','prep-input-placa'])assert.equal(f.elements.get(id).value,'');
  assert.equal(f.context.backendResult,null);
});

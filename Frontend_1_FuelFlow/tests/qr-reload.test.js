import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createHash, webcrypto } from 'node:crypto';

const source = readFileSync(new URL('../src/js/script.js', import.meta.url), 'utf8');
function fixture(terminalCode = 'T02') {
  const operation = { operationId:'op', status:'ACTIVE' };
  const state = { combustible:{id:'fuel',precio:21.3}, modalidad:'PREPAGO', montoPrepago:20, placa:'ABC-123', codigoCliente:'', tipoComprobante:'BOLETA', onlineOrderId:'order', adminAutenticado:false, idioma:'es' };
  const context = { state, catalog:undefined, confirmedTerminal:{code:terminalCode,pumpCode:'P04'}, crypto:webcrypto, TextEncoder,
    kioskAuthEnabled:()=>true, kioskStationId:()=> 'station',
    catalogService:{fuels:async()=>[{id:'fuel',active:true,pricePerGallon:'99.00'}],stations:async()=>[{id:'station',active:true}]},
    terminalService:{me:async()=>({code:terminalCode,pumpCode:'P04',prepared:true,activeOperationId:'op'})},
    transactionsService:{begin:()=>({operationId:'op'})},
  };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('async function cargarCatalogoOperacion('), source.indexOf('async function iniciar(')), context);
  vm.runInContext(source.slice(source.indexOf('function ordenAuthorization('), source.indexOf('function irAMetodoPago(')), context);
  return { context, state, operation };
}
for (const terminal of ['T01','T02']) test(`catalog comes from authenticated ${terminal} operation, retaining historical price`,async()=>{
  const f=fixture(terminal);await f.context.cargarCatalogoOperacion(f.operation);
  assert.equal(f.context.catalog.station.id,'station');assert.equal(f.state.combustible.precio,21.3);
});
for (const field of ['code','pumpCode','activeOperationId']) test(`rejects mismatched authenticated terminal ${field}`,async()=>{
  const f=fixture();f.context.terminalService.me=async()=>({code:'T02',pumpCode:'P04',prepared:true,activeOperationId:'op',[field]:'foreign'});
  await assert.rejects(f.context.cargarCatalogoOperacion(f.operation),/no coincide/);assert.equal(f.context.catalog,undefined);
});
test('catalog outage retains error and clears stale context',async()=>{
  const f=fixture();f.context.catalog={station:{id:'stale'}};f.context.catalogService.fuels=async()=>{throw Error('Backend unavailable');};
  await assert.rejects(f.context.cargarCatalogoOperacion(f.operation),/Backend unavailable/);assert.equal(f.context.catalog,undefined);
});
test('restoration never imports busy locks, unknown keys or admin session from old snapshot',()=>{
  const f=fixture();delete f.state.onlineOrderId;f.context.restaurarOrdenSnapshot({onlineOrderId:'order',onlineOrderAmount:'10',montoPrepago:20,creatingOrder:true,changingMethod:true,confirmingQR:true,despachoTimer:99,adminAutenticado:true,idioma:'other',unknown:true});
  assert.equal(f.state.onlineOrderId,'order');assert.equal(f.state.onlineOrderAmount,'10');
  assert.equal(f.state.creatingOrder,false);assert.equal(f.state.changingMethod,false);assert.equal(f.state.confirmingQR,false);assert.equal(f.state.despachoTimer,null);
  assert.equal(f.state.adminAutenticado,false);assert.equal(f.state.idioma,'es');assert.equal(f.state.unknown,undefined);
});
test('QR checkpoint persists operation data without in-flight UI flags',()=>{
  const f=fixture();f.state.creatingOrder=true;const s=f.context.snapshotOrden({onlineOrderCreationPending:true});
  assert.equal(s.creatingOrder,false);assert.equal(s.onlineOrderCreationPending,true);assert.equal(s.montoPrepago,20);
});
function order(f) {
  const request={operationId:'op',method:'YAPE',authorization:{plate:'ABC-123',mode:'PREPAGO',paymentMethod:'YAPE',unitPrice:'21.30',allowDebt:false,operationId:'op',amount:'20.00',stationId:'station',fuelId:'fuel',receiptType:'BOLETA'}};
  return {id:'order',operationId:'op',status:'PENDING',method:'YAPE',amount:'10',requestHash:createHash('sha256').update(JSON.stringify(request)).digest('hex')};
}
test('server checksum validates exact request without substituting discounted charge or current price',async()=>{
  const f=fixture();await f.context.cargarCatalogoOperacion(f.operation);await f.context.validarOrdenRecuperada(order(f),{operationId:'op'});
  assert.equal(f.state.montoPrepago,20);assert.equal(f.state.combustible.precio,21.3);
});
test('modified saved request is rejected before enabling confirmation',async()=>{
  const f=fixture();await f.context.cargarCatalogoOperacion(f.operation);const saved=order(f);f.state.montoPrepago=30;
  await assert.rejects(f.context.validarOrdenRecuperada(saved,{operationId:'op'}),/no coinciden/);
});
test('incomplete snapshot is rejected and CAPTURED never becomes a completed sale',async()=>{
  const f=fixture();await f.context.cargarCatalogoOperacion(f.operation);const saved=order(f);f.state.combustible=null;
  await assert.rejects(f.context.validarOrdenRecuperada(saved,{operationId:'op'}),/Faltan datos/);
  await assert.rejects(f.context.validarOrdenRecuperada({...saved,status:'CAPTURED'},{operationId:'op'}),/CAPTURED.*asistencia/);
});
test('authorization cannot dereference an uninitialized catalog',()=>{
  const f=fixture();assert.throws(()=>f.context.ordenAuthorization('YAPE'),/estación no está disponible/);
});

for (const staysCreating of [false,true]) test(`existing CREATING order ${staysCreating?'stays blocked':'becomes a QR'} without another POST`,async()=>{
  const f=fixture();await f.context.cargarCatalogoOperacion(f.operation);
  const saved={...order(f),providerId:'demo:order'};const calls=[];const elements=new Map();
  f.context.$=id=>{if(!elements.has(id))elements.set(id,{disabled:false,textContent:'',children:[],replaceChildren(){this.children=[];},append(x){this.children.push(x);}});return elements.get(id);};
  f.context.document={createElement:()=>({style:{}})};
  f.context.ensureTerminalOperation=async()=>f.operation;
  f.context.transactionsService.current=()=>({operationId:'op'});f.context.transactionsService.checkpoint=()=>{};
  f.context.apiClient=async(path,options)=>{calls.push({path,options});return {...saved,status:calls.length===1||staysCreating?'CREATING':'PENDING'};};
  vm.runInContext(source.slice(source.indexOf('async function crearOrdenQR('),source.indexOf('setInterval(async()=>{',source.indexOf('async function crearOrdenQR('))),f.context);
  await f.context.crearOrdenQR('YAPE');
  assert.equal(calls.length,2);assert(calls.every(c=>c.path==='/online-orders/order'&&!c.options));
  assert.equal(f.state.creatingOrder,false);assert.equal(f.context.$('btn-qr-pagado').disabled,staysCreating);
  if(staysCreating)assert.match(f.context.$('qr-msg').textContent,/sigue en creación/);
  else assert.equal(f.context.$('qr-code').children.length,1);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createAssistanceClient,assistanceReasons,assistanceLabels} from '../src/js/assistance.js';
const storage=()=>{const values=new Map();return{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)}};
test('assistance retains stable payload across timeout/reload, preventing duplicate creation',async()=>{
 const local=storage();let calls=[];let fail=true;
 const request=async(path,options)=>{calls.push({path,options});if(fail)throw Error('timeout');return{id:'one',status:'PENDIENTE'}};
 const a=createAssistanceClient({storage:local,request,uuid:()=> 'stable'});
 await assert.rejects(a.submit({reason:'OTRO',observation:'Ayuda'})); fail=false;
 const b=createAssistanceClient({storage:local,request,uuid:()=> 'different'});
 await b.refresh();assert.deepEqual(calls[0].options.body,calls[1].options.body);assert.equal(b.current().id,'one');
 await b.submit({reason:'ERROR_PAGO'});assert.equal(calls[2].path,'/terminal/assistance/one');
});
test('concurrent clicks share creation and terminal states allow another request',async()=>{
 let calls=0;const client=createAssistanceClient({storage:storage(),uuid:()=> 'id',request:async()=>{calls++;return{id:'one',status:'RESUELTA'}}});
 await Promise.all([client.submit({reason:'AYUDA_GENERAL'}),client.submit({reason:'AYUDA_GENERAL'})]);assert.equal(calls,1);
 client.clearCompleted();assert.equal(client.current(),null);
 assert.equal(assistanceReasons.length,6);assert.match(assistanceLabels.EN_ATENCION,/atendiendo/);
});
test('cancellation waits for Backend and keeps request when unavailable',async()=>{
 let fail=false;const client=createAssistanceClient({storage:storage(),uuid:()=> 'id',request:async(path)=>{if(fail)throw Error('offline');return{id:'one',status:path.endsWith('/cancel')?'CANCELADA_POR_CLIENTE':'PENDIENTE'}}});
 await client.submit({reason:'OTRO'});fail=true;await assert.rejects(client.cancel());assert.equal(client.current().status,'PENDIENTE');
 fail=false;assert.equal((await client.cancel()).status,'CANCELADA_POR_CLIENTE');
});


test('assistance page preserves module bootstrap and complete document', async () => {
 const {readFile}=await import('node:fs/promises');
 const html=await readFile(new URL('../src/index.html',import.meta.url),'utf8');
 assert.match(html, /<script type="module" src="js\/script.js[^"]*"><\/script>/);
 assert.match(html, /<\/body>\s*<\/html>\s*$/);
});

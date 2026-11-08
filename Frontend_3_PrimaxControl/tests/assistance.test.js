import test from 'node:test';
import assert from 'node:assert/strict';
import {assistanceActions,assistanceDetailMarkup} from '../js/assistance.js';
import {visibleModules} from '../js/control-state.js';
test('only pending requests can be taken; only assigned staff member can finish',()=>{
 assert.deepEqual(assistanceActions({status:'PENDIENTE'},'a',true),['ACCEPT']);
 assert.deepEqual(assistanceActions({status:'EN_ATENCION',assignedStaffId:'a'},'b',true),[]);
 assert.deepEqual(assistanceActions({status:'EN_ATENCION',assignedStaffId:'a'},'a',true),['NOTE','RESOLVE','ESCALATE']);
 assert.deepEqual(assistanceActions({status:'RESUELTA'},'a',true),[]);
 assert.deepEqual(assistanceActions({status:'PENDIENTE'},'a',false),[]);
});
test('administrative history needs incident view grant',()=>{
 assert(visibleModules({permissions:['ADMIN_INCIDENT_VIEW']}).some(([id])=>id==='assistance'));
 assert(!visibleModules({permissions:[]}).some(([id])=>id==='assistance'));
});

test('notification baseline excludes history and suppresses repeats', async()=>{
 const {createArrivalTracker}=await import('../js/assistance.js');
 const track=createArrivalTracker();
 assert.deepEqual(track([{id:'old',status:'PENDIENTE'}]),[]);
 assert.deepEqual(track([{id:'old',status:'PENDIENTE'},{id:'new',status:'PENDIENTE'}]).map(r=>r.id),['new']);
 assert.deepEqual(track([{id:'new',status:'PENDIENTE'}]),[]);
 assert.deepEqual(track([{id:'resolved',status:'RESUELTA'}]),[]);
 assert.deepEqual(track([{id:'resolved',status:'PENDIENTE'}]),[]);
 assert.deepEqual(createArrivalTracker()([{id:'other-station',status:'PENDIENTE'}]),[]);
});

test('detail keeps scoped data readable, chronological and escaped',()=>{
 const html=assistanceDetailMarkup({reason:'ERROR_PAGO',status:'EN_ATENCION',station:{name:'Sur'},terminal:{code:'T01'},pump:{code:'P02'},operationId:'11111111-1111-4111-8111-111111111111',plate:'ABC-123',customerName:'Cliente',assignedStaff:{name:'Encargado'},createdAt:'2026-11-08T10:00:00Z',incidents:[],events:[{createdAt:'2026-11-08T12:00:00Z',action:'ASSISTANCE_NOTE'},{createdAt:'2026-11-08T11:00:00Z',action:'ASSISTANCE_CREATED',details:{observation:'<script>'}}]});
 assert.match(html,/Referencia técnica de operación/);
 assert.match(html,/data-copy-assistance=/);
 assert.match(html,/Sin incidencias vinculadas/);
 assert(html.indexOf('Solicitud creada')<html.indexOf('Observación registrada'));
 assert.doesNotMatch(html,/<script>/);
});

test('real backend assistance events have readable labels and unknown codes remain diagnostic',async()=>{
 const {eventPresentation}=await import('../js/assistance.js');
 assert.equal(eventPresentation('ASSISTANCE_ACCEPT').label,'Solicitud aceptada');
 assert.equal(eventPresentation('ASSISTANCE_RESOLVE').label,'Solicitud resuelta');
 assert.equal(eventPresentation('ASSISTANCE_ESCALATE').label,'Solicitud escalada');
 assert.deepEqual(eventPresentation('ASSISTANCE_FUTURE'),{label:'Evento de asistencia registrado',technical:'ASSISTANCE_FUTURE'});
});

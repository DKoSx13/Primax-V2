import test from 'node:test';
import assert from 'node:assert/strict';
import {assistanceActions} from '../js/assistance.js';
import {visibleModules} from '../js/control-state.js';
test('only pending requests can be taken; only assigned Supervisor can finish',()=>{
 assert.deepEqual(assistanceActions({status:'PENDIENTE'},'a',true),['ACCEPT']);
 assert.deepEqual(assistanceActions({status:'EN_ATENCION',assignedSupervisorId:'a'},'b',true),[]);
 assert.deepEqual(assistanceActions({status:'EN_ATENCION',assignedSupervisorId:'a'},'a',true),['NOTE','RESOLVE','ESCALATE','CANCEL']);
 assert.deepEqual(assistanceActions({status:'RESUELTA'},'a',true),[]);
 assert.deepEqual(assistanceActions({status:'PENDIENTE'},'a',false),[]);
});
test('administrative history needs incident view grant',()=>{
 assert(visibleModules({permissions:['ADMIN_INCIDENT_VIEW']}).some(([id])=>id==='assistance'));
 assert(!visibleModules({permissions:[]}).some(([id])=>id==='assistance'));
});

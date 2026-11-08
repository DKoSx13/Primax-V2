import test from 'node:test';
import assert from 'node:assert/strict';
import { operationStatusLabel, operationFinancialLabel } from '../js/operation-labels.js';
test('backend operational and authorization statuses are distinct from financial statuses',()=>{
 assert.deepEqual(['ACTIVE','CLOSED','INTERVENTION_REQUIRED','RESERVED','DISPENSING','SETTLED','RELEASED'].map(operationStatusLabel),
 ['Activa','Cerrada','Requiere intervención','Reservada','Abasteciendo','Liquidada','Reserva liberada']);
 assert.equal(operationFinancialLabel('PAYMENT_PENDING'),'Pago pendiente');
 assert.equal(operationFinancialLabel('CAPTURED'),'Confirmado');
});

test('transaction statuses used by the operations filter have distinct labels',()=>{
 const codes=['ACTIVE','INTERVENTION_REQUIRED','CLOSED','RESERVED','DISPENSING','SETTLED','RELEASED','PAID','REFUNDED','PAYMENT_PENDING'];
 const labels=codes.map(operationStatusLabel);
 assert.equal(new Set(labels).size,codes.length);
 assert(!labels.some(label=>label==='Estado por revisar'));
 assert.equal(operationStatusLabel('FUTURE_STATUS'),'Estado desconocido (FUTURE_STATUS)');
});

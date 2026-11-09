import test from 'node:test';
import assert from 'node:assert/strict';
import { operationStatusLabel, operationFinancialLabel, operationDetailStatusLabel } from '../js/operation-labels.js';
test('backend operational and authorization statuses are distinct from financial statuses',()=>{
 assert.deepEqual(['ACTIVE','CLOSED','INTERVENTION_REQUIRED','RESERVED','DISPENSING','SETTLED','RELEASED'].map(operationStatusLabel),
 ['Activa','Cerrada','Requiere intervención','Reservada','Abasteciendo','Liquidada','Reserva liberada']);
 assert.equal(operationFinancialLabel('PAYMENT_PENDING'),'Pago pendiente');
 assert.equal(operationFinancialLabel('CAPTURED'),'Pago confirmado');
});

test('operation detail labels distinguish orders, payments, authorization and inventory',()=>{
 assert.equal(operationDetailStatusLabel('order','CANCELLED'),'Cancelada');
 assert.equal(operationDetailStatusLabel('payment','CANCELLED'),'Cancelado');
 assert.equal(operationDetailStatusLabel('payment','CAPTURED'),'Pago confirmado');
 assert.equal(operationDetailStatusLabel('authorization','SETTLED'),'Liquidada');
 assert.equal(operationDetailStatusLabel('reservation','CLOSED'),'Cerrada');
 assert.equal(operationDetailStatusLabel('operation','ACTIVE'),'Activa');
 assert.equal(operationDetailStatusLabel('operation','CLOSED'),'Cerrada');
});

test('transaction statuses used by the operations filter have distinct labels',()=>{
 const codes=['ACTIVE','INTERVENTION_REQUIRED','CLOSED','RESERVED','DISPENSING','SETTLED','RELEASED','PAID','REFUNDED','PAYMENT_PENDING'];
 const labels=codes.map(operationStatusLabel);
 assert.equal(new Set(labels).size,codes.length);
 assert(!labels.some(label=>label==='Estado por revisar'));
 assert.equal(operationStatusLabel('FUTURE_STATUS'),'Estado desconocido (FUTURE_STATUS)');
});

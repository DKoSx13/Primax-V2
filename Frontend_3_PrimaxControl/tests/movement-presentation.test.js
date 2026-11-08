import test from 'node:test';
import assert from 'node:assert/strict';
import {movementKindLabel,formatLiters} from '../js/movement-presentation.js';
test('all persisted inventory movement kinds have Spanish labels',()=>{
 assert.deepEqual(['OPENING_BALANCE','RESERVE','DISPENSE','LEGACY_DISPENSE','RELEASE','ADJUST_IN','ADJUST_OUT'].map(movementKindLabel),
 ['Saldo inicial','Reserva','Despacho','Despacho histórico','Liberación de reserva','Ajuste de entrada','Ajuste de salida']);
});
test('exact decimal display keeps sign and fractional precision',()=>{
 assert.equal(formatLiters('-12345.000001'),'-12 345,000001');
 assert.equal(formatLiters('+1.234500'),'+1,234500');
 assert.equal(formatLiters(null),'—');
});

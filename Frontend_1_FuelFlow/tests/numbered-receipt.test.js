import test from 'node:test';
import assert from 'node:assert/strict';
import {thermalReceipt} from '../src/js/thermalReceipt.js';
import {validateReceipt} from '../../PrintAgent/contract.mjs';

for(const [documentType,number] of [['BOLETA','EB01-0007'],['FACTURA','FT01-10000']])
test(documentType+' sends the persisted number unchanged to the printer',()=>{
  const transaction={id:'transaction-1',createdAt:'2026-11-07T00:00:00.000Z',receiptType:documentType,
    receipt:{id:'receipt-1',number,issuedAt:'2026-11-07T00:01:00.000Z'},mode:'PREPAGO',
    station:{name:'Primax Sur'},plate:'ABC-123',fuel:{name:'Regular'},gallons:'1',unitPrice:'21.30',amount:'21.30',status:'PAID',payment:{method:'TARJETA',status:'CAPTURED'}};
  const first=thermalReceipt(transaction),reprint=thermalReceipt(transaction);
  assert.equal(first.number,number);assert.equal(first.transactionId,'transaction-1');
  assert.equal(first.id,'receipt-1');assert.deepEqual(first,reprint);assert.equal(validateReceipt(first).number,number);
  assert.throws(()=>validateReceipt({...first,number:documentType==='BOLETA'?'FT01-0001':'EB01-0001'}));
});

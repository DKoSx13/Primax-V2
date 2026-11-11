const {execFileSync}=require('node:child_process');
const assert=require('node:assert/strict');

// Read-only snapshot. Never release reservations or close operations to make a test pass.
module.exports=function financialState(){
 require('./assert-lab.cjs')();
 const sql=`BEGIN READ ONLY;
 SELECT json_build_object(
 'operations',(SELECT coalesce(json_agg(x),'[]') FROM (SELECT o."operationId",o.number,o.status,t.code terminal,p.code pump,r.number receipt FROM "TerminalOperation" o JOIN "Terminal" t ON t.id=o."terminalId" JOIN "Pump" p ON p.id=o."pumpId" LEFT JOIN "Transaction" s ON s."operationId"=o."operationId" LEFT JOIN "Receipt" r ON r."transactionId"=s.id ORDER BY o."openedAt") x),
 'transactions',(SELECT count(*) FROM "Transaction"),
 'payments',(SELECT count(*) FROM "Payment"),
 'pendingReservations',(SELECT count(*) FROM "InventoryReservation" WHERE status NOT IN ('CLOSED','CANCELLED')),
 'duplicateTransactions',(SELECT count(*) FROM (SELECT "operationId" FROM "Transaction" GROUP BY 1 HAVING count(*)>1) x),
 'duplicatePayments',(SELECT count(*) FROM (SELECT "transactionId" FROM "Payment" WHERE "transactionId" IS NOT NULL GROUP BY 1 HAVING count(*)>1) x),
 'duplicateReservations',(SELECT count(*) FROM (SELECT "operationId" FROM "InventoryReservation" GROUP BY 1 HAVING count(*)>1) x)
 ); COMMIT;`;
 const output=execFileSync('docker',['exec','-i','primax-astra-qa-postgres-1','psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','astra_qa','-d','astra_qa_local'],{input:sql,encoding:'utf8',timeout:20000});
 return JSON.parse(output.trim());
};
module.exports.assertSettled=function(state){
 assert(state.operations.every(o=>o.status==='CLOSED'||o.status==='CANCELLED'),'Existing operation requires recovery; do not create another purchase');
 for(const key of ['pendingReservations','duplicateTransactions','duplicatePayments','duplicateReservations'])assert.equal(state[key],0,key);
};
if(require.main===module)console.log(JSON.stringify(module.exports(),null,2));

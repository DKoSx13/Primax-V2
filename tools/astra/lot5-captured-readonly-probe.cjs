// Executed only inside the NEW synthetic Commerce container. SELECTs under READ ONLY.
require('reflect-metadata');
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {PrismaClient,Prisma}=require('@prisma/client');
const {plainToInstance}=require('class-transformer');
const {KioskService}=require('./services/commerce/dist/src/kiosk/kiosk.service.js');
const {CreateAuthorizationDto}=require('./services/commerce/dist/src/transactions/create-authorization.dto.js');
assert(/^primax-astra-lot5-captured-[a-f0-9]+$/.test(process.env.COMPOSE_PROJECT_NAME||''),'Only the new captured diagnostic lab is allowed');
const input=JSON.parse(process.argv[1]),db=new PrismaClient();
async function main(){
 const result=await db.$transaction(async tx=>{
  await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
  const operation=await tx.terminalOperation.findUniqueOrThrow({where:{operationId:input.operationId}});
  const [order,payment,reservation,auth,sale,credential,fuel]=await Promise.all([
   tx.onlineOrder.findUniqueOrThrow({where:{operationId:input.operationId}}),tx.payment.findUniqueOrThrow({where:{operationId:input.operationId}}),
   tx.inventoryReservation.findUniqueOrThrow({where:{operationId:input.operationId}}),tx.fuelAuthorization.findUnique({where:{operationId:input.operationId}}),
   tx.transaction.findUnique({where:{operationId:input.operationId}}),tx.terminalCredential.findFirst({where:{terminalId:operation.terminalId,revokedAt:null,expiresAt:{gt:new Date()}}}),
   tx.fuel.findUniqueOrThrow({where:{id:input.authorization.fuelId}})
  ]);
  assert.equal(auth,null);assert.equal(sale,null);assert.equal(order.status,'CAPTURED');assert.equal(payment.status,'CAPTURED');
  let admission;
  // Invoke the unmodified read-only predicate, NOT issueRecoveryTicket, exchange,
  // authorization creation, transaction creation, cancel, refund or compensation.
  try{const evidence=await Object.create(KioskService.prototype).recoveryEvidence(tx,operation);admission={accepted:true,evidence};}
  catch(error){admission={accepted:false,httpStatus:error.getStatus?.(),message:error.message};}
  const authorization=plainToInstance(CreateAuthorizationDto,input.authorization);
  const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
  const normalized={...authorization,plate:authorization.plate,amount:new Prisma.Decimal(authorization.amount).toFixed(2)};
  const providerEvent=await tx.paymentEvent.findUniqueOrThrow({where:{eventKey:'demo-confirm:'+order.id}});
  const remote=JSON.parse(providerEvent.detail);
  const checks={orderRequestHashMatches:hash({operationId:input.operationId,method:input.method,authorization})===order.requestHash,
   authorizationHashMatchesPersistedPayment:hash(normalized)===payment.requestHash,
   reservationHashMatchesPayment:reservation.requestHash.trim()===payment.requestHash,
   orderPaymentLink:order.paymentId===payment.id,matchingOperation:operation.operationId===order.operationId&&order.operationId===payment.operationId,
   matchingStationAndFuel:reservation.stationId===operation.stationId&&reservation.fuelId===authorization.fuelId,
   currentPriceMatchesOriginal:payment.unitPrice.eq(fuel.pricePerGallon)&&fuel.pricePerGallon.eq(authorization.unitPrice),
   providerEvidencePaid:remote.id===order.providerId&&remote.order_number===order.id&&remote.state==='paid'&&remote.amount===order.amount.mul(100).toNumber()&&remote.currency_code==='PEN',
   noDispense:reservation.consumedLiters.isZero(),noAuthorization:auth===null,noSale:sale===null};
  assert(Object.values(checks).every(Boolean));assert.equal(admission.accepted,false);assert.equal(admission.httpStatus,409);
  const infrastructure={serverVersion:(await tx.$queryRawUnsafe("SELECT current_setting('server_version') AS version"))[0].version,
   migrations:(await tx.$queryRawUnsafe('SELECT count(*)::int AS n FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL'))[0].n,
   unvalidatedForeignKeys:(await tx.$queryRawUnsafe("SELECT count(*)::int AS n FROM pg_constraint WHERE contype='f' AND NOT convalidated"))[0].n,
   sequences:await tx.$queryRawUnsafe("SELECT sequencename,last_value::text AS last_value FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename")};
  return {transactionReadOnly:true,project:process.env.COMPOSE_PROJECT_NAME,operationId:operation.operationId,orderId:order.id,paymentId:payment.id,
   admission,checks,liveOrdinaryTerminalCredential:!!credential,counts:{orders:await tx.onlineOrder.count(),payments:await tx.payment.count(),authorizations:await tx.fuelAuthorization.count(),sales:await tx.transaction.count(),receipts:await tx.receipt.count()},
   reservation:{status:reservation.status,remainingLiters:reservation.remainingLiters.toFixed(6),consumedLiters:reservation.consumedLiters.toFixed(6)},
   infrastructure,limits:'Predicate invocation only: public exceptional ticket issuance has additional authorization/live-credential gates; no ticket or financial action was requested'};
 },{timeout:20000});
 console.log(JSON.stringify(result));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>db.$disconnect());

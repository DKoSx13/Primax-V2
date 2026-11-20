// Test-only fault injection inside the NEW Commerce process/database. No manual state edits.
require('reflect-metadata');
const fs=require('node:fs'),assert=require('node:assert/strict');
const {plainToInstance}=require('class-transformer');
const {PrismaService}=require('./services/commerce/dist/src/prisma/prisma.service');
const {AuthorizationsService}=require('./services/commerce/dist/src/transactions/authorizations.service');
const {AuthorizationsRepository}=require('./services/commerce/dist/src/transactions/authorizations.repository');
const {WalletRepository}=require('./services/commerce/dist/src/wallet/wallet.repository');
const {CreateAuthorizationDto}=require('./services/commerce/dist/src/transactions/create-authorization.dto');
assert(/^primax-astra-lot5-continuation-[a-f0-9]+$/.test(process.env.COMPOSE_PROJECT_NAME||''));
const db=new PrismaService(),input=JSON.parse(process.argv[1]);
async function state(){return {order:await db.onlineOrder.findUnique({where:{operationId:input.operationId}}),payment:await db.payment.findUnique({where:{operationId:input.operationId}}),reservation:await db.inventoryReservation.findUnique({where:{operationId:input.operationId}}),authorizations:await db.fuelAuthorization.findMany({where:{operationId:input.operationId}}),sales:await db.transaction.findMany({where:{operationId:input.operationId}}),events:await db.paymentEvent.findMany({where:{orderId:input.capturedContinuation.orderId},orderBy:{id:'asc'}})};}
async function main(){
 const before=await state();assert.equal(before.authorizations.length,0);assert.equal(before.reservation.status,'PENDING_PAYMENT');
 const repo=new AuthorizationsRepository(db),atomic=repo.atomic.bind(repo);let injected=0,providerCalls=0;
 repo.atomic=work=>atomic(tx=>work(new Proxy(tx,{get(target,key){if(key!=='paymentEvent')return target[key];return new Proxy(target.paymentEvent,{get(delegate,name){if(name!=='create')return delegate[name];return async args=>{if(args.data.kind==='CAPTURED_CONTINUED'){injected++;throw Error('SYNTHETIC_CONTINUATION_COMMIT_INTERRUPTED');}return delegate.create(args);};}});}})));
 const service=new AuthorizationsService(repo,new WalletRepository(db),{authorize(){providerCalls++;throw Error('Provider must never be called');}});
 await assert.rejects(service.create(plainToInstance(CreateAuthorizationDto,input)),/SYNTHETIC_CONTINUATION_COMMIT_INTERRUPTED/);
 assert.equal(injected,1);assert.equal(providerCalls,0);assert.deepEqual(await state(),before);
 console.log(JSON.stringify({project:process.env.COMPOSE_PROJECT_NAME,operationId:input.operationId,fault:'after authorization insert and inventory activation, before continuation audit commit',transactionRolledBack:true,exactStateUnchanged:true,providerCalls,injected,manualFinancialStateEdits:false}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>db.$disconnect());

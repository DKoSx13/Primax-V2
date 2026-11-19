module.exports=async c=>{
  const {db,id,call,snapshot,assert,flags}=c;
  await db.membership.create({data:{id:id('root-membership'),userId:id('root'),number:'LAB-ROOT',balance:'0.00'}});
  for(const key of ['member','root'])await db.transaction.create({data:{id:id(key+'-sale'),operationId:id(key+'-sale-operation'),requestHash:'a'.repeat(64),plate:'AAA-001',membershipId:id(key+'-membership'),stationId:id('station-'+(key==='root'?'B':'A')),fuelId:id('fuel'),amount:'60.00',unitPrice:'20.00',gallons:'3.000',pointsRate:'0.1',pointsEarned:0,mode:'POSTPAGO',status:'PAID'}});
  const before=await snapshot(),seq=await c.sequences(),route='/api/v1/transactions/';
  await call('GET',route+id('member-sale'),200,'member reads own transaction',{actor:'member'});
  await call('GET',route+id('root-sale'),404,'member cannot read another owner',{actor:'member'});
  await call('GET',route+id('root-sale'),200,'second member reads own transaction',{actor:'root'});
  await call('GET',route+id('member-sale'),404,'second member cannot read first owner',{actor:'root'});
  for(const actor of ['anonymous','invalid','expired','stale'])await call('GET',route+id('member-sale'),401,'read denies '+actor,{actor});
  await call('GET',route+'invalid',400,'read invalid UUID',{actor:'member'});
  await call('GET',route+id('absent-sale'),404,'read absent UUID',{actor:'member'});
  await call('GET',route+id('member-sale'),200,'legacy read compatibility',{actor:'legacy'});
  await call('GET',route+id('root-sale'),200,'legacy foreign station limitation retained',{actor:'legacy'});
  await call('GET',route+id('member-sale')+'?userId='+id('root'),200,'member read ignores foreign query owner',{actor:'member'});
  assert.deepEqual(await snapshot(),before);assert.deepEqual(await c.sequences(),seq);flags.transactionReadOwnerContracts=true;flags.readNoFinancialWrites=true;
};

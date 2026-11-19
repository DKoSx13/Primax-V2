module.exports=async c=>{
  const {assert,db,id,call,snapshot,sequences,flags}=c;
  await db.station.update({where:{id:id('station-B')},data:{active:false}});
  await db.fuel.create({data:{id:id('inactive-fuel'),code:'ZZZ',name:'Inactive synthetic',pricePerGallon:'30.00',active:false}});
  await db.fuelInventory.create({data:{stationId:id('station-B'),fuelId:id('inactive-fuel'),liters:'50.00'}});
  await db.benefit.create({data:{id:id('inactive-benefit'),code:'ZZZ',title:'Inactive',description:'Synthetic',category:'Synthetic',pointsCost:50,active:false}});
  const before=await snapshot(),seq=await sequences();
  const fuels=await call('GET','/api/v1/fuels',200,'active fuel list',{actor:'anonymous'});assert.deepEqual(fuels.map(x=>x.code),['LAB']);
  const stations=await call('GET','/api/v1/stations',200,'active station list',{actor:'anonymous'});assert.deepEqual(stations.map(x=>x.code),['A']);
  const benefits=await call('GET','/api/v1/benefits',200,'active benefits',{actor:'anonymous'});assert.deepEqual(benefits.map(x=>x.code),['LAB']);
  const stock=await call('GET','/api/v1/fuels/inventory',200,'public inventory exposure preserved',{actor:'anonymous'});assert.equal(stock.length,2);assert(stock.some(x=>x.stationId===id('station-B')));
  const bearer=await call('GET','/api/v1/fuels/inventory',200,'public bearer does not create Control scope',{actor:'manager'});assert.deepEqual(bearer,stock);
  for(const route of ['stations','inventory']){
    const path='/api/v1/control/catalog/'+route;
    for(const [actor,status]of [['anonymous',401],['member',403],['viewer',403],['legacy',401],['invalid',401],['expired',401]])await call('GET',path,status,route+' denies '+actor,{actor});
    const scoped=await call('GET',path,200,route+' scoped manager',{actor:'manager'});assert.equal(scoped.length,1);assert.equal(route==='stations'?scoped[0].id:scoped[0].stationId,id('station-A'));
    await call('GET',path+'?stationId='+id('station-B'),403,route+' explicit foreign station denied',{actor:'manager'});
    await call('GET',path+'?stationId=bad',400,route+' invalid station DTO',{actor:'manager'});
    await call('GET',path,200,route+' cookie session',{actor:'cookie'});
    await call('GET',path,200,route+' global root',{actor:'root'});
  }
  await Promise.all(['A','B'].map(k=>call('GET','/api/v1/fuels/inventory',200,'concurrent catalog '+k,{actor:'anonymous'})));
  assert.deepEqual(await snapshot(),before);assert.deepEqual(await sequences(),seq);flags.sixCatalogContracts=true;flags.stationAndPermissionFilters=true;flags.activeMasterFiltering=true;flags.publicInventoryLimitationPreserved=true;flags.noSqlWrites=true;flags.noSequenceChanges=true;
};

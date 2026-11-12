const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Catalog } = require('../dist/application/catalog');
const { configuration } = require('../dist/config');
const { PostgresCatalog } = require('../dist/adapters/postgres');

test('station and inventory scope never expose a different station', async () => {
  const catalog = new Catalog({ stations: async () => [{id:'a'}, {id:'b'}],
    inventory: async () => [{stationId:'a'}, {stationId:'b'}] });
  assert.deepEqual(await catalog.stations('a'), [{id:'a'}]);
  assert.deepEqual(await catalog.inventory('unknown'), []);
  assert.equal((await catalog.inventory()).length, 2);
});
test('startup fails closed without service credentials or environment', () => {
  assert.throws(() => configuration({}), /APP_ENV/);
  assert.throws(() => configuration({ APP_ENV:'qa', CATALOG_DATABASE_URL:'postgres://localhost/qa' }), /API_KEY/);
});
test('persistence uses read-only transaction and canonical decimal strings', async () => {
  const statements = [];
  let released = false;
  const client = { query: async sql => { statements.push(sql); return {rows: sql.startsWith('SELECT') ? [{pricePerGallon:'21.30'}] : []}; }, release: () => {released=true;} };
  const adapter = new PostgresCatalog({connect: async () => client});
  assert.equal((await adapter.fuels())[0].pricePerGallon, '21.3');
  assert.match(statements[0], /READ ONLY/);
  assert.equal(statements.at(-1), 'COMMIT');
  assert.equal(released, true);
});
test('query failure rolls back and releases the connection', async () => {
  const statements = []; let released = false;
  const adapter = new PostgresCatalog({connect: async () => ({query: async sql => {
    statements.push(sql); if(sql.startsWith('SELECT'))throw Error('unavailable');
  }, release: () => {released=true;}})});
  await assert.rejects(adapter.fuels(), /unavailable/);
  assert.equal(statements.at(-1), 'ROLLBACK'); assert.equal(released, true);
});

test('real Nest HTTP contract: key required, health public, writes rejected', async () => {
  require('reflect-metadata');
  const {Module} = require('@nestjs/common'); const {NestFactory} = require('@nestjs/core');
  const {CatalogController, HealthController, ServiceGuard, API_KEY} = require('../dist/adapters/http');
  const reader = {fuels:async()=>[{id:'fuel',pricePerGallon:'21.3'}], stations:async()=>[],
    benefits:async()=>[], inventory:async()=>[], ready:async()=>{}};
  class TestModule {}
  Module({controllers:[CatalogController,HealthController], providers:[ServiceGuard,
    {provide:Catalog,useValue:new Catalog(reader)}, {provide:API_KEY,useValue:'test-only-key'}]})(TestModule);
  const app = await NestFactory.create(TestModule,{logger:false});
  try {
    await app.listen(0,'127.0.0.1'); const url=await app.getUrl();
    assert.equal((await fetch(url+'/health')).status,200);
    assert.equal((await fetch(url+'/api/v1/fuels')).status,401);
    assert.equal((await fetch(url+'/api/v1/fuels',{headers:{'x-catalog-key':'wrong'}})).status,401);
    const response=await fetch(url+'/api/v1/fuels',{headers:{'x-catalog-key':'test-only-key'}});
    assert.equal(response.status,200); assert.deepEqual(await response.json(),await reader.fuels());
    assert.equal((await fetch(url+'/api/v1/fuels',{method:'POST',headers:{'x-catalog-key':'test-only-key'}})).status,404);
  } finally {await app.close();}
});

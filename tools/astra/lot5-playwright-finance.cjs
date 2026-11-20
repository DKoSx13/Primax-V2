// Run from repository root against a freshly seeded two-replica DEMO lab.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { chromium } = require(process.env.PW_CORE || 'playwright');
const setup = eval('(' + fs.readFileSync(path.join(__dirname,'lot5-t02fix-browser-setup.cjs'),'utf8') + ')');
const lab = process.env.LOT5_LAB;
assert.match(lab, /^astra-pw5-[a-f0-9]{10}$/);
const out = path.resolve('Docs/astra/evidence', lab);
const cache = path.resolve('.cache',lab);
const envFile = path.join(cache,'private.env');
const events = [];
function record(name, data) { events.push({at:new Date().toISOString(),name,data}); }
function docker(args, input) {
  return execFileSync('docker',args,{input,encoding:'utf8'}).trim();
}
function sql(statement) {
  return docker(['exec','-i',lab+'-pg','psql','-XAtq','-v','ON_ERROR_STOP=1','-U','postgres','-d','lot5pw'],
    'BEGIN READ ONLY;\n'+statement+'\nCOMMIT;');
}
function redis(...args) { return docker(['exec',lab+'-redis','redis-cli','--raw',...args]); }
function totals() {
  return JSON.parse(sql(`SELECT json_build_object('payments',(SELECT count(*) FROM "Payment"),
    'orders',(SELECT count(*) FROM "OnlineOrder"),'auth',(SELECT count(*) FROM "FuelAuthorization"),
    'sales',(SELECT count(*) FROM "Transaction"),'receipts',(SELECT count(*) FROM "Receipt"));`));
}
function binding(op, tab) {
  assert.match(op,/^[0-9a-f-]{36}$/);
  const row=JSON.parse(sql(`SELECT row_to_json(o) FROM (SELECT "terminalId","stationId" FROM "TerminalOperation" WHERE "operationId"='${op}') o;`));
  const key = 'primax:v12:'+lab+':';
  assert.equal(redis('GET',key+'operation:'+op),row.stationId);
  assert.equal(redis('GET',key+'terminal-owner:'+row.terminalId),createHash('sha256').update(tab).digest('hex'));
  const ttl=Number(redis('TTL',key+'terminal-owner:'+row.terminalId));
  assert.ok(ttl>0 && ttl<=120);
  record('redis-binding',{op,...row,ownerMatches:true,ttl});
}
async function runTerminal(browser, terminal) {
  const normal=terminal==='T01';
  const port=normal?29481:29484;
  const ctx=await browser.newContext();
  const errors=[];
  await ctx.tracing.start({name:terminal,snapshots:false,screenshots:false,sources:false});
  try {
    const p=await ctx.newPage();
    p.setDefaultTimeout(30000);
    await p.route('**/*',r=>new URL(r.request().url()).origin==='http://127.0.0.1:'+port?r.continue():r.abort());
    p.on('pageerror',e=>errors.push(e.message));
    p.on('requestfailed',r=>record('requestfailed',{terminal,path:new URL(r.url()).pathname,error:r.failure()?.errorText}));
    p.on('console',m=>{if(['warning','error'].includes(m.type()))record('console',{terminal,level:m.type(),text:m.text()});});
    p.on('response',r=>{const url=new URL(r.url());if(url.pathname.startsWith('/api/'))record('http',{terminal,method:r.request().method(),path:url.pathname,status:r.status()});});
    await p.addInitScript(()=>localStorage.setItem('primax_idioma','es'));
    p.__fixConfig={port,arm:'new-evidence'};
    await setup(p);
    await p.__fix.start();
    await p.addLocatorHandler(p.locator('#lang-overlay:visible'),()=>p.getByRole('button',{name:/Español/}).click());
    const orderResponse=p.waitForResponse(r=>r.request().method()==='POST' && r.url().endsWith('/online-orders'));
    await p.__fix.order(normal?'NEW-701':'NEW-702');
    const created=await orderResponse;
    assert.equal(created.status(),201);
    const body=await created.json();
    const orderRequest=created.request().postDataJSON();
    const {operationId:op,id:order,paymentId:payment}=body;
    assert.ok(order && payment);
    const saved=await p.__fix.record('pending');
    assert.equal(saved.operationId,op);
    assert.equal(saved.orderId,order);
    binding(op,saved.tabId);
    async function orderStatus(payload) {
      return p.evaluate(async payload=>{
        const source=performance.getEntriesByType('resource').find(r=>new URL(r.name).pathname.endsWith('/apiClient.js')).name;
        const {apiClient}=await import(source);
        try { await apiClient('/online-orders',{method:'POST',body:payload});return {accepted:true}; }
        catch(e){return {status:e.status,message:e.message};}
      },payload);
    }
    if (!normal) {
      let capture;
      await p.route('**/demo-confirm',async route=>{
        try {
          const response=await route.fetch();
          capture={status:response.status(),json:await response.json()};
        } finally {await route.abort();}
      },{times:1});
      await p.click('#btn-qr-pagado');
      await p.waitForFunction(()=>document.querySelector('#qr-msg').textContent.includes('No generes'));
      assert.ok(capture);
      assert.equal(capture.status,201);
      assert.equal(capture.json.status,'CAPTURED');
      assert.equal(capture.json.paymentId,payment);
      const ref={orderId:order,paymentId:payment,amount:'20.00',currency:'PEN'};
      const before=totals();
      const blocked=await orderStatus({...orderRequest,authorization:{...orderRequest.authorization,capturedContinuation:ref}});
      assert.equal(blocked.status,400);
      assert.match(blocked.message,/continuación/i);
      assert.deepEqual(totals(),before);
      record('continuation-cannot-create-order',{op,order,payment,blocked,before});
      await p.reload();
      await p.locator('#btn-iniciar').click();
      await p.getByText('Continuar con el despacho',{exact:true}).waitFor();
      const resumed=await p.__fix.record('reload');
      assert.equal(resumed.operationId,op);assert.equal(resumed.orderId,order);assert.equal(resumed.tabId,saved.tabId);
      binding(op,resumed.tabId);
      await p.route('**/api/v1/authorizations',async route=>{
        try {
          const responses=await Promise.all([route.fetch(),route.fetch()]);
          const results=await Promise.all(responses.map(r=>r.json()));
          assert.deepEqual(responses.map(r=>r.status()),[201,201]);
          assert.deepEqual(results.map(x=>x.replayed).sort(),[false,true]);
          const auth=results[0].authorization.id;
          assert.ok(auth);assert.equal(auth,results[1].authorization.id);
          record('concurrent-authorization',{op,auth,payment,replays:results.map(x=>x.replayed)});
          const proof=JSON.parse(docker(['exec','--env-file',envFile,'-e','LOT5_BROWSER_REQUEST='+route.request().postData(),
            '-w','/lot',lab+'-test','node','replay-contract.cjs']));
          assert.equal(proof.ownAuth,auth);record('foreign-authorization-contract',proof);
        } catch(e){errors.push(e.message);}
        await route.abort();
      },{times:1});
      await p.click('#modal-ok');
      await p.getByText('Operación conservada',{exact:true}).waitFor();
      assert.deepEqual(errors,[]);
      await p.reload();await p.locator('#btn-iniciar').click();
      const replay=p.waitForResponse(r=>r.url().endsWith('/authorizations') && r.request().method()==='POST');
      await p.getByText('Continuar con el despacho',{exact:true}).click();
      const confirmed=await replay;
      const result=await confirmed.json();
      assert.equal(confirmed.status(),201);assert.equal(result.replayed,true);
      assert.equal(result.authorization.id,events.find(e=>e.name==='concurrent-authorization').data.auth);
      record('lost-response-recovered',{op,order,payment,auth:result.authorization.id});
      await p.route('**/api/v1/transactions',async route=>{
        const responses=await Promise.all([route.fetch(),route.fetch()]);
        try {
          const sales=await Promise.all(responses.map(r=>r.json()));
          assert.deepEqual(responses.map(r=>r.status()),[201,201]);
          assert.deepEqual(sales.map(x=>x.replayed).sort(),[false,true]);
          assert.ok(sales[0].transaction.id);assert.equal(sales[0].transaction.id,sales[1].transaction.id);
          record('concurrent-sale',{op,sale:sales[0].transaction.id,replays:sales.map(x=>x.replayed)});
        } catch(e){errors.push(e.message);}
        await route.fulfill({response:responses[0]});
      },{times:1});
    } else {await p.click('#btn-qr-pagado');}
    await p.waitForFunction(()=>document.getElementById('modal-msg').textContent.includes('abastecer'));
    await p.click('#modal-ok');
    const close=p.waitForResponse(r=>r.url().endsWith('/'+op+'/close'));
    await p.click('#btn-finalizar');assert.equal((await close).status(),201);
    if (normal) {
      const before=totals();
      const denied=await orderStatus(orderRequest);
      assert.equal(denied.status,403);
      assert.match(denied.message,/operación técnica no disponible/i);
      assert.deepEqual(totals(),before);record('order-create-after-own-close',{op,denied,before});
    }
    assert.deepEqual(errors,[]);record('terminal-complete',{terminal,op,order,payment});
  } finally {
    await ctx.tracing.stop({path:path.join(cache,terminal+'.zip')});
    await ctx.close();
  }
}

async function main(){
  assert.equal(sql('SELECT current_database();'),'lot5pw');
  assert.deepEqual(totals(),{payments:0,orders:0,auth:0,sales:0,receipts:0});
  assert.equal(redis('DBSIZE'),'0');
  const browser=await chromium.launch({executablePath:process.env.PW_EXE,downloadsPath:cache});
  try {
    await runTerminal(browser,'T01');await runTerminal(browser,'T02');
    assert.deepEqual(totals(),{payments:2,orders:2,auth:2,sales:2,receipts:2});
    const rows=sql(`SELECT row_to_json(q) FROM (SELECT o."operationId",o.status AS operation,t.code,
        p.id AS payment,p.status AS paid,p.provider,p.amount,w.id AS "order",a.id AS auth,a.status AS authorization,
        s.id AS sale,s.status AS sold,c.number AS receipt,r.status AS reservation
      FROM "TerminalOperation" o JOIN "Terminal" t ON t.id=o."terminalId"
      JOIN "Payment" p ON p."operationId"=o."operationId" JOIN "OnlineOrder" w ON w."paymentId"=p.id AND w."operationId"=o."operationId"
      JOIN "FuelAuthorization" a ON a."paymentId"=p.id AND a."terminalOperationId"=o.id
      JOIN "Transaction" s ON s.id=p."transactionId" AND s."terminalOperationId"=o.id
      JOIN "Receipt" c ON c."transactionId"=s.id JOIN "InventoryReservation" r ON r."terminalOperationId"=o.id
      ORDER BY t.code) q;`).split(/\r?\n/).map(s=>JSON.parse(s));
    assert.equal(rows.length,2);assert.equal(new Set(rows.map(r=>r.receipt)).size,2);
    for(const row of rows){
      const run=events.find(e=>e.name==='terminal-complete' && row.code.endsWith(e.data.terminal)).data;
      assert.equal(row.operationId,run.op);assert.equal(row.order,run.order);assert.equal(row.payment,run.payment);
      assert.deepEqual([row.operation,row.paid,row.provider,row.amount,row.authorization,row.sold,row.reservation],
        ['CLOSED','CAPTURED','DEMO',20,'SETTLED','PAID','CLOSED']);
    }
    assert.equal(rows[1].auth,events.find(e=>e.name==='concurrent-authorization').data.auth);
    assert.equal(rows[1].sale,events.find(e=>e.name==='concurrent-sale').data.sale);
    record('postgres-final',{rows,totals:totals()});record('passed',true);
  } finally {await browser.close();}
}
main().catch(e=>{record('failed',e.message);console.error(e);process.exitCode=1;}).finally(()=>{
  fs.writeFileSync(path.join(out,'playwright-'+Date.now()+'.json'),JSON.stringify(events,null,2));
});

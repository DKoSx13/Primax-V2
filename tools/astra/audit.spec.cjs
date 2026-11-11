const {test:base,expect}=require('@playwright/test');
const AxeBuilder=require('@axe-core/playwright').default;
const test=base.extend({audit:[async({page,context},use,testInfo)=>{
 await context.addInitScript(owner=>{
  if(window===window.top&&['http://127.0.0.1:28181','http://127.0.0.1:28184'].includes(location.origin))
   sessionStorage.setItem('fuelflow:tab:v1',owner);
 },process.env.ASTRA_BROWSER_OWNER);
 const failures=[];const allowed=[];
 const expected=(url,status)=>allowed.some(a=>a.status===status&&new URL(url).pathname===a.path);
 const observe=target=>{
 target.on('pageerror',e=>failures.push('JS '+e.message));
 target.on('response',r=>{if(r.status()>=400&&!expected(r.url(),r.status()))failures.push(`HTTP ${r.status()} ${r.url()}`)});
 target.on('requestfailed',r=>failures.push(`NETWORK ${r.url()} ${r.failure()?.errorText}`));
 target.on('console',m=>{if(m.type()==='error'&&!(m.text().startsWith('Failed to load resource:')&&allowed.some(a=>m.location().url.includes(a.path)&&m.text().includes(String(a.status)))))failures.push('CONSOLE '+m.text())});
 };
 observe(page);context.on('page',observe);
 await use({allow:(path,status)=>allowed.push({path,status}),watch:observe});
 await testInfo.attach('browser-audit',{body:JSON.stringify(failures,null,2),contentType:'application/json'});
 expect(failures).toEqual([]);
 },{auto:true}]});
for(const [name,port] of [['FuelFlow T01',28181],['FuelFlow T02',28184],['Prime',28182],['Control',28183]]){
 test(`${name}: accesibilidad y adaptación de acceso real`,async({page,audit},info)=>{
  if(name==='Control')audit.allow('/api/v1/control/session',401);
  await page.goto(`http://127.0.0.1:${port}`);
  await page.locator('body').waitFor();
  await expect(page.locator('body')).not.toBeEmpty();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa']).analyze();
  await info.attach('axe',{body:JSON.stringify(result,null,2),contentType:'application/json'});
  await page.screenshot({path:info.outputPath('access.png'),fullPage:true});
  expect(result.violations).toEqual([]);
 });
}
test('Prime: login real y sesión persistente',async({page})=>{
 await page.goto('http://127.0.0.1:28182');
 await page.getByLabel(/^Correo(?: o DNI)?$/,{exact:true}).fill('demo@primaxprime.pe');
 await page.getByLabel('Contraseña',{exact:true}).fill('PrimaxDemo123!');
 await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Hola, Diego'})).toBeVisible();
 await page.reload();await expect(page.getByRole('heading',{name:'Hola, Diego'})).toBeVisible();
});
test('Control: login real y supervisión',async({page,audit})=>{
 audit.allow('/api/v1/control/session',401);
 await page.goto('http://127.0.0.1:28183');
 await page.getByLabel('Correo',{exact:true}).fill('control-admin@primax.local');
 await page.getByLabel('Contraseña',{exact:true}).fill('AdminDemoLocal123!');
 await page.getByRole('button',{name:'Entrar a Control'}).click();
 await expect(page.locator('#logout')).toBeVisible();
 await page.reload();await expect(page.locator('#logout')).toBeVisible();
});
test('Prime: credenciales incorrectas no abren sesión',async({page,audit})=>{
 audit.allow('/api/v1/auth/login',401);
 await page.goto('http://127.0.0.1:28182');
 await page.getByLabel(/^Correo(?: o DNI)?$/,{exact:true}).fill('demo@primaxprime.pe');
 await page.getByLabel('Contraseña',{exact:true}).fill('WrongQaPassword123!');
 await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();
 await expect(page.getByRole('alert')).toBeVisible();
 await expect(page.getByRole('navigation')).toBeHidden();
});
test('Control: credenciales incorrectas no abren administración',async({page,audit})=>{
 audit.allow('/api/v1/control/session',401);audit.allow('/api/v1/control/login',401);
 await page.goto('http://127.0.0.1:28183');
 await page.getByLabel('Correo',{exact:true}).fill('control-admin@primax.local');
 await page.getByLabel('Contraseña',{exact:true}).fill('WrongQaPassword123!');
 await page.getByRole('button',{name:'Entrar a Control'}).click();
 await expect(page.getByRole('alert')).not.toBeEmpty();
 await expect(page.locator('#logout')).toHaveCount(0);
});
for(const [terminal,port,finish] of [['T01',28181,'#btn-finalizar'],['T02',28184,'#btn-comprobante']]){
 test(`${terminal}: compra prepago real y cierre ${finish}`,async({page,audit},info)=>{
  test.skip(info.project.name!=='desktop','Compra financiera ejecutada una vez por terminal; responsive se audita por separado');
  test.setTimeout(120000);
  const financialState=require('./financial-state.cjs');
  const before=financialState();
  await info.attach('financial-before',{body:JSON.stringify(before,null,2),contentType:'application/json'});
  financialState.assertSettled(before);
  // ensureTerminalOperation queries its new UUID before creating it. Only that
  // exact GET may return 404; existing operations and other errors stay failures.
  const newOperationLookups=new Set();
  let saleRequests=0;
  page.on('request',request=>{
   const path=new URL(request.url()).pathname;
   if(request.method()==='POST'&&path==='/api/v1/transactions')saleRequests++;
   const match=path.match(/^\/api\/v1\/terminal\/operations\/([0-9a-f-]{36})$/);
   if(request.method()==='GET'&&match&&!before.operations.some(o=>o.operationId===match[1])){
    newOperationLookups.add(match[1]);audit.allow(path,404);
   }
  });
  await page.addInitScript(()=>localStorage.setItem('primax_idioma','es'));
  await page.goto(`http://127.0.0.1:${port}`);
  await page.locator('#btn-iniciar').click();
  await page.locator('[data-fuel="Regular"]').click();
  await page.locator('#btn-prepago').click();
  await page.locator('#prepago-panel [data-monto="20"]').click();
  await page.locator('#btn-confirmar-monto').click();
  if(terminal==='T01'){
   await page.locator('#btn-boleta').click();
   await page.locator('#input-dni').fill('70123456');
  }else{
   await page.locator('#btn-factura').click();
   await page.locator('#input-ruc').fill('20100070970');
   await page.locator('#input-razon').fill('Empresa QA Astra');
  }
  await page.locator('#prep-input-placa').fill('ABC-123');
  await page.locator('#btn-continuar-datos').click();
  await page.locator('[data-metodo="TARJETA"]').click();
  const submitted=page.waitForResponse(r=>r.url().endsWith('/api/v1/transactions')&&r.request().method()==='POST',{timeout:90000});
  await page.locator('#btn-nfc-tap').click();
  await page.locator('#modal-ok').click();
  const response=await submitted;expect(response.status()).toBe(201);
  const sale=await response.json();expect(sale.transaction.receipt.number).toMatch(terminal==='T01'?/^EB01-\d+$/:/^FT01-\d+$/);
  expect([...newOperationLookups]).toEqual([sale.transaction.operationId]);
  await info.attach('real-sale',{body:JSON.stringify(sale,null,2),contentType:'application/json'});
  await page.screenshot({path:info.outputPath('paid-summary.png'),fullPage:true});
  if(terminal==='T01'){
   // Reload only after confirmed sale; recover that same operation, never pay again.
   await page.reload();
   await page.locator('#btn-iniciar').click();
   await expect(page.locator('#btn-finalizar')).toBeVisible();
   await expect(page.locator('body')).toContainText(sale.transaction.receipt.number);
   await page.screenshot({path:info.outputPath('recovered-summary.png'),fullPage:true});
  }
  const printPath='/api/v1/demo-print/jobs/receipt-'+sale.transaction.receipt.id;
  if(terminal==='T02')audit.allow(printPath,404); // First lookup of a new simulated job.
  const printed=terminal==='T02'?page.waitForResponse(r=>new URL(r.url()).pathname===printPath&&r.request().method()==='POST'):null;
  await page.locator(finish).click();
  if(printed){
   const result=await printed;expect(result.ok()).toBe(true);
   const job=await result.json();expect(job.status).toBe('accepted');
   await info.attach('simulated-print',{body:JSON.stringify(job),contentType:'application/json'});
  }
  await expect(page.locator('#pantalla-inicio')).toBeVisible();
  await expect(page.locator('#print-error')).toBeHidden();
  const after=financialState();
  await info.attach('financial-after',{body:JSON.stringify(after,null,2),contentType:'application/json'});
  financialState.assertSettled(after);
  expect(after.transactions).toBe(before.transactions+1);
  expect(after.payments).toBe(before.payments+1);
  expect(saleRequests).toBe(1);
  expect(after.operations.find(o=>o.operationId===sale.transaction.operationId)).toMatchObject({
   number:expect.stringMatching(/^OP01-\d+$/),status:'CLOSED',terminal:'PRIMAX-SUR-'+terminal,
   pump:terminal==='T01'?'03':'04',receipt:sale.transaction.receipt.number,
  });
 });
}

for(const [name,port] of [['Prime',28182],['Control',28183]]){
 test(`${name}: navegación autenticada, accesibilidad y salida`,async({page,audit},info)=>{
  test.setTimeout(180000);
  const control=name==='Control';
  const state=require('./financial-state.cjs')();
  const latest=['T01','T02'].map(code=>state.operations.findLast(o=>o.terminal.endsWith(code)&&o.receipt));
  expect(latest.every(Boolean)).toBe(true);
  if(control)audit.allow('/api/v1/control/session',401);
  await page.goto(`http://127.0.0.1:${port}`);
  await page.getByLabel(control?'Correo':/^Correo(?: o DNI)?$/,{exact:true}).fill(control?'control-admin@primax.local':'demo@primaxprime.pe');
  await page.getByLabel('Contraseña',{exact:true}).fill(control?'AdminDemoLocal123!':'PrimaxDemo123!');
  await page.getByRole('button',{name:control?'Entrar a Control':'Iniciar sesión',exact:true}).click();
  await expect(page.locator('nav')).toBeVisible();
  const routes=await page.locator('nav a').evaluateAll(links=>links.map(a=>a.getAttribute('href')));
  expect(routes.length).toBeGreaterThan(3);
  for(const route of routes){
   await page.locator(`nav a[href="${route}"]`).click();
   await expect(page.locator(`nav a[href="${route}"]`)).toHaveAttribute('aria-current','page');
   await expect(page.locator(control?'#content':'#main')).not.toBeEmpty();
   await expect(page.getByText(/^Cargando/)).toHaveCount(0);
   if(route===(control?'#operations':'#consumos')){
    for(const operation of latest){
     await expect(page.locator(control?'#content':'#movements')).toContainText(operation.receipt);
     if(control)await expect(page.locator('#content')).toContainText(operation.number);
    }
   }
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa']).analyze();
   await info.attach('axe-'+route.slice(1),{body:JSON.stringify(result),contentType:'application/json'});
   await page.screenshot({path:info.outputPath(route.slice(1)+'.png'),fullPage:true});
   expect.soft(result.violations,route).toEqual([]);
  }
  if(!control)await page.locator('nav a[href="#membresia"]').click();
  await page.locator(control?'#logout':'[data-logout]').click();
  await expect(page.getByLabel('Contraseña',{exact:true})).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Contraseña',{exact:true})).toBeVisible();
 });
}

test('FuelFlow: bloqueo de segunda pestaña y liberación sin compra',async({page,context},info)=>{
 await page.goto('http://127.0.0.1:28181');
 await expect(page.locator('#btn-iniciar')).toBeEnabled();
 const second=await context.newPage();
 try{
  await second.goto('http://127.0.0.1:28181');
  await expect(second.getByRole('dialog',{name:'Terminal en uso'})).toBeVisible();
  await expect(second.locator('#btn-iniciar')).toBeDisabled();
  await second.screenshot({path:info.outputPath('tab-locked.png'),fullPage:true});
  await page.close();
  await expect(second.getByRole('dialog',{name:'Terminal en uso'})).toHaveCount(0);
  await expect(second.locator('#btn-iniciar')).toBeEnabled();
 }finally{await second.close();}
});

test('Control: encargado limitado a su estación y sin gestión de cuentas',async({page,audit})=>{
 audit.allow('/api/v1/control/session',401);
 await page.goto('http://127.0.0.1:28183');
 await page.getByLabel('Correo',{exact:true}).fill('encargado@primax.local');
 await page.getByLabel('Contraseña',{exact:true}).fill('EncargadoDemo123!');
 await page.getByRole('button',{name:'Entrar a Control'}).click();
 await expect(page.locator('#logout')).toBeVisible();
 await expect(page.locator('nav a[href="#accounts"]')).toHaveCount(0);
 const session=await page.request.get('http://127.0.0.1:28183/api/v1/control/session');
 expect(session.status()).toBe(200);
 const identity=await session.json();
 expect(identity.global).toBe(false);
 expect(identity.stations).toHaveLength(1);
 expect(identity.stations[0].code).toBe('PRIMAX-SUR');
 const denied=await page.request.get('http://127.0.0.1:28183/api/v1/control/accounts');
 expect(denied.status()).toBe(403);
});

test('FuelFlow: Backend rechaza otro propietario de terminal',async({page,browser,audit},info)=>{
 await page.goto('http://127.0.0.1:28181');
 await expect(page.locator('#btn-iniciar')).toBeEnabled();
 const outsider=await browser.newContext({viewport:info.project.use.viewport});
 try{
  await outsider.addInitScript(()=>{
   if(window===window.top&&location.origin==='http://127.0.0.1:28181')sessionStorage.setItem('fuelflow:tab:v1',crypto.randomUUID());
  });
  const other=await outsider.newPage();audit.watch(other);
  audit.allow('/api/v1/terminal/claim',409);
  const denied=other.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/terminal/claim');
  await other.goto('http://127.0.0.1:28181');
  expect((await denied).status()).toBe(409);
  await expect(other.getByRole('dialog',{name:'Terminal en uso'})).toBeVisible();
  await expect(other.locator('#btn-iniciar')).toBeDisabled();
  await other.screenshot({path:info.outputPath('server-owner-denied.png'),fullPage:true});
 }finally{await outsider.close();}
});

test('FuelFlow: navegación prepago sin cobro y accesibilidad',async({page,audit},info)=>{
 test.setTimeout(120000);
 const financialState=require('./financial-state.cjs');
 const before=financialState();financialState.assertSettled(before);
 await page.goto('http://127.0.0.1:28181');
 // The creation probe is expected for exactly the operation generated by this UI.
 const probes=new Set();
 page.on('request',r=>{
  const path=new URL(r.url()).pathname,match=path.match(/^\/api\/v1\/terminal\/operations\/([0-9a-f-]{36})$/);
  if(r.method()==='GET'&&match&&!before.operations.some(o=>o.operationId===match[1])){
   probes.add(match[1]);audit.allow(path,404);
  }
 });
 const started=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/api/v1/terminal/operations'));
 await page.locator('#btn-iniciar').click();
 const operation=await (await started).json();
 try{
  expect([...probes]).toEqual([operation.operationId]);
  for(const [screen,advance] of [
   ['#pantalla-combustible',()=>page.locator('[data-fuel="Regular"]').click()],
   ['#pantalla-pago',()=>page.locator('#btn-prepago').click()],
  ]){
   await expect(page.locator(screen)).toBeVisible();
   const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa']).analyze();
   await info.attach('axe-'+screen.slice(1),{body:JSON.stringify(result),contentType:'application/json'});
   expect.soft(result.violations).toEqual([]);
   await page.screenshot({path:info.outputPath(screen.slice(1)+'.png'),fullPage:true});
   await advance();
  }
  await page.locator('#prepago-panel [data-monto="20"]').click();
  await page.locator('#btn-confirmar-monto').click();
  await expect(page.locator('#pantalla-comprobante')).toBeVisible();
  await page.locator('#pantalla-comprobante [data-nav="pantalla-pago"]').click();
  await expect(page.locator('#pantalla-pago')).toBeVisible();
 }finally{
  const current=financialState();
  expect(current.transactions).toBe(before.transactions);expect(current.payments).toBe(before.payments);
  expect(current.pendingReservations).toBe(0);
  const result=await page.evaluate(async id=>{
   const version=document.querySelector('meta[name="app-version"]').content;
   const {terminalService}=await import('/src/js/apiClient.js?v='+version);
   return terminalService.close(id);
  },operation.operationId);
  expect(result.status).toBe('CLOSED');
 }
});

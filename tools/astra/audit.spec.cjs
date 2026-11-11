const {test:base,expect}=require('@playwright/test');
const AxeBuilder=require('@axe-core/playwright').default;
const test=base.extend({audit:[async({page},use,testInfo)=>{
 const failures=[];const allowed=[];
 const expected=(url,status)=>allowed.some(a=>a.status===status&&new URL(url).pathname===a.path);
 page.on('pageerror',e=>failures.push('JS '+e.message));
 page.on('response',r=>{if(r.status()>=400&&!expected(r.url(),r.status()))failures.push(`HTTP ${r.status()} ${r.url()}`)});
 page.on('requestfailed',r=>failures.push(`NETWORK ${r.url()} ${r.failure()?.errorText}`));
 page.on('console',m=>{if(m.type()==='error'&&!(m.text().startsWith('Failed to load resource:')&&allowed.some(a=>m.location().url.includes(a.path)&&m.text().includes(String(a.status)))))failures.push('CONSOLE '+m.text())});
 await use({allow:(path,status)=>allowed.push({path,status})});
 await testInfo.attach('browser-audit',{body:JSON.stringify(failures,null,2),contentType:'application/json'});
 expect(failures).toEqual([]);
 },{auto:true}]});
for(const [name,port] of [['FuelFlow T01',28181],['FuelFlow T02',28184],['Prime',28182],['Control',28183]]){
 test(`${name}: accesibilidad y adaptación de acceso real`,async({page,audit},info)=>{
  if(name==='Control')audit.allow('/api/v1/control/me',401);
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
 audit.allow('/api/v1/control/me',401);
 await page.goto('http://127.0.0.1:28183');
 await page.getByLabel('Correo',{exact:true}).fill('control-admin@primax.local');
 await page.getByLabel('Contraseña',{exact:true}).fill('AdminDemoLocal123!');
 await page.getByRole('button',{name:'Entrar a Control'}).click();
 await expect(page.locator('#logout')).toBeVisible();
 await page.reload();await expect(page.locator('#logout')).toBeVisible();
});

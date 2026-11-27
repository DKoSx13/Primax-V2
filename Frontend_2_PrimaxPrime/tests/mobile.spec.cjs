const {test,expect}=require('@playwright/test');
test('build: navegación, tamaños móviles, textos largos y contenido libre de barra',async({page})=>{const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await page.getByLabel(/^Correo(?: o DNI)?$/,{exact:true}).fill('demo@primaxprime.pe');await page.getByLabel('Contraseña',{exact:true}).fill('FixtureOnly123');await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();await expect(page.getByRole('heading',{name:'Hola, Diego'})).toBeVisible();const marker=await page.evaluate(()=>window.__navigationMarker=Math.random());for(const name of ['Consumos','Beneficios','Membresía','Ayuda','Inicio']){await page.getByRole('navigation').getByRole('link',{name,exact:true}).click();await expect(page.getByRole('navigation').getByRole('link',{name,exact:true})).toHaveAttribute('aria-current','page');expect(await page.evaluate(()=>window.__navigationMarker)).toBe(marker);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));expect(await page.evaluate(()=>document.querySelector('main').getBoundingClientRect().bottom<=document.querySelector('nav').getBoundingClientRect().top)).toBe(true);}await page.getByRole('navigation').getByRole('link',{name:'Membresía',exact:true}).click();await page.getByLabel('Nombre en este dispositivo',{exact:true}).fill('Diego '.repeat(12));await page.getByRole('button',{name:'Guardar cambios'}).click();await page.getByRole('navigation').getByRole('link',{name:'Inicio',exact:true}).click();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.reload();await expect(page.getByRole('heading',{name:/Hola, Diego/})).toBeVisible();expect(errors).toEqual([]);});
test('recarga, persistencia, historial, canje y preferencias',async({page})=>{await page.goto('/');await page.getByLabel(/^Correo(?: o DNI)?$/,{exact:true}).fill('demo@primaxprime.pe');await page.getByLabel('Contraseña',{exact:true}).fill('FixtureOnly123');await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();await page.getByLabel('Seleccionar vehículo').selectOption('DEF-456');await page.getByRole('button',{name:'Recargar saldo'}).click();await page.getByLabel('Monto en soles').fill('50');await page.getByRole('button',{name:'Confirmar recarga'}).click();await expect(page.locator('.balance')).toContainText('50.00');await page.reload();await expect(page.getByLabel('Seleccionar vehículo')).toHaveValue('DEF-456');await expect(page.locator('.balance')).toContainText('50.00');await page.getByRole('navigation').getByRole('link',{name:'Consumos',exact:true}).click();await page.getByRole('tab',{name:'Recargas',exact:true}).click();await expect(page.locator('.movement').first()).toContainText('50.00');await page.locator('.movement').first().getByRole('button',{name:'Ver detalle'}).click();await expect(page.getByRole('dialog')).toContainText('PRIME-001');await page.getByRole('button',{name:'Cerrar',exact:true}).click();await page.getByRole('navigation').getByRole('link',{name:'Beneficios',exact:true}).click();await page.getByRole('button',{name:'Ver beneficio'}).nth(1).click();await page.getByRole('button',{name:'Canjear por 400 puntos'}).click();await expect(page.locator('.mini-points')).toContainText('2,050');await expect(page.locator('.coupon')).toHaveCount(1);await page.getByRole('navigation').getByRole('link',{name:'Membresía',exact:true}).click();await page.getByLabel('Notificaciones de promociones').uncheck();await page.reload();await page.getByRole('navigation').getByRole('link',{name:'Membresía',exact:true}).click();await expect(page.getByLabel('Notificaciones de promociones')).not.toBeChecked();});

test('tarjeta de membresía exclusiva de su pestaña y navegación fija al hacer scroll', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel(/^Correo(?: o DNI)?$/, { exact: true }).fill('demo@primaxprime.pe');
  await page.getByLabel('Contraseña', { exact: true }).fill('FixtureOnly123');
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page.locator('.wallet-summary .balance')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Tarjeta de membresía' })).toHaveCount(0);
  await expect(page.locator('.member-number')).toHaveCount(0);

  const navigation = page.getByRole('navigation');
  await navigation.getByRole('link', { name: 'Membresía' }).click();
  const code = page.getByRole('region', { name: 'Tarjeta de membresía' }).locator('strong');
  await expect(code).toHaveText('PRIME-001');
  const centerOffset = await code.evaluate(el => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const text = range.getBoundingClientRect();
    const card = el.closest('.member-number').getBoundingClientRect();
    return Math.abs(text.left + text.width / 2 - card.left - card.width / 2);
  });
  expect(centerOffset).toBeLessThan(2);
  expect(await code.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(39);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await expect(navigation).toBeInViewport();
  expect(await navigation.evaluate(el => Math.abs(el.getBoundingClientRect().bottom - innerHeight))).toBeLessThan(2);
  await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeInViewport();
  await navigation.getByRole('link', { name: 'Inicio' }).click();
  await expect(page.locator('.member-number')).toHaveCount(0);
});

test.beforeEach(async({context})=>require('./api-fixture.cjs').installApi(context));

test('Bonus conserva los puntos del backend en las tres vistas', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel(/^Correo(?: o DNI)?$/, { exact: true }).fill('demo@primaxprime.pe');
  await page.getByLabel('Contraseña', { exact: true }).fill('FixtureOnly123');
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  const expected = await page.evaluate(() => new Intl.NumberFormat('es-PE').format(2450));
  const points = page.getByRole('region', { name: 'Puntos Bonus' });
  await expect(points.locator('.bonus-card-icon')).toBeVisible();
  await expect(points.locator('strong')).toContainText(expected);
  await expect(points.getByRole('button', { name: 'Ver mis puntos' })).toBeVisible();
  for (const [tab, selector] of [['Consumos', '.available'], ['Beneficios', '.mini-points']]) {
    await page.getByRole('navigation').getByRole('link', { name: tab, exact: true }).click();
    await expect(page.locator(selector).locator('.bonus-card-icon')).toBeVisible();
    await expect(page.locator(selector)).toContainText(expected);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

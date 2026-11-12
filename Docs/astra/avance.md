# Auditoría inicial Astra — 2026-11-10

Punto de partida: `09e2e4c`, rama `feat/astra-hexagonal-microservices`. Informe parcial; no certifica la misión integral.

## PR consultados en GitHub

Todos abiertos, draft y mergeable con su propia base al consultar. Esto no garantiza integración con QA. Las pruebas descritas por sus autores son históricas, no verificaciones nuevas por PR.

| PR | Propósito | Base | Estado frente a QA | Faltantes / acción | Conflictos / pruebas |
|---|---|---|---|---|---|
|9|Logo Prime|main|Divergente|Revisar patch visual; no importar rama completa|Conflicto con QA no evaluado; pruebas históricas|
|10|style(frontend3): usar logos PNG y variante V2 en Control|main|Divergente|Comparar cambios visuales individualmente; diferencias de árbol incluyen evoluciones posteriores|Mergeable con base; conflictos con QA no evaluados; pruebas históricas|
|11|feat(receipts): persistir correlativos y vincular comprobantes con operaciones|main|Head incluido en historial local de QA|No duplicar commits; consolidar QA validada hacia main|Mergeable con base; conflictos con QA no evaluados; pruebas históricas|
|12|fix(frontend1): eliminar la activación administrativa del kiosco|review/persistent-receipt-numbering-20261107|Head incluido en historial local de QA|No duplicar commits; consolidar QA validada hacia main|Mergeable con base; conflictos con QA no evaluados; pruebas históricas|
|13|fix(frontend1): recuperar sesiones abandonadas de forma segura|review/kiosk-availability-20261107|Head incluido en historial local de QA|No duplicar commits; consolidar QA validada hacia main|Mergeable con base; conflictos con QA no evaluados; pruebas históricas|
|14|fix(frontend1): conservar datos y finalizar con o sin impresión|review/terminal-session-recovery-20261107|Head incluido en historial local de QA|No duplicar commits; consolidar QA validada hacia main|Mergeable con base; conflictos con QA no evaluados; pruebas históricas|
|15|style(frontend1): centrar los métodos de pago de prepago|review/receipt-form-finalization-20261107|Divergente|Comparar cambios visuales individualmente; diferencias de árbol incluyen evoluciones posteriores|Mergeable con base; conflictos con QA no evaluados; pruebas históricas|
|16|refactor(deploy): desplegar microservicios y demo local con Compose|review/receipt-form-finalization-20261107|Head incluido en historial local de QA|No duplicar commits; consolidar QA validada hacia main|Mergeable con base; conflictos con QA no evaluados; pruebas históricas|
|17|docs: documentar arquitectura, despliegue y resultados verificados|review/microservices-compose-20261107|Head incluido en historial local de QA|No duplicar commits; consolidar QA validada hacia main|Mergeable con base; conflictos con QA no evaluados; pruebas históricas|

## Verificación ejecutada

- FuelFlow: reprodujeron 3 fallos (165 aprobadas de 168). Fixture desactualizado: faltaban `terminalService.me` y `confirmedTerminal`. El código real consulta identidad antes de imprimir; no se retiró esa protección.
- Fixture actualizado y cuatro regresiones añadidas: terminal diferente, surtidor inválido, consulta indisponible y T02 con surtidor 02. Resultado: 172/172.
- Prime: 31/31; Control: 36/36. PrintAgent: 56 aprobadas, 1 omitida.
- Build estático de los tres frontends aprobado.
- Evidencias completas en `evidence/*-tests.log`.
- CI remoto 42661448994: falló Frontend and print contracts; Backend y PostgreSQL aprobaron; OCR and public flows omitido. No hay ejecución remota nueva.

## Límites y próximos pasos obligatorios

No se ha completado auditoría funcional E2E, accesibilidad, baselines, responsive ni aislamiento entre usuarios. No se afirma estabilidad financiera. Backend no tiene node_modules local. Los scripts Playwright existentes dependen de Prime/node_modules y algunos reutilizan servidores: antes de ejecutarlos debe garantizarse QA exclusiva, pues localhost por sí solo no garantiza aislamiento de datos.

No se avanzó a extracción arquitectónica: falta superar la estabilización e integración requerida. Persisten cuatro procesos con proyecto y persistencia compartidos; no son cuatro proyectos independientes. Quedan pendientes puertos/adaptadores, separación compilable, Docker QA exclusivo, evaluación Neon, CI E2E y guías de despliegue.

Estrategia: conservar historial QA, comparar por patch los PR divergentes #9/#10/#15, validar el conjunto y preparar PR consolidado hacia main. No fusionar automáticamente la cadena de PR ya incorporados.

## Protección del laboratorio

No se ejecutaron operaciones de escritura Docker, migraciones, seeds, conexiones financieras ni hardware. Solo se listaron contenedores. No se modificó el directorio de feria. Esto documenta las acciones de esta sesión; no constituye un checksum o auditoría independiente de sus bases.

## Reproducción

```bash
for app in Frontend_1_FuelFlow Frontend_2_PrimaxPrime Frontend_3_PrimaxControl PrintAgent; do
  npm test --prefix "$app" || exit 1
done
for app in Frontend_1_FuelFlow Frontend_2_PrimaxPrime Frontend_3_PrimaxControl; do
  npm run build --prefix "$app" || exit 1
done
```

## Continuación: laboratorio y suite E2E

Commit de infraestructura `6c9fbb1`: laboratorio `primax-astra-qa`, puertos loopback 28100/28181/28182/28183/28184 y volúmenes propios. El lanzador ignora archivos .env y variables heredadas de conexión, verifica recursos y comprueba puertos libres antes del arranque. Las pruebas verifican etiquetas Docker, puertos y volumen PostgreSQL antes de escribir datos. No se ejecutó el antiguo smoke restringido a feria.

Revisión de Playwright existente: `integration.spec.cjs` usa Prisma directo, proxies antiguos e inyección de fallos; los tests de login Prime instalan `api-fixture.cjs` (mocks). `smoke-multiterminal.cjs` apunta explícitamente a feria. Se reutilizó su recorrido HTTP en una copia exclusiva QA con comprobaciones de aislamiento e inventario; no equivale a compra mediante clicks en navegador.

Suite centralizada en `tools/astra`: Playwright y axe con versiones fijas y lockfile. Tres tamaños; HTML, JSON, screenshots y traces ante fallo. Auditoría de pageerror, consola, requestfailed y HTTP; los errores negativos permitidos se especifican por ruta y código. Ningún mock instalado en esta suite. Las capturas de acceso son evidencia, no baselines visuales aprobados.

```bash
npm ci --prefix tools/astra
(cd tools/astra && npx playwright install --with-deps chromium)
node tools/astra/lab.cjs config
node tools/astra/lab.cjs up
COMPOSE_PROJECT_NAME=primax-astra-qa node tools/astra/multiterminal.cjs
npm test --prefix tools/astra
node tools/astra/lab.cjs stop
```

`up` rechaza puertos ocupados; para repetir pruebas sobre el laboratorio ya levantado omitir ese paso. `stop` conserva volúmenes. El workflow `astra-e2e.yml` prepara estos pasos en un runner aislado y sube artefactos incluso con fallo. No hubo publicación: el workflow remoto anterior no puede reflejar commits locales; debe comprobarse tras un push autorizado, verificando SHA y ejecución de ambos workflows.

Pendientes antes de arquitectura: recorrido UI de compra/impresión/recuperación en ambas terminales, roles y estaciones, postpago, wallet, EcoDigital, registro y sesión expirada, correlativos FT01, accesibilidad tras login, baselines revisados y Lighthouse. Los PR mantienen el estado consultado anteriormente; esta continuación no volvió a consultar GitHub ni cambió ramas remotas.

### Hallazgos demostrados durante ejecución

- T02 devolvía 409 al bootstrap en instalación limpia: Compose la publica pero `seed-local-operations.cjs` solo creaba T01. Se extendió el seed local para T02/surtidor 04, conservando T01/03 y sin reasignar terminales existentes. Aplicado solo al contenedor QA; consulta PostgreSQL confirma las dos terminales.
- El smoke anterior no transmitía `X-FuelFlow-Tab` ni reclamaba `/terminal/claim`, por lo que era incompatible con el control de propietario vigente. La copia QA ahora respeta ese protocolo. No se borran locks: espera acotadamente su expiración y falla si persiste una sesión.
- No ejecutar smoke y navegador simultáneamente: compiten correctamente por la terminal. El workflow los ejecuta secuencialmente.
- El seed fue validado en el contenedor QA mediante copia temporal del script; un nuevo build incorporará el archivo corregido. No se modificaron imágenes o contenedores de otros proyectos.

### Integración real aprobada

`evidence/integration-real.json`: dos ventas concurrentes; T01/03 OP01-0001 EB01-0001 y T02/04 OP01-0003 EB01-0003. Los huecos de secuencia son compatibles con los reintentos transaccionales y no significan duplicados. Regular: 5000 → 4992.429176 litros; reservas 0 → 0. Reenvío conserva transacción y comprobante. Control devuelve ambas operaciones y Prime separa los historiales de los dos clientes. `evidence/qa-cardinality.txt` confirma una transacción por operación y un pago por transacción en esta base nueva. No demuestra todavía FT01, postpago ni todas las recuperaciones.

Primera ejecución navegador: 19 aprobadas / 5 fallidas / 0 omitidas. Detalle en `evidence/browser-first-summary.json` y `browser-first.txt`. Fallos: T02 sin seed, colisiones de propietarios entre proyectos responsive y dos esperas de login agotadas en 5 segundos. La suite conserva una identidad QA estable entre ejecuciones secuenciales; la prueba negativa HTTP usa otra identidad y exige 409. Espera de aserciones aumentada a 20 segundos, sin alterar códigos HTTP ni reglas de negocio.

Comprobaciones auxiliares: 5/5 tests de seguridad de base de datos aprobados; auditoría de secretos sin hallazgos.

### PR divergentes: comprobación adicional local

`git cherry HEAD <head>` marca #9/#10/#15 con `+`: no son patches idénticos en el historial. Sin embargo, inspección actual confirma logo corporativo Prime, variante V2 en Control y cuadrícula `.pay-grid-methods` de tres columnas con una en móvil. La divergencia de commits no implica que esas funcionalidades falten. Recomendación: conservar la implementación QA, comparar cambios residuales de assets/cache antes del PR consolidado; no cherry-pick de las ramas visuales completas ni cierre automático de PR. Los otros seis heads siguen incluidos por ascendencia.

## Continuación del 11 de noviembre: compras UI y recuperación T02

Se retomó `701ad77` sin modificar ramas compartidas. La lectura inicial de QA encontró solamente OP01-0001 y OP01-0003, ambas cerradas, dos pagos y dos reservas cerradas. Se preservaron las evidencias anteriores y los informes completos en `Docs/astra/previous-run/` (local, excluido de Git).

Los cuatro frontends se reconstruyeron con Compose en `primax-astra-qa`, conservando sus volúmenes. El script FuelFlow servido coincide con el build de fuente al normalizar únicamente el identificador de versión. Kiosk auth e impresión demo están activados en ambas terminales. La corrección de INICIAR quedó comprobada mediante compras UI completas.

La primera pasada UI realizó T01 OP01-0004 / EB01-0004 sin imprimir y T02 OP01-0005 / FT01-0001 con impresión simulada aceptada. Sus aserciones financieras aprobaron; el auditor las marcó fallidas por el GET 404 esperado antes de crear el UUID de operación. Se conserva ese resultado en `evidence/browser-ui-first-summary.json`; no se presenta como ejecución verde. Se corrigió la clasificación exclusivamente para el UUID nuevo, verificando luego que coincida con la venta.

Después de consultar nuevamente el estado (cuatro ventas/pagos, cero pendientes/duplicados), la pasada siguiente aprobó **26 pruebas y omitió cuatro compras responsive intencionales**, evitando repetir compras por tamaño. Incluye T01/T02 por UI, acceso WCAG 2 A/AA, adaptación, login, sesión persistente y credenciales negativas en escritorio/tablet/móvil, todo con Backend QA real. Evidencia: `browser-continuation-summary.json`; capturas/trazas completas en `previous-run/ui-green/`. No equivale aún a auditoría completa de navegación autenticada o recuperación financiera.

Nuevas unitarias: FuelFlow 172/172, Prime 31/31, Control 36/36 antes del cambio siguiente, PrintAgent 56 aprobadas y una omitida (Windows PowerShell). Contratos del gateway 23/23. Auditoría de secretos sin hallazgos. Logs locales en `evidence/*continuation*.log`.

### Corrección del destino de recuperación en Control

Se detectó una dependencia del puerto fijo 27181 para habilitar recuperación de T02; fallaba con los puertos configurados del laboratorio. Control ahora recibe dos orígenes explícitos desde Compose/build, selecciona únicamente T01/T02 y rechaza terminales desconocidas, URLs con credenciales, rutas y HTTP remoto. No se emite ni consume ningún ticket en estas pruebas unitarias. Los imports transitivos del build también reciben versión por contenido: faltante residual del PR #10, necesario para actualizar config y módulos tras reconstrucción.

Control: **38/38 tests**, build local aprobado con orígenes 28181/28184. La reconstrucción QA de este cambio está en curso; verificación visual extendida y pruebas PostgreSQL todavía pendientes. No se inició extracción arquitectónica ni se ejecutó CI remoto nuevo.

### Herramientas de inspección y estado financiero

`assert-lab.cjs` inspecciona por nombre y valida etiquetas de proyecto/servicio, estado, puertos y volumen de PostgreSQL; evita depender de `docker ps`, cuyo listado global se bloqueó al comenzar. `lab.cjs rebuild-frontends` reconstruye únicamente los cuatro frontends QA, sin reiniciar dominios ni bases. `verify-backend` construye el target de pruebas y usa las bases de fixtures separadas de `astra_qa_local`; la ejecución completa continúa pendiente.

`financial-state.cjs` usa una transacción SQL de solo lectura y registra operaciones, pagos, transacciones, reservas pendientes y duplicados. La pasada verde dejó **seis ventas y seis pagos**, todas las operaciones cerradas, cero reservas pendientes y cero duplicados. Últimas compras: T01 OP01-0006 / EB01-0005 y T02 OP01-0007 / FT01-0002 (`evidence/financial-ui-green.json`).

La auditoría extendida inicial encontró contraste insuficiente en Prime y errores de inyección del fixture en documentos auxiliares de navegador. Resultado preservado: 3 fallidas, 1 aprobada, 8 no ejecutadas; se interrumpió para reconstruir y comprobar las correcciones, no para omitir sus reglas. Control recorrió sus 14 secciones sin violaciones axe; el fallo registrado correspondió a la inyección del fixture. Informe: `browser-extended-first-summary.json`. Correcciones y nueva ejecución extendida aún pendientes de cierre.

## Misión 3 — 12 de noviembre, punto de control de estabilización

Se retomó `9245f82`, árbol inicialmente limpio. Se consultaron los jobs 130859959974 y 130859960474 de los runs indicados y los metadatos del artefacto 13901616568. No se lanzó CI remoto ni se hizo push.

- Causa del 403: `smoke-microservices.cjs` buscaba una cookie CSRF sin el sufijo del puerto y omitía propietario/claim. Corregido el cliente, sin modificar autenticación ni CSRF. Nueva comprobación real `SMOKE_AUTH_ONLY=1`: CSRF falso → 403; claim, apertura y cierre válidos → PASS. Seis ventas y seis pagos antes/después. Este modo no valida el recorrido financiero completo del smoke.
- Causa del timeout de navegación sin cobro: diálogo inicial de idioma superpuesto (confirmado en error-context local). El fixture fija español; el cierre pasa a un fixture con timeout propio y APIRequestContext, independiente de la página. Los 409 posteriores son protección de una operación abierta, no errores a ignorar.
- QA contenía OP01-0010 activa sin comprobante. Se inspeccionó el estado y se cerró exclusivamente esa atención con `/control/terminal-operations/:id/cancel-unpaid` (201), cuyos controles rechazan ventas, autorizaciones y pagos activos. No se borró Redis ni se alteraron pagos. Evidencia antes/después conservada.
- Control: tablas desplazables ahora enfocables por teclado. FuelFlow: verde con contraste suficiente. Reconstrucción de los cuatro frontends QA terminada; sin reconstruir bases/dominios.
- Verificación actual: FuelFlow unitarias 172/172; Control 38/38. Playwright individual con Backend real: navegación FuelFlow sin cobro escritorio 1/1 y Control autenticado móvil 1/1, sin omitidas. No equivale a regresión completa.
- El workflow E2E publicará solo resumen por lista permitida; trazas, HTML y JSON completos pueden incluir cookies/login y permanecen locales. Evidencias previas preservadas en `previous-run/mission3-start`, pruebas dirigidas en `previous-run/mission3-target-*`.

Reproducción del smoke sin venta, **tras inspeccionar QA y sin navegador FuelFlow concurrente**:

```bash
node tools/astra/financial-state.cjs
FRONTEND1_PORT=28181 FRONTEND2_PORT=28182 FRONTEND3_PORT=28183 API_ORIGIN=http://127.0.0.1:28100 SMOKE_AUTH_ONLY=1 node tools/smoke-microservices.cjs
npm test --prefix tools/astra -- --project desktop --grep 'navegación prepago sin cobro'
npm test --prefix tools/astra -- --project mobile --grep 'Control: navegación autenticada'
```

El smoke usa propietario propio: antes de volver al navegador esperar expiración normal del claim; no limpiar Redis. Pendientes: resto de casos fallidos, regresión global y extracción Catalog. PR #9–#17 consultados de nuevo: siguen abiertos/draft y mergeable con su propia base; no se integraron ni publicaron cambios.

### Catalog independiente: primera extracción de lectura validada

`services/catalog` contiene NestJS, package/lockfile, build, Dockerfile, configuración y tests propios. Dominio/casos de uso no importan Nest ni PostgreSQL; `CatalogReader` encapsula persistencia y adaptadores. No hay imports de Backend. Se conservó PostgreSQL físico compartido y todas las escrituras de Commerce.

Ejecutado: `npm test --prefix services/catalog` **5/5** (puerto de persistencia simulado, HTTP Nest real), build Docker independiente, `node tools/astra/catalog.cjs verify` y `restart` con PostgreSQL QA real. Los cuatro endpoints devuelven JSON equivalente al catálogo existente: 3 combustibles, 1 estación, 3 beneficios, 3 inventarios. El acceso sin clave devuelve 401. IDs y horas de inicio de Identity, Catalog anterior, Commerce, Administration y gateway permanecen iguales tras levantar/reiniciar el nuevo servicio. Evidencia `catalog-verify.json` y `catalog-restart.json`.

**Límite explícito:** servicio de lectura en paralelo en 127.0.0.1:28210; aún no recibe tráfico del gateway público. Falta adaptador autenticado en la fachada actual y retirar su persistencia anterior, así como rol PostgreSQL exclusivo SELECT. No es separación completa de Catalog ni de los cinco servicios. No se cambiaron bases ni transacciones financieras. Configuración privada QA excluida de Git; pipeline propio solo compila/prueba/construye, sin publicación.

Comandos: `node tools/astra/catalog.cjs build`, `verify` (primera creación), `restart` (contenedor existente), `stop`. Diseño y dependencias: `arquitectura-mision3.md`; contrato/límites: `services/catalog/README.md`.

Pruebas dirigidas adicionales: Control autenticado tablet **1/1**, FuelFlow en tres tamaños **15/15**, incluyendo 409 esperado por otro propietario. Regresión global 48 casos iniciada, todavía no certificada en este punto de control.

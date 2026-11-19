# Astra — Etapa 2B.1: resolución focalizada de observaciones

Fecha: 2026-11-18. Rama verificada: `feat/dezkz-identity-a4-core`. HEAD inicial y final: `f05027ff86f5a03aba12ffeb528f2d001209d747`. Al comenzar no había staging ni modificaciones versionadas; estaban exactamente los nueve archivos nuevos de 2B.

**Resultado:** smoke corregido y validado en ambos empaquetados; T01 diagnosticada sin alterar su estado; terminación forzada de auxiliares demostrada. **No corresponde cerrar 2B sin observaciones.** Falta autorizar y validar el cambio mínimo de cierre propuesto abajo. No se inició Etapa 3 ni se crearon commits.

## 1. Auditoría, privacidad y respaldo preparado

Se leyeron los nueve archivos completos y se registraron sus SHA-256 antes de trabajar. Las dos capturas, ya inspeccionadas visualmente en 2B, coinciden byte a byte con las auditadas: muestran perfiles y datos de demostración. La evidencia JSON contiene referencias de usuario/membresía y de operaciones; la configuración redactada conserva identidades de fixture y los helpers históricos incluyen literales de prueba. No se añadirá ese conjunto bruto al staging en bloque.

Se conservaron íntegros los nueve originales, sin borrarlos, editarlos, moverlos ni sobrescribirlos. También permanecen las configuraciones privadas, sesiones, logs y capturas en la cache ignorada. El paquete para revisión contiene este informe saneado, un manifiesto de hashes y resultados agregados, los cambios del smoke y de su invocación de pruebas CI, y el harness nuevo. No copia valores de contraseñas, tokens, cookies, emails, nombres, documentos ni capturas de perfiles, aunque sean sintéticos.

El manifiesto [review-summary.json](evidence/stage2b1/review-summary.json) permite identificar los nueve archivos preservados sin publicar sus datos. Los hashes no sustituyen un respaldo privado de su contenido: los originales siguen físicamente presentes y excluidos del staging. No se creó ningún commit de respaldo ni de implementación en esta intervención.

## 2. Smoke de impresión: causa y corrección

`tools/smoke-microservices.cjs` llamaba a `thermalReceipt(sale.transaction)` sin el segundo argumento. `Frontend_1_FuelFlow/src/js/thermalReceipt.js` exige un código de surtidor confirmado y rechaza su ausencia antes de formar el comprobante. El historial muestra ambos comportamientos ya presentes en `b99b995`; la incompatibilidad precede al empaquetado independiente. El frontend operativo sí consulta `/terminal/me` y entrega su pumpCode.

Corrección aplicada **sólo al test**:

```js
const confirmedTerminal = await kiosk('/api/v1/terminal/me');
const receipt = thermalReceipt(sale.transaction, confirmedTerminal.pumpCode);
```

No se fijó un surtidor ficticio, no se infirió del número de terminal y no se relajó la validación operativa.

Para cumplir la revisión de privacidad se retiraron también los emails y contraseñas demo de fallback del smoke: exige cuatro entradas de fixture explícitas por entorno y falla antes de acceder a la red si faltan. Los errores ya no imprimen cuerpos JSON completos de respuestas que podrían contener datos de sesión.

Ese cambio requiere ajustar al llamador existente en `.github/workflows/ci.yml`: únicamente su paso de smoke obtiene la configuración del stack demo del propio job, lee las identidades de fixtures con `BEGIN READ ONLY` y pasa los valores al subproceso en memoria. No imprime valores, no añade credenciales a GitHub, no cambia permisos, arranque del stack, migraciones ni política de autenticación. Evita dejar incompatible al llamador CI al retirar los defaults. El workflow no se ejecutó en GitHub y no se hizo push.

## 3. Entorno nuevo y preservación del anterior

Proyecto nuevo: `primax-astra-stage2b1-34b131b9b5`; puertos loopback 30100 y 30181–30184; redes propias 10.253.213.0/26, 10.253.213.64/27 y 10.253.213.96/27, comprobadas contra redes existentes. PostgreSQL, Redis, impresión y claves de la ejecución normal son nuevos. Se revisaron y ejecutaron los mismos jobs protegidos de inicialización sobre la base nueva; no se editaron schema, migraciones ni seeds.

Los tres volúmenes de 2B no se arrancaron con sus contenedores originales ni se conectaron al stack nuevo. Sólo se montaron en lectura en utilidades sin red para calcular huellas. Para el diagnóstico indispensable se copió PostgreSQL, con el origen montado **readonly**, a un cuarto volumen nuevo del proyecto 2B.1. El PostgreSQL de esa copia estuvo sin red/puertos y con `default_transaction_read_only=on`; las consultas usaron además `BEGIN READ ONLY`. No tuvo aplicaciones, migraciones o seeds conectados, ni se obtuvo ningún valor de credencial.

Las huellas agregadas de rutas y contenidos de archivos regulares de los tres volúmenes coinciden antes/después. Se mantuvieron 1.509 archivos PostgreSQL, cuatro Redis y cuatro de impresión. Este control acredita igualdad de los contenidos examinados; no es una certificación de restauración ni un manifiesto de todos los metadatos del filesystem. El montaje readonly y la ausencia de arranque de los originales son garantías adicionales del procedimiento.

## 4. T01: estado real, recuperación y criterio de resolución

La operación pendiente es la primera atención T01 del smoke 2B, asociada al primer comprobante de esa corrida; su referencia exacta permanece en el expediente original. No se reproducen referencias personales o de perfil en este paquete.

Lectura de la copia, contrastada con el digest financiero histórico:

| Elemento | Estado verificado |
|---|---|
| Atención / terminal | ACTIVE, sin closedAt / EN_USO, lifecycle REGISTRADA |
| Venta | Una, PAID; contexto de operación/terminal/estación/surtidor coincide |
| Pago | Uno, CAPTURED, proveedor DEMO; importe coincide, sin reembolso |
| Autorización | Una, SETTLED; paymentId y contexto coinciden |
| Reserva de inventario | Una, CLOSED; vinculada a esa autorización y transacción |
| Comprobante | Uno, vinculado a esa venta |
| OnlineOrder | Cero |
| Credencial vigente al diagnosticar | Una; sólo se consultó el conteo, no su secreto ni hash |

La autorización registra inventoryManaged=true. No debe deducirse ausencia de reserva por la denominación LEGACY usada en parte del informe anterior: la consulta focalizada confirma la reserva cerrada. Se documenta la precisión aquí sin modificar el informe histórico.

**Causa:** el harness confirmó la venta y luego abortó al preparar la impresión, antes del comando normal de cierre de atención. La transacción financiera ya estaba comprometida; cerrar una atención es un comando posterior. La sesión técnica del primer harness era efímera y no quedó conservada por ese script. No hay evidencia de venta/pago duplicado, pérdida de comprobante o cambio de comportamiento causado por las imágenes nuevas.

**Recuperación existente:**

- Con la sesión técnica original válida, el flujo normal puede consultar la operación/comprobante y terminar por el comando existente; la rutina `closeOperation` verifica los vínculos y no vuelve a vender. No se invocó aquí.
- Sin esa sesión, `KioskService.issueRecoveryTicket` exige ausencia de credencial técnica vigente y autoridad administrativa actual. Después, `recoveryEvidence` exige una forma financiera con OnlineOrder, pago, reserva y evidencia de proveedor correlacionadas. Esta T01 no tiene OnlineOrder: no satisface ese camino, incluso después de vencer la credencial. Se concluye por código y lecturas; no se llamó al endpoint, porque puede escribir auditoría o estado Redis.
- `resolveOperation` requiere intervención/estado de asistencia y otros controles. No es una orden genérica de cierre de una atención ACTIVE/EN_USO. No se cambió su estado para forzar ese camino.

La atención abierta es consecuencia esperable de abortar ese harness y revela una limitación de cobertura de recuperación para este tipo de venta directa con sesión perdida. No es correcto afirmar que el ticket cubre cualquier venta confirmada, ni reconstruir una sesión desde hashes.

**Criterios:** el defecto del harness se considera corregido por pasar el flujo entero en ambos empaquetados y dejar las nuevas atenciones cerradas. La T01 histórica queda resuelta **analíticamente**, pero **no cerrada operativamente**: se preservó ACTIVE. Para aceptar ese expediente como diagnóstico congelado se necesita aceptar explícitamente esta limitación; si se exige recuperar esa terminal, hace falta una decisión autorizada sobre recuperación que cubra su forma financiera y pruebas en copia/entorno nuevo. No se proponen reembolso, recreación de recibos, UUID nuevos ni cambios SQL manuales.

## 5. Exit 137: investigación causal

Se inspeccionaron logs, CMD/StopSignal, PID 1 y las entradas de servidor. Los dos BFF ejecutan el mismo `server/local.js`; PrintAgent ejecuta `demo-server.mjs`. Ambos crean un HTTP Server sin conservarlo para un cierre de aplicación y sin handlers JS de SIGTERM/SIGINT. No se editó ninguno de esos archivos.

En el entorno nuevo, en reposo y sin una venta en curso, se enviaron señales mediante Docker y se capturaron los eventos del daemon:

| Caso | Timeout solicitado | Duración aproximada del comando | Eventos / resultado |
|---|---:|---:|---|
| BFF T01 | 3 s | 3,39 s | kill signal 15 → kill signal 9 → die 137 |
| BFF T02 | 3 s | 3,36 s | kill signal 15 → kill signal 9 → die 137 |
| PrintAgent primer ensayo | 3 s | 10,79 s | kill signal 15 → kill signal 9 → die 137 |
| PrintAgent repetición, salud comprobada | 5 s | 5,32 s | kill signal 15 → kill signal 9 → die 137 |
| Control diagnóstico con handler TERM | 3 s | 0,28 s | kill signal 15 → die 0, sin signal 9 |

Todos mostraron OOMKilled=false. No hubo evento OOM en estas trazas. La primera parada de PrintAgent excedió el timeout solicitado y coincidió con actividad del healthcheck; no se atribuye sin prueba ese retraso al healthcheck. La repetición confirmó la secuencia de escalamiento alrededor de los cinco segundos configurados.

Docker **sí escaló de TERM a KILL**. La aplicación no terminó ante TERM en esta ejecución; el control demuestra que el mismo entorno permite una salida 0 al manejar la señal. No se deduce la causa sólo del número 137, ni se necesita atribuirla a memoria o afirmar detalles no medidos de la implementación interna de Node/kernel.

## 6. Propuesta mínima de cierre — NO APLICADA

Dos rutas operativas requerirían autorización adicional:

- `Frontend_1_FuelFlow/server/local.js`, utilizada por los dos BFF.
- `PrintAgent/demo-server.mjs`, sólo el servidor demo.

La propuesta conserva el Server, detiene la aceptación de conexiones al recibir TERM/INT, cierra conexiones ociosas y deja terminar las peticiones aceptadas. No fuerza process.exit al recibir la señal, no cancela escrituras para simular éxito y no modifica handlers HTTP, firmas, sesiones, validadores ni formato de jobs. No requiere modificar Compose o aumentar indefinidamente stop_grace_period.

Diff propuesto para revisión; no está aplicado al árbol de código:

```diff
--- Frontend_1_FuelFlow/server/local.js
+++ Frontend_1_FuelFlow/server/local.js
@@
-createServer((req, res) => {
+const server = createServer((req, res) => {
@@
 }).listen(3001, '0.0.0.0');
+let stopping = false;
+function shutdown() {
+  if (stopping) return;
+  stopping = true;
+  server.close(error => { if (error) process.exitCode = 1; });
+  server.closeIdleConnections();
+}
+process.on('SIGTERM', shutdown);
+process.on('SIGINT', shutdown);
--- PrintAgent/demo-server.mjs
+++ PrintAgent/demo-server.mjs
@@
-http.createServer(async (req, res) => {
+const server = http.createServer(async (req, res) => {
@@
 }).listen(3000, '0.0.0.0');
+let stopping = false;
+function shutdown() {
+  if (stopping) return;
+  stopping = true;
+  server.close(error => { if (error) process.exitCode = 1; });
+  server.closeIdleConnections();
+}
+process.on('SIGTERM', shutdown);
+process.on('SIGINT', shutdown);
```

Aceptación futura: reposo con exit 0 y sin KILL; petición BFF en vuelo con upstream sintético que termina dentro del presupuesto; job demo aceptado completo/persistido antes de exit 0; relectura/replay del mismo job tras reinicio sin duplicación; señales repetidas sin excepción. Debe revisarse también qué ocurre si un cliente/upstream no termina antes del presupuesto Docker: el handler propuesto no demuestra por sí solo un cierre acotado de toda conexión colgada. No se implementó ni validó todavía ese cambio sobre los servidores reales. Añadir init o cambiar sólo el timeout no demostraría el drenaje de peticiones/escrituras requerido.

## 7. Pruebas ejecutadas y conservación final

- Smoke final corregido y con fixtures explícitos: PASS con el empaquetado original y PASS con las cuatro imágenes independientes, usando terminales distintas en la base nueva. En total se conservaron cuatro ventas/pagos/comprobantes por las dos rondas de comprobación; cero atenciones abiertas y cero reservas pendientes en el entorno nuevo. No se tocó la T01 histórica para conseguir esos resultados.
- `node --test Frontend_1_FuelFlow/tests/thermalReceipt.test.js`: 11/11. La falta de surtidor y su formato inválido siguen siendo rechazados.
- `node --test tools/astra/stage2b1-ci-fixture.test.cjs`: 2/2. Se extrajo y probó el bloque CI con dobles de subproceso, comprobando SQL readonly, paso en memoria y que los errores de preparación no divulgan stdout/stderr o mensajes sensibles; no es una ejecución completa de GitHub Actions.
- Workflow CI: YAML y sintaxis shell correctos, comprobados sin ejecutar el workflow; comparación estructural confirma que sólo cambió la invocación de fixtures del smoke y permanecen iguales los demás pasos.
- Invocación sin fixtures: falla antes de red, sin defaults ni impresión de credenciales.
- Diagnóstico T01 sobre copia: vínculos consistentes y digest financiero coincidente con 2B; ninguna recuperación/finalización aplicada.
- Señales: cuatro ensayos iniciales y repetición PrintAgent, con eventos Docker y timings conservados.
- Integridad: nueve archivos originales byte a byte iguales; huellas de contenido de los tres volúmenes anteriores iguales antes/después.

Los 21 contenedores creados para 2B.1 están detenidos, incluidos la copia diagnóstica y el control de señales. Se conservaron los cuatro volúmenes nuevos, las redes, los originales y las evidencias privadas. No se ejecutaron down -v, prune, borrados de evidencia ni modificaciones de datos operativos. La parada final de los auxiliares no se presenta como graceful: no se ha aplicado el cambio pendiente.

## 8. Revisión, Git y decisión de cierre

Cambios preparados para revisión:

1. `tools/smoke-microservices.cjs`: dato correcto del surtidor, fixtures explícitos y mensajes sin cuerpos sensibles.
2. `.github/workflows/ci.yml`: sólo alimentación de fixtures al paso de smoke; sin cambio de provisión/arranque.
3. `tools/astra/stage2b1-lab.cjs`: entorno nuevo, guardas y ejecución de ambos empaquetados.
4. `tools/astra/stage2b1-ci-fixture.test.cjs`: comprobación focalizada del bloque CI.
5. Este informe, incluido el diff operativo propuesto y no aplicado.
6. `Docs/astra/evidence/stage2b1/review-summary.json`: manifiesto y resultados saneados.

Los nueve archivos de 2B quedan fuera del staging, intactos para diagnóstico. No se incorporan configuraciones privadas, capturas de perfiles, sesiones ni logs brutos al paquete de revisión. HEAD y referencias anteriores permanecen intactos; no se crearon commits, push ni merge.

**Cierre:** smoke resuelto; T01 explicada y preservada, con limitación de recuperación documentada; graceful shutdown pendiente de implementación autorizada y pruebas. Se puede revisar una aceptación de 2B **con observaciones**, pero no corresponde declarar un cierre sin ellas. Recomiendo un único corte mínimo de los dos servidores y sus pruebas de drenaje, seguido de aceptación explícita del expediente T01 congelado o decisión de recuperación. Sólo después debe autorizarse Etapa 3; no se requieren nuevos experimentos A.4 para resolver estas dos decisiones.

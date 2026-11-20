# Lote 5 — corrección limitada de recuperación de interfaz T02

Fecha: 20/11/2026. Base autorizada: `b6dd92c6b360c31aeec9076e8e323d827c8d814b`, rama `feat/dezkz-identity-a4-core`. **Recuperación frontend de orden pendiente con identificador corregida y verificada; recuperación financiera de CAPTURED sin venta no implementada. Lote 5 abierto.**

## Alcance y causa corregida

El único archivo funcional modificado es `Frontend_1_FuelFlow/src/js/script.js`. La rama de restauración omitía cargar catalog antes de usar catalog.station.id; además importaba creatingOrder=true del snapshot. La vista de método no reconstruía total/selección/QR. Se conserva `transactionsService.js`, todos los motores, APIs, AuthCore, políticas, Prisma, migraciones, PrintAgent, OCR y compose.yaml.

El cargador común consulta catálogo y contexto de terminal real. La estación procede de kioskStationId de la sesión autenticada, nunca de una estación elegida por el snapshot. Se verifica la atención activa y el código de terminal/surtidor que expone el BFF; no se requiere que este publique UUID internos, que deliberadamente oculta. Backend conserva las verificaciones de pertenencia y firma. Los accesos de reserva y creación de solicitud comprueban que exista catalog.station antes de construir el body.

La restauración importa datos conocidos de operación, incluyendo onlineOrderId/onlineOrderAmount, y descarta flags de trabajo, timers y autenticación administrativa de UI. Los checkpoints de QR guardan creatingOrder/changingMethod/confirmingQR=false. Se reconstruyen total desde la orden backend, método, panel y QR demo. El monto y precio originales de la solicitud se conservan: el importe cobrado por la orden puede incluir descuentos backend y no se sustituye por el importe solicitado.

Antes de habilitar confirmación se comprueban identificación/estado de orden, combustible activo, forma numérica de monto/precio y checksum requestHash ya devuelto por Backend. El checksum reconstruye la serialización vigente OrderDto/CreateAuthorizationDto; no cambia el algoritmo backend ni decide una venta. Una alteración de snapshot se rechaza antes de capturar el pago. Esta validación depende de la serialización DTO actual: si cambia en otro trabajo deberá actualizarse y probarse conjuntamente; falla conservando la orden, no recalculando o cobrando.

Elegir nuevamente YAPE/PLIN permite reintentar la consulta/reconstrucción de la misma orden. No abre otra orden ni ejecuta reselect para el mismo método. Un CREATING que permanece sin QR listo mantiene confirmación deshabilitada y explica que debe consultarse otra vez; los mensajes legítimos HTTP se conservan.

Antes de enviar POST online-orders se guarda un marcador de creación pendiente, sin flags transitorios activos. Si se pierde la respuesta y no se conoce el identificador servidor, la recarga **no repite automáticamente el POST**: conserva operationId y solicita asistencia. No se añadió un contrato de búsqueda ni una política de recuperación financiera. Las ramas de payload/reconcile y el bloqueo de CAPTURED tras recarga mantienen sus políticas anteriores.

## Línea base y recursos aislados

Se comprobaron HEAD/rama, Git inicialmente sin cambios versionados y SHA-256 de las nueve evidencias históricas, todas sin seguimiento. Docker 29.9.2, desktop-linux, contenedores Linux x86_64 disponible. Se crearon tres proyectos nuevos, cuatro volúmenes y dos redes propios por proyecto, puertos loopback libres y secretos aleatorios. Se utilizó únicamente la cadena de migraciones existente mediante bootstrap en bases nuevas; no se creó ni modificó ninguna migración.

| Brazo | Proyecto | Puertos | Uso |
|---|---|---|---|
| Baseline | primax-astra-lot5-t02fix-4c7f866fd5 | 27600/27681–27684 | script.js exacto del commit b6dd92c |
| Candidato recorrido | primax-astra-lot5-t02fix-3398208473 | 27700/27781–27784 | Recuperación, venta normal, replay, CAPTURED conservado y T01 básica |
| Candidato respuesta perdida | primax-astra-lot5-t02fix-dffe7a2010 | 27800/27881–27884 | Recarga durante creación, sin segundo POST/pago |

La línea base nueva reprodujo Regular → PREPAGO 20 → BOLETA → ABC-123 → YAPE → recarga → INICIAR → confirmar: total «—», cero imágenes QR, creatingOrder=true y TypeError station. SQL: un pago CAPTURED de 20 y cero autorizaciones/ventas/comprobantes. No se usaron las operaciones congeladas de T01 ni T02 anteriores. Este laboratorio también se conserva detenido.

Durante la implementación se corrigieron tres problemas de borrador antes de aceptar el parche: supuesto incorrecto sobre UUID que el BFF redacta; orden de serialización DTO para comparar checksum; campos de orden dinámicos ausentes del estado inicial. No se modificó BFF/backend para acomodarlos. Se reconstruyeron solo los frontends de los laboratorios candidatos y se reutilizó la misma orden pendiente, sin cambiar sus datos financieros. La traza conserva los intentos; `finalImplementationStartRequestIndex` delimita la versión corregida. También se corrigió el harness para esperar el selector de idioma por su estado visible. Ningún timeout de prueba se convirtió en temporizador de producto.

## Pruebas antes/después y regresiones

Chromium real 158.0.8127.36 sobre Windows; PostgreSQL 17.6 y Redis reales exclusivos. Las respuestas 503 de catálogo/consulta y la pérdida de respuesta fueron inyecciones explícitas del harness de navegador, sin editar servicios ni filas financieras.

| Comprobación obligatoria | Resultado verificable |
|---|---|
| Recarga antes de crear orden | Mismo operationId/atención vacía, vuelve a selección de combustible; ningún pago/orden nuevo |
| Durante creación | POST real completa en backend; el harness retiene su respuesta y recarga. Una orden/pago PENDING, cero ventas; UI conserva marcador y solicita asistencia sin otro POST |
| Catálogo/estación | Carga por sesión autenticada y contexto BFF; T02/surtidor 04. Pruebas unitarias rechazan otro código/surtidor/operación |
| Reconstrucción QR/total | Una imagen QR demo, S/20.00, mismo orderId/operationId y confirmación habilitada solo tras validar |
| Snapshot antiguo con creatingOrder=true | Inyección solo en localStorage de fixture; tras recarga flag=false y QR reconstruido |
| Recarga antes del pago | La orden permanece PENDING; después confirma, autoriza, despacha simulado y emite EB01-0001 |
| Recarga CAPTURED sin venta | Mensaje original de asistencia; sin autorización/venta/comprobante automático |
| Segundo cobro | Replay de la misma confirmación mantiene mismo paymentId, un evento CAPTURED y monto 20 |
| Duplicación de orden/comprobante | Una orden por operationId; dos ventas completas de operaciones distintas con EB01-0001/0002; no duplicación por replay |
| PostgreSQL/Redis | Snapshots SQL/Redis tras recargas; PONG, sesiones con TTL positivo, 36 migraciones/41 tablas y cero FK sin validar. No se repitió ensayo de reinicio completo ya documentado anteriormente |
| Idempotencia/replay | Reenviar el payload original de la venta devuelve replayed=true, mismo transactionId/EB01-0001; SQL completo idéntico antes/después |
| Errores legítimos | Catálogo/consulta 503 conserva error y permite reintentar; snapshot alterado bloquea antes del pago; sin ID pide asistencia; CREATING persistente no habilita pago |
| Compra normal T02 | Otra atención sin recarga completa YAPE demo 20 → EB01-0002 → cierre por UI |
| T01 básica | PRIMAX-SUR-T01/surtidor 03, catálogo y recarga con el mismo operationId vacío; sin orden/pago. No se interviene en la T01 histórica |

Las ventas completadas se finalizaron con «No imprimir y finalizar»; no se ejecutó impresión física ni se modificó PrintAgent. La impresión demo/OCR conservan sus evidencias anteriores. El fixture alterado para validar rechazo de precio se restauró únicamente en localStorage al valor original; no se editaron montos SQL, reservas ni estados de proveedor.

Pruebas automatizadas en contenedor Node 22.21.1 sin red: **FuelFlow 186/186** (172 existentes y 14 nuevas focalizadas), **Gateway 24/24**. Una aserción estática previa contaba una sola llamada a crearOrdenQR: se actualizó a dos (selección inicial y reintento del mismo método), conservando restricciones YAPE/PLIN/NFC y sin efectivo. La primera ejecución tuvo ese único fallo de aserción; la repetición final pasa. No se repitieron las 3526 comprobaciones globales ni Jest de motores sin cambios. La integración pertinente se ejerció con navegador real, HTTP, PostgreSQL y Redis en los tres brazos, no únicamente con mocks.

## Separación entre interfaz y recuperación financiera

En el candidato de recorrido hay dos ventas terminadas y una tercera atención preparada para simular el corte entre captura y autorización. La tercera confirmación se ejecutó una vez mediante el apiClient existente y luego se recargó antes de autorizar; otra llamada sobre la misma orden comprobó replay. No se invocó procesarPago para rescatarla ni se ejecutó POST authorizations/transactions de esa tercera atención.

| Estado final del candidato recorrido | Valor |
|---|---|
| Pagos | 3 CAPTURED de operaciones distintas: dos vinculados a ventas y uno sin transactionId |
| Ventas / comprobantes | 2 PAID / EB01-0001 y EB01-0002 |
| Autorizaciones de las ventas | 2 SETTLED; ninguna para la tercera operación |
| Tercera operación | `4f8916a7-20f8-4a26-a9b6-69367c1ed11c` |
| Orden / pago incompletos | `b6fc118f-0137-4a01-8802-9ade392e10e8` / `f46e7dbc-c284-42e6-a2f8-b3dfa6499ffc` |
| Reserva de tercera operación | PENDING_PAYMENT, sin consumo, no cancelada/compensada |
| UI tras recargar esa orden | «El pago tiene estado CAPTURED. Solicita asistencia para continuar con esta misma operación.» |

**La recuperación financiera sigue pendiente.** El arreglo de catálogo/flags permite completar el recorrido cuando se recupera una orden pendiente antes de confirmar; no convierte un CAPTURED huérfano en venta. Las evidencias históricas, el baseline nuevo capturado sin venta y esta tercera operación quedan conservados. Cualquier resolución requiere intervención posterior expresamente autorizada, con diagnóstico y regresión propios. No se añade recaptura, reembolso, compensación, finalización forzada ni recuperación automática de estos estados.

La pérdida del identificador de orden durante creación también queda como conservación con asistencia, no recuperación automática certificada. En su laboratorio la orden/pago siguen PENDING, importe 20, cero autorizaciones/ventas/comprobantes y snapshot SQL exacto antes/después de recargar. Es una limitación explícita del alcance, con ausencia de duplicación comprobada.

## Integridad, entrega y estado académico

Las nueve evidencias históricas y los directorios de evidencia Lote 5 anteriores permanecen idénticos y excluidos de modificaciones. Desde el inicio de los laboratorios se comparan IDs/imágenes/inicios/reinicios/montajes de los proyectos original y exposición, sin comandos de despliegue sobre ellos. **El código del repositorio está corregido; no se reconstruyeron los contenedores existentes del original ni la copia de exposición.** La validación usa imágenes propias de laboratorio.

Los tres laboratorios se detuvieron con timeout 20; se conservan sus 12 volúmenes. Sin limpieza global, reset, down -v, pagos externos o datos operativos. Secretos/configuraciones completas y logs privados permanecen en .cache. Los resultados públicos tienen campos permitidos, hashes y pruebas de preservación; no contienen tokens/cookies completos ni contraseñas de laboratorio.

Verificación reproducible: `node tools/astra/lot5-t02-frontend-tests.cjs` ejecuta las suites focalizadas en Node 22 dentro de Docker, sin red y con fuente de solo lectura. `node tools/astra/lot5-t02-frontend-fix.cjs verify` contrasta los artefactos retenidos y metadata de recursos, sin reanudar operaciones. Este último requiere los metadatos privados conservados en .cache. El helper `tools/astra/lot5-t02fix-browser-setup.cjs` fue utilizado con Playwright y configura únicamente el navegador de pruebas. El [resumen final](evidence/lot5-t02-frontend-fix/review-summary.json) registra hashes, alcance, recursos y pendientes. Las secuencias finales del candidato son boleta=2, factura sin utilizar y atención=4 (incluye la atención vacía T01), sin asignación adicional por replay.

Lote 5 permanece abierto: la recuperación financiera incompleta, las limitaciones históricas y las pruebas reales Linux nativo/macOS/ARM64 siguen pendientes. No se rebaja ningún criterio 3J ni se certifica portabilidad universal. La intervención termina al verificar y registrar este parche frontend; no se inicia otro trabajo.

Evidencia: [baseline](evidence/lot5-t02-frontend-fix/baseline/browser.json), [recorrido y errores](evidence/lot5-t02-frontend-fix/flow/browser.json), [respuesta perdida](evidence/lot5-t02-frontend-fix/inflight/browser.json), [T01](evidence/lot5-t02-frontend-fix/flow/t01-browser.json), [tests Node 22](evidence/lot5-t02-frontend-fix/unit-results.json), [SQL primera venta](evidence/lot5-t02-frontend-fix/flow/first-sale.json), [replay de venta](evidence/lot5-t02-frontend-fix/flow/first-sale-replayed.json), [CAPTURED sin venta](evidence/lot5-t02-frontend-fix/flow/orphan-captured.json), [CAPTURED conservado](evidence/lot5-t02-frontend-fix/flow/orphan-after-replay.json).

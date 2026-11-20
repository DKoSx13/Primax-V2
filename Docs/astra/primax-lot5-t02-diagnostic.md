# Lote 5 — diagnóstico Docker y recuperación T02

Fecha: 20/11/2026. Base: `945abd06dc2f5392348438d466c7e2e3967e316b`, rama `feat/dezkz-identity-a4-core`. Intervención limitada autorizada: restablecer Docker, reproducir con recursos nuevos y diagnosticar; **sin corrección funcional**. Lote 5 permanece abierto.

## Dictamen

Docker Desktop estaba detenido. Se inició correctamente con `docker desktop start`, sin reinicializar WSL2, cambiar contexto ni limpiar recursos. El original queda con 15 servicios saludables y dos jobs exit 0.

**T02 tiene un defecto funcional preexistente del frontend, confirmado en navegador y depurador.** La recuperación de la orden pendiente restaura el snapshot y retorna antes de inicializar `catalog`. Tras confirmar el pago demo, `ejecutarReserva` intenta leer `catalog.station.id` y falla antes de llamar a `/authorizations`. Además, se persiste y restaura `creatingOrder=true`, y no se reconstruye el total visible. No es un fallo del fixture, de Compose, del Gateway ni un error HTTP de autorización backend en este recorrido.

Es **P1 funcional**, con impacto operativo/financiero: queda un pago capturado sin despacho, venta ni comprobante y una reserva física pendiente. No es únicamente un defecto visual. En el escenario ejecutado no hubo cobros o ventas duplicados, descuento físico de stock ni corrupción relacional demostrada. Esto no convierte el recorrido incompleto en íntegro o aceptable.

## Verificaciones iniciales e integridad

- Rama y HEAD esperados confirmados; staging y archivos versionados inicialmente limpios. Solo estaban sin seguimiento las nueve evidencias históricas.
- `git fsck --connectivity-only` pasó; informó blobs sueltos, sin errores de conectividad. No se limpiaron objetos.
- Nueve archivos históricos: SHA-256 idénticos al manifiesto Lote 5 y sin seguimiento; excluidos del nuevo trabajo.
- No se abrió, montó ni modificó el directorio `C:\Users\MATHIAS\Desktop\primax V2-avance`. La comprobación de sus contenedores se limita a metadata Docker.
- Las fuentes de aplicación del original y la evidencia anterior `evidence/lot5-validation` se conservan. La ejecución nueva usa snapshot de archivos versionados, sin .env operativo ni node_modules del host.

## Diagnóstico Docker

| Posible causa | Observación | Conclusión |
|---|---|---|
| Desktop detenido | Sin procesos Docker; `com.docker.service` Stopped/Manual; `docker desktop status` no encuentra Desktop | Causa respaldada |
| Motor no disponible | `docker info` y `docker compose ls --all` fallan antes de iniciar Desktop | Consecuencia de Desktop detenido |
| WSL2 averiado | WslService Running; distribución docker-desktop Stopped/version 2; arranca sin reparación | No se acreditó avería de WSL2 |
| Contexto incorrecto | `docker context ls`: desktop-linux activo, endpoint dockerDesktopLinuxEngine | No se cambió el contexto |
| Compose inválido | `docker compose config --quiet` exit 0 antes del arranque | No hay fallo de sintaxis/configuración demostrado |
| Contenedores dañados | Tras iniciar motor, original 15 healthy y dos jobs exit 0 | No hay avería actual de esos servicios demostrada |

Error inicial exacto:

```text
failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine; check if the path is correct and if the daemon is running: open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified.
```

Motor posterior: Docker 29.9.2, contexto desktop-linux, OSType linux, arquitectura x86_64, Docker Desktop, WSL2 docker-desktop Running. Compose 5.6.1. `docker compose ls --all` vuelve a responder; sus numerosos laboratorios históricos detenidos no se limpiaron ni se interpretan como daño del proyecto.

Al iniciar Desktop, Docker reactivó contenedores existentes según sus políticas de reinicio. No se emitieron comandos `compose up`, `stop`, `restart`, migración o seed sobre el original o la copia de exposición. Desde la captura posterior al arranque hasta terminar el diagnóstico se conservan exactamente IDs, imágenes, inicios, reinicios y montajes: original 17 contenedores; exposición 20. No se afirma que sus tiempos de inicio sean idénticos a los anteriores a apagar el motor. Evidencia: [Docker y logs backend](evidence/lot5-t02-diagnostic/docker-and-backend.json).

## Laboratorio y reproducción nueva

Proyecto exclusivo: `primax-astra-lot5-t02-27d5ab6a9f`. Puertos loopback 27500/27581/27582/27583/27584; T02 en `http://127.0.0.1:27584/src/index.html`. Redes y cuatro volúmenes nuevos verificados inexistentes; secretos sintéticos nuevos, sin proveedores externos. Arranque 15 healthy/dos jobs exit 0. Se construyeron imágenes propias desde el snapshot con caché Docker. Solo se aplicó la cadena existente de 36 migraciones al volumen nuevo mediante bootstrap; **no se creó, modificó ni inició una migración de esquema nueva**.

Preparación del harness: un intento de reutilizar un digest histórico de imagen no disponible se abortó antes de crear volúmenes/contenedores del stack. Se optó por construir imágenes del proyecto nuevo, sin retaggear ni reconstruir las del original. Al cambiar del primer contexto de navegador a uno aislado apareció el rechazo 409 de owner de terminal; se esperó su TTL natural de 120 segundos y se reintentó por UI. No se borró ninguna clave Redis ni se cambió la política. Ambos hechos son incidencias de preparación, separadas de T02.

Pasos efectivamente ejecutados en Chromium 158.0.8127.36, Windows:

1. Abrir T02, elegir Español e INICIAR; Regular → PREPAGO → S/20 → BOLETA.
2. Introducir DNI sintético y placa ABC-123; Continuar → YAPE. La placa se escribió manualmente para aislar recuperación; no se repitió OCR, ya validado anteriormente sobre la misma placa.
3. Esperar orden PENDING y guardar snapshot navegador/SQL/Redis. Total visible S/20.00.
4. Recargar la **misma pestaña** y pulsar INICIAR. Se conserva la operación/orden; el total visible pasa a «—» y no se reconstruye correctamente el QR.
5. Pulsar una vez «Simular confirmación del pago». Backend devuelve CAPTURED; la UI muestra `Cannot read properties of undefined (reading 'station')`.
6. Pulsar «Entendido» dos veces, cada vez ante el mismo error. El callback reintenta autorización; no genera solicitudes HTTP ni una nueva operación.
7. Probar una repetición explícita de `demo-confirm` sobre **la misma orden capturada**, mismo importe/moneda, usando el apiClient existente en la sesión sintética. Devuelve el mismo pago; PostgreSQL completo coincide exactamente antes/después del replay.
8. Recargar nuevamente después de CAPTURED y pulsar INICIAR. UI muestra «El pago tiene estado CAPTURED. Solicita asistencia para continuar con esta misma operación». No se fuerza recuperación, cancelación, reembolso, autorización ni venta.
9. Capturar evidencia y detener exclusivamente el proyecto nuevo con timeout 20. Los 17 contenedores quedan detenidos sin exit 137/OOM; cuatro volúmenes conservados. Las operaciones T01 y T02 anteriores no se reutilizaron.

Identidades de esta prueba:

| Entidad | Identificador |
|---|---|
| operationId estable | `59b97980-55d3-4201-a6b2-17b1dc14e334` |
| Atención técnica | `6659844e-e200-482a-b874-56a50aee690e`, OP01-0001 |
| Orden | `053f9833-ea7c-403e-a3e0-94ba1d15b740` |
| Pago | `bd019d27-a3ad-4600-9463-853402645a77` |
| Transacción/comprobante | No existen en el caso fallido |

## Evidencia HTTP, sesión, PostgreSQL y Redis

El [registro de navegador](evidence/lot5-t02-diagnostic/browser-evidence.json) conserva 43 respuestas observadas, incluidos bootstrap, polling y los rechazos de preparación. No son 43 casos independientes. Headers, valores de cookies y tokens se excluyen por lista permitida.

Algunas capturas se tomaron durante transiciones CSS y tienen contraste reducido; los textos y estados se verifican además por DOM, HTTP, SQL y el depurador, sin editar las imágenes para alterar el resultado.

| Tramo | Solicitudes relevantes | Resultado |
|---|---|---|
| Inicio normal | GET fuels/stations 200; POST terminal/operations 201 | Catálogo cargado y atención nueva |
| Crear orden | POST online-orders 201 | PENDING, importe 20, mismo operationId |
| Recarga pendiente | GET kiosk/session 200; POST terminal/claim 201; GET terminal/operations/{op} 200; GET online-orders/{id} 200 | Sesión aceptada y orden PENDING conservada; no GET fuels/stations en esa fase |
| Confirmación | POST online-orders/{id}/demo-confirm 201 | Orden/pago CAPTURED; ninguna llamada POST authorizations/transactions |
| Dos reintentos UI | Sin nuevas solicitudes en esos callbacks | Mismo TypeError antes de construir/enviar autorización |
| Replay de confirmación | POST al mismo demo-confirm 201 | Mismos orderId/paymentId/operationId; sin evento CAPTURED adicional |
| Recarga posterior | GET misma orden 200 | CAPTURED; UI conserva y solicita asistencia, no crea otra orden |

Cookies de sesión kiosco y terminal preservadas e HttpOnly/SameSite Strict. La cookie CSRF cambió tras recargar; no hubo 401/403 en el flujo de recuperación ni una petición de autorización que pudiera ser rechazada por CSRF. El tabId de sessionStorage y el operationId local permanecen iguales. Snapshot conserva monto=20, combustible y precio=21.30, orden y método YAPE; no tiene authorizationRequest/payload/result porque el fallo ocurre antes de `transactionsService.authorize`.

| Estado PostgreSQL | Antes de recargar | Tras confirmar y fallar | Tras reintentos/replay/segunda recarga |
|---|---|---|---|
| Orden / pago | Un PENDING / PENDING | Un CAPTURED / CAPTURED | Mismos IDs y estados |
| Autorizaciones / ventas / comprobantes | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| Atención | Una ACTIVE | Misma ACTIVE | Misma ACTIVE |
| Stock Regular | 5000 L físicos; 3.554972 L reservados | Igual | Igual |
| Reserva física | PENDING_PAYMENT, consumido=0 | Misma PENDING_PAYMENT, consumido=0 | Igual; no liberada ni cerrada por fuerza |
| Eventos pago | Un DEMO_PENDING | DEMO_PENDING + DEMO_PAID + CAPTURED | Exactamente los mismos tres |

Redis responde PONG en cada snapshot. Tras crear la orden se registran ocho claves, incluidas sesiones autenticadas con TTL positivo y terminal-owner. Luego quedan siete por expiración natural de una clave; no se exige igualdad literal de TTL o contadores. Se conservan hashes de claves/valores y solo campos de sesión permitidos, sin credenciales. La misma sesión autenticada permite los GET y POST posteriores; no hay evidencia de pérdida de sesión como causa. El estado financiero autoritativo se comprueba en PostgreSQL, no se infiere de Redis.

Los [snapshots](evidence/lot5-t02-diagnostic/captured-after-failure.json) incluyen relaciones, stock, reserva y eventos. La comparación SQL completa tras fallo/replay/segunda recarga coincide exactamente. Gateway, Commerce, Identity y BFF T02 no presentan líneas ERROR/TypeError/PrismaClientError en sus logs recogidos; los logs de startup sin trazas de cada request no son una auditoría universal del backend. `pageerror` queda vacío porque la aplicación captura el TypeError y lo presenta en modal. El depurador sí registra el error capturado.

## Causa confirmada y archivos implicados

| Archivo / ubicación | Hallazgo |
|---|---|
| `Frontend_1_FuelFlow/src/js/script.js:34` | `catalog` es variable del módulo sin persistencia |
| `script.js:1365` | Rama de orden recuperada hace Object.assign del snapshot y retorna antes del arranque normal |
| `script.js:1410` | Solo el arranque normal consulta fuels/stations y asigna catalog |
| `script.js:2476` | El total se reconstruye al entrar por irAMetodoPago, no por la rama de recuperación |
| `script.js:2863` / `:2876` | crearOrdenQR pone creatingOrder=true y guarda snapshot antes de que finally la devuelva a false |
| `script.js:2538` / `:1644` | Confirmación captura pago y después intenta ejecutarReserva |
| `script.js:2452` | Lectura de catalog.station.id lanza TypeError antes del POST de autorización |
| `Frontend_1_FuelFlow/src/js/transactionsService.js:32` | checkpoint guarda el snapshot recibido completo, incluidas banderas transitorias |

En el depurador, frame ejecutarReserva línea 2452: **catalogType=undefined**, combustible Regular presente, monto=20, orderId/operationId correctos. Stack: ejecutarReserva → procesarPago → callback de reintento → cerrarModal. [Evidencia de ejecución](evidence/lot5-t02-diagnostic/browser-evidence.json). El [snapshot leído](evidence/lot5-t02-diagnostic/persisted-transient-flags.json) confirma savedCreatingOrder=true: tras Object.assign, crearOrdenQR retorna por su guard y no regenera el QR. El total «—» tiene un origen adicional de reconstrucción DOM omitida; no indica pérdida del monto SQL.

La fuente es idéntica al commit documental 945abd y a la referencia funcional 9d57ede en los archivos implicados. Es un defecto preexistente encontrado durante Lote 5, reproducido de nuevo; no una regresión introducida por esta intervención. No se modificaron Gateway, backend, contratos, AuthCore, seguridad, algoritmos financieros ni recuperación transaccional.

**Distinción de T01:** T01 histórica conserva venta PAID, pago CAPTURED, autorización SETTLED, reserva CLOSED y atención ACTIVE según su evidencia previa. T02 aquí tiene cero ventas/autorizaciones/comprobantes y reserva PENDING_PAYMENT. Son operaciones, terminales y problemas diferentes. No se consultó ni recuperó la operación congelada T01.

## Corrección mínima propuesta, todavía no aplicada

Solicitar autorización para un cambio **solo de recuperación de interfaz en script.js**, con regresiones focalizadas:

1. Hidratar y validar el contexto de catálogo/estación antes de permitir confirmar una orden recuperada PENDING/CREATING, reutilizando el cargador normal. Si falta red, estación, combustible o correspondencia de contexto, conservar la misma operación y bloquear confirmación; no capturar primero un pago para descubrir después el contexto inválido.
2. Restaurar solo estado persistente de negocio y reiniciar banderas transitorias de UI como creatingOrder/changingMethod/confirmingQR. No cambiar operationId, orden, importe, precio histórico, comprobante ni datos de autorización; no sustituir el precio del snapshot por un precio nuevo del catálogo. El backend mantiene la validación autoritativa y el rechazo de incompatibilidades.
3. Reconstruir el total desde el importe de la misma orden y la vista QR por la ruta existente. No reutilizar irAMetodoPago sin revisar sus resets, pues borra el método seleccionado. No abrir una nueva orden ni repetir una captura para corregir la presentación.
4. Mantener el comportamiento actual de CAPTURED tras recarga como conservación y asistencia. **Recuperar automáticamente pagos ya capturados, incluida esta operación de prueba, sería otro cambio funcional que necesita autorización concreta**; no se introduce como parte implícita de rehidratar catálogo. No ejecutar correcciones sobre el laboratorio congelado.

El efecto previsto es cambiar la preparación/orden de las acciones de UI, sin modificar cálculos, transacciones, idempotencia, políticas o contratos. Sigue siendo un cambio funcional: requiere permiso según la instrucción del usuario, aunque su archivo principal sea frontend. No se aplicó un parche en memoria, una interceptación de respuestas ni una edición de datos para hacer pasar el flujo.

Pruebas exigibles al autorizar: mismo escenario pendiente→recarga→confirmación→autorización→despacho simulado→comprobante→impresión demo; conservación de IDs y precio/importe; un solo pago/venta/evento/stock, doble click/reintento; arranque normal T02; PENDING/CREATING; catálogo no disponible o contexto incompatible bloquea antes de demo-confirm; snapshots con creatingOrder=true; CSRF/sesión; CAPTURED después de recarga conserva asistencia sin nuevo pago. Mantener T01 intacta y no ampliar TARJETA/proveedores. Recuperación automática de CAPTURED requeriría su diseño y pruebas propias antes de autorizarla.

## Entrega y estado del Lote 5

Se reutilizan las 3526 comprobaciones aprobadas anteriores y su fallo, sin repetirlas ni sumarlas como nuevas. Esta sesión aporta un escenario T02 nuevo con snapshots por fase, dos reintentos UI, un replay de confirmación demo, segunda recarga, inspección de excepción capturada, Docker/health/logs/integridad y parada del laboratorio. Las verificaciones de conservación/idempotencia pasan; **la recuperación funcional sigue fallando**. No hay corrección de configuración de producto ni cambio de comportamiento de aplicaciones; solo se restauró Desktop y se ajustó la preparación del harness.

El [resumen verificable](evidence/lot5-t02-diagnostic/review-summary.json) agrupa 14 comprobaciones diagnósticas: 12 aprobadas y dos criterios funcionales fallidos (reconstrucción de vista y completar despacho/comprobante tras recarga). No son 14 endpoints independientes ni se suman a las 3526 anteriores como cobertura nueva equivalente. La auditoría se reproduce con `node tools/astra/lot5-t02-diagnostic.cjs verify <lab-private.json>` sobre los artefactos conservados; el comando create rechaza sobrescribir evidencia y usa recursos nuevos, no el laboratorio detenido.

La documentación y evidencia nuevas no equivalen a cerrar Lote 5. Linux nativo/macOS continúan pendientes por falta de hosts; ARM64 no ejecutado. Se mantienen los criterios 3J sin rebajarlos. Se detiene el trabajo después del diagnóstico y verificaciones autorizadas; cualquier corrección funcional espera autorización específica.

Artefactos: [aislamiento](evidence/lot5-t02-diagnostic/isolation.json), [arranque](evidence/lot5-t02-diagnostic/startup.json), [navegador y stack](evidence/lot5-t02-diagnostic/browser-evidence.json), [SQL/Redis pendiente](evidence/lot5-t02-diagnostic/pending-before-reload.json), [SQL/Redis tras fallo](evidence/lot5-t02-diagnostic/captured-after-failure.json), [replay](evidence/lot5-t02-diagnostic/captured-after-retries.json), [segunda recarga](evidence/lot5-t02-diagnostic/after-captured-reload.json), [parada/volúmenes](evidence/lot5-t02-diagnostic/stopped-lab.json). Configuraciones, secretos y logs completos permanecen privados en .cache.

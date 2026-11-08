# Recuperación de FuelFlow y logotipos PNG

Validación: 7 de noviembre de 2026, America/Lima.

## Diagnóstico comprobado

El mensaje provenía de `Frontend_1_FuelFlow/src/js/kioskSession.js`. El arranque técnico en `Backend/src/kiosk/kiosk.service.ts` rechazaba renovar una credencial perdida o vencida si encontraba cualquier `TerminalOperation` con `closedAt = null`, sin distinguir una selección vacía abandonada de una venta financiera en curso.

En la base demo se encontró la operación `7fde1a65-e37f-4aa2-a534-57dcc535aa10`, abierta desde `2026-11-08T00:45:46.268Z`, en estado ACTIVE, con terminal EN_USO y sin autorización, pago, transacción ni orden de cobro. La existencia de esa fila explicaba el bloqueo de un navegador nuevo. No era necesario activar la terminal desde Control.

La nueva recuperación cerró esa operación automáticamente el `2026-11-08T01:03:41.441Z` y registró `ABANDONED_EMPTY_ATTENTION_CLOSED`. Se conservó la fila histórica.

## Política implementada

Se reutilizan `TerminalOperation.openedAt` y `TerminalCredential.lastUsedAt`, ya existentes. No se requieren tablas, columnas ni migraciones nuevas.

1. El bootstrap del gateway confiable se ejecuta en una transacción serializable con bloqueo de la fila Terminal. Comprueba credencial, operación y estado operativo.
2. Una atención ACTIVE se considera vacía únicamente si no existe evidencia de autorización, transacción, pago, orden de cobro, reserva de inventario ni incidencia abierta o en revisión. También se comprueban los vínculos por ID de operación técnica cuando existen.
3. Si esa atención lleva **dos minutos sin actividad**, se cierra y audita automáticamente. No se borran registros. La terminal EN_USO sin operación queda DISPONIBLE.
4. Mientras una sesión original está abierta y visible, consulta su terminal cada **30 segundos** y actualiza la actividad de su credencial. Una atención reciente de otro navegador no se cancela ni se entrega a una segunda sesión.
5. La credencial original válida puede recuperar su atención. Si se perdió únicamente el UUID de localStorage, el backend permite recuperar el UUID de la atención vacía; no se reemplaza ningún payload, autorización o evidencia financiera local.
6. Si la operación tiene evidencia financiera, inventario o incidencia, el tiempo por sí solo **nunca la cierra**. Se conserva la sesión original y sus mecanismos existentes de conciliación. Si faltan credencial o datos de recuperación, se indica que hace falta intervención autorizada; no se inicia una segunda venta.
7. La comprobación de disponibilidad reintenta automáticamente cada **15 segundos**. El botón Reintentar ahora es opcional. El arranque normal ya no presenta un mensaje de indisponibilidad antes de haber comprobado la terminal.

La recuperación automática es deliberadamente conservadora: una operación con registros financieros históricos no se trata como una atención vacía. Las órdenes rechazadas o canceladas definitivamente mantienen su ruta de cancelación controlada existente. El cierre de una operación sin autorización conciliada ahora rechaza expresamente pagos capturados, pendientes u órdenes sin resultado definitivo.

## Seguridad y dashboard

Se conservan credenciales HttpOnly, firma del gateway, CSRF, autenticación administrativa, permisos, estación asignada, exclusión de operaciones simultáneas, restricciones de pago e inventario, incidencias, revocación de terminales y estados reales ASISTENCIA/FUERA_DE_SERVICIO.

El interruptor administrativo de activación ya era de solo lectura y permanece así. La recuperación no inicia turnos humanos ni depende de FrontEnd_3. No se tocaron las secuencias EB01 y FT01, comprobantes, pagos históricos ni datos fiscales.

## PNG utilizados

| Aplicación | Recurso local | Verificación del recurso servido por Docker |
| --- | --- | --- |
| Prime | `Frontend_2_PrimaxPrime/assets/Logotipo corporativo PRIMAX PRIME.png` | HTTP 200; 318052 bytes; coincide byte por byte con el original |
| Control | `Frontend_3_PrimaxControl/assets/Logotipo Primax Control en azul y naranja.png` | HTTP 200; 298265 bytes; coincide byte por byte con el original |

Ambos conservan la proporción 3:1 y `object-fit: contain`. Prime usa el recurso en acceso, registro y encabezado. Control lo usa en acceso y barra lateral, dentro de un contenedor blanco centrado horizontal y verticalmente. Se corrigió el ancho mínimo del lateral que ocasionaba desbordamiento en móvil.

Los builds incluyen los bytes de imágenes en su hash de versión y agregan esa versión a las referencias de recursos. Control ahora versiona también su entrada JavaScript, sus importaciones y CSS, para que un módulo antiguo no conserve el logo anterior en caché.

Capturas verificadas: `logo-prime-actualizado.png` y `logo-control-actualizado.png`.

## Archivos modificados en esta intervención

- Backend: `src/kiosk/kiosk.service.ts`, `src/kiosk/terminal-bootstrap.spec.ts`, `src/operations/empty-attention.ts`, `src/operations/operations.service.ts`, `src/operations/operations.controller.ts`, `test/terminal-refactor.e2e-spec.ts`.
- FuelFlow: `server/gateway.js`, `src/js/kioskSession.js`, `src/js/terminalOperation.js`, `src/js/transactionsService.js`, `tests/kiosk-session.test.js`, `tests/terminal-operation.test.js`.
- Prime: `index.html`, `js/login.js`, `js/register.js`, `styles/app.css`.
- Control: `js/app.js`, `styles/control.css`, `tools/build.cjs`.
- Documentación y capturas de este informe.

## Pruebas ejecutadas

- Backend: 227 pruebas unitarias aprobadas, incluidas renovación de credenciales, atención abandonada, lease reciente, sesión original y protección independiente de las seis clases de evidencia.
- Frontends: FuelFlow 155, Prime 28 y Control 27 pruebas aprobadas.
- Integración: `docker compose --profile test run --rm --build backend-tests`, 311 pruebas aprobadas en bases aisladas. Incluye atención obsoleta, recuperación legítima, pago capturado preservado, impedimento de cierre inseguro, cancelación controlada, inventario, autenticación y comprobantes. La primera ejecución detectó la cancelación legítima de una orden rechazada/cancelada; se corrigió y la ejecución completa posterior terminó con código 0.
- Compilación TypeScript del backend y `docker compose config --quiet`: correctos.
- `docker compose up -d`: construcción y arranque correctos con inicialización automática existente.
- Navegador sin cookies: bienvenida y ausencia de diálogo de bloqueo después de recuperar la atención obsoleta real.
- Se detuvo únicamente frontend3, se accedió a FuelFlow desde un contexto nuevo y se comprobó la bienvenida. Después se restauró frontend3.
- Se reiniciaron PostgreSQL, Redis, los cuatro dominios, API Gateway, gateway del kiosco y los tres frontends. Un navegador sin cookies volvió a mostrar la bienvenida sin bloqueo. Antes y después había 8 transacciones y 8 comprobantes en la base demo, sin operaciones abiertas.
- Recuperación legítima desde navegador: se inició la atención `e7c958eb-d320-4830-925f-d5d5f3cc426a`, se retiró únicamente el UUID local, se recargó y se recuperó exactamente el mismo UUID. Se cerró de forma controlada con HTTP 201, sin venta ni pago.
- Logos y proporciones en escritorio y móvil: Prime a 1280/375/320 px; Control a 1280/768/375/320 px, sin desbordamiento y con diferencia de centrado horizontal y vertical de cero píxeles.
- ESLint del backend y `git diff --check` sobre los archivos editados: correctos. Al finalizar, los 13 servicios persistentes estaban saludables.

## Límites intencionales

La recuperación automática no sustituye una conciliación financiera. Si se pierde la credencial original y existe pago, autorización, inventario o incidencia, se requiere intervención autorizada para determinar el estado real. Los registros financieros no se borran ni se cambian para habilitar la terminal. No se realizó una nueva prueba de clonación limpia en esta intervención; sí se reconstruyeron las imágenes del despliegue actual y el contenedor de pruebas.

## Despliegue

Desde la raíz: `docker compose up -d`.

- FuelFlow: http://localhost:26081
- Prime: http://localhost:26082
- Control: http://localhost:26083

Los checks y las migraciones del despliegue siguen automatizados. No se eliminaron volúmenes ni se publicaron cambios remotos. Las pruebas de integración utilizan las bases aisladas definidas por `Backend/scripts/test-compose.cjs`.

## Logo vigente al preparar los Pull Requests

El lateral de Control usa `Frontend_3_PrimaxControl/assets/Logotivo V2.png`, con letras blancas y naranja sobre el azul de la barra. El contenedor y la imagen son transparentes. En acceso y solicitud se conserva el PNG azul/naranja, adecuado para fondo claro. Las capturas anteriores documentan el estado verificado antes de seleccionar V2. El archivo V2 original era PNG sin extensión; se agregó `.png` para servir el MIME correcto, sin editar sus bytes.

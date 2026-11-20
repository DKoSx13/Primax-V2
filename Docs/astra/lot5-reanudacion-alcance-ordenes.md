# Lote 5 abierto · Reanudación del 20 de noviembre de 2026

## Estado recuperado

Rama `feat/dezkz-identity-a4-core`, HEAD `cec1cafc56f770597e786c9182a0fb82c3bfc7d4`. El inventario inicial coincide con el [informe de recuperación](lot5-revision-recuperada.md), más ese mismo informe sin seguimiento. Había seis archivos en el índice, cinco con cambios sin preparar y 31 sin seguimiento. Hay solapamiento entre las dos primeras cifras. Se conservaron el índice completo, las modificaciones locales, las nueve piezas históricas de Stage 2B, las evidencias del candidato y sus herramientas. El único archivo añadido en esta ejecución es este informe, sin preparar. Sin commit.

## Motivo de la parada

La revisión estática identificó una omisión de autorización en la cancelación **ordinaria** de órdenes pendientes de kiosco. Ambas listas de rutas permiten la cancelación. La credencial ordinaria acredita la terminal solicitante y, cuando corresponde, su pestaña. Para la orden objetivo, la comprobación en Redis vincula el identificador de operación a una estación. Falta la comparación de la terminal solicitante con la terminal propietaria de esa operación. Dos terminales autorizadas pueden compartir estación. En cambio, la rama de recuperación excepcional sí comprueba la operación específica del ticket.

La acción de cancelación tiene un efecto financiero externo. El controlador acepta un actor de kiosco, el servicio verifica titularidad de miembro y estado de la orden, y el proveedor recibe la cancelación. Por tanto, corregir solo avance, liberación e intervención dejaría esa decisión de permisos sin corregir. El hallazgo es de código. No se ejecutó una cancelación cruzada ni se observó un perjuicio real.

Referencias para revisión: [política FuelFlow](../../Frontend_1_FuelFlow/server/policy.js), [política backend](../../Backend/src/kiosk/policy.ts), [KioskService.authorize y binding](../../Backend/src/kiosk/kiosk.service.ts), [AccessGuard.newKioskSale](../../Backend/src/auth/access.guard.ts), [OnlineOrdersService.cancel, owns y controlador](../../Backend/src/payments/online-orders.ts).

Se solicita ampliar el alcance a la vinculación de terminal y operación en la cancelación ordinaria, con contratos defensivos que comprueben el rechazo antes de invocar al proveedor y preserven la recuperación por ticket. La confirmación DEMO comparte la comprobación de titularidad de orden y merece revisión dentro de esa ampliación. Esta sesión se detuvo antes de modificar las tres rutas de autorización ya aprobadas. En ellas persiste la comprobación por estación descrita en el informe anterior.

## Playwright y correlación histórica

| Mensaje | Evidencia recuperada | Qué falta para atribuir causa |
|---|---|---|
| Unrelated authorization incorrectly replayed | En el replay documentado coinciden operación, autorización y pago antes y después del reintento. El registro de consola incluye varios rechazos de autorizaciones. | Falta la petición y la respuesta de la aserción denominada «unrelated», con la operación que esperaba el fixture. El replay documentado no demuestra cruce ni descarta otro intento. |
| Continuation cannot create order | El servicio heredado rechaza expresamente una creación o reselección que incluya metadatos de continuación. El registro incluye un 400 en creación de órdenes. | Falta el cuerpo asociado a esa aserción para determinar si alcanzó ese rechazo o una guarda previa. |
| Order guard status 403 | Hay dos 403 sobre creación de orden en el navegador candidato. El gateway y backend tienen varias comprobaciones que pueden emitir ese estado. | Faltan las respuestas con mensaje, contexto autenticado y cuerpo de cada petición. |

El log candidato está en `.playwright-mcp/console-2026-11-20T14-13-26-088Z.log`. Registra búsquedas 404 de operaciones y vehículos sintéticos, fallos de red durante confirmación y autorización, respuestas HTTP 400/401/403/409 y avisos de Chromium sobre un campo de contraseña. En el baseline se observa la consulta de operación 404 seguida de creación 201. El log candidato por sí solo no establece la causa de cada respuesta. No se encontró el texto de las tres aserciones en los artefactos Playwright ni en la caché específica de continuación inspeccionada.

### Venta y replay del candidato

| Entidad | Identificador histórico |
|---|---|
| Terminal | `3b0c9ed8-de96-4ac8-871a-5794c394643c` |
| Operación | `bc01f193-7549-4b79-9f01-cf519a180a78` |
| Orden | `9f88760c-30d3-4060-bb4e-33d62e392e9e` |
| Pago YAPE DEMO, PEN 20 | `e3a1d636-427e-4f14-b590-5bf336da939e` |
| Autorización | `ebb41092-1ad9-4e63-9bfc-8a9cb08614e1` |
| Venta PAID | `1f183b42-4923-4af1-9b41-baf6b0e249f5` |

Tras la respuesta perdida había un pago capturado, una autorización y cero ventas. Tras el replay persistían los mismos identificadores. Al cierre había una venta vinculada a esa autorización, un pago vinculado a esa venta, reserva CLOSED con remanente cero y comprobante EB01-0001. El caso acredita unicidad en esas capturas. No permite generalizar a dos operaciones o dos solicitudes concurrentes.

Fuentes: [petición](evidence/lot5-captured-continuation/candidate/continuation-request.json), [respuesta perdida](evidence/lot5-captured-continuation/candidate/authorization-response-lost.json), [replay](evidence/lot5-captured-continuation/candidate/replay-confirmed.json), [venta](evidence/lot5-captured-continuation/candidate/recovered-sale.json).

## Validación y reanudación

El historial registra 144 pruebas Jest y 21 de recarga QR aprobadas, y un rechazo 409 al intentar reutilizar el pago consumido. En esta ejecución hubo revisión de código y de artefactos. Se ejecutaron cero pruebas unitarias, de contrato y E2E. No hay resultados nuevos de concurrencia, rechazo cruzado, pérdida de ID, permisos, recorridos T01/T02 o ausencia de duplicados. Los tres fallos de Playwright quedan abiertos.

Docker respondió `linux` a la consulta de motor. Se descargó la imagen `redis:7-alpine` durante la comprobación inicial. No se arrancaron bases ni se utilizaron volúmenes. El Compose del proyecto especifica `redis:7.4-alpine`. El bloqueo actual es la autorización de alcance. La disponibilidad del stack completo sigue sin probar. Para una próxima ejecución, el script histórico de laboratorio escribe con creación exclusiva en directorios de evidencia que ya existen y presupone imágenes y un proyecto antiguos. Usar destinos nuevos y un laboratorio independiente antes de ejecutar validaciones financieras.

Comandos de consulta desde la raíz de Primax-V2-Astra:

~~~powershell
git status --branch --untracked-files=all
git rev-parse --show-toplevel HEAD
git diff
git diff --cached
docker info --format '{{.OSType}}'
Get-Content -Encoding UTF8 Docs/astra/lot5-revision-recuperada.md
Get-Content .playwright-mcp/console-2026-11-20T14-13-26-088Z.log
~~~

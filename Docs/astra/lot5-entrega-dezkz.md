# Entrega a Dezkz · Auditoría final del Lote 5

**Dictamen del 20 de noviembre de 2026.** El cierre técnico de T02 y los recorridos financieros DEMO están validados. La aceptación integral queda abierta por la atribución de tres mensajes históricos de Playwright. Esta auditoría revisó contratos, resultados guardados y trazas, y volvió a consultar PostgreSQL en una transacción de solo lectura. Las cifras de Jest, FuelFlow y Chromium corresponden a la última ejecución de validación.

## Tres fallos históricos

| Mensaje | Clasificación del fallo original | Evidencia disponible y pieza indispensable |
|---|---|---|
| Unrelated authorization incorrectly replayed | **Pendiente por evidencia histórica insuficiente** | El candidato registra una continuación YAPE de S/ 20, operación `bc01f193-7549-4b79-9f01-cf519a180a78`, pago `e3a1d636-427e-4f14-b590-5bf336da939e`, orden `9f88760c-30d3-4060-bb4e-33d62e392e9e`, autorización `ebb41092-1ad9-4e63-9bfc-8a9cb08614e1` y terminal `3b0c9ed8-de96-4ac8-871a-5794c394643c`. Es un replay legítimo. Falta la aserción fallida con los IDs esperado y recibido, el fixture de las dos operaciones y la solicitud y respuesta del intento considerado ajeno. |
| Continuation cannot create order | **Pendiente por evidencia histórica insuficiente** | La consola de 28184 registra 400 en `/api/v1/online-orders` a +520539 ms. Hoy el contrato rechaza la creación con metadatos de continuación y la continuación legítima recupera la orden existente. Falta el paso original con su intención, método, payload, actor, respuesta JSON y resultado esperado. |
| Order guard status 403 | **Pendiente por evidencia histórica insuficiente** | La consola registra 403 en `/api/v1/online-orders` a +473083 y +487459 ms. Falta identificar cuál solicitud evaluaba la aserción, su operación, terminal, permisos, estado esperado y mensaje de respuesta de la guarda. |

Se buscaron las tres cadenas en el árbol local, incluidas cachés y archivos ignorados de trabajo; se excluyeron dependencias, perfiles de navegador y archivos de entorno de la búsqueda textual. Solo se localizaron menciones en cuatro informes retrospectivos. Se revisaron los nombres de artefactos de red y trazas, los 14 logs y 22 instantáneas YAML de Playwright, el historial alcanzable y los reflogs con `git log --all --reflog -G`, y el contenido de los 19 blobs sin referencia que enumeró `git fsck --no-reflogs --unreachable`. Falta el vínculo entre cada mensaje y el intercambio HTTP que lo disparó. Los datos disponibles tampoco permiten atribuirlos a permisos, colisión de fixtures o interpretación. [Petición candidata](evidence/lot5-captured-continuation/candidate/continuation-request.json) · [Replay candidato](evidence/lot5-captured-continuation/candidate/replay-confirmed.json) · [Consola original, líneas 28–32](../../.playwright-mcp/console-2026-11-20T14-13-26-088Z.log)

## Correcciones y pruebas de seguridad

- La continuación CAPTURED correlaciona operación, terminal, orden, pago y autorización persistidos. FuelFlow conserva la intención ante respuesta perdida. La ausencia del identificador local bloquea la creación de otro pago.
- La comprobación de titularidad protege avance, liberación, intervención, cancelación ordinaria, confirmación DEMO y reembolsos de orden o pago. Se conservan el ticket excepcional y la devolución legítima de una venta cerrada. La orden se relee bajo bloqueo antes de iniciar el reembolso para detectar un despacho ya iniciado.
- El contrato parametrizado de kiosco conserva el mismo `stationId`, cambia la terminal y después vincula el pago a otra operación. Para las tres acciones de autorización también sustituye `terminalOperationId` por una operación anterior. Comprueba el rechazo antes de llamar al doble de proveedor o efectuar la escritura simulada. Al restaurar la titularidad, exige una llamada de cada clase. Los cinco casos de `binds ordinary … to its operation before dispatch` figuran como aprobados en el resultado completo del laboratorio. Los contratos HTTP de reembolso comprueban 403 para la terminal ajena, y el de continuación rechaza una autorización preexistente sin vínculo válido. La cobertura negativa usa dobles. [Contrato de kiosco](../../Backend/src/kiosk/kiosk.spec.ts) · [Contratos HTTP](../../Backend/src/kiosk/kiosk-http.spec.ts) · [Resultados de los contratos](evidence/astra-l5-cierre-83446aa831/jest.json)
- Tras la devolución completa sin despacho, la terminal conserva la atención. La escalación autorizada verifica el pago y la orden, el evento de devolución, la reserva liberada y la ausencia de venta y autorización. Control puede entonces resolver la intervención con actor y motivo. El incidente requiere su propia revisión y resolución. Se comprobó que después T02 pudo realizar una nueva venta. [Cierre y procedimiento de Control](lot5-cierre-tecnico-validacion.md) · [Auditoría](evidence/astra-l5-cierre-83446aa831/auditoria.jsonl)

## Pruebas y conciliación

La última regresión aprobó **635/635 pruebas Jest en 62 suites** y **194/194 pruebas FuelFlow**. Una primera ejecución de Jest con las variables DEMO del servidor produjo cinco fallos de configuración en OCR y acceso. Con el entorno de pruebas, la suite completa pasó. Chromium ejercitó T01 y T02 con dos procesos backend, PostgreSQL y Redis aislados. Las trazas distinguen 404 de consultas iniciales, abortos inducidos para perder respuestas y 409 esperados. Las trazas finales de los recorridos aprobados registraron cero excepciones JavaScript de página. [Jest](evidence/astra-l5-cierre-83446aa831/jest.json) · [Primer intento](evidence/astra-l5-cierre-83446aa831/jest-entorno-demo.txt) · [FuelFlow](evidence/astra-l5-cierre-83446aa831/fuelflow.txt) · [Chromium](evidence/astra-l5-cierre-83446aa831/trace-29384-1795193002326.json)

| Consulta ejecutada en esta auditoría sobre `lot5cierre` | Filas | Claves distintas |
|---|---:|---:|
| Payment por operationId | 3 | 3 |
| FuelAuthorization por operationId | 2 | 2 |
| Transaction por operationId | 2 | 2 |
| PaymentEvent de tipo REFUNDED por paymentId | 2 | 2 |

En PostgreSQL, `BEGIN READ ONLY` y `current_setting('transaction_read_only') = 'on'` confirmaron el modo de lectura. Cada uno de los dos pagos devueltos por S/ 20 tenía un evento definitivo y S/ 20 de importe devuelto. El tercer pago por S/ 20 tenía cero eventos de devolución y cero soles devueltos. La orden de billetera tuvo una transición del proveedor DEMO. Los reintentos concurrentes de autorización y venta devolvieron sus respectivos IDs originales. Estas comprobaciones descartan duplicados en los escenarios ejecutados.

T01 conservó la venta reembolsada y el comprobante EB01-0001. La devolución previa al despacho en T02 dejó cero ventas, autorizaciones y comprobantes para esa operación. La venta posterior e independiente de T02 quedó pagada con EB01-0002. La cuarta atención fue una prueba vacía. Las cuatro quedaron cerradas. Para repetir la conciliación sin efectuar escrituras, ejecutar desde la raíz:

```powershell
Get-Content -Raw Docs/astra/evidence/astra-l5-cierre-83446aa831/operaciones.sql | docker exec -i astra-l5-cierre-83446aa831-pg psql -XAt -v ON_ERROR_STOP=1 -U postgres -d lot5cierre
```

[Filas y totales por operación](evidence/astra-l5-cierre-83446aa831/operaciones-finales.jsonl) · [Eventos por pago y transición DEMO](evidence/astra-l5-cierre-83446aa831/conciliacion-final.json) · [Distribución por réplica](evidence/astra-l5-cierre-83446aa831/replicas.txt)

## Git y contenido de la entrega

Rama `feat/dezkz-identity-a4-core`. HEAD `cec1cafc56f770597e786c9182a0fb82c3bfc7d4`. El inventario adjunto sigue la notación XY de Git: primera columna para el índice, segunda para el árbol y `??` para archivos sin seguimiento. Las 17 rutas con cambios de índice o árbol se distribuyen en **3 solo preparadas, 11 solo con diferencias sin preparar y 3 con ambas clases**. En total son seis preparadas y catorce con diferencias sin preparar.

- **Índice heredado.** Puerto de comandos y servicio de autorizaciones, continuación CAPTURED, DTO de creación, HTML y script principal de FuelFlow. La continuación, el DTO y el script principal tienen además cambios sin preparar. Una revisión limitada al índice omitiría parte de la corrección.
- **Árbol sin preparar.** Guardas de acceso y kiosco y sus pruebas, escalación de Control, órdenes y contratos de reembolso, lógica de continuación y recuperación en FuelFlow y pruebas de QR y transacciones. El inventario incluye todas las rutas.
- **Sin seguimiento.** La auditoría empezó con 93 archivos. Incluyen dos especificaciones de pruebas, herramientas de laboratorio, informes, resultados financieros y archivos históricos Stage 2B. Los nueve archivos históricos concuerdan con los SHA-256 del inventario de recuperación. Esta auditoría añade únicamente este informe y el inventario individual de Git, para un total de **95**. Se conservaron el índice y las evidencias. No hubo commit, push, merge ni despliegue. [Inventario de esta entrega](lot5-entrega-dezkz-git.txt)

## Decisión pendiente de Dezkz

1. Recuperar del ejecutor original del **20 de noviembre, candidato en el puerto 28184**, el script o transcripción Playwright que emitió las tres cadenas, con el fixture y los valores esperado y recibido de cada aserción. Si se usó Playwright MCP de forma interactiva, sirve la transcripción original de las llamadas y sus resultados.
2. Adjuntar la traza de **esa ejecución** (`trace.zip` si se guardó), o un HAR con cuerpos y un registro de aserciones correlacionables por hora o ID. Para el supuesto replay ajeno hacen falta ambas parejas terminal/operación, sus IDs de autorización y pago, la respuesta recibida y el campo `replayed`. Para los rechazos de orden se necesitan método, ruta, cuerpo, terminal, operación, permisos efectivos y respuesta JSON. Se pueden ocultar tokens, cookies, secretos y datos personales conservando identificadores técnicos consistentes. El nombre original del script y la existencia de un archivo de traza siguen sin determinar.
3. Contrastar esas aserciones con el contrato vigente, revisar juntos índice y árbol, y seleccionar expresamente código y pruebas de la entrega. Hasta documentar la causa de cada mensaje, permanece pendiente la aceptación integral.

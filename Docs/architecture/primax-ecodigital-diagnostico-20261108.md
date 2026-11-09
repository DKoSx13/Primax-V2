# Primax EcoDigital — diagnóstico previo a implementación

Fecha: 2026-11-08. Rama: `qa/feria-integration`. Alcance: inspección estática del código y del estado Git. No se modificó código de aplicación ni se ejecutó una migración, un despliegue, un commit o una impresión.

## Decisión

Detener esta ronda después del diagnóstico. La métrica solicitada es viable, pero no es seguro agregar solo una columna o contar clics: hay dos canales de impresión, un resultado físico incierto, recuperación de operaciones y un cierre de terminal independiente de la compra. Una implementación parcial podría presentar como operación sin solicitud de impresión una que sí envió un trabajo. La alternativa pequeña para la feria está descrita abajo y requiere implementación y validación coordinadas antes de activarse.

## Flujo observado

1. `FuelFlow/src/js/script.js` confirma primero la compra en Backend mediante `transactionsService.submit()`. `Transaction.operationId` es único; el comprobante académico se emite en PostgreSQL con `Receipt.transactionId` único y número inmutable. El resumen se pinta con el resultado de Backend.
2. **Imprimir y finalizar** deshabilita ambos botones y usa guardas en memoria. Reconsulta `GET /transactions/:id`, arma el recibo con el `Receipt.id` real (o el `Transaction.id` heredado), consulta `GET /jobs/receipt-<id>` y, si no existe o es `retryable`, envía `POST` a PrintAgent. Solo ante `accepted` llama a `finalizar()`.
3. **No imprimir y finalizar** llama directamente a `finalizar()`. Este cierra `POST /terminal/operations/:operationId/close`, borra el estado local de la compra y vuelve al inicio. Ninguno de los dos botones envía su elección a PostgreSQL.
4. Si PrintAgent falla o devuelve `unknown`, la pantalla conserva el ticket y permite reintentar o cerrar sin imprimir. `accepted` confirma la aceptación del trabajo, no la salida física. El servicio de impresión demo guarda JSON por trabajo en el volumen `print_data`, con `simulation: true` y `physicalConfirmed: false`; PrintAgent real guarda trabajos y `print-attempts.jsonl` en archivos locales. Esos almacenes no alimentan la base ni el dashboard.
5. Primax Control puede consultar el comprobante con `ADMIN_RECEIPT_VIEW` y pedir una copia al mismo PrintAgent después de cerrar la operación. No hay notificación al Backend de esa solicitud. El identificador estable del trabajo reduce duplicados por reintento, pero no equivale a un registro global de decisiones de impresión.

Referencias: `Frontend_1_FuelFlow/src/js/script.js` (`mostrarResumen`, `imprimirYFinalizar`, `finalizar`); `src/js/transactionsService.js`; `src/js/printReceipt.js`; `src/js/thermalReceipt.js`; `PrintAgent/store.mjs`; `PrintAgent/demo-server.mjs`; `Frontend_3_PrimaxControl/js/app.js` (`showReceipt`); `Backend/prisma/schema.prisma` (`Transaction`, `Receipt`).

## Asociación y permisos

La clave de correlación apropiada es `Transaction.id`, con `operationId`, `Receipt.id` y `Receipt.transactionId` comprobados en servidor. Nunca se debe confiar en un número de comprobante o un identificador remitido por el navegador sin resolverlo contra la transacción y la terminal. El cierre técnico ya comprueba que `TerminalOperation.operationId` pertenece a la credencial de esa terminal y valida la relación con autorización, transacción y estación (`OperationsService.closeOperation`).

La escritura desde FuelFlow debería usar una ruta `@TerminalOnly()` firmada por el gateway, la credencial técnica y el control CSRF existentes. No debe ampliarse la ruta genérica del kiosco para permitir escrituras ambientales sobre transacciones arbitrarias. Control debe reutilizar la sesión `access=control`, `ADMIN_DASHBOARD_VIEW` para un agregado sin datos personales, y el filtro de estaciones de `stationsFor`; una vista de transacción o de comprobante exige sus permisos actuales. Prime debe consultar únicamente transacciones de la membresía autenticada: `MembershipsRepository.transactions` ya filtra por `membershipId`, pero la lista está paginada y no sirve para calcular un total histórico en el navegador. La lectura individual `GET /transactions/:id` exige pertenencia del miembro y el gateway limita las consultas del kiosco a su estación.

## Casos que impiden contar clics como ahorro

| Situación | Estado que debe quedar | Razón |
| --- | --- | --- |
| Cierre sin tocar imprimir | Elección `NO_PRINT` conocida, solo tras cierre confirmado | Clic anterior al cierre no acredita operación finalizada. |
| Trabajo demo `accepted` y cierre | `PRINT_REQUESTED`, `simulation=true`; salida física no confirmada | Demo guarda un archivo, no imprime papel. |
| Fallo, timeout o `unknown` seguido de cerrar sin imprimir | Elección final `NO_PRINT`, pero con intento previo y elegibilidad EcoDigital falsa | El trabajo puede haber llegado al agente; no se puede inferir que no hubo impresión. |
| Doble clic o reintento | Una decisión final y una marca monotónica de intento por transacción | Guardas del navegador no cubren recarga, reinicio ni dos pestañas. |
| Recarga tras `accepted` antes de cerrar | Recuperar la misma transacción, trabajo y marca de intento; cierre idempotente | `localStorage` guarda compra y `operationId`, pero no la historia de impresión. |
| Operación anterior o cierre por Control | Elección `UNKNOWN` | Ausencia de fila no significa elección de no imprimir. |
| Copia posterior desde Control | Registrar solicitud posterior o excluir de toda afirmación de no uso de papel | El cierre histórico no prueba ausencia permanente de impresión. |

## Arquitectura mínima propuesta

1. Migración **aditiva**, sin tocar `Receipt` ni campos financieros: tabla `ReceiptPrintDecision` con `transactionId` único y FK restrictiva a `Transaction`, `operationId`, `receiptId`, `stationId`, `printRequestedAt` opcional, `closedAt` opcional, `finalChoice` (`PRINT`/`NO_PRINT`/desconocido), `printResult` (`ACCEPTED`/`UNKNOWN`/`RETRYABLE`/`DEMO`/desconocido) y marcas de solicitud posterior separadas. Definir restricciones para que una elección final solo exista con cierre y no pueda reemplazarse en un reintento contradictorio. No rellenar filas antiguas. La marca de intento debe ser monotónica.
2. Antes de consultar o enviar a PrintAgent desde FuelFlow, registrar de forma idempotente **intención de impresión** en Backend para la transacción y el comprobante actuales. Si esa escritura no puede confirmarse, conservar el ticket y no enviar el trabajo: de otro modo un cierre posterior podría atribuir falsamente la ruta sin impresión. Reintentar con el mismo `operationId` y `Receipt.id`.
3. El cierre recibe la elección final y guarda decisión y `TerminalOperation.closedAt` en una sola transacción serializable, después de las comprobaciones actuales. La ruta de cierre existente conserva su uso para otros callers; si llega sin elección, cerrar con `UNKNOWN`. Una falla de la función ambiental no debe retener una venta: si el cierre técnico se completa sin poder registrar elección, queda `UNKNOWN` y se muestra como tal. Revisar cuidadosamente que no haya escrituras ambientales separadas que sobrevivan a un cierre fallido como elección final.
4. Registrar desde Control cada solicitud posterior antes de enviar a PrintAgent, con `ADMIN_RECEIPT_VIEW` y estación autorizada. Si no se consigue registrar, no enviarla y conservar el acceso al comprobante digital. No intentar inferir salida física desde `accepted`. Mantener el identificador de trabajo existente.
5. Agregar a `GET /control/dashboard` un agregado filtrado por estaciones: denominador = operaciones cerradas con elección `PRINT` o `NO_PRINT`; numerador = cerradas con elección `NO_PRINT` **y sin intento previo registrado**. Mostrar por separado las operaciones que eligieron cerrar sin solicitar otra impresión tras un intento incierto, o excluirlas y explicar el criterio. Etiqueta sugerida: “Cierres sin solicitud de impresión en FuelFlow”; no “papel ahorrado”. Mostrar el período y la proporción, y cero/“sin datos” cuando el denominador sea cero. No sumar datos demo como impacto físico.
6. En Prime, usar la respuesta de `memberships/me/transactions` para dar acceso claro al número y detalle digital de cada consumo ya emitido; si se desea un contador histórico, añadir un agregado servidor filtrado por `membershipId`, con el mismo criterio conservador y sin incluir transacciones no asociadas a ese miembro. No emitir un segundo documento ni cambiar numeración.
7. En FuelFlow, conservar ambos botones, añadir una explicación breve y traducida (español, inglés, quechua) de que elegir el comprobante digital evita **solicitar una impresión en este terminal**. Evitar lenguaje de ahorro físico medido.

Una variante aún menor, si no se puede cubrir la solicitud posterior de Control, es medir solamente la **elección al cierre de FuelFlow** y rotularla exactamente así. En esa variante no se debe mostrar “sin papel”, “impresiones evitadas” ni un contador de ahorro; los intentos previos deben quedar excluidos del numerador.

## Validación requerida antes de activar la métrica

- Pruebas de servicio y HTTP: cierre sin impresión, demo `accepted`, fallo/`unknown` seguido de cierre, cierre fallido, duplicación, carreras y elección contradictoria, transacción/comprobante/terminal ajenos, operación antigua sin fila, recarga y cierre recuperado.
- Pruebas de permisos: cliente A no lee B; terminal A no escribe en B ni otra estación; Control sin `ADMIN_DASHBOARD_VIEW` o `ADMIN_RECEIPT_VIEW` recibe 403; el agregado de un encargado no incluye otra estación.
- Pruebas de no regresión: importes, pagos demo, reservas, saldos, inventario y numeración de comprobantes invariantes; mismo trabajo de impresión al reintentar.
- Prueba integrada en `primax-feria-check` únicamente tras revisar que Compose apunta a su PostgreSQL y volumen propios, que ninguna URL de migración es Neon/remota, y que el destino real de `DATABASE_URL_UNPOOLED` coincide con el laboratorio. Comparar conteos y decisiones antes y después de reiniciar solo servicios del laboratorio. No hacer seed ni reset de otras bases.

## Riesgos y pendientes

- PrintAgent y PostgreSQL no forman una transacción distribuida. La secuencia segura es registrar intención antes del envío y tratar toda incertidumbre como intento; jamás afirmar salida física ni ahorro de papel.
- Una impresora o ruta externa a estas interfaces no puede ser observada por este sistema. El indicador debe limitarse a solicitudes hechas en FuelFlow/Control.
- El comprobante digital completo existe en el Backend y Control; Prime actualmente muestra número y datos resumidos, pero no una vista completa del comprobante. Esa mejora requiere una presentación de solo lectura con datos ya emitidos.
- Falta revisión e implementación de la migración, pruebas, compilación y recorrido integrado. La rama sigue lista para una implementación controlada posterior; ninguna estadística EcoDigital puede presentarse como real todavía.

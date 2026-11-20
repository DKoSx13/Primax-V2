# Lote 5 · Reembolsos del 20 de noviembre de 2026

**Ambos recorridos de reembolso DEMO pasaron en Chromium, PostgreSQL y Redis.** En cada recorrido dos solicitudes legítimas simultáneas fueron a procesos Nest distintos. Un tercer intento consultó el resultado ya confirmado. PostgreSQL registró un único evento financiero final por pago.

| Recorrido | Resultado comprobado |
|---|---|
| T02, YAPE antes del despacho | La confirmación de captura se completó en el servidor y se cortó su respuesta al navegador. El reembolso devolvió tres veces la misma orden REFUNDED. El proveedor DEMO registró una transición de devolución. Pago de S/ 20 reembolsado por S/ 20, reserva CANCELLED, remanente cero, sin autorización, venta ni comprobante. |
| T01, tarjeta DEMO después de cerrar la venta | Antes del reembolso constaban operación CLOSED y pago CAPTURED. Las dos solicitudes simultáneas devolvieron el mismo pago, una con replay. El tercer intento también indicó replay. Pago y venta REFUNDED, importe reembolsado S/ 20, reserva CLOSED y comprobante original EB01-0001. El reembolso interno de tarjeta DEMO no invoca a un banco. |

Fuentes: [filas financieras enlazadas](evidence/lot5-reembolsos-b4ea3efca2e3/reembolsos.json), [consulta SQL](evidence/lot5-reembolsos-b4ea3efca2e3/correlacion.sql), [destinos por solicitud](evidence/lot5-reembolsos-b4ea3efca2e3/replicas.txt). Las trazas de navegador se guardaron en el mismo directorio.

## Cambios y autorización

- En `Backend/src/kiosk/kiosk.service.ts`, las dos rutas de reembolso reutilizan la credencial ordinaria de terminal. La decisión usa la operación original de PostgreSQL, incluso después de cerrar la venta o caducar el vínculo temporal en Redis. Se cotejan estación, terminal, orden y pago, y los vínculos de autorización y venta cuando existen. Un actor de kiosco no adquiere acceso a órdenes de miembro. El predicado también lo consume `AccessGuard` para rechazar el acceso solo por clave antigua.
- En `Backend/src/payments/online-orders.ts`, la admisión del reembolso relee la orden bajo bloqueo dentro de la transacción serializable y comprueba el consumo antes de marcar el reembolso o invocar al proveedor. El proveedor sigue recibiendo su clave idempotente por orden. El reembolso total de una orden con combustible despachado conserva su restricción.
- Contratos en `Backend/src/kiosk/kiosk-http.spec.ts`, `Backend/src/kiosk/terminal-recovery.spec.ts` y `Backend/src/payments/order-workflow.spec.ts`. Se usaron dobles para rechazar titularidad cruzada antes del proveedor y de escrituras financieras. Se verificó la vía legítima de atención cerrada y la limitación del ticket excepcional. Los dos contratos HTTP nuevos fallaron con el código anterior. La primera suite completa con la corrección pasó 624/624.
- El laboratorio nuevo `astra-refund-b4ea3efca2e3` comenzó con cero tablas públicas y cero claves Redis. Se aplicaron las 36 migraciones existentes exclusivamente a la base sintética `lot5refund`. Dos réplicas de la aplicación integrada comprobaron salud HTTP 200. El navegador usó los gateways de FuelFlow en loopback. Las solicitudes cruzadas se probaron con dobles.

## Evidencia histórica pendiente

En el directorio histórico de Playwright se conservan 14 logs y 22 instantáneas YAML. La copia candidata conserva fuentes, configuraciones y logs de construcción. En los artefactos localizados falta la aserción original con el ID esperado y la petición/respuesta asociada. Para `Unrelated authorization incorrectly replayed` queda acreditado el rechazo actual de referencias cruzadas en los contratos y el replay legítimo en SQL, sin atribución causal del mensaje histórico. Para `Continuation cannot create order` está acreditado el rechazo 400 del contrato de creación con metadatos de continuación. Para `Order guard status 403` hay más de una guarda capaz de emitirlo. Los detalles y evidencias del ciclo CAPTURED figuran en el [informe anterior](lot5-validacion-terminal-captured.md).

## Reanudación sin repetir escrituras

Desde la raíz de Primax-V2-Astra:

~~~powershell
git status --branch --untracked-files=all
git rev-parse HEAD
git diff -- Backend/src/payments/online-orders.ts Backend/src/payments/order-workflow.spec.ts
git diff --cached --stat
$lab = 'astra-refund-b4ea3efca2e3'
$ev = 'Docs/astra/evidence/lot5-reembolsos-b4ea3efca2e3'
docker ps -a --filter "name=$lab"
Get-Content -Raw "$ev/correlacion.sql" | docker exec -i "$lab-pg" psql -XAt -v ON_ERROR_STOP=1 -U postgres -d lot5refund
node --test Frontend_1_FuelFlow/tests/*.test.js
~~~

El runner exacto de esta ejecución está en `.cache/astra-refund-b4ea3efca2e3/refunds.cjs`. Exige una base de laboratorio vacía antes de comenzar los recorridos. Las credenciales de prueba permanecen en la caché privada. Las bases usan tmpfs. Al reiniciar Docker o detener sus contenedores se puede perder el estado volátil, por lo que la evidencia durable es la exportada en Docs/astra.

## Dictamen final

Los reembolsos solicitados están validados para los dos casos DEMO. Los totales de esta base son dos pagos por S/ 40, S/ 40 devueltos, dos eventos de reembolso financiero, una venta, una autorización y un comprobante. La suite final pasó **624 de 624 Jest en 61 suites y 194 de 194 pruebas FuelFlow**. Los contratos de titularidad usan persistencia y proveedor simulados. Los dos recorridos de Chromium usan PostgreSQL y Redis reales de laboratorio. [Jest](evidence/lot5-reembolsos-b4ea3efca2e3/jest.json) · [FuelFlow](evidence/lot5-reembolsos-b4ea3efca2e3/fuelflow.txt) · [Totales SQL](evidence/lot5-reembolsos-b4ea3efca2e3/totales.json)

La operación T02 quedó ACTIVE después del reembolso previo al despacho, con saldo reembolsado íntegro e inventario liberado. Se verificó por lectura de `OperationsService.closeOperation` que la guarda ordinaria deriva a intervención un pago REFUNDED sin autorización. En este escenario se probó la devolución financiera y se conservó la operación. No se ejecutó un cierre técnico de T02. La operación T01 sí se cerró por HTTP antes de solicitar su devolución.

El Lote 5 sigue abierto por la atribución histórica pendiente y el límite operativo descrito. La búsqueda en el historial Git alcanzable de pruebas/herramientas y en los artefactos de Playwright no recuperó las tres aserciones originales. La regresión CAPTURED se incluye en Jest. Los E2E dedicados a recuperación CAPTURED, concurrencia de ventas y ausencia de duplicados se conservan en el informe anterior.

Git final: rama `feat/dezkz-identity-a4-core`, HEAD `cec1cafc56f770597e786c9182a0fb82c3bfc7d4`, seis archivos preparados heredados, trece con diferencias sin preparar y 66 sin seguimiento. Los nueve archivos históricos coinciden con su SHA-256. Los diffs de índice y árbol pasaron `--check`. No hubo commit, push, merge ni cambios de Prisma o migraciones. Los servidores HTTP de este laboratorio quedaron detenidos. PostgreSQL y Redis continúan disponibles en la red privada, sin puertos publicados. [Estado final de los contenedores](evidence/lot5-reembolsos-b4ea3efca2e3/infraestructura.txt)

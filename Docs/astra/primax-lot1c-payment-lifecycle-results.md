# Astra — Lote 1C: fronteras del ciclo de pagos

## Inventario previo a implementación

Referencia b2df4fda3c004a515c991b31aa6d3c56f79980d4, rama
feat/dezkz-identity-a4-core. Índice y archivos versionados limpios; nueve originales
sin seguimiento conservados/excluidos; ancestros y existencia de volúmenes
históricos verificados. Se revisaron matriz 3I, plan 3J y fuentes operativas.

| Entrada real | Motor, seguridad, efectos y transacciones | Decisión |
|---|---|---|
| POST /api/v1/payments/:id/refund | PaymentLifecycleController → PaymentLifecycleService.refund; KioskOnly, UUID, POST default 201. Un db.atomic con FOR UPDATE Payment: CAPTURED DEMO EFECTIVO/TARJETA → REFUNDED; rechazo 409 de proveedor/estado o despacho sin venta, 404 ausente. Sin proveedor externo. Puede cancelar autorización sin venta, soltar welcomeReservedOperationId, marcar venta PAID → REFUNDED, compensar puntos con RewardMovement, incrementar refundedAmount y PaymentEvent refund:id. REFUNDED retorna replay sin efectos adicionales; no agrega liberación de inventario. | Consolidar unidad íntegra. |
| GET /api/v1/payments/:id/partial-refund | PartialRefundController → PartialRefundService.get; metadata admin, UUID, 200. db.atomic de inspección; exige PREPAGO externo CAPTURED con autorización/venta/operationId correlacionados, PARTIAL_REFUND_PENDING y reserva CLOSED/restante cero. Calcula excedente con Decimal; retorna paymentId, operationId, transactionId, amount, refundedAmount, transactionStatus, outcome. 404 ausente; 409 contexto/estado divergente. | Consolidar, conservar atomic de lectura. |
| POST /api/v1/payments/:id/partial-refund | PartialRefundService.report; metadata admin, DTO UUIDv4/eventId/outcome/importe/referencia, default 201. atomic + FOR UPDATE Payment. PENDING/AMBIGUOUS → CONFIRMED o REJECTED. CONFIRMED actualiza refundedAmount y venta PAYMENT_PENDING → PAID; REJECTED conserva pendiente. Registra eventos report/result; AMBIGUOUS no acredita devolución. Replay por eventId/detail; reutilización incompatible 409; resultado definitivo contrario 409; AMBIGUOUS tardío ignorado con evento conservado. No llama proveedor. | Consolidar unidad íntegra. |
| POST /api/v1/payments/webhook | PaymentWebhookController.receive: Public + secreto x-webhook-secret comparado en tiempo constante; DTO eventId/orderId/type. OnlineOrdersService.webhook verifica evento deduplicado, consulta status o confirmRefund al proveedor antes de registrar PaymentEvent en atomic. Evento no confirmado 400; colisión 409; secreto 401. El cuerpo por sí solo no prueba pago. | No consolidar: acoplado a reconciliación completa de órdenes/proveedor; validar callbacks junto a esa familia, sin rediseñarlos aquí. |
| POST /api/v1/online-orders; GET /api/v1/online-orders/:id; POST /:id/demo-confirm, /:id/cancel, /:id/reselect, /:id/refund | OnlineOrdersController/Service: MemberOrKiosk, actor y owns; status GET puede escribir/reconciliar. Intent SQL, llamada proveedor, confirmación SQL; no atomic global. Dedupe requestHash/operationId y claves de proveedor, locks OnlineOrder/Membership. Mantiene pagos, reservas, autorizaciones, wallet/deuda/welcome, eventos e incidentes. | Fuera de frontera de órdenes en este lote. |
| POST /api/v1/online-orders/:id/notify | Public + x-webhook-secret; controller llama status(id), no trata payload como confirmación. | Callback de órdenes excluido. |
| OnlineOrdersService.status, confirmRefund, webhook, refund, cancel, create, confirmDemo, reselect (llamadas internas) | status recupera CREATING por findByReference, consulta proveedor para PENDING, valida referencia/importe/PEN/paid_at; desconocido conserva REVIEW y PAYMENT_AMBIGUOUS. refund persiste REFUNDING antes de efecto, usa refund:orderId; confirmRefund comprueba refunded_at y aplica atomic original. Puede reabrir deuda y compensar wallet; no devolver combustible ya despachado. cancel requiere confirmación remota. | Sin reemplazar por HTTP ni nuevos puertos internos; motores íntegros. |
| PaymentsService.authorize; AuthorizationsService.create/release; TransactionsService.create | authorize valida medios/modo y demo; create PREPAGO maneja intento/resultado desconocido; release cero demo simula devolución y parcial delega cierre de venta; TransactionsService conserva prepago y pagos/stock/puntos/comprobante. Lotes 1/1B ya protegen estas unidades. | Reutilizar sin modificar, regresión obligatoria. |
| GET /api/v1/control/payments/:id; POST /:id/actions | ControlPaymentsService.detail/act; permisos ADMIN_INCIDENT_VIEW/MANAGE y estación. RETRY llama status; CANCEL llama cancel y cancelUnpaidOperation; ESCALATE registra incidente/audit; RESELECT autoriza elección posterior, no modifica directamente medio. | Recuperación operacional especial excluida; no cambiar actor ni coordinar nueva recuperación. |
| DemoWalletProvider.create/get/findByReference/confirm/cancel/refund; CulqiProvider.create/get; recordPaymentIssue; welcome helpers | Adaptadores de proveedor, registro de observación y reservas de beneficio. Demo SQL con perfil explícito; Culqi usa fetch/credenciales externas, no admite implementación refund/cancel en este adapter. Eventos e incidentes conservan incertidumbre; no son nuevos endpoints. | Sin modificar ni llamar a Culqi; pruebas sólo sintéticas. |

### Seguridad y dependencias que se preservan

AccessGuard mantiene KioskOnly para refund y admin para partial-refund. Su rama
firmada pasa por KioskService.authorize y kioskRoute: la allowlist excluye
partial-refund para kioscos, aunque AccessGuard delegue antes de la rama admin.
Para refund firmado sí comprueba estación del pago por autorización/venta.
Admin Bearer válido requiere SYSTEM_ADMIN o credencial admin configurada y no
aplica filtro de propietario/estación a las dos rutas partial-refund; no se inventa restricción
de propietario. Miembro ordinario no obtiene acceso administrativo. Cookie Control
y CSRF Control no se incorporan a rutas con metadata admin: se conserva contrato
actual. La llave legacy sólo aplica a refund KioskOnly, con limitación preexistente
de alcance fuera de modo académico; no gana acceso a partial-refund admin.

Redis interviene en firma/sesión/CSRF/límites de kiosco, no en los motores de
conciliación/refund. PostgreSQL sigue siendo único y cada atomic/lock original se
mantiene. No existe atomic distribuido con Redis/proveedor. Cualquier conducta
histórica de permisos o reservas se documenta, sin corregirla como refactorización.

## Resultados

Tres fronteras consolidadas, ninguna otra familia implementada:
controladores originales → PaymentWorkflowAdapter → PaymentWorkflow →
PaymentWorkflowPort → ExistingPaymentWorkflow → PaymentLifecycleService.refund
o PartialRefundService.get/report. Misma instancia de cada motor en PaymentsModule.
Una invocación por ejecución, sin retry/catch ni transformación de DTO/resultados.
Puerto y aplicación no dependen de NestJS/Prisma/HTTP. No se agregan reglas de dominio.
Los motores están en archivos que también contienen controladores: sólo cambian
importaciones y dependencias del controlador, no el texto de sus clases financieras.

### Inventario ampliado de entradas excluidas

No se declara consolidado el ciclo externo completo. Los siguientes contratos
siguen en su implementación original; este inventario no constituye autorización
para ejecutarlos contra proveedores:

| Entrada | Estado/actor y persistencia original | Incertidumbre/replay/errores |
|---|---|---|
| POST online-orders | MemberOrKiosk: miembro sólo deuda propia; kiosco sólo autorización PREPAGO. Intent CREATING en atomic (Payment PENDING, reserva PENDING_PAYMENT y welcome, o deuda con lock Membership), luego provider.create y actualización PENDING/QR. | operationId/requestHash, 409 colisión/cobro activo, 400 modo/medio/precio/importe S/6–7000, 401 actor, 404 deuda ajena. Timeout o respuesta divergente conserva intento, REVIEW/incidente, sin crear otro cargo automático. |
| GET online-orders/:id | owns: miembro sólo propia; kiosco no puede orden de usuario. CREATING sin providerId intenta findByReference; PENDING consulta provider.get. CAPTURED/REFUNDING/FAILED/CANCELLED/REFUNDED/CONVERTED retornan persistido. Confirmación paid usa lock OnlineOrder y atomic de Payment/orden/evento; deuda usa además lock Membership, wallet/debt y estado de venta. | Rechazo externo lleva FAILED o CANCELLED, Payment REJECTED/CANCELLED, reserva liberada y welcome liberado. Estado remoto desconocido/timeout conserva REVIEW/incidencias. 404 ausencia/actor ajeno; 409 referencias/importes/moneda; 503 si falta adapter de recuperación. No lectura pura. |
| POST online-orders/:id/demo-confirm | MemberOrKiosk + owns, perfil demo explícito/provider DemoWalletProvider. PENDING/CAPTURED y referencia demo; confirma importe/PEN, provider.confirm, luego status. | 409 importe/estado/proveedor incompatible; transición demo original deduplicada con lock de orden/evento. No confirma pagos comerciales. |
| POST online-orders/:id/reselect | Actor kiosco + proveedor demo; atomic lock OnlineOrder: PENDING, Payment PENDING, reserva PENDING_PAYMENT; sin autorización/venta/evento terminal. Cambia método/hash de orden/pago/reserva correlacionados. | 401 otro actor; 409 conflicto de estado/operationId/digest; preserva IDs y contexto, sin crear otro intento ni reserva. |
| POST online-orders/:id/cancel | MemberOrKiosk + owns; primero status. Sólo PENDING/providerId o replay CANCELLED. Llama provider.cancel(cancel:orderId), luego status y exige CANCELLED. | 409 estado/confirmación ausente; 503 proveedor sin cancel. No inventa rollback distribuido ni cancela por timeout. |
| POST online-orders/:id/refund | MemberOrKiosk + owns; primero status. CAPTURED/REFUNDING, no despacho; atomic persiste REFUNDING e intervención/REVIEW antes de provider.refund(refund:orderId); luego confirmRefund. | Replay REFUNDED. 409 estado/despacho, 503 adapter sin refund; incertidumbre conserva intento. confirmRefund exige referencia/PEN/importe/refunded_at; lock de orden y atomic conservan Payment, autorización/reserva/welcome o compensación de deuda/wallet y venta, eventos y puntos. |
| POST online-orders/:id/notify | Public + secreto técnico, llama status sin actor. No escribe por confiar en payload. | 401 secreto ausente/incorrecto; mismos errores y efectos de status. No hay replay/eventId propio en este controlador. |
| POST payments/webhook | Public + secreto y DTO. webhook primero dedupe eventId/detail; llama status o confirmRefund; exige estado esperado para PAID/FAILED/CANCELLED/REFUNDED antes de atomic de evento. | 400 proveedor no confirma; 409 colisión; 401 secreto. No una sola transacción con proveedor ni nuevo retry. |
| Control payments detail/actions | detail requiere VIEW+estación; act MANAGE y acción incluida por estado. RETRY → status, CANCEL → cancel/cancelUnpaidOperation, ESCALATE → recordPaymentIssue, RESELECT sólo mensaje. Auditoría atomic posterior, no atomic de toda coordinación. | 403 permiso/estación, 404 operación, 409 acción no segura. Cualquier consulta/proveedor previa conserva resultados y errores originales. |

Los helpers reserveWelcome y recordPaymentIssue siguen dentro de sus transacciones
llamantes: el primero reserva elegibilidad con updateMany, no consume beneficio;
el segundo upsert del incidente PAYMENT_AMBIGUOUS y observación audit append-only.
DemoWalletProvider almacena eventos demo, con locks/transiciones pending →
paid/cancelled → refunded sólo desde paid; findByReference puede recuperar intento
CREATING demo. CulqiProvider sólo implementa create/get y valida credenciales;
no soporta recuperación por referencia/refund/cancel en este adapter. Ninguno
fue modificado ni se usaron credenciales comerciales. Redis no es ledger financiero.

### Validación real y comparación

| Ejecución | Resultado | Evidencia privada bajo .cache/astra-lot1c-payments/ |
|---|---|---|
| Línea base offline | 124 Jest, 24 Gateway, 9 empaquetado; correctos | run-aafd4917d40f |
| Final offline | 128 Jest en 13 suites, 24 Gateway, 9 empaquetado; correctos | run-c145caf9d1b5 |
| Compilaciones | Identity, Catalog, Administration, Commerce y legacy: exit 0 | build-* del final offline |
| Pagos antes/después | 127 comprobaciones por brazo, 20 casos; snapshots/respuestas coincidentes | 6af67b1984c4 / e14a2ae16973 |
| Autorizaciones antes/después | 107 comprobaciones por brazo, 24 casos; coincidentes | c685814ba2b7 / ddad0e9fa51f |
| Ventas antes/después | 38 comprobaciones por brazo, 11 casos; coincidentes | ad95ca661edc / b4073b266a0c |

Los nombres abreviados de integración llevan prefijo primax-astra-lot1c-payments-.
Resumen saneado: Docs/astra/evidence/lot1c-payments/review-summary.json. Se usaron
los harnesses lot1c-payments-validation.cjs (--baseline y final) y
lot1c-payments-postgres-redis.cjs; las regresiones integradas reutilizan sin cambios
los scripts de Lote 1 y 1B. Se construyeron imágenes Commerce y Backend legacy con
Dockerfiles existentes, tags lot1c-payments; entrypoint y carga de módulo comprobados
sin red ni bootstrap operativo. No se ejecutó Compose operativo.

Se comprobaron solicitudes válidas/inválidas, Bearer administrativo real mediante
SYSTEM_ADMIN sintético, miembros sin permiso, token inválido/vencido, cookie Control
no aceptada, firma/CSRF inválidos y pago de estación ajena para refund firmado.
Kiosco y llave legacy no ganan acceso a partial-refund; no se atribuye aislamiento
por propietario a SYSTEM_ADMIN. DTO inválido y UUID inválido conservan rechazo.

Refund demo: CAPTURED → REFUNDED, replay, rechazo de pago PENDING y proveedor externo.
Conciliación parcial: PENDING → AMBIGUOUS → CONFIRMED o REJECTED; importes erróneos,
eventId reutilizado, trim de referencia, resultado definitivo contrario y observación
ambigua tardía. AMBIGUOUS conserva refundedAmount=0 y venta PAYMENT_PENDING; no
acredita pago ni devolución. Report/get preservan el contrato de serialización.

Cada comando se probó con dos solicitudes concurrentes: una respuesta inicial y
un replay, sin segundo efecto. Fallo test-only al final del callback atomic antes
del commit revierte tablas de negocio completas; retry explícito posterior funciona.
Respuesta perdida simulada después del retorno original (503) permite recuperar
refund/report por replay; get se repite sin escrituras. No se agregaron retries al
producto ni se simuló una devolución bancaria. Los motores se invocaron una vez por
solicitud que supera el guard/DTO; rechazos tempranos no los invocaron.

La comparación conserva importes Decimal, estados, hashes, relaciones, reservas,
movimientos, UUID sembrados y secuencias. Sólo correlaciona UUID generados por
tabla/identidad natural y excluye timestamps de ciclo de vida/metadatos de ejecución
de migraciones. El grantedAt del grant sintético se fija igual en ambos brazos.
Ganador concurrente se compara como multiconjunto, sin omitir sus efectos.
Normalización sólo de exportación, sin reescribir datos persistidos.

Pagos: 18 ventas/18 comprobantes por brazo; boleta_seq=19 (hueco original por
rollback), op01_seq=20, factura sin uso. Refund/conciliación no generan nuevos
comprobantes, consumen secuencias ni alteran movimientos de inventario físico.
Autorizaciones: 2 ventas/2 comprobantes, boleta_seq=2, op01_seq=24. Ventas:
9 ventas/9 comprobantes, boleta_seq=10, op01_seq=11. Snapshots completos coinciden.
El harness de pagos bloquea fetch y registra cero intentos HTTP externos.

### Aislamiento y diagnósticos preservados

Seis proyectos aceptados, cada uno con PostgreSQL 17.6 y Redis 7.4, red interna,
cero puertos publicados y dos volúmenes nuevos verificados vacíos. Se verificaron
destino, rol y base antes de las 36 migraciones existentes, sin seeds. No se
reutilizaron bases/volúmenes históricos. Se conservaron logs y todos los volúmenes
propios; contenedores de prueba detenidos. Los tres volúmenes históricos intactos
no fueron montados/arrancados. Compose y diagnósticos privados pueden contener
credenciales sintéticas efímeras: permanecen excluidos del commit.

Intentos diagnósticos no aceptados preservados: 943366672b9b (nombre local snapshot
duplicado en harness); e47e1fc902e9 (reason requerido del grant en fixture);
bdb3deca3e82 (HMAC GET debe firmar cuerpo null, no {}); 7cff6cdd93d1 (expectativa
incorrecta del harness sobre acceso kiosco a partial-refund); par
1c405359d1ea/c11a204ec9ed (casos correctos, comparación diferenciaba grantedAt del
grant sintético). Se corrigieron sólo fixtures/harness/documentación. No fueron
regresiones financieras; los motores nunca se ajustaron para satisfacer pruebas.

### Inventario de cambios

Tres archivos existentes: Backend/src/payments/payment-lifecycle.ts y
partial-refund.ts (inyección/delegación de controladores), payments.module.ts
(composición del puerto). Once archivos nuevos:

- Backend/services/commerce/src/application/ports/payment-workflow.ts
- Backend/services/commerce/src/application/use-cases/payment-workflow.ts
- Backend/services/commerce/src/adapters/inbound/payment-workflow.adapter.ts
- Backend/services/commerce/src/adapters/outbound/existing-payment-workflow.ts
- Backend/services/commerce/src/bootstrap/payment-workflow.providers.ts
- Backend/src/payments/payment-workflow.spec.ts
- Backend/test/payment-workflow.integration.cjs
- tools/astra/lot1c-payments-validation.cjs
- tools/astra/lot1c-payments-postgres-redis.cjs
- Docs/astra/primax-lot1c-payment-lifecycle-results.md
- Docs/astra/evidence/lot1c-payments/review-summary.json

### Dependencias, límites y siguiente familia

Persisten motores concretos/Prisma en adaptadores locales, AuthCore/KioskService,
PaymentsModule y unidades financieras compartidas. No se cambian cálculos, bloqueos,
propiedad, reservas ni secuencias. El refund simulado no añade liberación de stock:
se conserva su comportamiento original. La política legacy sin alcance por estación
no se corrige; callbacks/proveedor y coordinación de recuperación siguen pendientes.
No se acredita autonomía productiva, pagos externos reales, recuperación física,
frontend completo ni equivalencia universal. T01 y cierre A.4 permanecen intactos.

Lote 1C cierra sólo estas tres fronteras y los escenarios comprobados. Próxima
familia propuesta, con nueva autorización: workflow de órdenes agrupado (creación,
consulta con reconciliación, callbacks y transiciones/refund), preservando fases
SQL/proveedor y probando con proveedor sintético controlado. La limitación de
CulqiProvider para recuperación/refund/cancel requiere decisión explícita, no una
implementación financiera durante extracción hexagonal. No se inició esa familia.

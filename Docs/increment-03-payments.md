# Incremento 03 — Pagos V2

Spec: `Specs/05-payments-and-receipts.md` §§1–2 y `Specs/04-supervisor-assistance.md` §6. Rama independiente desde main 7cde52c: `feature/v2-03-payments`.

## Implementación y trazabilidad

| Requisito | Código | Tests | Resultado |
| --- | --- | --- | --- |
| YAPE/PLIN/TARJETA/SALDO_PRIME, efectivo solo histórico | `payments.service.ts`, DTO de autorización/transacción, `online-orders.ts`; FuelFlow index/script | `payments.service.spec.ts`, `v2-payments.e2e-spec.ts`, `payment-recovery.test.js` | DTO y servicios rechazan efectivo; registro histórico continúa legible |
| Reintento seguro, reselección e idempotencia | `online-orders.ts`, `paymentRecovery.js`, `script.js` | E2E PostgreSQL de confirmación concurrente y una sola captura; test de timeout y cierre perdido | Pago ambiguo conserva intento/stock; nuevo intento solo tras fallo definitivo y cierre confirmado |
| Incidencia ante rechazo/ambigüedad; sin edición financiera | `payment-incidents.ts`, `authorizations.service.ts` | E2E timeout/reintento sin segundo cargo y rechazo confirmado | Una incidencia por operación; observaciones adicionales auditadas |
| Supervisor consulta/reconcilia/reselecciona/cancela/escala con alcance | `operations/supervisor-payments.ts`, `Control/js/payment-recovery.js` | E2E de scope, cancelación controlada y rechazo de cancelación de capturados | Backend/proveedor conserva autoridad; sin endpoint para marcar pagado |
| No captura ficticia fuera de demo | `PaymentsService.authorize` usa `assertDemoWallet` para tarjeta | pruebas sandbox/production | Simulación denegada fuera de perfil local/academic + PAYMENT_ENV=demo + flag explícito |

## Hallazgos corregidos

La baseline autorizaba tarjeta como CAPTURED/DEMO sin verificar el perfil de demostración. Ahora exige el perfil demo; un proveedor comercial de tarjeta todavía no integrado no se sustituye con una captura ficticia. Además, `OnlineOrdersService.status` enviaba una orden normalmente pendiente a revisión de stock: se reconoce `pending` antes de tratar estados desconocidos. No se alteraron asserts de integridad financiera para ocultar fallos; el fixture unitario incorpora las nuevas lecturas de contexto para la auditoría.

No hay migraciones. El enum histórico PaymentMethod.EFECTIVO permanece y los reembolsos históricos mantienen compatibilidad. Se eliminó recepción/validación/vuelto simulados de FuelFlow. Las fixtures activas usan tarjeta; el test histórico crea EFECTIVO de forma explícita para verificar lectura retrocompatible.

## Validación

PostgreSQL 17 local en base aislada V2: 5 pruebas E2E nuevas (proveedor comercial explícitamente simulado en tests; demo real local en concurrencia/reselección). Backend Jest: 23 suites/192 pruebas. FuelFlow: 140 pruebas. Control: 16 pruebas. Builds de los tres componentes correctos. No se realizaron cobros reales ni llamadas de test a staging.

## Riesgos / pendientes

Tarjeta física comercial requiere su adapter; FuelFlow actual conserva demostración explícita, sin fingir confirmación externa. Reselección sobre una orden pendiente está implementada para DEMO; proveedor comercial sin adapter de cancelación/reselección se rechaza y requiere escalar. El Supervisor reintenta consultando el mismo proveedor, nunca genera una nueva transacción manual. La conexión con solicitudes de asistencia del PR anterior se valida en la rama de integración, sin merge automático a main. El SDLC y la matriz SDD por incremento continúan en los documentos individuales; SonarQube/staging corresponden a etapas posteriores.

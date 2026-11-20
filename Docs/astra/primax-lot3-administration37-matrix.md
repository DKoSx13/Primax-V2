# Administration — matriz definitiva de 37 contratos (Lote 3)

Referencia: `d1aa04072f3f71d72f9313e03066c3a663738f56`.

**37/37 H: siete fronteras anteriores y 30 consolidadas en Lote 3.**
La matriz registra evidencia ejecutada, dependencias legacy compartidas y ausencia
de bloqueos C o excepciones D pendientes. No declara autonomía productiva.

## Inventario previo de las 30 pendientes

Clasificación previa: 13 A (adaptación directa, incluido transporte logout),
17 B (compatibilidad con motor completo), 0 C, 0 D. Las letras A/B de este lote
no son las categorías históricas de 3H. El registro previo inmutable está en
[evidence/lot3-administration/classification.json](evidence/lot3-administration/classification.json).

| # | Contrato | Familia funcional | Clase previa |
|---:|---|---|:---:|
| 8 | GET /api/v1/control/transactions | administrative-transactions | A |
| 9 | GET /api/v1/control/session | account-access | A |
| 10 | GET /api/v1/control/accounts | account-administration | A |
| 11 | GET /api/v1/control/dashboard | administrative-supervision | A |
| 12 | GET /api/v1/control/incidents | administrative-supervision | A |
| 13 | GET /api/v1/control/incidents/:id | administrative-supervision | A |
| 14 | GET /api/v1/control/operations | operational-supervision | A |
| 15 | GET /api/v1/control/operations/:operationId | operational-supervision | A |
| 16 | GET /api/v1/control/terminals | operational-supervision | A |
| 17 | GET /api/v1/control/inventory | inventory-administration | A |
| 18 | GET /api/v1/control/inventory/movements | inventory-administration | A |
| 19 | GET /api/v1/control/audit | operational-supervision | A |
| 20 | GET /api/v1/control/inventory/:stationId/:fuelId/reconciliation | inventory-administration | B |
| 21 | GET /api/v1/inventory/:stationId/:fuelId/reconciliation | inventory-administration | B |
| 22 | POST /api/v1/control/access-requests | account-access | B |
| 23 | POST /api/v1/control/verify-email | account-access | B |
| 24 | POST /api/v1/control/resend-verification | account-access | B |
| 25 | POST /api/v1/control/login | account-access | B |
| 26 | POST /api/v1/control/logout | account-access | A |
| 27 | POST /api/v1/control/accounts | account-administration | B |
| 28 | POST /api/v1/control/accounts/:userId/approve | account-administration | B |
| 29 | POST /api/v1/control/accounts/:userId/access | account-administration | B |
| 30 | POST /api/v1/control/accounts/:userId/reject | account-administration | B |
| 31 | POST /api/v1/control/accounts/:userId/disable | account-administration | B |
| 32 | POST /api/v1/control/incidents/:id/status | administrative-supervision | B |
| 33 | POST /api/v1/control/terminals/:id/status | operational-supervision | B |
| 34 | POST /api/v1/control/inventory/receipts | inventory-administration | B |
| 35 | POST /api/v1/control/inventory/:stationId/:fuelId/reconcile | inventory-administration | B |
| 36 | POST /api/v1/inventory/:stationId/:fuelId/reconcile | inventory-administration | B |
| 37 | POST /api/v1/inventory/:stationId/:fuelId/activate | inventory-administration | B |

## Fronteras, motores y evidencia

Cada fila H posee puerto, caso de uso, adaptador de entrada, adaptador local y
composicion. Para cada familia nueva, los cinco archivos homonimos residen en
`Backend/services/administration/src/{application/ports,application/use-cases,adapters/inbound,adapters/outbound,bootstrap}`.
El adaptador local lleva prefijo `existing-`; entrada usa `.adapter.ts` y composicion
`.composition.ts`. Las siete anteriores conservan los modulos `administrative-lists`
y `administrative-details`. Todo motor conserva su autoridad original.

| # | Contrato | Estado | Puerto.metodo / adaptador local | Motor conservado | Pruebas y dependencias |
|---:|---|:---:|---|---|---|
| 1 | GET /api/v1/control/customers | H | AdministrativeListSource.customers / LegacyAdministrativeLists | ControlCustomersService / original 3G readers.customers | customers + Jest; PG/Core; Identity/Commerce read; sin C/D |
| 2 | GET /api/v1/control/memberships | H | AdministrativeListSource.memberships / LegacyAdministrativeLists | ControlCustomersService / original 3G readers.memberships | customers + Jest; PG/Core; Identity/Commerce read; sin C/D |
| 3 | GET /api/v1/control/vehicles | H | AdministrativeListSource.vehicles / LegacyAdministrativeLists | ControlCustomersService / original 3G readers.vehicles | customers + Jest; PG/Core; Identity/Commerce read; sin C/D |
| 4 | GET /api/v1/control/customers/:userId | H | AdministrativeDetailSource.customer / LegacyAdministrativeDetails | ControlCustomersService / original 3H readers.customer | customers + Jest; PG/Core; Identity/Commerce read; sin C/D |
| 5 | GET /api/v1/control/memberships/:membershipId | H | AdministrativeDetailSource.membership / LegacyAdministrativeDetails | ControlCustomersService / original 3H readers.membership | customers + Jest; PG/Core; Identity/Commerce read; sin C/D |
| 6 | GET /api/v1/control/transactions/:transactionId | H | AdministrativeDetailSource.transaction / LegacyAdministrativeDetails | ControlCustomersService / original 3H readers.transaction | customers + Jest; PG/Core; Identity/Commerce read; sin C/D |
| 7 | GET /api/v1/control/receipts/:transactionId | H | AdministrativeDetailSource.receipt / LegacyAdministrativeDetails | ControlCustomersService / original 3H readers.receipt | customers + Jest; PG/Core; Identity/Commerce read; sin C/D |
| 8 | GET /api/v1/control/transactions | H | AdministrativeTransactionsPort.transactions / ExistingAdministrativeTransactions | ControlCustomersService.transactions | customers + Jest; PG/Core; Identity/Commerce projections only; sin C/D |
| 9 | GET /api/v1/control/session | H | AccountAccessPort.session / ExistingAccountAccess | ControlService.session | access + Jest; PG/Core/JWT/RecoveryDelivery; sin C/D |
| 10 | GET /api/v1/control/accounts | H | AccountAdministrationPort.pending / ExistingAccountAdministration | ControlService.pending | accounts + Jest; PG/Core; User/authVersion/grants/assignments/audit; sin C/D |
| 11 | GET /api/v1/control/dashboard | H | AdministrativeSupervisionPort.dashboard / ExistingAdministrativeSupervision | ControlService.dashboard | supervision + Jest; PG/Core; Commerce projections/incidents/audit; sin C/D |
| 12 | GET /api/v1/control/incidents | H | AdministrativeSupervisionPort.incidents / ExistingAdministrativeSupervision | ControlService.incidents | supervision + Jest; PG/Core; Commerce projections/incidents/audit; sin C/D |
| 13 | GET /api/v1/control/incidents/:id | H | AdministrativeSupervisionPort.incident / ExistingAdministrativeSupervision | ControlService.incident | supervision + Jest; PG/Core; Commerce projections/incidents/audit; sin C/D |
| 14 | GET /api/v1/control/operations | H | OperationalSupervisionPort.operations / ExistingOperationalSupervision | ControlOperationsService.operations | operations + Jest; PG/Core; Commerce terminal/sales/audit; sin C/D |
| 15 | GET /api/v1/control/operations/:operationId | H | OperationalSupervisionPort.operationDetail / ExistingOperationalSupervision | ControlOperationsService.operationDetail | operations + Jest; PG/Core; Commerce terminal/sales/audit; sin C/D |
| 16 | GET /api/v1/control/terminals | H | OperationalSupervisionPort.terminals / ExistingOperationalSupervision | ControlOperationsService.terminals | operations + Jest; PG/Core; Commerce terminal/sales/audit; sin C/D |
| 17 | GET /api/v1/control/inventory | H | InventoryAdministrationPort.inventory / ExistingInventoryAdministration | ControlOperationsService.inventory | inventory + Jest; PG/Core; shared inventory/ledger/locks/audit; sin C/D |
| 18 | GET /api/v1/control/inventory/movements | H | InventoryAdministrationPort.movements / ExistingInventoryAdministration | ControlOperationsService.movements | inventory + Jest; PG/Core; shared inventory/ledger/locks/audit; sin C/D |
| 19 | GET /api/v1/control/audit | H | OperationalSupervisionPort.audit / ExistingOperationalSupervision | ControlOperationsService.audit | operations + Jest; PG/Core; Commerce terminal/sales/audit; sin C/D |
| 20 | GET /api/v1/control/inventory/:stationId/:fuelId/reconciliation | H | InventoryAdministrationPort.reconciliation / ExistingInventoryAdministration | ControlOperationsService.reconciliation | inventory + Jest; PG/Core; shared inventory/ledger/locks/audit; sin C/D |
| 21 | GET /api/v1/inventory/:stationId/:fuelId/reconciliation | H | InventoryReconciliationPort.inspect / ExistingInventoryReconciliation | InventoryReconciliationService.inspect | inventory + Jest; PG/Core; shared inventory/functions/atomic; sin C/D |
| 22 | POST /api/v1/control/access-requests | H | AccountAccessPort.requestAccess / ExistingAccountAccess | ControlService.requestAccess | access + Jest; PG/Core/JWT/RecoveryDelivery; sin C/D |
| 23 | POST /api/v1/control/verify-email | H | AccountAccessPort.verifyEmail / ExistingAccountAccess | ControlService.verifyEmail | access + Jest; PG/Core/JWT/RecoveryDelivery; sin C/D |
| 24 | POST /api/v1/control/resend-verification | H | AccountAccessPort.resendVerification / ExistingAccountAccess | ControlService.resendVerification | access + Jest; PG/Core/JWT/RecoveryDelivery; sin C/D |
| 25 | POST /api/v1/control/login | H | AccountAccessPort.login / ExistingAccountAccess | ControlService.login | access + Jest; PG/Core/JWT/RecoveryDelivery; sin C/D |
| 26 | POST /api/v1/control/logout | H | ControlSessionTransportPort.logout / ExistingControlSessionTransport | ControlController.logout original body | access + Jest; HTTP/Config; no SQL writer; sin C/D |
| 27 | POST /api/v1/control/accounts | H | AccountAdministrationPort.createAdministrativeAccount / ExistingAccountAdministration | ControlService.createAdministrativeAccount | accounts + Jest; PG/Core; User/authVersion/grants/assignments/audit; sin C/D |
| 28 | POST /api/v1/control/accounts/:userId/approve | H | AccountAdministrationPort.approve / ExistingAccountAdministration | ControlService.approve | accounts + Jest; PG/Core; User/authVersion/grants/assignments/audit; sin C/D |
| 29 | POST /api/v1/control/accounts/:userId/access | H | AccountAdministrationPort.approve / ExistingAccountAdministration | ControlService.approve | accounts + Jest; PG/Core; User/authVersion/grants/assignments/audit; sin C/D |
| 30 | POST /api/v1/control/accounts/:userId/reject | H | AccountAdministrationPort.setStatus / ExistingAccountAdministration | ControlService.setStatus | accounts + Jest; PG/Core; User/authVersion/grants/assignments/audit; sin C/D |
| 31 | POST /api/v1/control/accounts/:userId/disable | H | AccountAdministrationPort.setStatus / ExistingAccountAdministration | ControlService.setStatus | accounts + Jest; PG/Core; User/authVersion/grants/assignments/audit; sin C/D |
| 32 | POST /api/v1/control/incidents/:id/status | H | AdministrativeSupervisionPort.incidentStatus / ExistingAdministrativeSupervision | ControlService.incidentStatus | supervision + Jest; PG/Core; Commerce projections/incidents/audit; sin C/D |
| 33 | POST /api/v1/control/terminals/:id/status | H | OperationalSupervisionPort.terminalStatus / ExistingOperationalSupervision | ControlOperationsService.terminalStatus | operations + Jest; PG/Core; Commerce terminal/sales/audit; sin C/D |
| 34 | POST /api/v1/control/inventory/receipts | H | InventoryAdministrationPort.receiveInventory / ExistingInventoryAdministration | ControlOperationsService.receiveInventory | inventory + Jest; PG/Core; shared inventory/ledger/locks/audit; sin C/D |
| 35 | POST /api/v1/control/inventory/:stationId/:fuelId/reconcile | H | InventoryAdministrationPort.reconcile / ExistingInventoryAdministration | ControlOperationsService.reconcile | inventory + Jest; PG/Core; shared inventory/ledger/locks/audit; sin C/D |
| 36 | POST /api/v1/inventory/:stationId/:fuelId/reconcile | H | InventoryReconciliationPort.reconcile / ExistingInventoryReconciliation | InventoryReconciliationService.reconcile | inventory + Jest; PG/Core; shared inventory/functions/atomic; sin C/D |
| 37 | POST /api/v1/inventory/:stationId/:fuelId/activate | H | InventoryReconciliationPort.activate / ExistingInventoryReconciliation | InventoryReconciliationService.activate | inventory + Jest; PG/Core; shared inventory/functions/atomic; sin C/D |

## Condiciones y limites de cierre

Core = AuthCore/AccessGuard/Users/JWT; PG = Prisma/bootstrap y PostgreSQL unica.
Redis/KioskStore sigue compartido para sesiones tecnicas. No se transfieren
escrituras ni se divide ninguna unidad atomica mediante HTTP. AuthCore y
PasswordReset permanecen intactos. Los puertos no exponen HTTP ni TransactionClient.

Las familias funcionales son acceso/sesion (6), administracion de cuentas (6),
supervision administrativa (4), supervision operativa (5), inventario (8) y
listado de transacciones (1). Acceso tiene una composicion de transporte HTTP
para logout; inventario conserva dos composiciones para sus politicas distintas
Control y admin. Esto no crea etapas independientes por endpoint.

Las 30 operaciones estan consolidadas; ninguna excluida o bloqueada. Logout
solo borra la cookie original y terminal-status conserva su rechazo 409.
La conciliacion conserva fases atomic y auditoria fuera de ellas; no se afirma
una transaccion global que el motor no tiene. Los errores HTTP divergentes por
politica se preservan. No se crea CRUD de estaciones, clientes o vehiculos que
no exista en estos 37 contratos; catalog y operational-admin pertenecen a sus
servicios originales.

**Cierre tecnico academico del alcance de Administration**, con compatibilidad
legacy explicita. No certifica autonomia productiva ni Compose definitivo.
T01, TARJETA/OnlineOrder_method_check, x-kiosk-key, proveedores externos, A.4 y
dependencias compartidas mantienen sus observaciones preexistentes.

Informe: [Lote 3](primax-lot3-administration-results.md).
Evidencia: [resumen saneado](evidence/lot3-administration/review-summary.json).

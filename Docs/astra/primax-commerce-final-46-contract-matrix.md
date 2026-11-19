# Commerce — matriz final de 46 contratos tras Lote 1F

Referencia de comparación 1F: `5ba983d3242cf025ead1e1bd1d640d1e22fa4222`.
Numeración y rutas conservadas de la matriz 3I; no se agregan contratos.

H = frontera hexagonal implementada y validada en los casos indicados.
L = motor/repositorio legacy local de compatibilidad, admisible dentro del alcance
académico autorizado. H y L pueden coexistir: no se cuentan como dos rutas.
D = excepción técnica sin frontera. C = bloqueo pendiente para la frontera.
Las incidencias funcionales preexistentes se consignan aparte; H no las resuelve.

| # | Contract | Family | Original engine / repository | Authorization | H | L | D | C | Evidence family |
|---:|---|---|---|---|:---:|:---:|:---:|:---:|---|
| 1 | GET /api/v1/authorizations | AuthorizationReads | AuthorizationsService.pendingBefore | Kiosk original; signed scope/legacy limits | Si | Si | No | No | finance |
| 2 | POST /api/v1/authorizations | AuthorizationCommands | AuthorizationsService.create | Kiosk original; signed scope/legacy limits | Si | Si | No | No | authorizations |
| 3 | GET /api/v1/authorizations/:id | AuthorizationReads | AuthorizationsService.status | Kiosk original; signed scope/legacy limits | Si | Si | No | No | finance |
| 4 | POST /api/v1/authorizations/:id/intervention | AuthorizationCommands | AuthorizationsService.intervention | Kiosk original; signed scope/legacy limits | Si | Si | No | No | authorizations |
| 5 | POST /api/v1/authorizations/:id/progress | AuthorizationCommands | AuthorizationsService.progress | Kiosk original; signed scope/legacy limits | Si | Si | No | No | authorizations |
| 6 | POST /api/v1/authorizations/:id/release | AuthorizationCommands | AuthorizationsService.release | Kiosk original; signed scope/legacy limits | Si | Si | No | No | authorizations |
| 7 | GET /api/v1/control/assistance | AssistanceWorkflow | AssistanceService.list | Control VIEW/MANAGE + station/staff | Si | Si | No | No | assistance |
| 8 | GET /api/v1/control/assistance/:id | AssistanceWorkflow | AssistanceService.detail | Control VIEW/MANAGE + station/staff | Si | Si | No | No | assistance |
| 9 | POST /api/v1/control/assistance/:id/actions | AssistanceWorkflow | AssistanceService.act | Control VIEW/MANAGE + station/staff | Si | Si | No | No | assistance |
| 10 | GET /api/v1/control/payments/:id | ControlPaymentWorkflow | ControlPaymentsService.detail | Control VIEW/MANAGE + station | Si | Si | No | No | control-payments |
| 11 | POST /api/v1/control/payments/:id/actions | ControlPaymentWorkflow | ControlPaymentsService.act | Control VIEW/MANAGE + station | Si | Si | No | No | control-payments |
| 12 | POST /api/v1/control/terminal-operations/:id/cancel-unpaid | ControlOperationRecovery | OperationsService.cancelUnpaidOperation | Control + assigned original | Si | Si | No | No | recovery |
| 13 | POST /api/v1/control/terminal-operations/:id/recovery-ticket | ControlOperationRecovery | KioskService.issueRecoveryTicket | Control SUPER_ADMIN + grants + state | Si | Si | No | No | recovery |
| 14 | POST /api/v1/control/terminal-operations/:id/resolve | ControlOperationRecovery | OperationsService.resolveOperation | Control + assigned original | Si | Si | No | No | recovery |
| 15 | POST /api/v1/memberships/me/recharges | WalletOperations | WalletService.recharge | JWT member owner | Si | Si | No | No | finance |
| 16 | GET /api/v1/memberships/me/wallet | WalletOperations | WalletService.history | JWT member owner | Si | Si | No | No | finance |
| 17 | POST /api/v1/online-orders | OrderWorkflow | OnlineOrdersService.create | MemberOrKiosk + original scope | Si | Si | No | No | orders |
| 18 | GET /api/v1/online-orders/:id | OrderWorkflow | OnlineOrdersService.status | MemberOrKiosk + original scope | Si | Si | No | No | orders |
| 19 | POST /api/v1/online-orders/:id/cancel | OrderWorkflow | OnlineOrdersService.cancel | MemberOrKiosk + original scope | Si | Si | No | No | orders |
| 20 | POST /api/v1/online-orders/:id/demo-confirm | OrderWorkflow | OnlineOrdersService.confirmDemo | MemberOrKiosk + original scope | Si | Si | No | No | orders |
| 21 | POST /api/v1/online-orders/:id/notify | OrderWorkflow | OnlineOrdersService.status (notify) | Public + webhook secret | Si | Si | No | No | orders |
| 22 | POST /api/v1/online-orders/:id/refund | OrderWorkflow | OnlineOrdersService.refund | MemberOrKiosk + original scope | Si | Si | No | No | orders |
| 23 | POST /api/v1/online-orders/:id/reselect | OrderWorkflow | OnlineOrdersService.reselect | MemberOrKiosk + original scope | Si | Si | No | No | orders |
| 24 | POST /api/v1/operational-admin/permissions/admin | OperationalAdministration | OperationsService.grantAdmin | SYSTEM_ADMIN (original) | Si | Si | No | No | administration |
| 25 | POST /api/v1/operational-admin/permissions/admin/:id/revoke | OperationalAdministration | OperationsService.revokeAdminGrant | SYSTEM_ADMIN (original) | Si | Si | No | No | administration |
| 26 | POST /api/v1/operational-admin/pumps | OperationalAdministration | OperationsService.createPump | SYSTEM_ADMIN (original) | Si | Si | No | No | administration |
| 27 | POST /api/v1/operational-admin/terminal-pump-assignments/:id/end | OperationalAdministration | OperationsService.endTerminalAssignment | SYSTEM_ADMIN (original) | Si | Si | No | No | administration |
| 28 | POST /api/v1/operational-admin/terminals | OperationalAdministration | OperationsService.createTerminal | SYSTEM_ADMIN (original) | Si | Si | No | No | administration |
| 29 | POST /api/v1/operational-admin/terminals/:id/assign-pump | OperationalAdministration | OperationsService.assignTerminal | SYSTEM_ADMIN (original) | Si | Si | No | No | administration |
| 30 | POST /api/v1/operational-admin/terminals/:id/revoke | OperationalAdministration | OperationsService.revokeTerminal | SYSTEM_ADMIN (original) | Si | Si | No | No | administration |
| 31 | GET /api/v1/payments/:id/partial-refund | PaymentWorkflow | PartialRefundService.get | Admin original | Si | Si | No | No | payments |
| 32 | POST /api/v1/payments/:id/partial-refund | PaymentWorkflow | PartialRefundService.report | Admin original | Si | Si | No | No | payments |
| 33 | POST /api/v1/payments/:id/refund | PaymentWorkflow | PaymentLifecycleService.refund | Kiosk original; signed scope/legacy limits | Si | Si | No | No | payments |
| 34 | POST /api/v1/payments/webhook | OrderWorkflow | OnlineOrdersService.webhook | Public + webhook secret | Si | Si | No | No | orders |
| 35 | POST /api/v1/rewards/redeem | RewardRedemption | RewardsService.redeem | JWT member owner | Si | Si | No | No | finance |
| 36 | POST /api/v1/terminal/assistance | AssistanceWorkflow | AssistanceService.create | Terminal HMAC + scope | Si | Si | No | No | assistance |
| 37 | GET /api/v1/terminal/assistance/:id | AssistanceWorkflow | AssistanceService.terminalStatus | Terminal HMAC + scope | Si | Si | No | No | assistance |
| 38 | POST /api/v1/terminal/assistance/:id/cancel | AssistanceWorkflow | AssistanceService.cancel | Terminal HMAC + scope | Si | Si | No | No | assistance |
| 39 | POST /api/v1/terminal/claim | TerminalWorkflow | KioskService.claimTerminal | Terminal HMAC + owner/recovery scope | Si | Si | No | No | terminal |
| 40 | GET /api/v1/terminal/me | TerminalWorkflow | OperationsService.terminalMe | Terminal HMAC + owner/recovery scope | Si | Si | No | No | terminal |
| 41 | POST /api/v1/terminal/operations | TerminalWorkflow | OperationsService.startOperation | Terminal HMAC + owner/recovery scope | Si | Si | No | No | terminal |
| 42 | GET /api/v1/terminal/operations/:id | TerminalWorkflow | OperationsService.operation | Terminal HMAC + owner/recovery scope | Si | Si | No | No | terminal |
| 43 | POST /api/v1/terminal/operations/:id/close | TerminalWorkflow | OperationsService.closeOperation | Terminal HMAC + owner/recovery scope | Si | Si | No | No | terminal |
| 44 | GET /api/v1/terminal/operations/:id/recovery-state | TerminalWorkflow | OperationsService.recoveryState | Terminal HMAC + owner/recovery scope | Si | Si | No | No | terminal |
| 45 | POST /api/v1/transactions | CreateTransaction | TransactionsService.create | Kiosk original; signed scope/legacy limits | Si | Si | No | No | sale-regression |
| 46 | GET /api/v1/transactions/:id | ReadTransaction | TransactionsRepository.byId + transactionResponse | MemberOrKiosk + original scope | Si | Si | No | No | reads-regression |


La evidencia de cada familia incluye contratos HTTP, pruebas negativas y efectos
en SQL/Redis; los puertos nuevos tienen pruebas de aridad/identidad de argumentos,
resultado/error sin retries y aplicación independiente de framework. El manifiesto
de ejecuciones y hashes está en [review-summary.json](evidence/lot1f-operations/review-summary.json).
El detalle de escenarios/límites está en el [informe 1F](primax-lot1f-operational-closure-results.md).

**46/46 H, 46 adaptadores/motores locales L asociados, 0 D, 0 C de frontera.**
Los escritores y unidades transaccionales originales permanecen intactos.
No se excluyen rutas operacionales por su consumidor Control ni se trasladan
grants o inventario a otro servicio. Las dependencias compartidas son explícitas.

Observaciones abiertas que no se cuentan como funciones recuperadas:

- T01 mantiene su incidencia de recuperación funcional y estado histórico intacto.
- `x-kiosk-key` mantiene sus permisos legacy, incluido alcance no firmado de estación.
- TARJETA en reselect conserva 500/rollback por `OnlineOrder_method_check`.
- Capacidades comerciales de proveedores y firma nativa siguen sin acreditarse.
- AuthCore/PasswordReset/JWT/AccessGuard/KioskService, Prisma y bootstrap siguen compartidos.

El cierre es de la frontera académica de Commerce, dentro de la evidencia y
observaciones declaradas, sujeto a aceptación de 1F. No acredita autonomía
productiva, recuperación universal o cierre global de 3J. Compose integral,
frontends y validación por plataforma siguen en los Lotes 4–5.

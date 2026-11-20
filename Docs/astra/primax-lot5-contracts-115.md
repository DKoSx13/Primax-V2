# Lote 5 — matriz maestra de 115 contratos

Referencia: `9d57edea9bf047ac8e5d05833ec752bb82572591`. Elaborada al reanudar a partir del JSON guardado, las matrices aceptadas de Lotes 1–3 y el inventario estático Etapa 1. **115/115 asignadas: Identity 26, Catalog 6, Administration 37, Commerce 46.** Health es transversal y no se añade al denominador.

La tabla reúne ruta, familia/puerto, autorización, motor/escritor, unidad de consistencia y evidencia. Los paths exactos de puerto/adaptadores, decoradores y controlador están en [trazabilidad ampliada](evidence/lot5-validation/contracts-115-traceability.json); el [JSON original](evidence/lot5-validation/contracts-115.json) se conserva intacto. La autorización se transcribe como metadata; los guards, cuerpo original y configuración siguen siendo normativos. La etiqueta H acredita frontera con adaptador legacy, no pureza del motor ni autonomía productiva. Las referencias TX describen participación, no una única transacción global.

La evidencia funcional es por familia: [22 comparaciones](evidence/lot5-validation/paired-families.json), con checkpoints normales y negativos, estados SQL/Redis, replay, concurrencia y rollback según escenario. Los 115 enrutamientos se comprobaron por método/ruta y servicio; esto no equivale a 115 recorridos completos de UI. La auditoría vuelve a comparar los snapshots originales, sin repetir solicitudes ni cobros. T02 recuperación continúa fallida aunque las familias backend pasen.

| # | Servicio | Contrato | Familia / puerto | Autorización declarada | Motor / escritor original | Consistencia | Evidencia funcional |
|---:|---|---|---|---|---|---|---|
| 1 | identity | GET /api/v1/admin/alerts | AdminIdentityWorkflows / admin-identity-workflows.ts | admin | AlertsService.list | Consulta/efectos técnicos originales; sin TX financiera nueva | admin-ocr |
| 2 | identity | POST /api/v1/admin/alerts/:id/resolve | AdminIdentityWorkflows / admin-identity-workflows.ts | admin | AlertsService.resolve | Motor original; atomicidad no ampliada | admin-ocr |
| 3 | identity | POST /api/v1/admin/check-plate | AdminIdentityWorkflows / admin-identity-workflows.ts | kiosk | AlertsService.checkPlate | Motor original; atomicidad no ampliada | admin-ocr |
| 4 | identity | GET /api/v1/admin/dashboard | AdminIdentityWorkflows / admin-identity-workflows.ts | admin | AlertsService.dashboard | Consulta/efectos técnicos originales; sin TX financiera nueva | admin-ocr |
| 5 | identity | GET /api/v1/admin/demo-credentials | AdminAccessOperations / admin-access-operations.ts | public | AdminAccessEngine.demo (original extraído) | Consulta/efectos técnicos originales; sin TX financiera nueva | admin-ocr |
| 6 | identity | POST /api/v1/admin/login | AdminAccessOperations / admin-access-operations.ts | public | AdminAccessEngine.login (original extraído) | Motor original; atomicidad no ampliada | admin-ocr |
| 7 | identity | POST /api/v1/auth/forgot-password | IdentitySecurityOperations / identity-security-operations.ts | public | PasswordResetService.forgot | TX02 | security |
| 8 | identity | POST /api/v1/auth/login | IdentitySecurityOperations / identity-security-operations.ts | public | AuthService.login | Motor original; atomicidad no ampliada | security |
| 9 | identity | POST /api/v1/auth/register | IdentitySecurityOperations / identity-security-operations.ts | public | AuthService.register | TX01 | security |
| 10 | identity | POST /api/v1/auth/reset-password | IdentitySecurityOperations / identity-security-operations.ts | public | PasswordResetService.reset | TX02 | security |
| 11 | identity | POST /api/v1/auth/verify-reset-code | IdentitySecurityOperations / identity-security-operations.ts | public | PasswordResetService.verify | TX02 | security |
| 12 | identity | GET /api/v1/kiosk/session | KioskSessionOperations / kiosk-session-operations.ts | public | KioskService.status | TX04 (SQL/Redis separados) | kiosk |
| 13 | identity | POST /api/v1/kiosk/session/authorize | KioskSessionOperations / kiosk-session-operations.ts | public | KioskService.authorize | TX04 (SQL/Redis separados) | kiosk |
| 14 | identity | POST /api/v1/kiosk/session/login | KioskSessionOperations / kiosk-session-operations.ts | public | KioskService.login | TX04 (SQL/Redis separados) | kiosk |
| 15 | identity | POST /api/v1/kiosk/session/logout | KioskSessionOperations / kiosk-session-operations.ts | public | KioskService.logout | TX04 (SQL/Redis separados) | kiosk |
| 16 | identity | POST /api/v1/kiosk/session/terminal-bootstrap | KioskSessionOperations / kiosk-session-operations.ts | public | KioskService.bootstrapTerminal | TX04 (SQL/Redis separados) | kiosk |
| 17 | identity | POST /api/v1/kiosk/session/terminal-recovery | KioskSessionOperations / kiosk-session-operations.ts | public | KioskService.exchangeRecoveryTicket | TX04 (SQL/Redis separados) | kiosk |
| 18 | identity | GET /api/v1/memberships/me | MembershipReads / membership-reads.ts | default-member | LegacyMembershipReads / original repositories | Consulta/efectos técnicos originales; sin TX financiera nueva | profile |
| 19 | identity | PATCH /api/v1/memberships/me/profile | ProfileOperations / profile-operations.ts | default-member | MembershipsService.updateProfile | Motor original; atomicidad no ampliada | profile |
| 20 | identity | GET /api/v1/memberships/me/redemptions | MembershipReads / membership-reads.ts | default-member | LegacyMembershipReads / original repositories | Consulta/efectos técnicos originales; sin TX financiera nueva | profile |
| 21 | identity | GET /api/v1/memberships/me/rewards | MembershipReads / membership-reads.ts | default-member | LegacyMembershipReads / original repositories | Consulta/efectos técnicos originales; sin TX financiera nueva | profile |
| 22 | identity | GET /api/v1/memberships/me/transactions | MembershipReads / membership-reads.ts | default-member | LegacyMembershipReads / original repositories | Consulta/efectos técnicos originales; sin TX financiera nueva | profile |
| 23 | identity | POST /api/v1/plate-recognition | PlateRecognition / plate-recognition.ts | kiosk | RecognitionService.recognize | Motor original; atomicidad no ampliada | admin-ocr |
| 24 | identity | GET /api/v1/vehicles | ListVehicles / list-vehicles-query.ts | default-member | Existing vehicle readers / VehiclesRepository | Consulta/efectos técnicos originales; sin TX financiera nueva | profile |
| 25 | identity | POST /api/v1/vehicles | VehicleLinking / vehicle-linking.ts | default-member | VehiclesService.create | TX03 | profile |
| 26 | identity | GET /api/v1/vehicles/:plate | LookupVehicle / vehicle-lookup.ts | either | Existing vehicle readers / VehiclesRepository | Consulta/efectos técnicos originales; sin TX financiera nueva | profile |
| 27 | catalog | GET /api/v1/benefits | ListBenefits / list-benefits-query.ts | public | BenefitsRepository.list | Consulta/efectos técnicos originales; sin TX financiera nueva | catalog |
| 28 | catalog | GET /api/v1/control/catalog/inventory | ReadInventory / inventory-query.ts | control | FuelsRepository.inventory | Consulta/efectos técnicos originales; sin TX financiera nueva | catalog |
| 29 | catalog | GET /api/v1/control/catalog/stations | ListStations / list-stations-query.ts | control | StationsRepository.list | Consulta/efectos técnicos originales; sin TX financiera nueva | catalog |
| 30 | catalog | GET /api/v1/fuels | ListFuels / list-fuels-query.ts | public | FuelsRepository.list | Consulta/efectos técnicos originales; sin TX financiera nueva | catalog |
| 31 | catalog | GET /api/v1/fuels/inventory | ReadInventory / inventory-query.ts | public | FuelsRepository.inventory | Consulta/efectos técnicos originales; sin TX financiera nueva | catalog |
| 32 | catalog | GET /api/v1/stations | ListStations / list-stations-query.ts | public | StationsRepository.list | Consulta/efectos técnicos originales; sin TX financiera nueva | catalog |
| 33 | administration | GET /api/v1/control/customers | administrative-lists / AdministrativeListSource | control | ControlCustomersService / original 3G readers | Consulta/efectos técnicos originales; sin TX financiera nueva | customers |
| 34 | administration | GET /api/v1/control/memberships | administrative-lists / AdministrativeListSource | control | ControlCustomersService / original 3G readers | Consulta/efectos técnicos originales; sin TX financiera nueva | customers |
| 35 | administration | GET /api/v1/control/vehicles | administrative-lists / AdministrativeListSource | control | ControlCustomersService / original 3G readers | Consulta/efectos técnicos originales; sin TX financiera nueva | customers |
| 36 | administration | GET /api/v1/control/customers/:userId | administrative-details / AdministrativeDetailSource | control | ControlCustomersService / original 3H readers | Consulta/efectos técnicos originales; sin TX financiera nueva | customers |
| 37 | administration | GET /api/v1/control/memberships/:membershipId | administrative-details / AdministrativeDetailSource | control | ControlCustomersService / original 3H readers | Consulta/efectos técnicos originales; sin TX financiera nueva | customers |
| 38 | administration | GET /api/v1/control/transactions/:transactionId | administrative-details / AdministrativeDetailSource | control | ControlCustomersService / original 3H readers | Consulta/efectos técnicos originales; sin TX financiera nueva | customers |
| 39 | administration | GET /api/v1/control/receipts/:transactionId | administrative-details / AdministrativeDetailSource | control | ControlCustomersService / original 3H readers | Consulta/efectos técnicos originales; sin TX financiera nueva | customers |
| 40 | administration | GET /api/v1/control/transactions | administrative-transactions / AdministrativeTransactionsPort | control | ControlCustomersService | Consulta/efectos técnicos originales; sin TX financiera nueva | customers |
| 41 | administration | GET /api/v1/control/session | account-access / AccountAccessPort | control | ControlService | Consulta/efectos técnicos originales; sin TX financiera nueva | access |
| 42 | administration | GET /api/v1/control/accounts | account-administration / AccountAdministrationPort | control | ControlService | TX10 / transporte original | accounts |
| 43 | administration | GET /api/v1/control/dashboard | administrative-supervision / AdministrativeSupervisionPort | control | ControlService | Consulta/efectos técnicos originales; sin TX financiera nueva | supervision |
| 44 | administration | GET /api/v1/control/incidents | administrative-supervision / AdministrativeSupervisionPort | control | ControlService | Consulta/efectos técnicos originales; sin TX financiera nueva | supervision |
| 45 | administration | GET /api/v1/control/incidents/:id | administrative-supervision / AdministrativeSupervisionPort | control | ControlService | Consulta/efectos técnicos originales; sin TX financiera nueva | supervision |
| 46 | administration | GET /api/v1/control/operations | operational-supervision / OperationalSupervisionPort | control | ControlOperationsService | Consulta/efectos técnicos originales; sin TX financiera nueva | operations |
| 47 | administration | GET /api/v1/control/operations/:operationId | operational-supervision / OperationalSupervisionPort | control | ControlOperationsService | Consulta/efectos técnicos originales; sin TX financiera nueva | operations |
| 48 | administration | GET /api/v1/control/terminals | operational-supervision / OperationalSupervisionPort | control | ControlOperationsService | Consulta/efectos técnicos originales; sin TX financiera nueva | operations |
| 49 | administration | GET /api/v1/control/inventory | inventory-administration / InventoryAdministrationPort | control | ControlOperationsService | Consulta/efectos técnicos originales; sin TX financiera nueva | inventory |
| 50 | administration | GET /api/v1/control/inventory/movements | inventory-administration / InventoryAdministrationPort | control | ControlOperationsService | Consulta/efectos técnicos originales; sin TX financiera nueva | inventory |
| 51 | administration | GET /api/v1/control/audit | operational-supervision / OperationalSupervisionPort | control | ControlOperationsService | Consulta/efectos técnicos originales; sin TX financiera nueva | operations |
| 52 | administration | GET /api/v1/control/inventory/:stationId/:fuelId/reconciliation | inventory-administration / InventoryAdministrationPort | control | ControlOperationsService | Consulta/efectos técnicos originales; sin TX financiera nueva | inventory |
| 53 | administration | GET /api/v1/inventory/:stationId/:fuelId/reconciliation | inventory-reconciliation / InventoryReconciliationPort | admin | InventoryReconciliationService | Consulta/efectos técnicos originales; sin TX financiera nueva | inventory |
| 54 | administration | POST /api/v1/control/access-requests | account-access / AccountAccessPort | public | ControlService | TX10 / transporte original | access |
| 55 | administration | POST /api/v1/control/verify-email | account-access / AccountAccessPort | public | ControlService | Motor original; atomicidad no ampliada | access |
| 56 | administration | POST /api/v1/control/resend-verification | account-access / AccountAccessPort | public | ControlService | Motor original; atomicidad no ampliada | access |
| 57 | administration | POST /api/v1/control/login | account-access / AccountAccessPort | public | ControlService | TX10 / transporte original | access |
| 58 | administration | POST /api/v1/control/logout | control-session-transport / ControlSessionTransportPort | control | ControlController.logout original body | TX10 / transporte original | access |
| 59 | administration | POST /api/v1/control/accounts | account-administration / AccountAdministrationPort | control | ControlService | TX10 / transporte original | accounts |
| 60 | administration | POST /api/v1/control/accounts/:userId/approve | account-administration / AccountAdministrationPort | control | ControlService | TX10 / transporte original | accounts |
| 61 | administration | POST /api/v1/control/accounts/:userId/access | account-administration / AccountAdministrationPort | control | ControlService | TX10 / transporte original | accounts |
| 62 | administration | POST /api/v1/control/accounts/:userId/reject | account-administration / AccountAdministrationPort | control | ControlService | TX10 / transporte original | accounts |
| 63 | administration | POST /api/v1/control/accounts/:userId/disable | account-administration / AccountAdministrationPort | control | ControlService | TX10 / transporte original | accounts |
| 64 | administration | POST /api/v1/control/incidents/:id/status | administrative-supervision / AdministrativeSupervisionPort | control | ControlService | Motor original; atomicidad no ampliada | supervision |
| 65 | administration | POST /api/v1/control/terminals/:id/status | operational-supervision / OperationalSupervisionPort | control | ControlOperationsService | Motor original; atomicidad no ampliada | operations |
| 66 | administration | POST /api/v1/control/inventory/receipts | inventory-administration / InventoryAdministrationPort | control | ControlOperationsService | TX11 + TX13 | inventory |
| 67 | administration | POST /api/v1/control/inventory/:stationId/:fuelId/reconcile | inventory-administration / InventoryAdministrationPort | control | ControlOperationsService | TX11 + TX13 | inventory |
| 68 | administration | POST /api/v1/inventory/:stationId/:fuelId/reconcile | inventory-reconciliation / InventoryReconciliationPort | admin | InventoryReconciliationService | TX11 + TX13 | inventory |
| 69 | administration | POST /api/v1/inventory/:stationId/:fuelId/activate | inventory-reconciliation / InventoryReconciliationPort | admin | InventoryReconciliationService | TX11 + TX13 | inventory |
| 70 | commerce | GET /api/v1/authorizations | AuthorizationReads / authorization-reads.ts | kiosk | AuthorizationsService.pendingBefore | Consulta/efectos técnicos originales; sin TX financiera nueva | finance |
| 71 | commerce | POST /api/v1/authorizations | AuthorizationCommands / authorization-commands.ts | kiosk | AuthorizationsService.create | TX06 + TX13 | authorizations |
| 72 | commerce | GET /api/v1/authorizations/:id | AuthorizationReads / authorization-reads.ts | kiosk | AuthorizationsService.status | Consulta/efectos técnicos originales; sin TX financiera nueva | finance |
| 73 | commerce | POST /api/v1/authorizations/:id/intervention | AuthorizationCommands / authorization-commands.ts | kiosk | AuthorizationsService.intervention | TX06 + TX13 | authorizations |
| 74 | commerce | POST /api/v1/authorizations/:id/progress | AuthorizationCommands / authorization-commands.ts | kiosk | AuthorizationsService.progress | TX06 + TX13 | authorizations |
| 75 | commerce | POST /api/v1/authorizations/:id/release | AuthorizationCommands / authorization-commands.ts | kiosk | AuthorizationsService.release | TX06 + TX13 | authorizations |
| 76 | commerce | GET /api/v1/control/assistance | AssistanceWorkflow / assistance-workflow.ts | control | AssistanceService.list | TX12 (TX04 si ticket; TX13 si SQL trigger) | assistance |
| 77 | commerce | GET /api/v1/control/assistance/:id | AssistanceWorkflow / assistance-workflow.ts | control | AssistanceService.detail | TX12 (TX04 si ticket; TX13 si SQL trigger) | assistance |
| 78 | commerce | POST /api/v1/control/assistance/:id/actions | AssistanceWorkflow / assistance-workflow.ts | control | AssistanceService.act | TX12 (TX04 si ticket; TX13 si SQL trigger) | assistance |
| 79 | commerce | GET /api/v1/control/payments/:id | ControlPaymentWorkflow / control-payment-workflow.ts | control | ControlPaymentsService.detail | TX08; Control agrega auditoría/permisos | control-payments |
| 80 | commerce | POST /api/v1/control/payments/:id/actions | ControlPaymentWorkflow / control-payment-workflow.ts | control | ControlPaymentsService.act | TX08; Control agrega auditoría/permisos | control-payments |
| 81 | commerce | POST /api/v1/control/terminal-operations/:id/cancel-unpaid | ControlOperationRecovery / control-operation-recovery.ts | control | OperationsService.cancelUnpaidOperation | TX12 (TX04 si ticket; TX13 si SQL trigger) | recovery |
| 82 | commerce | POST /api/v1/control/terminal-operations/:id/recovery-ticket | ControlOperationRecovery / control-operation-recovery.ts | control | KioskService.issueRecoveryTicket | TX12 (TX04 si ticket; TX13 si SQL trigger) | recovery |
| 83 | commerce | POST /api/v1/control/terminal-operations/:id/resolve | ControlOperationRecovery / control-operation-recovery.ts | control | OperationsService.resolveOperation | TX12 (TX04 si ticket; TX13 si SQL trigger) | recovery |
| 84 | commerce | POST /api/v1/memberships/me/recharges | WalletOperations / wallet-operations.ts | default-member | WalletService.recharge | TX07 | finance |
| 85 | commerce | GET /api/v1/memberships/me/wallet | WalletOperations / wallet-operations.ts | default-member | WalletService.history | Consulta/efectos técnicos originales; sin TX financiera nueva | finance |
| 86 | commerce | POST /api/v1/online-orders | OrderWorkflow / order-workflow.ts | either | OnlineOrdersService.create | TX08; Control agrega auditoría/permisos | orders |
| 87 | commerce | GET /api/v1/online-orders/:id | OrderWorkflow / order-workflow.ts | either | OnlineOrdersService.status | TX08; Control agrega auditoría/permisos | orders |
| 88 | commerce | POST /api/v1/online-orders/:id/cancel | OrderWorkflow / order-workflow.ts | either | OnlineOrdersService.cancel | TX08; Control agrega auditoría/permisos | orders |
| 89 | commerce | POST /api/v1/online-orders/:id/demo-confirm | OrderWorkflow / order-workflow.ts | either | OnlineOrdersService.confirmDemo | TX08; Control agrega auditoría/permisos | orders |
| 90 | commerce | POST /api/v1/online-orders/:id/notify | OrderWorkflow / order-workflow.ts | public | OnlineOrdersService.status (notify) | TX08; Control agrega auditoría/permisos | orders |
| 91 | commerce | POST /api/v1/online-orders/:id/refund | OrderWorkflow / order-workflow.ts | either | OnlineOrdersService.refund | TX08; Control agrega auditoría/permisos | orders |
| 92 | commerce | POST /api/v1/online-orders/:id/reselect | OrderWorkflow / order-workflow.ts | either | OnlineOrdersService.reselect | TX08; Control agrega auditoría/permisos | orders |
| 93 | commerce | POST /api/v1/operational-admin/permissions/admin | OperationalAdministration / operational-administration.ts | admin | OperationsService.grantAdmin | TX12 (TX04 si ticket; TX13 si SQL trigger) | administration |
| 94 | commerce | POST /api/v1/operational-admin/permissions/admin/:id/revoke | OperationalAdministration / operational-administration.ts | admin | OperationsService.revokeAdminGrant | TX12 (TX04 si ticket; TX13 si SQL trigger) | administration |
| 95 | commerce | POST /api/v1/operational-admin/pumps | OperationalAdministration / operational-administration.ts | admin | OperationsService.createPump | TX12 (TX04 si ticket; TX13 si SQL trigger) | administration |
| 96 | commerce | POST /api/v1/operational-admin/terminal-pump-assignments/:id/end | OperationalAdministration / operational-administration.ts | admin | OperationsService.endTerminalAssignment | TX12 (TX04 si ticket; TX13 si SQL trigger) | administration |
| 97 | commerce | POST /api/v1/operational-admin/terminals | OperationalAdministration / operational-administration.ts | admin | OperationsService.createTerminal | TX12 (TX04 si ticket; TX13 si SQL trigger) | administration |
| 98 | commerce | POST /api/v1/operational-admin/terminals/:id/assign-pump | OperationalAdministration / operational-administration.ts | admin | OperationsService.assignTerminal | TX12 (TX04 si ticket; TX13 si SQL trigger) | administration |
| 99 | commerce | POST /api/v1/operational-admin/terminals/:id/revoke | OperationalAdministration / operational-administration.ts | admin | OperationsService.revokeTerminal | TX12 (TX04 si ticket; TX13 si SQL trigger) | administration |
| 100 | commerce | GET /api/v1/payments/:id/partial-refund | PaymentWorkflow / payment-workflow.ts | admin | PartialRefundService.get | TX08; Control agrega auditoría/permisos | payments |
| 101 | commerce | POST /api/v1/payments/:id/partial-refund | PaymentWorkflow / payment-workflow.ts | admin | PartialRefundService.report | TX08; Control agrega auditoría/permisos | payments |
| 102 | commerce | POST /api/v1/payments/:id/refund | PaymentWorkflow / payment-workflow.ts | kiosk | PaymentLifecycleService.refund | TX08; Control agrega auditoría/permisos | payments |
| 103 | commerce | POST /api/v1/payments/webhook | OrderWorkflow / order-workflow.ts | public | OnlineOrdersService.webhook | TX08; Control agrega auditoría/permisos | orders |
| 104 | commerce | POST /api/v1/rewards/redeem | RewardRedemption / reward-redemption.ts | default-member | RewardsService.redeem | TX09 | finance |
| 105 | commerce | POST /api/v1/terminal/assistance | AssistanceWorkflow / assistance-workflow.ts | terminal | AssistanceService.create | TX12 (TX04 si ticket; TX13 si SQL trigger) | assistance |
| 106 | commerce | GET /api/v1/terminal/assistance/:id | AssistanceWorkflow / assistance-workflow.ts | terminal | AssistanceService.terminalStatus | TX12 (TX04 si ticket; TX13 si SQL trigger) | assistance |
| 107 | commerce | POST /api/v1/terminal/assistance/:id/cancel | AssistanceWorkflow / assistance-workflow.ts | terminal | AssistanceService.cancel | TX12 (TX04 si ticket; TX13 si SQL trigger) | assistance |
| 108 | commerce | POST /api/v1/terminal/claim | TerminalWorkflow / terminal-workflow.ts | terminal | KioskService.claimTerminal | TX12 (TX04 si ticket; TX13 si SQL trigger) | terminal |
| 109 | commerce | GET /api/v1/terminal/me | TerminalWorkflow / terminal-workflow.ts | terminal | OperationsService.terminalMe | TX12 (TX04 si ticket; TX13 si SQL trigger) | terminal |
| 110 | commerce | POST /api/v1/terminal/operations | TerminalWorkflow / terminal-workflow.ts | terminal | OperationsService.startOperation | TX12 (TX04 si ticket; TX13 si SQL trigger) | terminal |
| 111 | commerce | GET /api/v1/terminal/operations/:id | TerminalWorkflow / terminal-workflow.ts | terminal | OperationsService.operation | TX12 (TX04 si ticket; TX13 si SQL trigger) | terminal |
| 112 | commerce | POST /api/v1/terminal/operations/:id/close | TerminalWorkflow / terminal-workflow.ts | terminal | OperationsService.closeOperation | TX12 (TX04 si ticket; TX13 si SQL trigger) | terminal |
| 113 | commerce | GET /api/v1/terminal/operations/:id/recovery-state | TerminalWorkflow / terminal-workflow.ts | terminal | OperationsService.recoveryState | TX12 (TX04 si ticket; TX13 si SQL trigger) | terminal |
| 114 | commerce | POST /api/v1/transactions | CreateTransaction / transaction-creation.ts | kiosk | TransactionsService.create | TX05 + TX06 + TX13 | sale-regression |
| 115 | commerce | GET /api/v1/transactions/:id | ReadTransaction / transaction-read.ts | either | TransactionsRepository.byId + transactionResponse | Consulta/efectos técnicos originales; sin TX financiera nueva | reads-regression |

## Familias efectivamente reejecutadas antes de reanudar

| Runner | Familia | Checkpoints por brazo | Pareados | Dictamen de snapshot |
|---|---|---:|---:|---|
| administration | access | 36 | 72 | Coincide; reauditado sin reejecución |
| administration | accounts | 39 | 78 | Coincide; reauditado sin reejecución |
| administration | supervision | 43 | 86 | Coincide; reauditado sin reejecución |
| administration | operations | 55 | 110 | Coincide; reauditado sin reejecución |
| administration | inventory | 61 | 122 | Coincide; reauditado sin reejecución |
| administration | customers | 90 | 180 | Coincide; reauditado sin reejecución |
| administration | profile | 42 | 84 | Coincide; reauditado sin reejecución |
| administration | security | 31 | 62 | Coincide; reauditado sin reejecución |
| administration | kiosk | 26 | 52 | Coincide; reauditado sin reejecución |
| administration | admin-ocr | 46 | 92 | Coincide; reauditado sin reejecución |
| administration | catalog | 29 | 58 | Coincide; reauditado sin reejecución |
| commerce | assistance | 65 | 130 | Coincide; reauditado sin reejecución |
| commerce | administration | 94 | 188 | Coincide; reauditado sin reejecución |
| commerce | terminal | 61 | 122 | Coincide; reauditado sin reejecución |
| commerce | recovery | 41 | 82 | Coincide; reauditado sin reejecución |
| commerce | control-payments | 36 | 72 | Coincide; reauditado sin reejecución |
| commerce | reads-regression | 13 | 26 | Coincide; reauditado sin reejecución |
| commerce | finance | 110 | 220 | Coincide; reauditado sin reejecución |
| commerce | orders | 95 | 190 | Coincide; reauditado sin reejecución |
| commerce | payments | 127 | 254 | Coincide; reauditado sin reejecución |
| commerce | authorizations | 107 | 214 | Coincide; reauditado sin reejecución |
| commerce | sale-regression | 38 | 76 | Coincide; reauditado sin reejecución |

La definición completa TX01–TX13 se conserva en [Etapa 1, §5](primax-stage1-contracts-responsibilities-and-equivalence.md). Las excepciones de seguridad, TARJETA, A.4 y T01 están en [incidencias](primax-lot5-known-incidents.md). No hay rutas nuevas ni comando duplicado introducido: las 1508 fuentes versionadas iniciales se conservan salvo la actualización documental 3J.

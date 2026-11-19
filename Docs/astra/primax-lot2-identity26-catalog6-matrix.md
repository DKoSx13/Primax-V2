# Identity 26 + Catalog 6 ? matriz vigente despu?s del Lote 2C

Referencia autorizada: `a72e787deb03facf29989eab64949aec5d339950`.
Los estados anteriores se conservan en Git y en los informes de Lotes 2 y 2B.
Estado vigente: **24 fronteras implementadas y validadas, dos excepciones t?cnicas
propuestas sin aceptar, ning?n contrato sin clasificaci?n ni bloqueo t?cnico nuevo**.
No se afirma cierre acad?mico incondicional ni autonom?a productiva.

H: frontera hexagonal comprobada, con adaptador local legacy expl?cito cuando
corresponde. El motor y su autoridad de escritura permanecen donde estaban.
D: implementaci?n t?cnica inline conservada y evaluada; sin frontera ni aceptaci?n
nueva. Un HTTP correcto de una D no la convierte en H.

| Contrato p?blico | Estado | Familia | Motor/compatibilidad original | Evidencia 2C |
|---|:---:|---|---|---|
| GET /api/v1/admin/alerts | H | AdminIdentityWorkflows | AlertsService.list | lot2c-boundaries + admin-ocr |
| POST /api/v1/admin/alerts/:id/resolve | H | AdminIdentityWorkflows | AlertsService.resolve | lot2c-boundaries + admin-ocr |
| POST /api/v1/admin/check-plate | H | AdminIdentityWorkflows | AlertsService.checkPlate | lot2c-boundaries + admin-ocr |
| GET /api/v1/admin/dashboard | H | AdminIdentityWorkflows | AlertsService.dashboard | lot2c-boundaries + admin-ocr |
| GET /api/v1/admin/demo-credentials | D | Technical exception proposed | AdminController.demo (inline) | admin-ocr: comportamiento original + inspecci?n literal; sin frontera nueva |
| POST /api/v1/admin/login | D | Technical exception proposed | AdminController.login (inline) | admin-ocr: comportamiento original + inspecci?n literal; sin frontera nueva |
| POST /api/v1/auth/forgot-password | H | IdentitySecurityOperations | PasswordResetService.forgot | lot2c-boundaries + security |
| POST /api/v1/auth/login | H | IdentitySecurityOperations | AuthService.login | lot2c-boundaries + security |
| POST /api/v1/auth/register | H | IdentitySecurityOperations | AuthService.register | lot2c-boundaries + security |
| POST /api/v1/auth/reset-password | H | IdentitySecurityOperations | PasswordResetService.reset | lot2c-boundaries + security |
| POST /api/v1/auth/verify-reset-code | H | IdentitySecurityOperations | PasswordResetService.verify | lot2c-boundaries + security |
| GET /api/v1/kiosk/session | H | KioskSessionOperations | KioskService.status | lot2c-boundaries + kiosk |
| POST /api/v1/kiosk/session/authorize | H | KioskSessionOperations | KioskService.authorize | lot2c-boundaries + kiosk |
| POST /api/v1/kiosk/session/login | H | KioskSessionOperations | KioskService.login | lot2c-boundaries + kiosk |
| POST /api/v1/kiosk/session/logout | H | KioskSessionOperations | KioskService.logout | lot2c-boundaries + kiosk |
| POST /api/v1/kiosk/session/terminal-bootstrap | H | KioskSessionOperations | KioskService.bootstrapTerminal | lot2c-boundaries + kiosk |
| POST /api/v1/kiosk/session/terminal-recovery | H | KioskSessionOperations | KioskService.exchangeRecoveryTicket | lot2c-boundaries + kiosk |
| GET /api/v1/memberships/me | H | MembershipReads | LegacyMembershipReads / original repositories | profile |
| PATCH /api/v1/memberships/me/profile | H | ProfileOperations | MembershipsService.updateProfile | profile |
| GET /api/v1/memberships/me/redemptions | H | MembershipReads | LegacyMembershipReads / original repositories | profile |
| GET /api/v1/memberships/me/rewards | H | MembershipReads | LegacyMembershipReads / original repositories | profile |
| GET /api/v1/memberships/me/transactions | H | MembershipReads | LegacyMembershipReads / original repositories | profile |
| POST /api/v1/plate-recognition | H | PlateRecognition | RecognitionService.recognize | admin-ocr |
| GET /api/v1/vehicles | H | ListVehicles | Existing vehicle readers / VehiclesRepository | profile |
| POST /api/v1/vehicles | H | VehicleLinking | VehiclesService.create | profile |
| GET /api/v1/vehicles/:plate | H | LookupVehicle | Existing vehicle readers / VehiclesRepository | profile |

Los quince contratos antes bloqueados son las cinco filas IdentitySecurityOperations,
seis KioskSessionOperations y cuatro AdminIdentityWorkflows. Cada familia incorpora
caso de uso con m?todos expl?citos, puerto, adaptadores de entrada/salida y composici?n
en `Backend/services/identity/src/`. El controlador original valida y proyecta
los mismos datos; el adaptador local invoca una vez la instancia Nest existente.
No cambian AuthCore, PasswordReset, guards, JWT, CSRF, permisos ni transacciones.

Las dos D son t?cnicamente viables mediante una futura extracci?n literal de sus
bloques inline hacia un motor local inyectado. No existe un bloqueo de seguridad
nuevo ni TS2307 que impida esa opci?n. Esta autorizaci?n consolida quince operaciones
y eval?a separadamente estas dos: no se ampl?a a diecisiete ni se acepta la excepci?n
por inferencia. Sus m?todos y decoradores permanecen literalmente iguales. La decisi?n
finita pendiente es aceptar expresamente ambas excepciones justificadas o autorizar
su extracci?n conservadora, sin cambiar pol?ticas ni contratos.

| Lectura Catalog | Caso de uso | Persistencia original | Evidencia |
|---|---|---|---|
| GET /api/v1/benefits | ListBenefits | BenefitsRepository.list | catalog, 29 checks por brazo |
| GET /api/v1/control/catalog/inventory | ReadInventory | FuelsRepository.inventory | catalog |
| GET /api/v1/control/catalog/stations | ListStations | StationsRepository.list | catalog |
| GET /api/v1/fuels | ListFuels | FuelsRepository.list | catalog |
| GET /api/v1/fuels/inventory | ReadInventory | FuelsRepository.inventory | catalog |
| GET /api/v1/stations | ListStations | StationsRepository.list | catalog |

Catalog conserva **6/6 lecturas aceptadas acad?micamente**, sin reimplementaci?n.
La exposici?n p?blica de inventario incluye filas de estaciones/combustibles inactivos;
un Bearer en una ruta p?blica no activa el filtrado Control por estaci?n. Se conservan
estos l?mites, los repositorios originales y el lector HTTP alternativo con su evidencia
unitaria, sin certificar su despliegue. No se cambian pol?ticas de exposici?n.

Las dependencias AuthCore/Prisma/bootstrap, operaciones financieras compartidas,
T01, pol?tica legacy x-kiosk-key, TARJETA/OnlineOrder_method_check y proveedores
siguen documentadas. A.4 permanece cerrado. Los P0 globales de Compose definitivo
y portabilidad pertenecen a Lotes posteriores no iniciados.

Informe, l?mites y evaluaci?n de las dos excepciones:
[Lote 2C](primax-lot2c-identity-results.md).
Ejecuciones nuevas y trazabilidad: [resumen](evidence/lot2c-identity/review-summary.json).

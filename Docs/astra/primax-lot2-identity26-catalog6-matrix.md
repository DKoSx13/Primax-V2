# Identity 26 + Catalog 6 — matriz vigente del Lote 2D

Referencia: `efcbdc9bc7f68944f0c72c6bbff125f55793f4e4`.
Estado vigente: **26/26 fronteras Identity implementadas y validadas; 6/6 lecturas
Catalog aceptadas académicamente**. Sin excepciones inline pendientes de Identity.
H significa frontera comprobada que reutiliza el motor y la autoridad de escritura
originales. Los estados anteriores se conservan en Git y en los informes 2/2B/2C.
La aceptación académica de este alcance no declara autonomía productiva.

| Contrato público | Estado | Familia | Motor/compatibilidad original | Evidencia 2C/2D |
|---|:---:|---|---|---|
| GET /api/v1/admin/alerts | H | AdminIdentityWorkflows | AlertsService.list | lot2c-boundaries + admin-ocr |
| POST /api/v1/admin/alerts/:id/resolve | H | AdminIdentityWorkflows | AlertsService.resolve | lot2c-boundaries + admin-ocr |
| POST /api/v1/admin/check-plate | H | AdminIdentityWorkflows | AlertsService.checkPlate | lot2c-boundaries + admin-ocr |
| GET /api/v1/admin/dashboard | H | AdminIdentityWorkflows | AlertsService.dashboard | lot2c-boundaries + admin-ocr |
| GET /api/v1/admin/demo-credentials | H | AdminAccessOperations | AdminAccessEngine.demo (original extraído) | lot2d-boundaries + admin-ocr |
| POST /api/v1/admin/login | H | AdminAccessOperations | AdminAccessEngine.login (original extraído) | lot2d-boundaries + admin-ocr |
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


Las 24 fronteras anteriores conservan sus motores, composición y políticas. Las dos
restantes usan AdminAccessOperations: controlador existente → adaptador de entrada →
caso de uso → puerto explícito → adaptador local → AdminAccessEngine. Este motor
contiene literalmente los cuerpos y la comparación constante originales; reutiliza
ConfigService y el JwtService inyectado por AuthCore. No crea otro autenticador,
JwtService, Prisma ni escritor. Se conservan DTOs, errores, HTTP 201/401/400,
decoradores, permisos y throttle original.

La condición demo original exige APP_MODE=local y SHOW_DEMO_ADMIN_CREDENTIALS=true
exactos. Las pruebas rechazan divulgación y login demo en production/staging/test;
no se introduce una nueva habilitación productiva. El JWT administrativo técnico
mantiene sub=admin, role=admin, adminUser y 30 minutos; no se le atribuye revocación
por authVersion que el diseño original no proporciona. El guard conserva la
validación del usuario configurado y la revocación de cuentas con authVersion.

| Lectura Catalog | Caso de uso | Persistencia original | Evidencia |
|---|---|---|---|
| GET /api/v1/benefits | ListBenefits | BenefitsRepository.list | catalog, 29 checks por brazo |
| GET /api/v1/control/catalog/inventory | ReadInventory | FuelsRepository.inventory | catalog |
| GET /api/v1/control/catalog/stations | ListStations | StationsRepository.list | catalog |
| GET /api/v1/fuels | ListFuels | FuelsRepository.list | catalog |
| GET /api/v1/fuels/inventory | ReadInventory | FuelsRepository.inventory | catalog |
| GET /api/v1/stations | ListStations | StationsRepository.list | catalog |

Catalog conserva **6/6 lecturas aceptadas académicamente**, sin reimplementación.
La exposición pública de inventario incluye filas de estaciones/combustibles inactivos;
un Bearer en una ruta pública no activa el filtrado Control por estación. Se conservan
estos límites, los repositorios originales y el lector HTTP alternativo con su evidencia
unitaria, sin certificar su despliegue. No se cambian políticas de exposición.

Las dependencias AuthCore/Prisma/bootstrap, operaciones financieras compartidas,
T01, política legacy x-kiosk-key, TARJETA/OnlineOrder_method_check y proveedores
siguen documentadas. A.4 permanece cerrado. Los P0 globales de Compose definitivo
y portabilidad pertenecen a Lotes posteriores no iniciados.



## Evaluación vigente

Se cierra académicamente el alcance finito del Lote 2 (Identity 26 + Catalog 6):
fronteras, compatibilidad local, composición y empaquetado comprobados. No queda
pendiente aceptar las dos excepciones anteriores: ambas fueron implementadas.
Los P0 globales de Compose definitivo y portabilidad siguen fuera de este lote.
AuthCore, PasswordReset, Prisma/bootstrap, PostgreSQL/Redis compartidos, repositorios,
Alerts/OCR y operaciones financieras legacy siguen como dependencias explícitas.
T01, TARJETA/OnlineOrder_method_check, x-kiosk-key, proveedores externos y A.4
conservan sus observaciones sin reabrirse. No se inicia Administration ni Lotes 3–5.

Informe: [Lote 2D](primax-lot2d-identity-results.md).
Evidencia: [resumen saneado](evidence/lot2d-identity/review-summary.json).

# Lote 2 — matriz de 26 contratos Identity y seis lecturas Catalog

Referencia `868a74f4dd5aad41e5c1e73774979233d881cb59`.
H: frontera implementada y validada en el alcance indicado. C: frontera bloqueada
por la composición/empaquetado compartidos de AuthCore. D: excepción técnica
propuesta, pendiente de aceptación expresa. Una regresión HTTP de un C o D no
lo convierte en H. Los motores legacy se declaran sin mover sus escritores.

| Contract | State | Family / composition | Original engine / legacy | Evidence |
|---|:---:|---|---|---|
| GET /api/v1/admin/alerts | C | AdminIdentityWorkflows (blocked) | AlertsService.list | admin-ocr (regression only; no boundary) |
| POST /api/v1/admin/alerts/:id/resolve | C | AdminIdentityWorkflows (blocked) | AlertsService.resolve | admin-ocr (regression only; no boundary) |
| POST /api/v1/admin/check-plate | C | AdminIdentityWorkflows (blocked) | AlertsService.checkPlate | admin-ocr (regression only; no boundary) |
| GET /api/v1/admin/dashboard | C | AdminIdentityWorkflows (blocked) | AlertsService.dashboard | admin-ocr (regression only; no boundary) |
| GET /api/v1/admin/demo-credentials | D | Technical exception proposed | AdminController.demo (inline) | admin-ocr (regression only; no boundary) |
| POST /api/v1/admin/login | D | Technical exception proposed | AdminController.login (inline) | admin-ocr (regression only; no boundary) |
| POST /api/v1/auth/forgot-password | C | IdentitySecurityOperations (blocked) | PasswordResetService.forgot | security (regression only; no boundary) |
| POST /api/v1/auth/login | C | IdentitySecurityOperations (blocked) | AuthService.login | security (regression only; no boundary) |
| POST /api/v1/auth/register | C | IdentitySecurityOperations (blocked) | AuthService.register | security (regression only; no boundary) |
| POST /api/v1/auth/reset-password | C | IdentitySecurityOperations (blocked) | PasswordResetService.reset | security (regression only; no boundary) |
| POST /api/v1/auth/verify-reset-code | C | IdentitySecurityOperations (blocked) | PasswordResetService.verify | security (regression only; no boundary) |
| GET /api/v1/kiosk/session | C | KioskSessionOperations (blocked) | KioskService.status | kiosk (regression only; no boundary) |
| POST /api/v1/kiosk/session/authorize | C | KioskSessionOperations (blocked) | KioskService.authorize | kiosk (regression only; no boundary) |
| POST /api/v1/kiosk/session/login | C | KioskSessionOperations (blocked) | KioskService.login | kiosk (regression only; no boundary) |
| POST /api/v1/kiosk/session/logout | C | KioskSessionOperations (blocked) | KioskService.logout | kiosk (regression only; no boundary) |
| POST /api/v1/kiosk/session/terminal-bootstrap | C | KioskSessionOperations (blocked) | KioskService.bootstrapTerminal | kiosk (regression only; no boundary) |
| POST /api/v1/kiosk/session/terminal-recovery | C | KioskSessionOperations (blocked) | KioskService.exchangeRecoveryTicket | kiosk (regression only; no boundary) |
| GET /api/v1/memberships/me | H | MembershipReads | LegacyMembershipReads / original repositories | profile |
| PATCH /api/v1/memberships/me/profile | H | ProfileOperations | MembershipsService.updateProfile | profile |
| GET /api/v1/memberships/me/redemptions | H | MembershipReads | LegacyMembershipReads / original repositories | profile |
| GET /api/v1/memberships/me/rewards | H | MembershipReads | LegacyMembershipReads / original repositories | profile |
| GET /api/v1/memberships/me/transactions | H | MembershipReads | LegacyMembershipReads / original repositories | profile |
| POST /api/v1/plate-recognition | H | PlateRecognition | RecognitionService.recognize | admin-ocr |
| GET /api/v1/vehicles | H | ListVehicles | Existing vehicle readers / VehiclesRepository | profile |
| POST /api/v1/vehicles | H | VehicleLinking | VehiclesService.create | profile |
| GET /api/v1/vehicles/:plate | H | LookupVehicle | Existing vehicle readers / VehiclesRepository | profile |


Resultado Identity: **9 H (seis previas y tres nuevas), 15 C, dos D propuestas**.
No se declara Identity completo. El P0 es resolver una única decisión finita de
composición/empaquetado para las tres familias compartidas y aceptar o resolver
las dos D; no se requieren veinte etapas ni un rediseño de seguridad.

Los C corresponden a cinco contratos de AuthController, seis de KioskController
y cuatro workflows de AdminController. Los tres controladores se importan desde
el mismo archivo que AuthCoreModule y forman parte del cierre transitivo de
compilación de los cuatro servicios. Sus imports nuevos hacia `services/identity`
no caben en los Dockerfiles actuales de los otros servicios. Se reprodujo TS2307
en una copia sin red/bases, manteniendo el repositorio intacto.

Las D son login administrativo y credenciales demo, implementados inline con
Config/JWT/bcrypt/flags actuales. Sus cuerpos y autorización permanecen idénticos.
No se trasladan a otro servicio ni se copian como un motor alternativo.

| Contract | Application query | Original persistence | Evidence |
|---|---|---|---|
| GET /api/v1/benefits | ListBenefits | BenefitsRepository.list | catalog |
| GET /api/v1/control/catalog/inventory | ReadInventory | FuelsRepository.inventory | catalog |
| GET /api/v1/control/catalog/stations | ListStations | StationsRepository.list | catalog |
| GET /api/v1/fuels | ListFuels | FuelsRepository.list | catalog |
| GET /api/v1/fuels/inventory | ReadInventory | FuelsRepository.inventory | catalog |
| GET /api/v1/stations | ListStations | StationsRepository.list | catalog |


Catalog: **6/6 contratos de lectura con frontera académica comprobada**, cuatro
consultas de aplicación existentes. No se reimplementan ni modifican. Se conserva
la exposición pública de inventario —incluidas filas de estaciones o combustibles
inactivos— y la diferencia entre un Bearer sobre ruta pública y una sesión Control
con permisos/estaciones. Es una limitación preexistente, no una autorización nueva
de exposición productiva. El lector HTTP alternativo conserva su evidencia
unitaria previa; no se acredita su despliegue paralelo.

Pruebas, límites, decisión P0 y recomendación de cierre en el
[informe](primax-lot2-identity-catalog-results.md). Ejecuciones y hashes en
[review-summary.json](evidence/lot2-identity/review-summary.json).
Compose integral, frontends, Administration y validación multiplataforma de los
Lotes 3–5 no se inician ni se acreditan aquí.

## Actualización Lote 2B — composición desbloqueada

El [informe 2B](primax-lot2b-identity-authcore-composition-results.md) y su
[evidencia](evidence/lot2b-composition/review-summary.json) sustituyen únicamente
el diagnóstico P0 de distribución de la entrega anterior. AuthCore queda separado
de la fachada HTTP y de su dependencia indirecta a AdminController, sin cambiar
políticas ni copiar Identity a otros procesos. Los quince C quedan técnicamente
desbloqueados por composición y pendientes de implementación/validación de sus
fronteras: cinco auth, seis kiosco y cuatro workflows admin Identity.

La matriz contractual conserva sus estados históricos: **9/26 implementados,
15 pendientes de consolidación y dos D propuestas sin aceptar**. No hay contratos
nuevos ni migraciones en 2B. Catalog permanece en seis lecturas aceptadas con sus
observaciones; no se declara cerrado Identity ni el Lote 2.

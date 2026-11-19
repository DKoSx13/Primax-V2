# Astra — Lote 2: fronteras Identity y aceptación académica Catalog

## Verificación y clasificación previa

Referencia `868a74f4dd5aad41e5c1e73774979233d881cb59`, rama
`feat/dezkz-identity-a4-core`. HEAD correcto, sin modificaciones versionadas ni
staging inicial. Se verificaron ancestros, manifiesto completo de 1F, fuentes
protegidas y SHA256 de las nueve evidencias históricas sin seguimiento. Se
conservan excluidas. Git fsck no muestra objetos corruptos/faltantes; sólo los
blobs dangling preexistentes. No se borran objetos, bases o volúmenes anteriores.

Las 26 rutas Identity y seis Catalog se contrastaron con el inventario de Etapa 1,
la matriz 3J y controladores actuales. Seis lecturas Identity ya tienen frontera.
De los veinte pendientes, tras verificar el empaquetado: A=1, B=2, C=15, D=2.
A permite delegación local sin cambio
de comportamiento; B preserva la unidad de motor/transaction y dependencias
compartidas; D propone excepción técnica explícita, pendiente de aceptación.

| Contract | Class | Original controller |
|---|:---:|---|
| GET /api/v1/admin/alerts | C | AdminController.list |
| POST /api/v1/admin/alerts/:id/resolve | C | AdminController.resolve |
| POST /api/v1/admin/check-plate | C | AdminController.check |
| GET /api/v1/admin/dashboard | C | AdminController.dashboard |
| GET /api/v1/admin/demo-credentials | D | AdminController.demo |
| POST /api/v1/admin/login | D | AdminController.login |
| POST /api/v1/auth/forgot-password | C | AuthController.forgot |
| POST /api/v1/auth/login | C | AuthController.login |
| POST /api/v1/auth/register | C | AuthController.register |
| POST /api/v1/auth/reset-password | C | AuthController.reset |
| POST /api/v1/auth/verify-reset-code | C | AuthController.verify |
| GET /api/v1/kiosk/session | C | KioskController.status |
| POST /api/v1/kiosk/session/authorize | C | KioskController.authorize |
| POST /api/v1/kiosk/session/login | C | KioskController.login |
| POST /api/v1/kiosk/session/logout | C | KioskController.logout |
| POST /api/v1/kiosk/session/terminal-bootstrap | C | KioskController.terminalBootstrap |
| POST /api/v1/kiosk/session/terminal-recovery | C | KioskController.terminalRecovery |
| GET /api/v1/memberships/me | EXISTING | MembershipsController.me |
| PATCH /api/v1/memberships/me/profile | B | MembershipsController.profile |
| GET /api/v1/memberships/me/redemptions | EXISTING | MembershipsController.redemptions |
| GET /api/v1/memberships/me/rewards | EXISTING | MembershipsController.rewards |
| GET /api/v1/memberships/me/transactions | EXISTING | MembershipsController.transactions |
| POST /api/v1/plate-recognition | A | RecognitionController.recognize |
| GET /api/v1/vehicles | EXISTING | VehiclesController.list |
| POST /api/v1/vehicles | B | VehiclesController.create |
| GET /api/v1/vehicles/:plate | EXISTING | VehiclesController.find |

Las dos D son GET `/api/v1/admin/demo-credentials` y POST `/api/v1/admin/login`:
la implementación técnica está en el propio controlador, usa Config/JWT/bcrypt y
flags demo existentes. No se copia ni desplaza esa lógica de seguridad para
fabricar un motor nuevo. Quedan legacy explícitas y con pruebas; no se suman como
fronteras implementadas ni como excepciones ya aceptadas por el responsable.

Las tres A/B son perfil, vínculo de vehículos y reconocimiento. Las quince C
agrupan cinco rutas de seguridad de cuenta, seis sesiones kiosco y cuatro
workflows admin de Identity. Inicialmente admitían delegación semántica al motor,
pero la inspección del empaquetado mostró una dependencia compartida que impide
integrarlas bajo las restricciones actuales. Se detuvo esa parte antes de editar
los controladores compartidos. No se modifica AuthCore para forzar el resultado.

### Bloqueo concreto y prueba aislada

`Backend/src/auth/auth.module.ts` contiene AuthCoreModule y AuthModule e importa
AuthController, AdminController y KioskController. Los cuatro entrypoints importan
AuthCoreModule; TypeScript sigue todos esos imports aunque AuthModule no se active
en los otros procesos. Los Dockerfiles independientes copian sólo `src` y las
fuentes hexagonales de su servicio. Un import de `services/identity/src` en esos
tres controladores exige copiar también Identity en Catalog/Administration/
Commerce, o separar la composición de AuthCore. Ambas alternativas requieren una
autorización que contradice los límites actuales si se aplica implícitamente.

`tools/astra/lot2-core-packaging-diagnostic.cjs` reproduce el problema sin editar
el repositorio, en contenedor sin red ni bases: una copia con el mismo alcance
COPY de Commerce compila (exit 0); añadir un import de tipo Identity al controlador
Auth compartido produce TS2307 (exit 1 esperado). Evidencia privada:
`.cache/astra-lot2-identity/core-packaging-147cf8e444d7/`. No se incorporó ese import
al producto ni se cambió ningún Dockerfile. No es una regresión del candidato
entregado, sino la prueba del bloqueo de las familias no implementadas.

Decisión P0 finita: autorizar separar la composición de controladores Identity del
archivo compartido AuthCore, manteniendo sus motores y guardas; o autorizar que
los otros tres Dockerfiles incluyan esas dependencias de Identity. Se recomienda
la separación explícita de composición. No se usan require dinámicos, flags
ocultos, nuevos escritores o copias de lógica para eludir la decisión.

## Composición autorizada

Controlador original → adaptador de entrada → caso de uso → puerto → adaptador
local → misma instancia del motor original. Las dependencias del motor continúan
inyectadas por NestJS como antes. Una factory local de composición bajo
`Backend/services/identity/src/bootstrap/` construye únicamente las capas de
delegación en el constructor del controlador, una vez por instancia. No construye
otro AuthService, PasswordResetService, KioskService, repositorio ni cliente SQL.

Así se mantiene byte a byte el módulo compartido AuthCore/AuthModule y los motores
de autenticación/recuperación, sin introducir providers globales ni otro escritor.
Los hooks de transporte, guards, DTO, throttling, proyecciones y motivos calculados
siguen en los controladores originales. Las llamadas internas permanecen internas.

Se incorporan `ProfileOperations`, `VehicleLinking` y `PlateRecognition`, cada
uno con puerto, caso de uso, adaptador de entrada, adaptador local al motor y
factory de composición. Son quince fuentes nuevas bajo
`Backend/services/identity/src/{application/ports,application/use-cases,adapters/inbound,adapters/outbound,bootstrap}`.
No se añaden reglas de dominio artificiales ni repositorios duplicados.

Sólo cambian tres fuentes de producto: `Backend/src/memberships/memberships.controller.ts`,
`Backend/src/vehicles/vehicles.controller.ts` y `recognition.controller.ts`.
Se mantiene la inyección del servicio original; el constructor compone wrappers
una vez y la ruta elegible delega en ellos. El resto de handlers permanece igual.
Los servicios, repositorios, DTO, mappers y unidades de transacción no cambian.

Pruebas nuevas: `Backend/src/identity-adapters/lot2-boundaries.spec.ts`,
`Backend/test/lot2-identity.fixture.ts`, `lot2-identity.integration.cjs` y cinco
escenarios en `Backend/test/lot2-scenarios/`. Herramientas nuevas:
`tools/astra/lot2-identity-validation.cjs`, `lot2-identity-postgres-redis.cjs` y
`lot2-core-packaging-diagnostic.cjs`. Documentación: este informe, matriz 26+6,
sección 14 de 3J y resumen saneado. Lista exacta y SHA256 en
`evidence/lot2-identity/review-summary.json`.

Perfil conserva actor propietario, limpieza de datos, incompatibilidad DNI/
pasaporte, atomic de actualización y lectura posterior original. Una respuesta
perdida después de commit no se convierte en rollback. El vínculo conserva
normalización de placa, propietario, alias y UUID de vehículo ya existente,
atomic Serializable, replay del mismo propietario y conflicto de propietario
ajeno; la concurrencia no crea otro vehículo. Las seis lecturas previas mantienen
sus casos de uso, filtros, paginación, serialización y dependencias financieras.

Reconocimiento conserva validación de imagen, flag de deshabilitación, contrato
HTTP del OCR, umbral, confianza, placa/código, alias y lookup kiosco originales.
Se prueba su motor con transporte OCR controlado, no el reconocimiento real de
imágenes. No se conecta un proveedor externo ni se añade otro servicio OCR.

## Evaluación de Catalog

Las seis rutas existentes llegan a cuatro casos de uso: ListFuels, ListStations,
ListBenefits y ReadInventory. Sus puertos/adaptadores/composición permanecen
idénticos. Las dos fachadas Control reutilizan las consultas originales con
ADMIN_INVENTORY_VIEW y scope por estación. Se conservan los repositorios Prisma
y el lector alternativo legacy configurable; no se reimplementan consultas.

Los 29 casos HTTP por brazo comprueban seis contratos, maestros activos,
DTO inválido, usuarios sin permiso, estación ajena, cookie Control, superadmin,
concurrencia de lectura y datos/secuencias sin cambios. La ruta pública de
inventario conserva exposición a todas las estaciones y filas inactivas; un
Bearer sobre esa ruta pública no activa scope Control. Se documenta como riesgo
preexistente; no se endurece la política ni se confunde con acceso administrativo.

Catalog **cumple el bloque hexagonal académico de seis lecturas**, dentro de la
evidencia indicada y su compatibilidad local. No acredita autonomía productiva,
despliegue del lector HTTP alternativo ni cierre Compose/multiplataforma. Esa
observación no requiere reescribir las cuatro consultas ya consolidadas.

## Validación, límites y cierre

| Validation | Before / after | Result |
|---|---|---|
| Jest | 191 / 197 | 0 failures |
| Gateway / packaging | 24 + 9 | 0 failures |
| Independent + legacy builds | 5 | exit 0 |
| Existing Dockerfiles | 5 images | offline module loading verified |
| HTTP profile | 42 / 42 | Exact canonical parity; f59c2ef436b0 |
| HTTP security | 31 / 31 | Exact canonical parity; 3339db447d35 |
| HTTP kiosk | 19 / 19 | Exact canonical parity; cb1e53e57791 |
| HTTP admin-ocr | 30 / 30 | Exact canonical parity; 570c3c7079a0 |
| HTTP catalog | 29 / 29 | Exact canonical parity; e6b5db05e5ab |


Son **151 comprobaciones HTTP por brazo, 302 en las diez ejecuciones aceptadas**.
Las regresiones de security, kiosk y admin se ejecutan contra sus motores
intactos: pasar esos casos no implementa ni desbloquea sus quince fronteras C.
En admin-ocr sólo reconocimiento tiene frontera nueva; login/demo siguen como D.

Las pruebas offline inicial/final son run-f638a1c7cf68 y run-3a8ff6427b60,
Node 22.21.1, sin red/bases. 191→197 pruebas Jest, 17→18 suites, cero fallos.
Gateway: 24; empaquetado: 9. Compilaciones de Identity, Catalog, Administration,
Commerce y legacy: exit 0. Las cinco imágenes se construyen con sus Dockerfiles
existentes y se cargan sus módulos sin red, bases ni bootstrap operativo.
Ningún archivo de otro microservicio o Dockerfile se modifica.

Cada brazo usa PostgreSQL 17.6 y Redis 7.4 nuevos, credenciales y namespace nuevos,
una red interna sin puertos publicados y dos volúmenes nuevos verificados vacíos.
Se valida host/base/rol antes de las migraciones existentes y Redis vacío. No hay
seed operativo ni montaje de volumen histórico. Los proyectos propios quedan
detenidos; se conservan volúmenes y diagnósticos, sin prune o down -v.

Se comparan respuestas, todas las tablas de negocio, relaciones, estados,
secuencias y claves/valores Redis. Los UUID sembrados permanecen literales; los
generados se correlacionan por tabla/clave natural. Las fechas de ciclo de vida
conservan null frente a fecha presente, normalizando sólo su valor de reloj.
Redis conserva valores, contadores y expiración positiva, sin exigir el mismo
segundo de TTL en dos ejecuciones distintas.

Los JWT se validan criptográficamente antes de comparar claims, sujeto, versión,
issuer/audience y duración; iat/exp absolutos se normalizan. Los hashes bcrypt se
verifican contra la contraseña sintética esperada antes de correlacionar su salt.
El HMAC del código de reset se verifica contra la entrega capturada y fila real.
Tokens de reset/sesión/CSRF y sus hashes se correlacionan, manteniendo vínculos,
uso y revocación. No se alteran datos para comparar ni se publican secretos.

La entrega de recuperación se simula en el límite RecoveryDelivery.send; el
PasswordResetService original realiza emisión, cooldown, intentos fallidos,
verificación, transacción, uso único y revocación por authVersion. Se prueban modo
disabled y permitido con entrega controlada; no se certifica SMTP real. El código
de PasswordReset, AuthCore y sus políticas permanece idéntico.

No aplica rollback financiero a consultas sin escritura. Se comprueban sus tablas
y secuencias; los efectos técnicos legítimos de sesión/kiosco se comparan por
separado. La composición de prueba usa AccessGuard y servicios reales; el
throttler global de bootstrap no se recrea y no se acredita su límite por IP.
Los decoradores y bootstrap de producto siguen intactos; Redis/cooldown reales
conservan los rechazos ejercitados. La recuperación kiosco válida completa no se
recertifica aquí; se cubren DTO/credenciales rechazadas y evidencia unitaria previa.

Las excepciones 503 de respuesta perdida se inyectan después del retorno del
motor y prueban reintento explícito; no son caída física ni recuperación universal.
La concurrencia cubre los casos listados, no todas las intercalaciones. Los
resultados no acreditan A.4, proveedores, OCR real, SMTP, frontends, Compose final
o portabilidad anfitriona macOS/Linux.

Diagnósticos conservados, excluidos de aprobados: fixture MembershipCodeAlias
inicial con un campo id inexistente; correlación inicial de UUID BusinessAlert;
fechas usedAt/verifiedAt del reset no normalizadas inicialmente; recuperación
negativa sin owner válido que correctamente devolvió 400. Se corrigieron sólo
fixtures/comparador. El TS2307 del diagnóstico AuthCore es un fallo esperado
aislado, distinto de las compilaciones aprobadas del candidato entregado.

Comandos reproducibles:

```text
node tools/astra/lot2-identity-validation.cjs --baseline
node tools/astra/lot2-identity-validation.cjs
node tools/astra/lot2-core-packaging-diagnostic.cjs
node tools/astra/lot2-identity-postgres-redis.cjs --family profile
node tools/astra/lot2-identity-postgres-redis.cjs --family admin-ocr
node tools/astra/lot2-identity-postgres-redis.cjs
```

## Recomendación formal de cierre

La matriz final asigna todas las rutas y evidencia, pero Identity queda en
**9/26 fronteras, 15 C y dos D propuestas**. No cumple todavía el cierre académico
completo. El P0 técnico es resolver la composición/empaquetado compartidos y
consolidar las quince fronteras sin cambiar motores; el P0 de decisión es aceptar
las dos D o autorizar su tratamiento explícito. No se presenta el funcionamiento
legacy validado como una frontera terminada ni se oculta el bloqueo en un módulo.

Se recomienda aceptar el incremento elegible y el bloque de lectura Catalog con
sus observaciones, **mantener abierto el cierre académico de Lote 2** y resolver
esa decisión finita antes de declararlo cerrado. No se inicia Administration o
Compose definitivo para resolverla indirectamente. El commit local contiene sólo
el incremento validado y la evidencia del bloqueo, sin regresiones nuevas.

Se preservan T01, la política legacy `x-kiosk-key`, TARJETA/
`OnlineOrder_method_check`, límites de proveedores y las dependencias compartidas
de AuthCore, PasswordReset, JWT, Prisma, bootstrap y Redis. No se activa ni reabre
Identity A.4; no se cambia authVersion ni su política de revocación. Las pruebas
del reset ejercen su comportamiento original sólo sobre cuentas sintéticas.

Las quince C deben desbloquearse y las dos D requieren aceptación expresa para
cerrar académicamente las 26 rutas; no se declara Identity completo por contar archivos,
módulos o pruebas. No se crean nuevas etapas de código por defecto para esa
decisión. Catalog se evalúa por sus seis contratos y políticas actuales, incluida
la exposición pública de inventario, sin endurecerlas dentro de este lote.

Sin push ni merge. Se detiene el trabajo en Lote 2: Administration y Compose
definitivo, Lotes 3–5, no iniciados.

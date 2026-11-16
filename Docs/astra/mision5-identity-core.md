# Misión 5 — núcleo de Identity, primera etapa

Estado actual: opción A de Misión 5.9 autorizada e implementada solo en laboratorio:
TLS verificado, credencial técnica exclusiva y nonces compartidos. Laboratorio 15/15;
regresiones enfocadas 83/83 y FuelFlow legado 28/28. Autoridad humana Control y
correlación durable intactas. V1, las 27 rutas, login y tráfico público conservados.
Autonomía completa pendiente. Véase `mision5-9a-transporte-laboratorio.md`.

Estado vigente: `services/identity` compila y se ejecuta fuera del Backend en
laboratorio, con fuentes, dependencias y clientes Prisma propios. Redis se recupera
sin reiniciar Identity. No hay tráfico independiente activado; la independencia
física de datos y el retiro de la compatibilidad operativa siguen pendientes.
Véase «Proyecto ejecutable y persistencia delimitada» al final; las etapas previas
se conservan como historial.

La etapa «Base propia y límite de separación» añade un experimento con una base
nueva de solo 14 tablas, sin procesos Backend ni puente legado. No demuestra
autonomía completa: emisión/recuperación técnica requiere un contrato operativo
aprobado antes de dividir la transacción existente. Propuesta:
`identity-data-contracts-proposal.md`; auditoría: `identity-data-fk-audit.md`.

Inicio autorizado: 13 noviembre 2026. Se revisaron `identity-next-mission.md`,
`mision4-consolidacion.md` y las implementaciones indicadas abajo antes de editar.
Catalog continúa desactivado; su validación técnica y la migración pendiente del
inventario público son trabajos separados. No se cambian Gateway ni despliegues.

## Propiedad y dependencias comprobadas

| Responsabilidad | Implementación/tablas actuales | Frontera de esta etapa |
| --- | --- | --- |
| Usuario, contraseña, estado y revocación | UsersService → UsersRepository → Prisma: User; DNI en Membership | Identity: Accounts, Passwords y Revocations. El incremento de authVersion debe ser atómico |
| Login y registro Prime | AuthService → UsersService, JwtService y bcryptjs. Registro crea User + Membership en una transacción, con MembershipNumberCounter | Login puro extraído, sin sustituir AuthService. Registro sigue en repositorio; no dividir su transacción |
| JWT y actor | AuthCoreModule configura HS256, primax-v6, primax-prime, 1 h; AccessGuard consulta usuario y grants en cada petición | Tokens y contrato Actor compartido por tipo; sin clave nueva, caché ni distribución de secretos |
| Roles y permisos Control | ControlService y AccessGuard → UserPermissionGrant, AdminControlAccount, AdminControlGrant, AdminStationAssignment y Station.active | Grants entrega solo permisos vigentes/asignaciones activas. SYSTEM_ADMIN es global; ADMIN/ENCARGADO requieren aprobación, correo verificado y ADMIN_CONTROL_ACCESS |
| Sesión Control | ControlService.login emite JWT 8 h; cookie primax_control/Bearer resuelto por AccessGuard | Se conserva emisión, transporte, cookie y CSRF existentes. El login del núcleo es Prime, no reemplaza login Control |
| Sesiones kiosk | KioskService → KioskStore → Redis local/REST; firma HMAC, versión de configuración, autenticación, CSRF y estación | Puerto Sessions y caso de uso sobre sesiones previamente verificadas, adaptador sintético. No sustituye verificación de firma ni KioskService |
| Credenciales técnicas | AccessGuard → TerminalCredential/Terminal; SHA256 del token opaco, vigencia/revocación/lifecycle | Actor terminal conservado. Persistencia y resolución de credenciales siguen en AuthCore; no equiparar terminal con Control |
| Recuperación técnica y vinculación de ventas | KioskService y AccessGuard → TerminalOperation, operaciones/autorizaciones/pagos; imports de operations/terminal-availability y empty-attention | La credencial pertenece a identidad; estado/cierre/propiedad de operación siguen del lado operativo. No extraer estas transacciones ni iniciar Commerce |
| Recuperación de contraseña | PasswordResetService → PasswordReset, User, cuentas/grants Control, RecoveryDelivery/SMTP | Puerto de entrega declarado. Flujo existente intacto: HMAC SHA256, hash SHA256 de token, bcrypt 12, consumo + incremento de authVersion en una transacción |
| Membresía y perfil | MembershipsRepository: Membership, User, Vehicle; número/alias, datos personales y vínculo User | Memberships devuelve perfil sin dinero. Registro, edición, alias y DTO HTTP siguen en fachada legada |
| Proyección financiera de membresía | Membership.balance, FuelAuthorization, MembershipDebt/pendingDebt, RewardMovement; historial Transaction, Redemption/Benefit | Puerto CommerceMemberships solo lectura; adaptador transitorio conserva cálculos de me. No hay comandos financieros en el núcleo |
| Vehículos y OCR | VehiclesRepository → Membership, Vehicle, MembershipCodeAlias; findByPlate incluye balance/debts; RecognitionService hace HTTP a OCR | Propiedad/vínculo del vehículo es Identity; Vehicles exige enlace atómico. VehicleRecognition es puerto reservado. OCR y enriquecimiento financiero siguen legados |

Gateway mantiene su orden real: wallet/recharges de membresías a Commerce,
auth/admin/kiosk/memberships/vehicles/plate-recognition a Identity, Control general
a Administration. Por tanto historial financiero de membresía sigue entrando por
Identity aunque su propiedad lógica sea Commerce. No se corrige cambiando tráfico.
OperationsModule de Commerce importa AuthCoreModule. El bootstrap compartido importa
Prisma, AuthCore, Alerts y Health para todos los procesos; mover solo el entrypoint
no produce independencia.

## Núcleo y adaptadores

`Backend/src/identity-core` contiene dominio, puertos y casos de uso sin NestJS,
Prisma, bcrypt, JWT, HTTP ni imports del resto del Backend. `MemoryIdentity` es un
adaptador para fixtures, jamás un fallback de producción. Compilación separada con
`tsconfig.identity-core.json`: lib ES2022, types vacío, sin decoradores. La herramienta
TypeScript se toma del Backend; todavía no existe un proyecto/package independiente.

Casos implementados: login por email/DNI; resolver miembro/Control; revocar todos
los JWT por versión; resolver/revocar sesión opaca ya verificada; exigir permiso y
estación; componer perfil y proyección financiera separados. Puertos adicionales
para enlace de vehículos, correo y reconocimiento definen límites, pero no se
afirma que sus flujos completos estén extraídos.

`identity-adapters/authcore.ts` conecta UsersService, bcryptjs compare, JwtService
configurado y Prisma para grants/revocación. Es composición optativa para pruebas
y migración futura; ningún módulo de producción la registra ni altera el login.
Se conserva el hash señuelo bcrypt 12 para usuarios inexistentes. No se implementa
otra criptografía ni se incorpora dependencia nueva.

`LegacyMembershipCommerce` sí es utilizado por MembershipsService.me: concentra
la proyección financiera detrás de CommerceMemberships y reutiliza las consultas
anteriores. Conserva el mismo snapshot balance de Membership, orden de consultas,
redondeo Decimal/toFixed(2), puntos nulos como cero y campos de respuesta. No añade
una transacción consistente que el contrato anterior no tenía. El SQL financiero
sigue en MembershipsRepository; este adaptador es una frontera transitoria local,
no un cliente remoto ni una extracción de Commerce. Historial/recompensas/redenciones
y enriquecimiento financiero de vehículos siguen pendientes de la misma separación.

## Contrato de actor y revocación v1

Actor conserva exactamente la unión existente: member(userId), admin(adminUser),
control(userId, role, permissions, stationIds, global), terminal(terminalId,
stationId, credentialId, recoveredOperationId opcional) y kiosk(stationId opcional).
`auth/access.ts` reexporta el tipo; el import es eliminado al compilar. Ningún cuerpo
HTTP cambia. El resultado interno del núcleo añade contractVersion=1, authVersion
y expiresAt (epoch segundos) fuera del actor; no se publica un endpoint nuevo.

Se verifica firma/algoritmo/emisor/audiencia/expiración en el adaptador JWT. El
núcleo conserva ver ausente como cero y la política actual de usuarios activos.
exp ausente sigue siendo compatible con el verificador anterior: no se impone
un requisito nuevo. Control vuelve a leer grants y estaciones; revocación de grant
surte efecto en la siguiente consulta. SYSTEM_ADMIN conserva la lista exacta del
AccessGuard, verificada por prueba de paridad, no todas las etiquetas futuras.

Autenticar Control sin estaciones sigue permitido como antes; autorizar lectura
con alcance requiere asignación o global. El helper requireControlPermission no
sustituye los guards de ruta existentes. Fallos de cuentas/grants/sesiones abortan;
no hay acceso permisivo, caché ni respuesta financiera fabricada durante una caída.

revokeAll incrementa authVersion de forma atómica y revoca TODOS los JWT del usuario,
no solo un dispositivo. No introduce jti, refresh tokens ni logout individual de JWT.
Las sesiones Redis se revocan eliminándolas; el puerto del núcleo usa expiración en
segundos y no está conectado al formato legado en milisegundos. Adaptarlo requiere
preservar firma, authenticated, versión, CSRF, namespace y comprobación de estación.
No llamar resolveVerifiedKioskSession directamente desde datos enviados por HTTP.

## Verificación reproducible

```bash
npm run test:identity-core --prefix Backend
npm run build --prefix Backend
npm test --prefix Backend -- --silent
node --test Backend/gateway/routes.test.cjs
node --test Frontend_1_FuelFlow/tests/admin-identity.test.js Frontend_1_FuelFlow/tests/terminal-identity.test.js
git diff --check
```

Pruebas nuevas: 12 de núcleo con memoria sintética y 14 de integración de componentes
(10 AuthCore/JWT/bcrypt + 4 fachada de membresías/Decimal). Se comparan AuthService y
AccessGuard reales con el núcleo en ambos sentidos: JWT compatible, token alterado,
expirado, issuer/audience/algoritmo incorrectos, incremento de versión, revocación de
grants, actor Control, SYSTEM_ADMIN y fallo de persistencia. La fachada se prueba
con cero, decimales fraccionarios, límite de saldo y caída de proyección.

La persistencia de las pruebas nuevas es sintética en memoria/dobles: **no certifica
Prisma/PostgreSQL/Redis por red ni HTTP completo de los procesos**. No se accede a
bases, contenedores o datos existentes. Las pruebas previas de misión 4 no se
presentan como evidencia nueva de esta extracción. Resultados finales al pie.

## Bloqueos para proyecto y despliegue independientes

1. Backend sigue siendo dueño del build, dependencias, bootstrap/health/configuración
   y adaptadores Prisma. Falta empaquetar el núcleo y componer un entrypoint propio;
   no se mueve ninguna carpeta a Backend/microservices en esta etapa.
2. User/Membership comparten transacciones de registro y tablas con dinero, bienvenida
   y fidelización. Conservar atomicidad y decidir propiedad de columnas/identificadores
   antes de separar almacenamiento. No se han cambiado schema ni migraciones.
3. La autoridad final de grants Control se decide entre Identity y administración;
   hoy se conserva la lectura vigente. Nada de Administration fue extraído.
4. Acordar validación local frente a introspección y latencia admisible de revocación.
   En esta etapa se mantiene consulta de versión/grants por petición. Antes de separar
   procesos, ofrecer contrato autenticado con timeout/fallo cerrado y probar caída;
   no repartir JWT_SECRET HS256 entre proyectos independientes.
5. Extraer registro/perfil, vehículos/alias, recuperación, sesiones kiosk y credenciales
   técnicas con adaptadores completos. El modelo puro de sesión no acredita todavía
   paridad de firma/CSRF/recuperación de operación. No fragmentar transacciones del
   reset ni de propiedad de vehículo/operación.
6. Reemplazar la proyección financiera local por el puerto real de lectura, incluyendo
   historial y vehículos, manteniendo cuerpos HTTP/Decimal/paginación. No trasladar
   saldos, deuda, reservas, pagos, puntos o redenciones al dominio de Identity.

Siguiente paso: laboratorio PostgreSQL/Redis totalmente nuevo y sintético para
adaptadores de Identity y contratos HTTP Prime/FuelFlow/Control, con registro/reset,
sesión kiosk/CSRF/firma, terminales vigentes/expirados/revocados y caída de dependencias.
Después migrar casos de uso gradualmente detrás de fachadas compatibles; solo más
adelante separar proyecto/proceso/datos conforme a las decisiones anteriores.
No requiere activar Catalog ni dar por terminada su migración pública.

## Resultado ejecutado

- Compilación aislada del núcleo y pruebas Node: **12/12 aprobadas**.
- Build completo Backend: **aprobado**.
- Jest completo Backend: **34 suites, 269/269 pruebas aprobadas**, incluidas las
  14 nuevas de integración de componentes y las regresiones de kiosk, credenciales
  técnicas, recuperación, Control, vehículos, wallet y pagos.
- Contratos Gateway: **24/24 aprobados**, sin editar Gateway en esta misión.
- FuelFlow admin-identity y terminal-identity: **7/7 aprobadas**.
- `git diff --check`: **aprobado**.

El primer intento de la prueba nueva AuthCore falló al compilar el request sintético
(TS2352, faltaba declarar actor opcional). Se corrigió el tipo del fixture; la
repetición y la suite completa aprobaron. No fue un fallo del flujo de login.

No se ejecutaron migraciones, acceso a bases ni pruebas end-to-end contra sistemas
existentes. No se modificaron AuthService, AccessGuard, AuthCoreModule, parámetros
criptográficos, Gateway, frontends, esquema Prisma, trabajo de Dezkz, ocho JSON
originales ni evidencias anteriores. Se preservaron los cambios previos encontrados
en el árbol de trabajo; el diff global incluye trabajo de misión 4 ajeno a esta etapa.
No se crearon ramas, commits, push, PR ni merge.

## Continuación — PostgreSQL, Redis y contratos HTTP reales

Esta sección actualiza los límites de verificación de la primera etapa, que se
conserva arriba como historial. Reproductor nuevo:

```bash
npm run test:identity-lab --prefix Backend
```

El comando compila Backend y ejecuta `tools/astra/identity-isolated.cjs`. Requiere
Docker, OpenSSL y dependencias instaladas/Prisma Client generado. No ejecuta reset,
seed existente ni herramientas de conexión a QA. No usa archivos Compose existentes.

### Aislamiento y evidencia

Cada ejecución crea una red y dos contenedores nuevos `primax-m5-<tiempo>-<azar>`:
PostgreSQL 16 y Redis 7, credenciales aleatorias distintas, únicamente tmpfs, sin
montajes ni volúmenes de otros entornos. Puertos elegidos para esta ejecución,
publicados solo en 127.0.0.1; se mantienen fijos durante el reinicio de Redis.
Se inspeccionan montajes y bindings. Migraciones reales se aplican exclusivamente
a la URL explícita de esa nueva base `synthetic`. Redis requiere contraseña, base
0, sin RDB/AOF y con namespace exclusivo.

Los procesos reciben un entorno explícito sin heredar variables de aplicación;
se ejecutan desde un directorio temporal vacío, sin cargar .env existentes. El
Prisma Client del reproductor recibe datasources explícitos. Se detienen solo los
procesos/contenedores propios al terminar; se retienen contenedores detenidos y red
para auditoría, sin podar recursos existentes. Los tmpfs se descartan al detenerlos.
El directorio temporal propio conserva como máximo archivos no sensibles; clave y
certificado SMTP se eliminan al terminar. No queda un servicio nuevo escuchando.

`identity-smtp.cjs` es un receptor local STARTTLS, sin relay ni buzón persistente,
que acepta únicamente destinatarios example.invalid. RecoveryDelivery y Nodemailer
son los reales: requireTLS permanece activo y el certificado se valida con una CA
efímera confiada exclusivamente por los hijos del laboratorio mediante
NODE_EXTRA_CA_CERTS. No se desactiva verificación TLS ni se cambian mecanismos de
producción. Correo/códigos/tokens se mantienen en memoria, fuera de la evidencia.

La evidencia nueva es `evidence/identity-mission5-lab.txt`: resume comprobaciones,
resultado y bloqueo conocido sin secretos ni datos personales reales. El reproductor
verifica SHA-256 de todos los JSON de evidencia preexistentes (34 en esta ejecución,
incluidos los ocho originales); no los reescribe. Las evidencias previas de Catalog
permanecen intactas y no se presentan como nuevas pruebas de Identity.

### Dependencias reducidas, sin sustituir AuthCore

- `identity-adapters/persistence.ts`: PrismaIdentityAccounts consulta cuentas y DNI
  sin UsersService; PrismaMembershipProfiles selecciona únicamente perfil/vínculo,
  sin saldos/deudas/puntos. Ambos reciben capacidades acotadas de PrismaClient.
- PrismaIdentityAccess ahora acepta capacidades de PrismaClient y no requiere
  PrismaService. UsersService queda como import de tipo en la composición legada;
  el núcleo se instancia directamente con los adaptadores y una conexión real,
  sin iniciar Nest ni el bootstrap compartido.
- RedisVerifiedKioskSessions implementa el puerto interno con las mismas claves
  SHA256/namespace/formato legado, y traduce milisegundos a segundos. Comprueba
  authenticated, versión y estación; el núcleo comprueba vencimiento. No es un
  verificador HTTP: firma y CSRF deben verificarse antes de llamarlo. No está
  registrado en ningún módulo activo. La reconexión del cliente es responsabilidad
  de la composición que lo proporciona.
- LegacyVehicleLinks delega el enlace en la transacción atómica existente, sin
  duplicar reglas ni introducir una segunda autoridad de propiedad del vehículo.
- `identity-lab-app.cjs` compone exclusivamente AuthCore, AuthController,
  KioskController, Memberships, Vehicles, Prisma, Health, configuración y throttling
  existentes. Conserva setupApp, DTO, filtros, guard, JWT y recuperación reales.
  Se ejecuta sin `apps/bootstrap.ts` ni AlertsModule. Es optativa y exige marcador
  de laboratorio/URL loopback synthetic. No reemplaza `apps/identity/main.ts`.

La composición mínima **omite AdminController**, que requiere AlertsService para
check-plate; no acredita paridad de esas rutas ni constituye un entrypoint completo
de producción. Se contrasta con el Identity actual, que sí conserva sus módulos.
También se arrancan Commerce y Administration existentes exclusivamente para
validar `/terminal/me` y `/control/session`, que realmente viven en esos procesos.
No se desarrollan esos dominios, no se envían comandos financieros y no se inicia
un Gateway alternativo ni se cambia su tráfico.

### Matriz ejecutada

| Área | Comprobaciones reales |
| --- | --- |
| Cuentas/contraseñas | Registro HTTP en ambas composiciones, respuesta sin hash, bcrypt 12, login email normalizado/DNI, contraseña incorrecta/usuario inexistente, registro inválido sin filas huérfanas, duplicado 409 |
| JWT | Tokens del login actual aceptados por núcleo/adaptadores y viceversa por AccessGuard; alteración, vencimiento, issuer/audience/algoritmo incorrectos, usuario inactivo y revocación authVersion rechazados |
| Control | Cuenta aprobada/verificada, permiso vigente, asignación terminada excluida, paridad de permisos con HTTP Control, permiso insuficiente/estación ajena rechazados por política del núcleo, grant revocado y SYSTEM_ADMIN global |
| Vehículos | Alta/listado/consulta HTTP, usuario ajeno 404, enlace ajeno 409, listado ajeno vacío, adaptador de enlace con transacción Prisma real conserva propiedad exclusiva |
| Membresía | Perfil del puerto no contiene dinero. GET me en ambas composiciones produce cuerpos iguales; saldo 12.34, reserva 5.67, disponible 12.34, total 18.01, deuda 2.01 y puntos 9 |
| Solo lectura financiera | Comparación íntegra antes/después de Membership y diez tablas financieras/inventario, incluyendo filas y timestamps. Tercera instancia mínima usa rol SELECT-only: mismo GET y cuerpo; UPDATE Membership rechazado por PostgreSQL |
| Recuperación | Forgot HTTP envía correo por STARTTLS real al receptor local; código no se almacena en claro, intento erróneo incrementa contador, verificación emite token, reset de un solo uso cambia contraseña y revoca JWT/contraseña anteriores; sin cambiar finanzas |
| Kiosk | Pre-sesión, login, logout reales con Redis. CSRF erróneo 403, firma errónea 401, query de estación manipulada 403, expiración/estación/versión/authenticated inválidos 401. Borrado por logout y por puerto revoca la sesión |
| Técnica | Bootstrap firmado existente emite token opaco, hash persistido, terminal/me de Commerce devuelve terminal/estación; terminal de otra estación 409; sin gateway, firma alterada y token alterado/expirado/revocado o terminal revocada → 401 |
| Caídas | Redis caído → 503 firmado, JWT de miembro sigue 200; Redis vuelve sin sesiones previas. PostgreSQL caído → autenticación del núcleo rechazada, HTTP protegido falla y health 503 |

El permiso/estación de Control se comprueba en el núcleo y su sesión por HTTP; no
se afirma una matriz completa de todos los controladores administrativos. El
laboratorio no abre operaciones, procesa pagos, imprime, llama OCR ni reproduce
la recuperación de una venta con ticket/evidencias financieras. Tampoco certifica
todas las carreras concurrentes de registro/reset/enlace, expiración de resetToken,
SMTP comercial o despliegue privado productivo. Esas limitaciones permanecen
explícitas; las pruebas unitarias existentes no las convierten en integración real.

### Bloqueo real detectado: reconexión Redis de AuthCore

Después de una caída suficientemente larga para agotar los reintentos del cliente,
Redis vuelve a responder PING y un cliente nuevo puede conectarse, pero KioskStore
en el proceso existente conserva HTTP 503. Se reproduce y registra como **bloqueo**,
no como recuperación automática aprobada. Inspección de `connectLocalRedis`:
la promesa `connecting` resuelta del primer connect se conserva; tras agotarse la
reconexión, la siguiente llamada no inicia otro connect. No se modifica KioskStore
ni AuthCore debido a la restricción vigente de conservarlos.

Reiniciar **solo la composición Identity del laboratorio** permite leer Redis otra
vez: sesión anterior → 401 y nuevo pre-login/login → éxito. Es un procedimiento de
recuperación comprobado en el laboratorio, no un reinicio aplicado al sistema real.
Antes de ejecutar Identity de forma autónoma debe corregirse ese ciclo de conexión
en una intervención acotada y probar reconexión concurrente, fallo cerrado y CSRF,
o acordar expresamente supervisión/reinicio como política de disponibilidad.

### Qué todavía impide autonomía completa

El núcleo y los adaptadores de cuentas/perfil/grants/revocación ya pueden ejecutarse
sin Nest bootstrap; la composición HTTP mínima funciona con PostgreSQL/Redis reales
sin bootstrap común ni AlertsModule para el subconjunto probado. Esto **no elimina**
el toolchain, node_modules, Prisma Client/esquema completo ni código compartido del
Backend. JWT sigue usando el servicio configurado de AuthCore y su contrato HS256.

Registro y reset siguen en servicios/repositorios legados; el enlace de vehículos
depende de PrismaService.atomic; Memberships aún importa Transaction/Reward/Wallet,
y KioskService importa helpers operativos y consulta estados de Commerce. El
adaptador financiero permanece local y solo lector; no se trasladó su SQL ni
lógica de Commerce al núcleo. El contrato heredado de me continúa incluyendo
campos de Membership además de la proyección. No se propone dividir transacciones.

Siguiente paso seguro: resolver la recuperación de conexión Redis sin reemplazar
AuthCore y extender la composición mínima a todos los contratos Identity necesarios
(incluido el límite de AdminController/Alerts), con pruebas sintéticas concurrentes
y de caída/reinicio. Después extraer adaptadores de registro/reset/vehículos y
reemplazar enriquecimiento financiero por un puerto de lectura de Commerce.
Antes de separar proyectos/procesos/datos siguen pendientes autoridad de grants,
estrategia de verificación/introspección y latencia de revocación; no distribuir
JWT_SECRET ni activar tráfico como consecuencia de estas pruebas.

### Resultado de la continuación

Ejecución final: `node tools/astra/identity-isolated.cjs`, exit 0;
laboratorio `primax-m5-1794598496670-c98e4624`. **14 grupos completados**. Uno reproduce
el bloqueo Redis y otro valida recuperación mediante reinicio; no equivalen a
certificar reconexión automática ni autonomía productiva. La evidencia declara
`autonomousDeploymentReady: false` y enumera el bloqueo.

Regresión ejecutada de nuevo sobre esta etapa:

- Núcleo: compilación independiente y **12/12**.
- Backend: build aprobado y Jest **34 suites, 269/269**.
- Gateway: **24/24** contratos, sin modificar sus archivos.
- FuelFlow: admin-identity y terminal-identity **7/7**.
- Prime: services.test.js **9/9**.
- Catalog: build y **5/5**.
- Formato de archivos nuevos/modificados y `git diff --check`: aprobados.

Los primeros intentos del reproductor no se contaron como aceptación: fixtures
incompatibles con CHECK/enum/trazabilidad financiera, snapshot que asumía id simple
en FuelInventory, cierre de un cliente Redis ya cerrado y preparación del reinicio.
Se conservaron las restricciones SQL: autorización POSTPAGO con miembro, enum
PAYMENT_PENDING, puntos con venta trazable y orden de snapshot compatible con
claves compuestas. Se corrigieron lifecycle/revokedAt del fixture y la preparación
de Redis con puerto fijo de laboratorio/PING. La repetición luego reveló el 503
persistente del KioskStore real; se documentó como bloqueo y se probó recuperación
sin modificarlo. No se cambiaron servicios de negocio para hacer pasar el laboratorio.

Contenedores propios finales detenidos; procesos hijos cerrados. Los 34 JSON
preexistentes conservaron SHA-256. No se activó tráfico, modificaron datos/volúmenes
reales, esquema/migraciones, login/AuthCore, bootstrap activo, frontends, Catalog,
trabajo de Dezkz ni evidencias anteriores. Sin ramas, commits, push, PR o merge.

## Recuperación automática Redis y composición HTTP

Intervención autorizada posterior sobre KioskStore, sin editar AuthCoreModule,
AccessGuard, AuthService ni el flujo de login. Las secciones anteriores conservan
la reproducción del fallo original y la necesidad histórica de reiniciar Identity;
no describen el resultado vigente de esta corrección.

### Causa y corrección acotada

Se revisó también el código instalado de `@redis/client` (socket/client):
`isOpen` continúa true durante la reconexión interna y pasa a false cuando su
estrategia devuelve Error tras agotar el presupuesto. `connect()` rechaza sockets
ya abiertos. La promesa `connecting` de KioskStore permanecía resuelta después del
primer éxito; al agotarse luego la reconexión interna, cada nueva petición esperaba
esa promesa vieja y enviaba el comando a un cliente cerrado, que respondía 503.

La corrección de `Backend/src/kiosk/redis-store.ts`:

- Libera `connecting` en finally tanto al conectar como al fallar. Solo las llamadas
  que llegan durante un intento pendiente comparten esa misma promesa.
- Si node-redis ya tiene un socket abierto pero no listo, devuelve 503 y deja actuar
  a la estrategia interna, sin llamar connect otra vez ni abrir clientes adicionales.
- Conserva el único cliente creado en el constructor, el límite previo de reintentos
  internos y connectTimeout de 4 s. Tras agotarse/fallar una ronda, aplica 1 s de
  enfriamiento antes de permitir otra ronda bajo demanda. No introduce un bucle
  propio en segundo plano ni un sondeo por petición durante ese enfriamiento.
- Conserva disableOfflineQueue. Un comando se envía una sola vez cuando el cliente
  está listo; un resultado perdido se devuelve como error, sin repetir INCR/EVAL/SET
  ni reconstruir sesiones localmente. No existe fallback permisivo o en memoria.
- Marca el cierre del módulo para impedir nuevas conexiones/comandos. Si el cliente
  está conectando, lo destruye; una promesa que termina después del cierre no puede
  enviar el comando que esperaba. El cierre de un cliente listo sigue siendo limpio.
- El transporte REST mantiene una solicitud con timeout de 4 s y sin reintentos;
  las garantías nuevas de reconexión se refieren al transporte TCP local realmente
  probado. No se cambian claves, namespace, hashes, TTL, CSRF, firma o revocación.

La recuperación es automática en la siguiente petición permitida por el enfriamiento;
no exige reiniciar Identity. No implica que Redis conserve sus datos ni que una
sesión borrada/revocada vuelva a ser válida. No se promete una latencia nueva ante
particiones TCP silenciosas: se conservan los límites de conexión existentes y no
se reintentan comandos cuya aplicación pueda ser ambigua.

### Pruebas del ciclo de conexión

Nueva suite `redis-recovery.spec.ts`: ocho pruebas verifican llamadas concurrentes
que comparten conexión, nueva conexión tras un éxito seguido de agotamiento,
socket interno reconectando sin duplicación, enfriamiento ante ráfagas fallidas,
agotamiento de reconexión en segundo plano, ausencia de replay ante respuesta
perdida y cierre normal/durante connect. Las pruebas REST existentes siguen activas.

El reproductor `identity-isolated.cjs` mantiene su laboratorio nuevo PostgreSQL,
Redis tmpfs y SMTP STARTTLS; la evidencia de la etapa anterior se conserva en
`identity-mission5-lab.txt`. La evidencia nueva se escribe por separado en
`evidence/identity-mission5-redis-recovery.txt`. Ya no espera el bloqueo antiguo ni
reinicia Identity para ocultarlo. Los mismos procesos Identity legado y composición
optativa permanecen vivos durante toda la prueba.

Matriz nueva realmente ejecutada:

1. `CLIENT KILL TYPE normal` provoca desconexión de sockets sin borrar Redis.
   Ambos procesos Identity recuperan acceso con la sesión que sigue almacenada.
   La sesión revocada continúa en 401. Logout posterior borra la sesión conservada
   y también queda en 401. El contenido de la sesión válida se compara antes/después.
2. Dos ciclos completos de stop/start de Redis, con tiempo para agotar el presupuesto
   interno. Ráfagas de 20 comandos del KioskStore y peticiones HTTP concurrentes a
   ambos procesos reciben 503 durante la caída; el JWT de miembro sigue dando 200.
3. Redis vuelve a responder PING: KioskStore y ambos procesos se reconectan sin
   reinicio. Como tmpfs sin RDB/AOF perdió el contenido, la sesión anterior devuelve
   401. Un nuevo pre-login/login crea una sesión distinta que funciona en ambos
   procesos. CSRF erróneo sigue en 403, firma errónea en 401 y tokens antiguos en 401.
4. Antes/después de las desconexiones: 30 llamadas concurrentes a CLIENT ID usan
   una sola conexión del KioskStore probado; 30 INCR producen exactamente 1..30.
   Los INCR rechazados durante la caída no aparecen en Redis tras recuperarlo.
   La suite unitaria añade el caso de comando aplicado con respuesta perdida para
   comprobar específicamente que tampoco se reenvía ese comando.

El adaptador Redis usado directamente por el núcleo continúa recibiendo su cliente
desde la composición; no cambia las políticas de identidad ni asume persistencia.
La corrección está en el ciclo de transporte del KioskStore existente.

### Composición HTTP completa en laboratorio

Nuevo `identity-adapters/identity-http.module.ts`: agrupa AuthModule,
MembershipsModule, VehiclesModule, HealthModule y AlertsModule existentes. El host
aporta Config, Prisma y throttling. `identity-lab-app.cjs` consume esa composición
sin `apps/bootstrap.ts`; el entrypoint activo y Gateway permanecen intactos.

Se reincorpora AdminController sin alterar sus reglas. AlertsModule se declara
como dependencia transitoria explícita, porque check-plate y otras rutas legadas
lo necesitan. Esto completa la superficie HTTP de Identity anterior, pero conserva
ese acoplamiento; no es una extracción de Administration ni Commerce.

El laboratorio compara todos los pares método/path de OpenAPI entre Identity
actual y la composición optativa. Esa igualdad prueba superficie, no el comportamiento
de todas las rutas posibles. Además de repetir registro, login Prime, reset,
kiosk, JWT, grants, vehículos y bootstrap técnico de la etapa previa, prueba por
HTTP las rutas admin/demo-credentials (deshabilitada), admin/login válido/inválido,
admin/alerts autorizado/miembro sin permiso y check-plate firmado con placa propia.
No ejecuta resolución de alertas, OCR ni recuperación financiera de una venta.

`/terminal/me` sigue siendo contrato real de Commerce: se valida usando su proceso
existente. No se mueve ese controlador a Identity ni se cambia su routing. De igual
forma se usa el proceso Administration existente para contrastar control/session;
no se implementa trabajo nuevo en esos dominios.

### Dependencias que permanecen

| Límite | Estado actual y siguiente separación segura |
| --- | --- |
| Prisma/esquema | Adaptadores de cuentas/perfil/grants aceptan PrismaClient sin bootstrap, pero el cliente se genera desde todo el esquema Backend. User, Membership, alias, grants, estaciones y credenciales conservan relaciones cruzadas. No hay un esquema autónomo ni base separada |
| Registro/reset | User + Membership + contador se crean juntos; reset consume token y cambia contraseña/authVersion juntos. Extraer adaptadores transaccionales sin romper esas unidades atómicas |
| Vehículos | LegacyVehicleLinks delega a VehiclesRepository y PrismaService.atomic; requiere SERIALIZABLE/reintentos y comprobar User activo, Membership activa y unicidad de placa. Extraer ese adaptador completo, sin duplicar reglas ni fragmentar transacción |
| Finanzas | Membership contiene balance y vínculos de bienvenida/reservas. MembershipsRepository usa deuda, autorizaciones, Transaction y RewardMovement; Vehicles.findByPlate enriquece saldo/deuda. La proyección de me permanece local y solo lectura, con rol SELECT-only y snapshots verificados otra vez |
| Técnico/operativo | KioskService importa helpers operativos y consulta estados/evidencia de Commerce. Emisión/validación de credenciales y recuperación no deben partir transacciones de ventas/operaciones |
| Alerts/HTTP legado | La composición ya incluye AdminController con AlertsModule. Alerts lee deuda y reconcilia BusinessAlert: no puede presentarse como una dependencia pura de identidad. Se requiere puerto/fachada compatible antes de eliminar el módulo |
| Runtime/despliegue | Build, node_modules, Nest/configuración, PrismaClient y módulos aún viven en Backend. El módulo optativo no es un proyecto autónomo ni un servicio habilitado; siguen pendientes autoridad de grants y estrategia/latencia de revocación entre procesos |

El siguiente paso seguro es extraer los adaptadores transaccionales de registro,
reset y vehículos y la frontera de lectura financiera/Alerts mediante puertos,
manteniendo las APIs comprobadas. Después empaquetar una composición propia con
dependencias explícitas y validar despliegue privado y revocación entre procesos.
No separar tablas o repartir JWT_SECRET para simular autonomía. Catalog sigue sin
tráfico nuevo y su migración de inventario público continúa pendiente.

### Resultado vigente de la corrección

Comando: `node tools/astra/identity-isolated.cjs`, exit 0. Laboratorio nuevo
`primax-m5-1794599370731-3c80342d`: **17 grupos aprobados**, incluidos superficie
HTTP de **27 métodos/rutas**, desconexión preservando contenido y **dos ciclos de
caída/recuperación** sin reiniciar ninguno de los procesos Identity. La evidencia
declara `redisRecoveryResolved: true`, `identityRestarted: false` y mantiene
`autonomousDeploymentReady: false` por los acoplamientos restantes.

Una primera ejecución de esta corrección también aprobó 16 grupos; se añadió la
comparación completa de superficie HTTP y se repitió el laboratorio para obtener
el resultado final de 17. No se necesitó cambiar AuthCore/login ni relajar políticas
de sesión para obtenerlo. La evidencia antigua del bloqueo queda conservada.

Regresión final ejecutada:

- Build Backend aprobado; núcleo independiente **12/12**.
- Jest Backend **35 suites, 277/277** (ocho pruebas nuevas de reconexión).
- Gateway **24/24**, FuelFlow **7/7**, Prime **9/9**.
- Catalog: build y **5/5**.
- Formato de archivos intervenidos y `git diff --check`: aprobados.

Los 34 JSON de evidencia conservan SHA-256; contenedores y procesos propios quedaron
detenidos. No se tocaron datos, volúmenes o credenciales reales, AuthCoreModule,
AuthService, AccessGuard, entrypoints activos, Gateway, esquema/migraciones, Catalog,
frontends ni avances de Dezkz. No hubo ramas, commits, push, PR ni merge. El cambio
funcional en runtime existente se limita al ciclo de conexión/cierre de KioskStore;
la composición HTTP sigue siendo optativa y exclusiva del laboratorio.

## Proyecto ejecutable y persistencia delimitada

Objetivo de esta continuación: disponer de un proyecto que compile y arranque
por sí mismo, sin ejecutar el Backend completo, y delimitar persistencia sin
alterar contratos ni bases existentes. Se revisaron el historial, esquema real,
repositorios de usuarios/membresías/vehículos, reset, AuthCore, KioskStore,
KioskService, Alerts y los reproductores previos antes de intervenir.

### Runtime propio

`services/identity` contiene package.json/lockfile, tsconfig, configuración,
fuentes completas y clientes Prisma generables con sus propias dependencias.
`npm run build --prefix services/identity` ejecuta generación de clientes y
TypeScript estricto. No utiliza Backend/dist, Backend/node_modules, imports entre
proyectos ni el bootstrap compartido. `npm start` ejecuta su propio main.

La configuración exige IDENTITY_RUNTIME_PROFILE=synthetic, dos URLs PostgreSQL
explícitas a loopback/base synthetic, puente privado loopback con clave y bind
127.0.0.1. ConfigModule no carga .env. JWT, recovery, firmas, CSRF y Redis mantienen
las reglas actuales. Se comprueba que AuthCoreModule, AuthService y KioskStore
materializados conservan exactamente los bytes de origen.

`src/compatibility` materializa 43 fuentes de Identity, DTO, configuración y helpers
necesarios. Los imports de persistencia y proyecciones se redirigen a adaptadores
locales; no se copian los servicios/repositorios financieros, Alerts, Wallet,
Transactions ni Payments. `compatibility-manifest.json` conserva hashes de origen.
El comando explícito refresh:compatibility permite renovar esa extracción desde
el repositorio; **no forma parte de build, start ni test**. El proyecto resultante
se compila sin disponer del Backend. No se cambió el AuthCore o login activos.

Dependencias directas fijadas a las versiones del Backend. La instalación detectó
un aviso transitivo real de Multer; únicamente el proyecto nuevo fija Multer 2.5.0.
La auditoría del proyecto nuevo queda sin vulnerabilidades reportadas por npm.
No se actualizan dependencias del Backend ni mecanismos criptográficos.

### Dos clientes explícitos, sin migrar ni partir tablas

1. `prisma/identity.prisma` proyecta 14 modelos: User, MembershipNumberCounter,
   Membership, MembershipCodeAlias, Vehicle, PasswordReset, UserPermissionGrant,
   AdminControlAccount, AdminControlGrant, AdminStationAssignment,
   AdminEmailVerification, Station, Terminal y TerminalCredential. Solo incluye
   enums utilizados por esos modelos. Station es referencia externa; Terminal y
   Membership contienen aún campos compartidos, no una declaración de propiedad
   exclusiva sobre todos sus atributos.
2. `prisma/compatibility.prisma` conserva el esquema legado completo, con cliente
   generado dentro de las dependencias del proyecto y conexión/rol diferentes.
   Se necesita todavía para guards, credenciales y las transacciones operativas
   de KioskService. No se oculta ese acoplamiento ni se presenta como esquema propio
   puro del dominio.

`prisma/boundaries.json` inventaría las relaciones a modelos externos omitidas del
cliente delimitado: asistencia, supervisión, turnos, transacciones, deuda, pagos,
reservas, inventario, movimientos y auditoría operativa. Las columnas escalares y
sus tipos PostgreSQL permanecen compatibles. **Omitir relaciones del cliente no
elimina FK de PostgreSQL**: el laboratorio compara las definiciones antes/después.

Membership.balance, welcomeAvailable, welcomeReservedOperationId y
welcomeTransactionId permanecen por compatibilidad física. Registro conserva su
INSERT de membresía inicial/defaults y bienvenida; no se traslada dinero a Identity.
El rol nativo permite SELECT solo sobre los 14 modelos, escrituras de cuentas,
vehículos/reset/contador, INSERT Membership y UPDATE únicamente de campos de perfil.
No puede actualizar balance ni consultar Payment o modificar inventario. El rol
operativo permite lectura compatible y escrituras de credenciales/terminal/operación
y auditoría necesarias para conservar el flujo; también se le rechaza UPDATE balance.

No se agregan scripts migrate/db push al proyecto. Los dos esquemas son de cliente,
**no planes DDL para bases existentes**. El laboratorio aplica las migraciones
actuales exclusivamente a un PostgreSQL nuevo y luego usa esos clientes sobre las
mismas tablas sintéticas. Aprovisionar una base exclusivamente de Identity todavía
requiere resolver FK/columnas compartidas y unidades atómicas. Cualquier separación
física que cambie contratos/datos/FK necesita propuesta concreta y autorización
posterior; no fue necesaria ni se realizó en esta etapa.

### Adaptadores transaccionales y sesiones

- UsersRepository y PasswordResetService materializados reciben IdentityDatabase,
  no PrismaService del Backend ni el cliente operativo. Registro mantiene User +
  Membership + contador en la misma transacción; reset conserva consumo del token,
  contraseña bcrypt y authVersion atómicos, así como intentos y cooldown actuales.
- VehiclesRepository y la edición de perfil usan el cliente delimitado y su
  adaptador SERIALIZABLE, con el mismo presupuesto de reintentos. Se conservan
  usuario activo, membresía ACTIVE, propiedad exclusiva/idempotencia de placa y
  validación DNI/pasaporte; no se divide una transacción entre procesos.
- Los dos generadores Prisma llevan clases de error distintas. Se normalizan
  únicamente errores conocidos del cliente nativo en el límite de transacción,
  preservando código/meta/version y el contrato de errores legado. Objetos
  arbitrarios con un campo code no se clasifican como errores Prisma.
- KioskStore corre desde sus fuentes locales y dependencias propias, con la
  recuperación automática ya validada. No hay fallback de sesión en memoria.
  KioskService y validaciones de credenciales siguen usando el cliente operativo
  explícito cuando necesitan estado/cierre/evidencias de operaciones. Extraer esas
  transacciones sin conservar atomicidad no forma parte de este paso.

### Finanzas y Alerts detrás de puertos

`FinancialReads` entrega me, historial y enriquecimiento de vehículos; `AlertsPort`
entrega list/dashboard/resolve/check-plate. Los adaptadores del proyecto hacen HTTP
con clave de servicio, timeout 4 s, sin redirects ni reintentos. Un fallo de la
dependencia devuelve 503 y no fabrica saldo, puntos o respuestas de autorización.

El host de compatibilidad **solo del laboratorio** es
`tools/astra/identity-compatibility-bridge.cjs`: instancia servicios/repositorios
legados existentes sin arrancar una aplicación Backend completa. Reutiliza
MembershipsService, VehiclesService y AlertsService actuales; no copia sus cálculos
o SQL dentro del proyecto independiente ni cambia Commerce. Sus métodos están
cerrados y autenticados, sin una API Prisma/SQL genérica. El rol del host permite
SELECT financiero y las escrituras de BusinessAlert existentes, no modificar dinero.

Las respuestas financieras siguen procediendo de la implementación anterior. El
cliente delimitado escribe perfil/vehículo y después obtiene la vista compatible
por el puerto. Si falla la consulta posterior, la escritura ya confirmada conserva
su estado; no se reenvía automáticamente. Esa composición no introduce atomicidad
distribuida ni debe anunciarse como una transacción entre proyectos.

No se añadió ningún endpoint de compatibilidad al Backend activo, Gateway, Commerce
o Administration. El host privado es una dependencia de laboratorio que deberá
convertirse en un contrato de servicio definitivo antes de un despliegue autónomo.

### Laboratorio de proyecto independiente

```bash
npm ci --prefix services/identity --ignore-scripts
npm test --prefix services/identity
# Solo para comparadores y host de implementación legada del laboratorio:
npm run build --prefix Backend
node tools/astra/identity-isolated.cjs --standalone
```

--standalone crea infraestructura nueva como antes y roles/credenciales exclusivos.
Copia fuentes, esquemas, dependencias y artefactos de Identity a un directorio
temporal fuera del repositorio. Allí vuelve a ejecutar **npm run build**, incluidos
los dos generadores Prisma y tsc, y arranca dist/main.js con sus node_modules.
No puede resolver imports al Backend desde ese árbol. Los comparadores HTTP y el
host legado permanecen fuera del proyecto para validar paridad.

Se repite la superficie de 27 pares método/path, registro/login, contraseñas,
permisos/actor, JWT válidos/alterados/expirados/revocados, reset SMTP STARTTLS,
kiosk, firma/CSRF, credenciales técnicas, desconexión y dos ciclos Redis sin reiniciar
Identity. La igualdad de superficie OpenAPI no se presenta como prueba exhaustiva
del comportamiento de los 27 endpoints.

Pruebas nuevas del adaptador nativo: carrera por una placa entre dos usuarios,
rollback del contador ante registro duplicado, perfil inválido sin persistencia
parcial y consumo concurrente de resetToken con un único incremento de authVersion.
Los tests unitarios propios también verifican el límite entre clases Prisma.

Se contrasta me con valores no nulos, decimales, deuda, reservas y puntos; se
comparan historial de transacciones/recompensas/redenciones y snapshots financieros.
El host de puertos requiere clave; al detenerlo me/Alerts fallan con 503 y el login
nativo y Redis continúan disponibles. Reiniciarlo recupera me sin cambios de cuerpo.
Después se detienen los entrypoints Backend de comparación: el runtime conserva
login, me por su puerto y health. Esto prueba independencia del proceso, no ausencia
de una dependencia externa de lectura financiera.

### Dependencias eliminadas y pendientes

| Eliminado en build/ejecución del proyecto | Dependencia que permanece |
| --- | --- |
| Backend/dist, Backend/node_modules, bootstrap común e imports a fuentes externas | Snapshots de política/DTO con mantenimiento explícito; aún no se publica un paquete versionado de contratos |
| Cliente Prisma completo en registro/reset/perfil/vehículos | Cliente operativo completo en guard/kiosk y tablas/FK compartidas; aprovisionamiento sintético usa migraciones legadas |
| PrismaService del Backend y enlace de vehículo por repositorio externo | Adaptador serializable propio, con normalización de errores entre ambos clientes |
| SQL/cálculo financiero y servicio Alerts dentro del proyecto | Puertos HTTP cuyo host de laboratorio reutiliza implementaciones legadas; aún no son endpoints aprobados para despliegue |
| Reinicio de Identity para recuperar Redis | Dependencia de disponibilidad Redis y pérdida de sesiones si se pierde su contenido |

Siguiente paso seguro: sustituir la compatibilidad operativa por puertos específicos
que conserven las transacciones de terminal/recuperación, definir la implementación
definitiva de FinancialReads/AlertsPort y resolver autoridad/latencia de revocación.
Solo entonces proponer un plan de esquema/migraciones propio y separación física
de datos, con revisión de FK y autorización antes de modificar contratos o datos
existentes. No activar tráfico ni repartir el secreto HS256 como sustituto de ese
diseño. Catalog y la migración pendiente de inventario público siguen separados.

### Resultado ejecutado del proyecto propio

Ejecución final: `node tools/astra/identity-isolated.cjs --standalone`, exit 0,
laboratorio `primax-m5-1794602083676-579178fb`: **21 grupos aprobados**. Evidencia
nueva: `evidence/identity-mission5-runtime.txt`; se conservan las dos evidencias
anteriores de Identity. Declara standaloneRuntime/artifactOutsideBackend=true,
identityProjectionModelCount=14, redisRecoveryResolved=true e identityRestarted=false.
autonomousDeploymentReady continúa false por las dependencias físicas/operativas
y el host de puertos legado, no por necesitar el bootstrap Backend para compilar.

La copia de fuentes y dependencias se compila en un directorio propio fuera del
repositorio, en caché de disco para no consumir el tmpfs reservado a datos. Los
enlaces relativos de node_modules se conservan y se comprueba que prisma y tsc
resuelven dentro de la copia. No se cargan URLs DATABASE_URL/UNPOOLED del Backend
en el proceso nuevo: los adaptadores usan sus dos URLs explícitas de roles limitados.
Los entrypoints Backend de comparación quedan detenidos antes de las comprobaciones
finales de login, me y health del proceso autónomo.

Pruebas finales:

- Proyecto Identity: generación de ambos clientes, TypeScript estricto y **18/18**
  pruebas propias, incluidas las dos nuevas de normalización/reintento Prisma.
- Build aislado en la copia externa: **aprobado**; superficie HTTP **27 métodos/rutas**.
- PostgreSQL/Redis/SMTP reales sintéticos: **21 grupos**, carrera de vehículos
  201/409, contador y perfil sin escritura parcial, reset concurrente 200/400 y
  authVersion incrementada una sola vez; recuperación Redis en dos ciclos.
- Finanzas/Alerts: paridad de cuerpos/historial, roles limitados, snapshots sin
  cambio, denegación sin clave y caída/reinicio del host sin perder login nativo.
- Definiciones FK antes/después: **idénticas**.
- Backend: núcleo **12/12**, build aprobado y Jest **35 suites, 277/277**.
- Gateway **24/24**, FuelFlow **7/7**, Prime **9/9**, Catalog build y **5/5**.
- Auditoría de dependencias runtime del proyecto nuevo: **0 avisos** reportados.
- Formato de archivos intervenidos y `git diff --check`: aprobados.

Validación incremental: una primera ejecución aprobó el circuito inicial de 19
grupos. Al añadir carreras se detectó 500 en lugar del 409 esperado: el error del
cliente Prisma nativo no era instanceof de la clase del cliente compatible. Se
añadió normalización en el adaptador serializable y el catch transaccional del
registro, con pruebas específicas; no se alteraron políticas de negocio ni AuthCore.
Dos intentos de build copiado excedieron el límite del reproductor bajo presión de
recursos. Se preservaron enlaces relativos, trasladaron únicamente copias generadas
propias a caché de disco y ajustó el presupuesto de compilación del laboratorio.
La ejecución final vuelve a compilar las fuentes actuales y aprueba todas las
comprobaciones; esos intentos parciales no cuentan como aceptación.

Los 34 JSON preexistentes conservan SHA-256. Contenedores y procesos propios finales
quedaron detenidos; los artefactos generados de diagnóstico se conservan fuera del
repositorio. Sin datos/volúmenes/credenciales reales, cambios de tráfico, ramas,
commits, push, PR ni merge. No se modificaron AuthCore/login/guards activos,
esquema/migraciones del Backend, Catalog, frontends ni trabajo de Dezkz. La única
adición de proyecto es `services/identity`; no se movieron carpetas existentes.

## Base propia y límite de separación

Se revisaron el runtime real, los dos clientes, los repositorios transaccionales,
guards, KioskService, puertos, esquemas y restricciones SQL del Backend. La nueva
comprobación distingue cuatro cosas: propiedad lógica, capacidad del cliente,
tablas presentes físicamente y contratos funcionales realmente satisfechos.

### Propiedad y relaciones

`identity-data-contracts-proposal.md` delimita cuentas/credenciales/reset, número y
perfil de membresía y propiedad de vehículos; distingue grants con autoridad de
gestión pendiente, Station como referencia externa, Terminal compartido y finanzas/
Alerts pertenecientes a otros dominios. Membership no es una tabla exclusivamente
de Identity por contener balance, bienvenida y referencias operativas; su status
también participa en elegibilidad. No se trasladó automáticamente ningún agregado.

`node tools/astra/identity-data-audit.cjs` genera la auditoría estática con **37
relaciones Prisma** que cruzan el conjunto de 14 modelos proyectados. Este conjunto
incluye Station/Terminal, no equivale a 14 tablas exclusivamente de Identity. Se
documentan referencias escalares y constraints SQL adicionales que requieren otro
análisis antes de una migración. No se consultaron ni modificaron FK de bases reales.

### Experimento nuevo, sin migraciones Backend

```bash
# Usa el build propio aprobado de services/identity; no requiere Backend/dist.
node tools/astra/identity-data-isolated.cjs
node --test tools/astra/identity-data-contract-lab.test.cjs services/identity/test/*.test.cjs
node tools/astra/identity-data-audit.cjs
```

El reproductor crea PostgreSQL 16 y Redis 7 nuevos, con nombres/claves aleatorios,
puertos loopback y tmpfs, sin volúmenes ni credenciales de entornos existentes. No
lee .env y no acepta una URL de destino proporcionada por el usuario. Genera DDL
**desde vacío** mediante migrate diff --from-empty --to-schema-datamodel sobre
identity.prisma y lo aplica únicamente al contenedor que acaba de crear. No usa
Backend/prisma/migrations ni copia ninguna fila de otra base.

`prisma/lab-invariants.sql` completa checks/índices de identidad no expresables en
Prisma: email canónico, placa, documentos, contador, grant activo único, credencial
activa única y fechas/lifecycle. Conserva el check del balance legado presente en
la proyección, sin cálculos ni comandos financieros nuevos. Se prueban rechazos de
contador negativo y email no canónico. No es un plan de migración para bases existentes.

Se comprueba en pg_tables que hay exactamente 14 tablas, incluyendo únicamente las
referencias sintéticas Station/Terminal. No existen Payment, Transaction,
MembershipDebt, FuelInventory, BusinessAlert ni TerminalOperation. Los dos roles
del runtime apuntan a esa misma base propia con permisos limitados: escritor nativo
y lector/credenciales para el guard. No hay acceso SQL a un almacén de Commerce o
Administration ni un proceso Backend iniciado por este laboratorio.

Esto prueba viabilidad del subconjunto, no que el esquema proyectado pueda aplicarse
a la base compartida. Tampoco convierte las referencias sintéticas en sincronización
de estaciones/terminales reales. El runtime no fue modificado para ocultar tablas
faltantes, inventar aprobaciones o desactivar validaciones.

### Contratos de lectura de laboratorio

`identity-data-contract-lab.cjs` implementa respuestas **de fixture** para las rutas
V1 existentes, documentadas en la propuesta. No carga Backend, Prisma ni lógica
financiera/Alerts. Los valores de me y vehículo se aportan explícitamente desde el
dataset sintético; no se calculan ni se rellenan al faltar una proyección. Arrays y
dashboard vacíos son escenarios de prueba, no implementaciones de esos servicios.

Se conserva el transporte autenticado actual, sin redirects ni reintentos. El
host exige clave, valida identificadores/paginación, devuelve 404 sin fixture o
ante operación desconocida y marca versión 1 en respuesta. Se rechazan pagos y
RPC/SQL arbitrarios. No implementa writes de Alerts ni estados financieros reales.
Al caer, me devuelve 503 mientras login y sesiones locales permanecen disponibles.

El proveedor V1 legado se sustituye **solo en este experimento** por ese doble de
contrato. No se certifica una sustitución productiva de Commerce/Administration.
La propuesta V2 separa perfil/propietario de las proyecciones financieras por ID y
separa comandos de Alerts. Requiere revisar inicialización financiera, mapeo de
errores, idempotencia/outbox, actualización de referencias y revocación. No se
implementaron esos cambios de contrato, eventos o autoridades sin aprobación.

### Lo probado en la base de 14 tablas

- Arranque del runtime propio y superficie de **27 métodos/rutas**. Es conteo de
  superficie; no se declara éxito funcional de los 27 contratos en esta base.
- Registro HTTP, email/DNI, contraseña, duplicado 409 y creación de membresía con
  contador local; tablas financieras ausentes.
- JWT real compatible con los parámetros AuthCore, token alterado/expirado,
  authVersion y permisos insuficientes; grants/estación de Control en el guard
  existente y revocación de SYSTEM_ADMIN con acceso HTTP a Alerts de fixture.
- Persistencia/enlace concurrente de vehículo con un solo propietario; idempotencia,
  consulta/listado y rechazo de usuario ajeno. La vista enriquecida sigue siendo
  un contrato externo, incluso cuando la escritura local ya está confirmada.
- Reset por SMTP STARTTLS local; consumo concurrente 200/400 e incremento único de
  authVersion, con rechazo del JWT anterior. No se cambia criptografía ni login.
- Kiosk: login, authorize y CSRF con Redis y Station sintética. Validación del guard
  técnico con credencial local válida, expirada y revocada, sin TerminalOperation.
  Esa comprobación de componente no es el endpoint Commerce /terminal/me.
- Dos ciclos Redis: 503 durante caída, autenticación por JWT disponible, reconexión
  sin reiniciar Identity, sesión perdida 401 y nuevo login correcto.
- Caída/reinicio del motor PostgreSQL dentro del contenedor de laboratorio para
  conservar su tmpfs; errores controlados y recuperación del mismo proceso Identity.
  No se certifica conservación de datos después de destruir/recrear el contenedor.

### Punto de detención solicitado

El bootstrap técnico se ejecuta para reproducir el límite: su transacción intenta
leer TerminalOperation y registrar auditoría, tablas ausentes de la base propia.
Devuelve 500 controlado y no deja una credencial parcial. **Es un bloqueo funcional
reproducido, no una aceptación de ese contrato**. La verificación/revocación de una
credencial ya emitida puede usar datos locales; emisión/rotación/recuperación no
quedan resueltas por esa observación.

Eliminar el cliente completo o mover TerminalCredential separaría la unidad que
actualmente bloquea Terminal, valida/cierra operación vacía, rota credencial y
registra auditoría. Por la instrucción del usuario de detenerse antes de cambiar
contratos/relaciones/datos existentes, no se implementó ese corte ni se modificó
AuthCore. El cliente de esquema completo sigue presente, limitado aquí a la base
de 14 tablas; el experimento evidencia exactamente dónde deja de ser suficiente.

La propuesta revisable es `identity-data-contracts-proposal.md`: un puerto operativo
de emisión/reanudación/recuperación que preserve completa la transacción; decisión
explícita sobre autoridad/almacenamiento de credenciales; contratos de lectura por
ID y Events/outbox solo si se aprueban. No se comienza Commerce/Administration ni
se alteran FK existentes para simular autonomía.

### Resultado de esta etapa de datos

Comando: `node tools/astra/identity-data-isolated.cjs`, exit 0. Laboratorio
`primax-m5-data-1794604249272-938fd849`: **14 grupos completados**, incluida la
reproducción del bloqueo de bootstrap. Evidencia nueva:
`evidence/identity-mission5-data.txt`. Declara backendStarted=false,
legacyBridgeStarted=false, identityOnlyTableCount=14 y completeIdentityAutonomy=false;
el corte operativo exige aprobación. No se presenta el 500 técnico como contrato
funcional aprobado ni el doble V1 como implementación financiera.

Resultados vigentes:

- Base nueva con exactamente **14 tablas**; operaciones locales, credenciales y
  permisos descritos arriba comprobados sin tablas de Commerce/Administration.
- **27 métodos/rutas expuestos**, con el límite funcional técnico documentado.
- **37 relaciones declaradas** auditadas estáticamente y propuesta de propiedad,
  contratos/autoridades y futura migración lista para revisión.
- PostgreSQL: stop/start del motor con el contenedor supervisor aún vivo, mismo
  proceso Identity, login/health restaurados y authVersion conservada. Los pools
  del verificador del laboratorio se reconectan explícitamente después de que el
  servicio ya ha respondido 200; no se reinicia ni reemplaza el cliente del servicio.
- Redis: dos caídas/reinicios con pérdida de contenido, 503/401 conforme a estado,
  nuevo login y recuperación automática del mismo proceso Identity.
- Pruebas sobre el build propio vigente: **18/18** más **2/2** del proveedor V1
  sintético. No cambiaron fuentes TypeScript del runtime en esta etapa.
- Núcleo Backend **12/12**; Jest final **35 suites, 277/277** con
  `npm test --prefix Backend -- --silent --testTimeout=20000`.
- Gateway **24/24**, FuelFlow **7/7**, Prime **9/9**, Catalog build y **5/5**.
- Formato y `git diff --check`: aprobados. Los **34 JSON** conservaron SHA-256;
  evidencia anterior preservada y contenedores/procesos propios finales detenidos.

Los intentos parciales no cuentan como aceptación. El primer stop de PostgreSQL
terminó PID 1 y el contenedor: se corrigió el reproductor para usar un supervisor
exclusivo de laboratorio y poder reiniciar el motor conservando tmpfs. Otro intento
agotó readiness bajo carga. Una comprobación posterior del pool ocioso del propio
verificador recibió P1017; se renueva ese pool solo después de verificar recuperación
HTTP del servicio, sin reintentar escrituras. En la primera regresión Backend
276/277 aprobaron y un hook bcrypt excedió 5 s bajo carga; se repitieron todas con
20 s por prueba y aprobaron 277/277 sin cambiar coste bcrypt, código o política.

Se detiene la implementación de separación en el límite solicitado: no se eliminan
campos/FK, no se mueve la autoridad de credenciales, no se fragmenta la transacción
operativa ni se aplica V2. La propuesta necesita revisión/autorización antes de
esas modificaciones. Ningún dato/volumen/credencial real, AuthCore/login activo,
Gateway, Catalog, frontend o trabajo de Dezkz fue alterado; no hubo ramas, commits,
push, PR ni merge. La base de laboratorio no sustituye ni migra una base existente.

## Continuación autorizada — puerto operativo de credenciales (2026-11-13)

Se revisaron la propuesta `identity-data-contracts-proposal.md`, las **37 relaciones**
de `identity-data-fk-audit.md` y el bootstrap real. La autorización permite un puerto
operativo de laboratorio conservando el almacenamiento compartido y la transacción
existente; no permite separar TerminalOperation/auditoría ni modificar datos reales.

### Implementación

- `services/identity/src/operational/port.ts`: contrato interno V1, sin Nest/Prisma,
  para emisión, reanudación y rotación. Recibe estación confiable, selector de terminal
  y credencial previa; devuelve identificador, token opaco y vencimiento.
- `prisma-sessions.ts`: proveedor SQL con la unidad original materializada completa.
  Mantiene FOR UPDATE, serializable, política limitada de reintentos, atención vacía,
  heartbeat, lifecycle, revocación, vínculo rotatedFromId y ambas auditorías. No
  fragmenta el cierre/rotación/auditoría entre llamadas. Selección previa y revalidación
  bloqueada conservan su ubicación original. No introduce comandos financieros.
- `scripts/prepare-operational-adapter.cjs`: extracción explícita desde el snapshot
  local congelado, con hash de procedencia. Las pruebas verifican también que el cuerpo
  materializado completo sigue presente. Build/start no ejecutan la extracción.
- `coordinator.ts` y `controller.ts`: firma y límite antes del proveedor, mismo DTO
  validado y mismo resultado HTTP. Reutilizan el algoritmo de sesión Redis existente,
  sin fallback local ni replay. La invocación estrecha del método privado TypeScript
  `create(true)` es una deuda explícita del adaptador de compatibilidad.
- `main.ts`: composición optativa con `IDENTITY_OPERATIONAL_LAB=enabled`, además de
  las barreras sintéticas previas. Hereda los demás handlers. El arranque habitual,
  AuthCore, login, Gateway y tráfico público permanecen sin cambios en esta etapa.

El puerto inicial **no extrae la recuperación técnica autorizada**: esa ruta conserva
el KioskService congelado, sus comprobaciones de evidencia/owner Redis y acceso
operativo completo. Tampoco cambia almacenamiento, schema, FK o mecanismos criptográficos.

### Garantía y límite conservados

La atomicidad cubre Terminal + TerminalOperation + TerminalCredential +
OperationalAuditEvent en **una transacción PostgreSQL**. La sesión kiosk Redis se
crea después del commit, como en el código original. Un error SQL debe revertir
cada cambio; un error Redis posterior puede devolver 503 con credencial/auditoría
SQL completas ya confirmadas. No equivale a una transacción atómica SQL+Redis.
No se añadió compensación, replay automático ni protocolo distribuido.

Con una credencial previa vigente se reanuda; sin ella las solicitudes rotan y solo
la última credencial permanece activa. No se promete idempotencia durable por clave
de comando ni recuperación automática de una respuesta remota perdida. La propuesta
actualizada detalla recibo transaccional, autenticación, consulta de resultado,
outbox/deduplicación y fencing como diseño futuro, no como código implementado.

### Laboratorio ejecutado y evidencia

Comando: `node tools/astra/identity-isolated.cjs --operational`.
Resultado: **30 grupos aprobados**, laboratorio
`primax-m5-1794606950368-dae93b57`. Evidencia:
`Docs/astra/evidence/identity-mission5-operational.txt`.

PostgreSQL y Redis nuevos, contraseñas aleatorias, datos tmpfs y puertos loopback;
SMTP STARTTLS sintético. Las migraciones existentes se aplicaron únicamente a
esta base nueva. No se reutilizaron bases, credenciales ni volúmenes. Se usó una
subred libre explícita porque Docker agotó sus pools automáticos; no se limpiaron
redes anteriores. Los contenedores creados quedaron detenidos.

Pruebas operativas adicionales realizadas con PostgreSQL real y el mismo proveedor
SQL que usa HTTP, bajo el rol operativo restringido:

- Fallos inyectados mediante triggers exclusivos de la base nueva: auditoría tras
  cerrar atención, inserción tras revocar credencial, auditoría tras insertar y
  trigger diferido al commit. Cada fallo produjo el error sintético previsto y
  snapshots idénticos de terminal, operaciones, credenciales y auditoría al inicial.
- SQLSTATE 40001 real, con secuencia no transaccional: exactamente dos intentos,
  un cierre, una rotación y una auditoría de cada tipo confirmados.
- Seis solicitudes simultáneas con la misma credencial vigente: mismo token y
  una emisión/auditoría. Cuatro solicitudes sin credencial: cuatro rotaciones
  auditadas, solo una credencial activa, conservando la semántica existente.
- Terminal revocada, atención reciente y atención con incidente: emisión rechazada,
  sin cambios en los snapshots. La validación HTTP de credenciales alteradas,
  expiradas, revocadas y fuera de estación también pasó.
- HTTP terminal-bootstrap con fallo SQL: 500, rollback completo y ninguna sesión
  Redis nueva. Tras retirar el fallo: 201 con token/CSRF/TTL/formato existentes.
  UUID inválido o campo extra: 400; firma inválida: 401.
- ACL Redis sintética denegando EVAL: 503 antes de SQL, sin cierre, revocación,
  credencial ni auditoría nuevos. Denegando únicamente SET: 503 después del commit,
  SQL completo y coherente; reintento explícito rota y revoca la credencial no
  entregada, dejando una sola activa. No se ocultó ni compensó este límite.

El resto del laboratorio repitió registro/login/reset SMTP, JWT y authVersion,
permisos y estaciones, vehículos y aislamiento/concurrencia, sesiones/CSRF/firmas,
comparación financiera de solo lectura con valores no nulos, y fallos cerrados de
finanzas/Alerts. Comparó **27 combinaciones método/ruta** con Identity legado y
probó los circuitos descritos; no certifica cada combinación posible de entradas
de los 27 handlers. Una desconexión y dos reinicios Redis pasaron sin reiniciar
Identity, conservando/rechazando sesiones según su estado real. Caída PostgreSQL:
autenticación/protegidos rechazados y health 503. Tras detener los entrypoints
Backend usados como comparadores, el runtime propio siguió atendiendo operaciones
nativas y lecturas por el puente de laboratorio.

Los **34 JSON originales conservaron sus hashes**. AuthCore, fuentes congeladas de
login y KioskStore conservan las verificaciones de compatibilidad existentes. No
se activó tráfico, cambió de rama ni ejecutó commit/push/PR/merge.

Los intentos parciales no cuentan como aceptación: se corrigió una colisión de
nombre del runner, se eligió una subred libre y se amplió solo el presupuesto de
compilación externa del experimento a diez minutos tras agotar cinco bajo carga.
No se cambiaron mecanismos criptográficos ni la política de reintentos de runtime.

### Dependencias pendientes y siguiente paso seguro

El puerto permite cambiar el coordinador sin dividir la unidad SQL. Todavía no
habilita separar sus tablas: el proveedor usa el cliente Prisma de esquema completo,
los helpers de evidencia y las relaciones operativas auditadas. Guards técnicos,
recuperación autorizada y otros handlers del snapshot siguen accediendo a esa
persistencia. Las lecturas financieras/Alerts siguen pasando por el puente legado;
no se trasladaron cálculos ni escrituras de Commerce a Identity.

Antes de sustituir el proveedor en proceso por otro servicio, aprobar el contrato
remoto de comando/recibo y su tratamiento de resultado desconocido, manteniendo
credencial, operación y auditoría en una transacción local del proveedor. Después
extraer recuperación y validación técnica con sus reglas de revocación/owner,
delimitar el esquema operativo mínimo y validar permisos/caídas/duplicados en otro
laboratorio. La separación física, outbox, sincronización y cambios de FK/datos
requieren otra decisión explícita. El despliegue autónomo completo sigue pendiente;
este resultado no autoriza tráfico ni migración de bases existentes.

Nota de regresión: la primera suite Backend terminó con 276/277 y un timeout de
15 s en `shares login limits even when a client changes its claimed username`.
Se reprodujo sin compilación concurrente. Se amplió exclusivamente ese presupuesto
de prueba a 60 s (`Backend/src/kiosk/kiosk.spec.ts`), conservando sus cinco bcrypt
cost-12, entradas, aserciones y límites de producción. No se alteró código de
AuthCore/login. La suite completa se repite con ese margen y `--testTimeout=20000`
para los hooks; el resultado final se registra a continuación.

### Regresión final aprobada

- Backend: **35 suites, 277/277 pruebas**, ejecución completa final sin compilación
  concurrente, tras ampliar únicamente el margen del test descrito arriba.
- Identity propio: **23/23** (12 de núcleo, 6 de runtime previas y 5 nuevas de puerto).
  Contrato sintético de finanzas/Alerts: **2/2** adicionales.
- Núcleo Backend: build y **12/12**.
- Gateway **24/24**, FuelFlow **7/7**, Prime **9/9**.
- Catalog: build y **5/5**.
- Runtime propio: build independiente en copia fuera del repositorio y laboratorio
  **30/30 grupos**. `git diff --check` aprobado.

Salidas completas de regresión y comandos:
`Docs/astra/evidence/identity-mission5-operational-regression.txt`.
El resultado final reemplaza los intentos parciales como criterio de aceptación,
sin ocultar el timeout inicial ni ampliar el alcance de las garantías SQL/Redis.

## Continuación — contrato remoto y recibo durable (laboratorio)

### Punto de partida y respaldo antes de cambios

Rama verificada: `feat/astra-hexagonal-microservices`, HEAD
`b99b995fa9f0527a0e2094d4f1c9c3e638548c83`. Se revisaron Git, las misiones 4/5,
el puerto validado, la propuesta y las 37 relaciones auditadas. Catalog conserva
su validación técnica previa, tráfico desactivado y migración de inventario pendiente.

Antes de modificar código se respaldaron **225 archivos**, incluidos todos los
pendientes con/sin seguimiento y los **34 JSON**. Archivo local privado:
`/home/primax/.local/state/primax-backups/mission5-remote-20261114T035549Z/pending-work.tar.gz`.
`MANIFEST.json` registra SHA-256 por archivo y base Git; `SHA256SUMS` permite verificar
el archivo comprimido. Se leyeron de nuevo todos los miembros del tar y se comparó
cada hash. Directorio 0700, archivo/manifest 0600. No se copiaron .env, claves privadas
ni credenciales reales. Dos logs históricos **sin cambios pendientes** con URLs
con autenticación se excluyeron del respaldo; sus originales no se modificaron.

### Implementación del experimento

Contrato completo: `identity-remote-receipts.md`. Archivos nuevos en
`services/identity/src/operational/remote/`:

- `contract.ts`: wire V1 cerrado, comando UUID, normalización compatible de selectores
  opcionales y fingerprint canónico. El commandId remoto no altera operationId de
  TerminalOperation ni las reglas originales de reanudación/rotación.
- `receipt-provider.ts`: reusa el proveedor validado enlazándolo a la transacción
  ya abierta. Conserva el cuerpo SQL original completo y añade el recibo dentro
  del mismo commit. Bloqueo advisory por caller+commandId y PK compuesta; reintentos
  serializables limitados originales. Resultado previo se consulta, no se reejecuta.
- `http-server.ts` y `provider-main.ts`: proveedor en proceso separado, loopback,
  clave interna exclusiva, caller/estación derivados de configuración sintética,
  autenticación antes del cuerpo, tamaño acotado y errores sin datos sensibles.
- `http-client.ts`: implementación remota del puerto V1. execute/query con ID estable;
  una consulta tras respuesta ambigua, sin repetir automáticamente el POST ni usar
  credenciales como respaldo local. No sigue redirects.

`prisma/lab-operational-receipts.sql` instala explícitamente el recibo **solo en la
base nueva del runner**, sin modificar migraciones previas, modelos actuales ni
bases/volúmenes existentes. Las relaciones del recibo son locales al proveedor.
No se aplican DDL en startup. El rol proveedor conserva escrituras operativas,
INSERT de recibo y SELECT de evidencia; no modifica dinero/recibos existentes ni
elimina auditoría. Los roles del runtime propio y del puente no acceden al recibo.

El resultado recuperable se cifra con AES-256-GCM y AAD ligado al comando. Esto
protege el nuevo recibo; no cambia la generación/hash de credenciales, JWT, bcrypt,
firmas, CSRF o TTL existentes. Solo el proveedor recibe esa clave aleatoria de
laboratorio. Se vuelve a verificar la credencial/terminal al consultar: un recibo
no permite reactivar una revocación ni sustituye la autorización vigente del guard.

`operational/main.ts` selecciona el cliente únicamente con otro opt-in sintético;
la composición normal y el puerto/proveedor previamente validados se conservan.
No se modificaron AuthCore, login, Gateway, tráfico ni requisitos de Dezkz.

### Límite explícito del contrato y pasos pendientes

El recibo certifica **SQL confirmado**, no una sesión Redis confirmada. El
coordinador sigue creando Redis después del commit. La misma operación remota
puede consultarse/reintentarse sin otra emisión/auditoría; no se deshace SQL ni se
simula un commit distribuido si falla Redis. El ensayo HTTP conserva el error 503
controlado. Un fallo SQL remoto también se presenta como dependencia 503, mientras
el adaptador local conserva su 500 inesperado anterior; el tráfico actual no cambia.

El HTTP legado no recibe un ID durable obligatorio: cada invocación compatible
crea uno nuevo. Dos peticiones nuevas siguen rotando como antes. No se certifica
idempotencia entre peticiones legadas distintas, ni hay journal durable del consumidor.
En el ensayo Redis, el verificador de laboratorio obtiene el ID por SQL para
consultarlo; esto no representa todavía un flujo productivo de recuperación.

Pendientes: acordar correlación autenticada/durable en los llamadores sin debilitar
HMAC; gestión/rotación/retención de claves y recibos; transporte TLS/autenticación
multicliente; extraer recuperación técnica y validación de guards; delimitar el
cliente/esquema operativo completo; sustituir el puente financiero/Alerts y resolver
las relaciones/autoridad de datos. No se implementan Commerce/Administration,
outbox de secretos ni separación física. Identity **no es todavía completamente
independiente**.

### Ejecuciones reales, aceptación y límites de evidencia

Laboratorio aceptado: **40/40 grupos**, exit 0,
`primax-m5-1794630931096-7d73d20e`. Evidencia:
`Docs/astra/evidence/identity-mission5-remote-receipts.txt`.

Se compiló primero el proyecto completo fuera del repositorio con dependencias y
ambos clientes propios. Las repeticiones usaron únicamente ese código compilado,
verificando igualdad de src/prisma, package/lockfile/tsconfig y registrando SHA-256
sobre src/dist. Cada ejecución creó otra base PostgreSQL y otro Redis, con claves
aleatorias nuevas; no reutilizó datos, credenciales o volúmenes. Comando aceptado:

```bash
node tools/astra/identity-isolated.cjs --remote-receipts \
  --runtime-artifact=/home/primax/.cache/primax-identity-lab-artifacts/primax-m5-1794629422938-98c275c2-EVYg5G
```

Sin `--runtime-artifact` se vuelve a copiar/compilar. El artefacto reutilizado es
solo de laboratorio, fuera del repositorio, no un despliegue ni una imagen productiva.

Los 30 grupos anteriores se repitieron con el cliente remoto optativo. Mantuvieron
27 combinaciones método/ruta y los circuitos de registro/login/reset STARTTLS,
vehículos/membresías/permisos, JWT y revocación, sesiones kiosk, firmas/CSRF, lectura
financiera compatible, caída/reconexión Redis y aislamiento. Son circuitos concretos
y paridad de superficie; no cubren cada entrada posible de los 27 handlers.

Diez grupos nuevos verificaron:

1. Servicio autenticado, DTO/versionado cerrado y estación configurada, antes de SQL.
2. Fallo real en INSERT del recibo: contador no transaccional confirma que el trigger
   se ejecutó una vez; terminal, cierre, revocación, credencial, auditoría y recibo
   vuelven a sus snapshots iniciales. Al retirar el fallo, mismo ID confirma una vez.
3. SIGKILL real mientras INSERT esperaba en PostgreSQL: conexión/SQL se revierten;
   tras reiniciar proveedor, no hay recibo ni cambios parciales. Mismo ID confirma una vez.
4. Seis comandos simultáneos con un ID: mismo resultado y una emisión/auditoría/recibo;
   otro fingerprint devuelve 409 con snapshot intacto.
5. Respuesta HTTP descartada después del commit por proxy: un POST y una consulta,
   sin repetir POST, recuperan el resultado.
6. SIGKILL después del commit y antes de entregar respuesta: proveedor nuevo y cliente
   nuevo consultan el mismo recibo cifrado y obtienen la credencial original sin otra auditoría.
7. Token ausente del texto del recibo, AEAD rechaza clave incorrecta sin reejecutar;
   errores PostgreSQL de permiso confirman que el proveedor no actualiza recibos/dinero
   ni elimina auditoría.
8. Recibos de credenciales rotadas/expiradas y terminal revocada devuelven 409;
   no vuelven a emitir ni quitan revocaciones.
9. HTTP real con Redis SET denegado: SQL/recibo confirmados y respuesta 503. Consultar
   y ejecutar el mismo comando no duplica SQL; una nueva petición legada rota como
   antes. El ID lo obtiene el verificador privilegiado de laboratorio, no un journal
   productivo del consumidor.
10. Parada inmediata del motor PostgreSQL y recuperación WAL en el mismo contenedor
    sintético supervisado: recibos confirmados conservados, provider/Identity recuperan
    sus conexiones con los mismos PID, lecturas HTTP vuelven a 200 y un comando fallido
    durante la caída confirma exactamente una vez al reintentarlo explícitamente.

La unidad atómica nueva incluye las cuatro tablas del campo histórico
`sqlAtomicBoundary` **más IdentityOperationalReceipt**, verificada por snapshots y
fallos de inserción/interrupción. Redis permanece fuera. WAL/reinicio del motor en
tmpfs no acredita durabilidad frente a pérdida de host, contenedor o tmpfs. No se
simuló pérdida de confirmación TCP de PostgreSQL: sí pérdida de respuesta HTTP y
muerte del proveedor antes/después del commit.

Los contenedores propios quedaron detenidos. No se modificaron bases/volúmenes
anteriores. Se compararon todos los archivos de evidencia previa incluidos en el manifest
del respaldo: idénticos, incluidos los 34 JSON. Rama/HEAD permanecen iguales.

Intentos no aceptados, sin ocultar fallos:

- Primer intento unitario utilizó dist previo mientras terminaba la recompilación:
  rechazó null opcional. Se completó el build y se repitió; resultado final **30/30**
  (28 de Identity propio y 2 del host sintético), con cinco nuevas de transporte.
- Primera ejecución completa aprobó 10 grupos y agotó readiness del auxiliar de
  lectura. Se amplió solo la espera de laboratorio a 120 s y se añadieron último
  estado HTTP/logs redactados. El primer registro no permite afirmar una causa
  de producto; las repeticiones alcanzaron health 200.
- Segunda ejecución aprobó 35 grupos y detectó fixture con expiresAt anterior a
  issuedAt. Se corrigieron fechas sintéticas; no se retiró TerminalCredential_dates
  ni se alteró el proveedor. Evidencia parcial preservada en
  `evidence/identity-mission5-remote-receipts-partial-fixture.txt`.
- La tercera ejecución completa aprobó los 40 grupos. No se cuenta un intento
  parcial como aceptación ni se cambia el coste criptográfico para pasar pruebas.

### Regresión final de esta continuación

- Backend: **35 suites y 277/277**, ejecución completa con
  `npm test --prefix Backend -- --silent --testTimeout=20000`. Sin nuevos cambios
  de presupuestos de prueba; el margen kiosk de la etapa previa se conservó intacto.
- Identity propio: **28/28** (23 previas + 5 de transporte remoto); contrato sintético
  de finanzas/Alerts **2/2**. Comando combinado **30/30**.
- Núcleo Backend: compilación y **12/12**.
- Gateway **24/24**, FuelFlow **7/7**, Prime **9/9** (comando combinado 40/40).
- Catalog: compilación y **5/5**.
- Proyecto Identity: compilación propia y externa aprobadas; ensayo real **40/40**.
- Formato de archivos nuevos/afectados, sintaxis de reproductores y
  `git diff --check`: aprobados. No se formatearon fuentes congeladas ni la unidad
  SQL cuyo hash de procedencia se conserva.

Salidas y comandos en `evidence/identity-mission5-remote-regression.txt`.
No hay pruebas finales fallidas; los tres tipos de intento parcial están descritos
arriba. El siguiente paso seguro es acordar correlación autenticada/durable de
commandId en el consumidor/HTTP antes de activar el adaptador; después extender
recuperación y verificación técnica remotas, conservar revocación y reducir el
esquema operativo. No iniciar separación física ni otros dominios con este resultado.

Respaldo local de cierre (código y evidencias, sin credenciales):
`/home/primax/.local/state/primax-backups/mission5-remote-final-20261114T050045Z/pending-work.tar.gz`.
Se verificaron SHA-256 del archivo y de cada miembro; el respaldo inicial se conserva.

## Continuación — correlación autenticada y persistente del consumidor

### Bloqueo confirmado del HTTP legado

Se revisaron Git, el contrato remoto y el origen real en FuelFlow (`kioskSession.js`
y `server/gateway.js`). El bootstrap manda `{}`, deriva terminal de configuración,
renueva firma/tiempo y no aporta userId humano ni intención durable. Su sesión kiosk
no representa a un User Identity. El Gateway rechaza campos adicionales. No se puede
reconocer de forma segura un reintento por cuerpo, cookie, firma, pestaña o terminal.

**La correlación automática del bootstrap legado queda bloqueada**, sin cambiar su
contrato ni inventar asociación de operador a usuario. Diseño y trazabilidad completos:
`identity-consumer-correlation.md`. Esta etapa demuestra una alternativa explícita
privada de laboratorio; no declara resuelta la integración de los clientes actuales.

### Implementación mínima y límites

Nuevo `services/identity/src/operational/consumer/`:

- `intent.ts`: puertos y caso de uso sin Nest/Prisma en tiempo de ejecución. Preparar
  una intención nueva no llama al proveedor. Ejecutar lee el diario, consulta recibo
  y solo ante ausencia contractual permite el POST con el mismo comando persistido.
- `journal.ts`: INSERT/SELECT de diario local inmutable. Genera intentId y commandId
  una vez; liga usuario, authVersion, acción, estación, terminal, vencimiento y hash
  del comando. Commit local antes del RPC, sin transacción distribuida. Sin cache de
  respuestas/credenciales. Un handle vence a 15 min y no se reasigna automáticamente.
- `auth.ts`: usa el AccessGuard original, JWT con sus opciones originales y permisos
  vivos. Captura por petición el usuario verificado; exige Control/Bearer, permiso
  ADMIN_TERMINAL_MANAGE y alcance. No confía en identidades enviadas por JSON.
- `server.ts`/`main.ts`: proceso privado loopback con opt-in sintético, prepare/execute
  cerrados, sin nuevo login ni rutas en el proceso de los 27 métodos públicos.

El prototipo rechaza cookies y mantiene la prohibición original de Control firmado
como kiosk. No introduce una vía cookie que omita CSRF. CSRF/HMAC/login del legado
permanecen intactos y sus pruebas se repiten. Esta alternativa no acredita que un
operador kiosk actual sea un usuario Control ni que deba cambiarse su autoridad.

`prisma/lab-consumer-intents.sql` instala la tabla solo en el PostgreSQL nuevo del
runner. No modifica migraciones previas ni genera DDL al arrancar. El rol consumidor
no puede modificar/borrar diario, leer recibos SQL del proveedor o escribir dinero.
El diario no guarda JWT, contraseña, CSRF, credencial previa ni token de respuesta.

`RemoteOperationalSessions.lookup` distingue únicamente 404 RECEIPT_NOT_FOUND de
indisponibilidad/404 desconocido; estos últimos no autorizan otra emisión. Sus métodos
previos y el puerto V1 no cambian. El prototipo soporta emisión por terminalId sin
credencial previa, no todos los modos del bootstrap/recuperación.

Dos prepare iguales generan dos intenciones distintas. Si se pierde su respuesta,
puede quedar una intención huérfana, pero aún no hubo RPC. El llamador debe conservar
el handle recibido: no se implementa almacenamiento en el navegador legado ni se
recupera una referencia perdida deduciéndola del cuerpo. El resultado recuperado
sigue siendo SQL confirmado; este prototipo no emite ni reconstituye sesiones Redis.

### Verificación incremental

- Compilación TypeScript propia aprobada antes de pruebas nuevas.
- Pruebas enfocadas de aplicación/transporte: **11/11**.
- Identity propio más fixture sintético: **36/36** (34 propias + 2 del fixture).
- Gateway/FuelFlow/Prime: **40/40** del comando habitual, y **21/21** adicionales de
  kiosk-session/kiosk-gateway para los clientes de origen auditados.
- Probe real `--consumer-correlations --consumer-only`: **14 grupos aprobados**,
  `primax-m5-1794701341775-6b67580f`. Incluye arranque/paridad y diez grupos nuevos;
  no sustituye los 40 grupos anteriores ni acredita sus ciclos Redis. El primer
  reporte conservaba el indicador Redis genérico del runner; se corrigió la metadata
  para distinguir probe y regresión completa. Se interpreta solo el alcance de sus checks.

El probe comprobó JWT emitidos por login Identity existente, rechazo de miembro,
cookie, Control firmado y estación ajena; dueño/operación inmutables; seis reintentos
simultáneos y mezcla concurrente de usuarios sin fuga; pérdida de respuesta del
proveedor más consulta fallida, SIGKILL y recuperación con diario por un proceso
nuevo; pérdida de respuesta del consumidor y otro reinicio; lookup incierto sin
POST; expiración, alteración de commandId, revocación de credencial, permisos y
authVersion; aislamiento de roles SQL y ausencia de secretos almacenados.

La recuperación usa el mismo handle del llamador, no descubre commandId mediante
el SQL privilegiado del verificador. Este solo inspecciona conteos/invariantes.

Dos intentos previos no se cuentan como aceptación: error de ámbito de consumerUrl
corregido en el runner, y fixture de grant sin reason obligatorio corregida sin
relajar modelo/permisos. Ambos repitieron 38 checks previos y se conservaron en
`identity-mission5-consumer-partial-runner.txt` y `identity-mission5-consumer-partial-fixture.txt`.
Evidencias de esta etapa son nuevas; no se sobrescriben las anteriores ni los 34 JSON.

### Aceptación completa y regresión final

Laboratorio `primax-m5-1794701635155-7cff0649`: **50/50 grupos**, exit 0,
`fullRegression=true`, `consumerOnly=false`. Se repitieron los 40 grupos anteriores
y los diez del consumidor, con PG/Redis nuevos. Fuente/dist del artefacto previamente
compilado coincidentes; no se reutilizaron datos, claves ni volúmenes. Evidencia:
`evidence/identity-mission5-consumer-correlations.txt`.

Comando completo aceptado:

```bash
node tools/astra/identity-isolated.cjs --consumer-correlations \
  --runtime-artifact=/home/primax/.cache/primax-identity-lab-artifacts/primax-m5-1794700608676-c4d68eee-TJKuus
```

- Backend **35 suites, 277/277**, sin modificar sus fuentes ni tiempos de prueba.
- Identity propio **34/34**, host sintético **2/2**: comando combinado **36/36**.
- Núcleo Backend: build y **12/12**.
- Gateway **24/24**, FuelFlow identity **7/7**, Prime **9/9**: combinado **40/40**.
- FuelFlow origen kiosk-session/kiosk-gateway: **21/21** adicionales.
- Catalog: build y **5/5**.
- Build propio y externo, formato de archivos afectados/nuevos, sintaxis de scripts
  y `git diff --check` aprobados. No se formatearon snapshots ni la unidad SQL congelada.

No hay fallos finales; se preservaron los dos intentos parciales descritos arriba.
El ensayo completo repitió HMAC, CSRF, JWT, permisos, aislamiento, lecturas financieras
y las caídas/recuperación de PG/Redis; el consumidor se reinició de verdad en sus
casos de pérdida de respuesta. Cada recuperación válida mantuvo un solo credential/
audit/receipt por intención. Las mezclas concurrentes de usuarios también rechazaron
al dueño ajeno. No se acredita pérdida de host/volumen ni recuperación del navegador
sin su referencia explícita.

Salidas y comandos: `evidence/identity-mission5-consumer-regression.txt`. Todas las
evidencias previas y los 34 JSON se cotejan con SHA-256 del inicio de esta etapa;
se conservan Catalog, Dezkz, la rama y HEAD. No se ejecutaron commits/push/PR/merge,
no se activó tráfico ni se iniciaron Administration/Commerce.

**Siguiente paso seguro:** acordar la identidad/autoridad del actor del bootstrap
legado y un contrato explícito de intención, con persistencia de la referencia en
su llamador y política para pérdida de prepare. No inferir usuario por cookie o
pestaña ni reintento por igualdad de cuerpo. Después se podrá proponer integración
optativa sin relajar CSRF/firmas, y avanzar en recuperación/guards remotos, esquema
propio, transporte/claves/retención y puertos financieros/Alerts. Siguen siendo
dependencias funcionales/persistentes: Identity no se declara completamente autónomo.

Respaldo local de cierre verificado por SHA-256 de archivo y miembros, sin credenciales reales:
`/home/primax/.local/state/primax-backups/mission5-consumer-final-20261115T002701Z/pending-work.tar.gz`. Se conservan los respaldos anteriores.


## Continuación — contrato de actor e intención para FuelFlow

Propuesta concreta: [identity-actor-intent-proposal.md](identity-actor-intent-proposal.md).
Se auditaron los consumidores reales: bootstrap `{}`, Gateway que rechaza cuerpo
adicional y firma renovada, sesiones sin userId, operador configurado sin identidad
humana. Ninguno permite deducir intención durable ni autoridad humana. No se
modificaron estos llamadores ni el wire OperationalSessionPort.v1.

Se añadieron solo un modelo ejecutable privado de actor/intención, ocho pruebas
unitarias y cinco grupos de laboratorio. El sobre vincula actor/generación/permisos,
acción, estación, terminal, intentId, commandId y expiración. La autoridad se
revalida, nunca se restaura desde permisos capturados. El contexto humano viene del
autenticador original; el técnico del AccessGuard TerminalOnly original contra
HMAC, Redis y credenciales PostgreSQL. Lectura/continuidad técnica se prueba en
sombra: no se desplegó un nuevo comando técnico ni una política de bootstrap.

Un adaptador privado conserva nonce y referencia PENDING/READY antes/después de
prepare. Una respuesta de ejecución realmente perdida se recupera desde otro
proceso con el intentId original, sin otra credencial/auditoría. Si se pierde la
respuesta de prepare, se comprueba una intención SQL y cero credenciales y se
rechaza recuperar por contenido: PREPARE_OUTCOME_UNKNOWN. Este bloqueo requiere
preparación V2 que persista el callerOperationId con unicidad por actor estable,
sin incluir generación en la clave única, y asociación atómica a intentId/commandId.
Está propuesta, no implementada. El archivo de prueba no es persistencia FuelFlow
ni acredita resistencia a pérdida de host o coordinación multiinstancia.

### Resultados reales

Laboratorio `primax-m5-1794706205107-9905fed3`: **55/55 grupos**, exit 0,
fullRegression=true, consumerOnly=false, redisRecoveryResolved=true. PostgreSQL,
Redis y SMTP sintéticos nuevos; ningún volumen/credencial previo reutilizado.
Se reutilizó únicamente el artefacto de código compilado cuyos hashes fuente/dist
coinciden con la versión validada anterior: no se cambió código del runtime.

```bash
node tools/astra/identity-isolated.cjs --actor-intent-contract \
  --runtime-artifact=/home/primax/.cache/primax-identity-lab-artifacts/primax-m5-1794700608676-c4d68eee-TJKuus
```

- Compatibilidad de los 27 métodos/rutas, JWT, permisos, CSRF, HMAC y revocación.
- Manipulación de IDs/destino/permisos/expiración y otro actor rechazados.
- Pérdidas reales de respuesta de prepare y execute; recuperación por referencia
  en otro proceso y límite explícito de prepare V1.
- Revocación y cambio real de credencial técnica: la generación nueva no reutiliza
  intención antigua. Sin actor técnico inicial inventado ni escalada a humano.
- Regresiones previas de concurrencia, recibo durable, atomicidad, SQL confirmado
  seguido de fallo Redis, caídas/recuperación PG/Redis y aislamiento de usuarios.
- Identity **34**, fixture de datos **2**, propuesta nueva **8**: **44/44**.
- Backend **35 suites, 277/277**; núcleo **12/12** con build.
- Gateway **24**, FuelFlow Identity **7**, FuelFlow kiosk **21**, Prime **9**:
  **61/61** combinadas. Catalog build y **5/5**.
- Sintaxis, formato de herramientas afectadas y git diff --check aprobados.

Un primer ensayo completo se detuvo tras 12 grupos por 503 inesperado en
admin/check-plate (esperaba 201). No se atribuye una causa no demostrada ni se
relajó la aserción; una ejecución completa nueva superó ese mismo punto y todos
los grupos. Se conserva el intento fallido en actor-partial.txt. El sondeo enfocado
anterior aprobó 19 grupos y no sustituye la aceptación completa de 55.

Evidencias nuevas: `evidence/identity-mission5-actor-intent.txt`,
`identity-mission5-actor-probe.txt`, `identity-mission5-actor-partial.txt` y
`identity-mission5-actor-regression.txt`. Las evidencias anteriores y los **34 JSON**
conservan SHA-256. Rama/HEAD, fuentes de Identity/Backend/FuelFlow/Gateway, AuthCore,
login y tráfico público se conservan; no hay commits, cambios de rama ni publicación.

### Dependencias y autorización pendiente

No se declara autonomía completa: persisten esquema operativo compartido, relaciones
entre dominios, adaptadores financieros/Alerts, validación remota de autoridad,
transporte/claves/retención y entrega/recuperación de sesión Redis. El proveedor
mantiene una única transacción local; no se separa su almacenamiento real.

Antes de cambiar clientes se debe aprobar: autoridad de emisión inicial (humano
Control o identidad técnica provisionada expresamente), contrato V2 de preparación,
persistencia del nonce/referencia y canal optativo firmado. La propuesta detalla
cada llamador afectado. Se detiene en ese límite por instrucción del usuario;
ninguno de esos cambios se implementa por inferencia de cookie, firma o cuerpo.


## Continuación autorizada — preparación V2 con humano Control

La autorización expresa aprobó opción humana y adaptaciones privadas. Se conserva
la implementación OperationalSessionPort.v1 y su límite transaccional del proveedor.
Contrato vigente de laboratorio: [identity-consumer-v2.md](identity-consumer-v2.md).

### Implementación y archivos

- `services/identity/src/operational/consumer/intent.ts`: puerto de preparación V2.
- `services/identity/src/operational/consumer/journal.ts`: asociación transaccional
  única por usuario estable/callerOperationId, snapshot/digest, TTL inmutable,
  concurrencia, conflicto de destino y rechazo de generación revocada.
- `services/identity/src/operational/consumer/server.ts` y `main.ts`: dos rutas V2
  privadas únicamente con IDENTITY_CONSUMER_V2_LAB=enabled y los requisitos sintéticos
  previos. Se reutilizan autenticador Control/guard originales; no se modifica auth.ts.
- `services/identity/prisma/lab-consumer-intents.sql`: nonce y permisos nullable
  compatibles con V1. DDL aplicado solo en PostgreSQL nuevo de laboratorio, no
  sobre bases previas. Sin cambios al esquema operativo ni movimiento de datos.
- `services/identity/test/consumer-v2.test.cjs`: contrato cerrado y opt-in por defecto
  apagado; compatibilidad V1 y rechazo de campos de actor/comando inyectados.
- `tools/astra/identity-control-v2-client.cjs` y `.test.cjs`: referencia 0600 creada
  y fsync de archivo/directorio antes de red, nonce inmutable, sesión humana
  verificada antes de cada envío, ningún token persistido ni retry automático.
  Es cliente privado; FuelFlow/Gateway no importan este módulo.
- `tools/astra/identity-consumer-v2-checks.cjs`: doce grupos nuevos reales de V2.
- `tools/astra/identity-consumer-checks.cjs` y `identity-isolated.cjs`: hook optativo,
  evidencia nueva, procesos/servicios sintéticos; los grupos previos permanecen.
- `tools/astra/identity-compatibility-bridge.cjs`: diagnóstico sanitizado de operación,
  duración y tipo/código de error. Sin parámetros/SQL/mensajes de credenciales.
- `services/identity/README.md`, este informe, `identity-consumer-correlation.md`,
  `identity-actor-intent-proposal.md` y nuevo `identity-consumer-v2.md`: documentación
  de estado vigente, compatibilidad y límites. El texto previo se conserva como historial.

No se implementó UI ni flujo browser/FuelFlow desplegable, admisión delegada,
aprovisionamiento técnico o persistencia serverless. El cliente privado usa actor
obtenido de Control real contra usuarios sintéticos, no una identidad inventada.
Las 27 rutas no incorporan rutas V2; estas pertenecen a otro proceso loopback.

### Pruebas y evidencia exacta

Laboratorio completo `primax-m5-1794707258309-eaced91b`: **67/67**, exit 0,
fullRegression=true, consumerOnly=false, redisRecoveryResolved=true. Repite los
55 grupos anteriores y doce V2. Evidencia: `evidence/identity-mission5-v2-full.txt`.

```bash
node tools/astra/identity-isolated.cjs --consumer-v2 \
  --runtime-artifact=/home/primax/.cache/primax-identity-lab-artifacts/primax-m5-1794707093499-f80b0141-rQBAhJ
```

El artefacto V2 se compiló primero en el sondeo con build/dependencias/clientes
propios, fuera del repositorio. La ejecución completa reutilizó solo ese código
verificando hashes: fuente 7824c8af33f2b5ffe07069c3d5afcb5c230d50e65b4cef34f799e81b9f54edda,
dist bb26685e9da51c50327731a15c4e3937de14ff6f2e4a5a300d5960ba6b3985c9.
Cada ensayo creó PostgreSQL/Redis/SMTP nuevos, credenciales aleatorias y tmpfs sin
volúmenes previos. Los contenedores propios quedaron detenidos.

Sondeo previo: **30/30**, exit 0, consumerOnly=true, fullRegression=false, en
`evidence/identity-mission5-v2-probe.txt`. No acredita toda la regresión; la aceptación
es la ejecución completa de 67 que incluye una prueba SQL adicional precommit.

Casos comprobados: actor Control autorizado y permisos insuficientes; actor/campos
inyectados, cookie y estación/acción alteradas; seis preparaciones iniciales
concurrentes; ejecuciones concurrentes con un solo credential/audit/receipt;
conflictos concurrentes de destino; operaciones distintas con payload equivalente;
expiración sin reciclaje; pérdida de red antes de entrega y después de commit;
fallo SQL real antes de INSERT con rollback sin nonce/intent/command parciales;
reintento explícito con el mismo nonce; reinicio real de consumidor y cliente;
recuperación de recibo después de pérdida de respuesta de emisión; revocación de
credencial, permisos y authVersion incluso tras nuevo login; modificación del
snapshot persistido rechazada; caída inmediata y recuperación WAL de PostgreSQL
con 503 durante caída; Redis caído sin falsear recuperación de sesiones. Los checks
previos vuelven a verificar CSRF/HMAC/JWT, los 27 métodos/rutas y dos ciclos Redis.

Regresiones aprobadas, comandos/salidas en `evidence/identity-mission5-v2-regression.txt`:

| Suite | Resultado |
| --- | --- |
| Identity propio (34 anteriores + 3 HTTP V2) | 37/37 |
| Fixture persistencia / propuesta actor / cliente V2 | 2/2, 8/8, 3/3 |
| Comando combinado Identity + fixtures + herramientas | 50/50 |
| Backend | 35 suites; 277/277 |
| Núcleo Backend, con build | 12/12 |
| Gateway | 24/24 |
| FuelFlow identidad / kiosk | 7/7 y 21/21 |
| Prime | 9/9 |
| Comando combinado Gateway/FuelFlow/Prime | 61/61 |
| Catalog, con build | 5/5 |

Build propio, sintaxis, formato de fuentes/herramientas afectadas y git diff --check
aprobados. No se formatean snapshots de compatibilidad ni unidad SQL congelada.

### Fallos encontrados y diagnóstico 503

Un ensayo unitario inicial dio 49/50: prepare del cliente arrojaba errores locales
sincrónicamente mientras su contrato de red devolvía Promise. Se unificó la interfaz
async, conservando el rechazo y sin añadir requests/retries. Se preserva la salida
fallida en `evidence/identity-mission5-v2-unit-partial.txt`; repetición 50/50 y
cliente 3/3 tras añadir comprobación de cambio de sesión. No hubo ensayo de
integración V2 fallido: sondeo 30 y completo 67 aprobaron.

El 503 histórico de admin/check-plate no reapareció espontáneamente en estos ensayos.
Se revisaron el port con deadline original 4000ms y el puente. Se reprodujo un
503 mediante respuesta del puente confirmada 200 retenida por proxy >4 segundos:
una sola solicitud, error controlado, consulta explícita posterior correcta. No se
amplía timeout, no se relaja aserción ni se afirma causalidad retrospectiva. Queda
sin demostrar la causa exacta del fallo histórico; el nuevo diagnóstico permite
clasificar futuros errores sin exponer secretos. La recuperación de V2 no depende
de interpretar un 503 como ausencia ni de generar identificadores nuevos.

### Compatibilidad, integridad y respaldos

AuthCore, login, fuentes Backend/Gateway/FuelFlow/Prime/Catalog y tráfico permanecen
sin cambios respecto al inicio de esta etapa. V1 y OperationalSessionPort.v1 mantienen
contratos; no se modifica almacenamiento operativo. Los procesos legados
Administration/Commerce se usan solo como comparadores de regresión existentes,
no se desarrolla ninguno de esos dominios. Sin cambios de rama/HEAD, commits,
push, merge o PR. Todos los cambios previos y archivos sin seguimiento conservados.

Las **103 evidencias anteriores**, incluidos los **34 JSON**, conservan SHA-256
contra el inventario inicial. Los informes nuevos no sobrescriben ninguna anterior.
Se verificaron los tres respaldos históricos por hashes de todos sus miembros.
Respaldo previo completo: `/home/primax/.local/state/primax-backups/mission5-prepare-v2-before-20261115T014107Z/pending-work.tar.gz`.
Se conserva además un primer respaldo más limitado realizado antes de inventariar
todas las evidencias. Se excluyen configuración env y dos logs históricos PrintAgent
con URLs sensibles; sus originales permanecen intactos y se cotejan por hash.

Respaldo final recuperable (código pendiente + evidencias), verificado por SHA-256
de archivo y de cada miembro según MANIFEST.json/SHA256SUMS:
`/home/primax/.local/state/primax-backups/mission5-prepare-v2-final-20261115T015116Z/pending-work.tar.gz`.
Para recuperación, extraer en un directorio separado sobre la revisión HEAD registrada
en el manifiesto; no sobrescribir el workspace actual. No contiene credenciales
operativas ni archivos env. Las dependencias generadas se reconstruyen desde locks.

### Dependencias y siguiente paso

V2 resuelve correlación durable de prepare en el circuito privado. No resuelve
esquema operativo compartido, relaciones entre dominios, puentes financieros/Alerts,
validación remota de autoridad/delegación, garantías de revocación durante RPC,
transporte/claves, retención, almacenamiento de referencia desplegable ni entrega
segura de sesión Redis. El recibo SQL no equivale a recuperar datos Redis perdidos.
No se declara Identity autónomo ni se activa integración FuelFlow.

Siguiente paso seguro: diseñar el canal privado de admisión humana y persistencia
multiinstancia del llamador de FuelFlow, conservando la verificación Control y el
mismo nonce; ensayarlo con transporte y referencias seguras antes de proponer
cualquier activación pública. La autoridad inicial humana ya está aprobada: no
hace falta volver a decidirla. Cualquier despliegue o ampliación de política queda
fuera de esta etapa.


## Misión 5.7 — integración privada FuelFlow–Identity

[Informe breve, contrato y límites](mision5-7-fuelflow-private.md).
Se añade un llamador HTTP privado en `Frontend_1_FuelFlow/lab`, sin imports desde
clientes productivos. Dos instancias usan un diario PostgreSQL propio de laboratorio,
INSERT/SELECT, que confirma callerOperationId/actor/solicitud antes del RPC Identity.
Ambos extremos validan Control con autenticador original; no se inventa identidad.
La recuperación resuelve el mismo intentId/commandId V2, sin cache de credenciales.

Laboratorio `primax-m5-1794708314271-7c0b4bcb`: **15/15**, exit 0, cinco grupos
previos de arranque/paridad/aislamiento y diez escenarios nuevos. Probados: dos
procesos reales, reinicio de ambos, concurrencia inicial y de ejecución, respuestas
perdidas tras commit de prepare/emisión, indisponibilidad antes de prepare, permisos
y authVersion revocados, usuario ajeno, manipulación y vencimiento. Un solo
credential/audit/receipt por operación repetida. Comparadores Backend detenidos
antes de la comunicación privada; no se usa el llamador legado.

Regresiones enfocadas: Identity **37**, cliente V2 **3**, nuevo llamador **5**,
Gateway **24**: combinado **69/69**; FuelFlow legado **28/28**; AuthCore/AuthService
Backend **14/14**, dos suites. Paridad de superficie de las 27 rutas comprobada.
No se repite la regresión completa de Backend/Prime/Catalog o caídas PG/Redis:
no se cambian runtime Identity, criptografía o código compartido/productivo.
fullRegression=false no se presenta como aceptación de toda la batería anterior.

Dos intentos iniciales quedan conservados: DDL múltiple rechazado por prepared
statement (0 grupos) y rechazo de autenticación mal traducido como 503 (5 grupos).
Se separa DDL y se traduce explícitamente ContractFailure a su 401/403 original;
prueba unitaria añadida. Sin relajar aserciones ni añadir retries. El ensayo final
aprueba 15/15. Evidencias nuevas `identity-mission5-7-private.txt`,
`identity-mission5-7-regression.txt`, `identity-mission5-7-partial-ddl.txt` e
`identity-mission5-7-partial-auth.txt`, en `evidence/`.

Se conservan por SHA-256 los **107 archivos de evidencia previos** (incluyen los
103 solicitados) y los **34 JSON**; rama/HEAD y trabajo previo intactos. No hay
commits, publicación ni cambios de datos/volúmenes operativos. Archivos nuevos:
`Frontend_1_FuelFlow/lab/identity-caller.cjs`, `caller-journal.sql`,
`identity-caller.test.cjs`, `tools/astra/fuelflow-identity-private-checks.cjs` e
informe 5.7. Archivos existentes cambiados: solo los dos runners privados
`identity-isolated.cjs`/`identity-consumer-checks.cjs` y este documento.

Respaldo previo: `/home/primax/.local/state/primax-backups/mission5-7-before-20261115T015848Z/pending-work.tar.gz`.
Respaldo final recuperable, verificado por SHA-256 de archivo y miembros y cotejo
con los archivos actuales, con manifiesto externo y exclusión de env/logs sensibles:
`/home/primax/.local/state/primax-backups/mission5-7-final-20261115T020830Z/pending-work.tar.gz`.

FuelFlow–Identity **sí se comunican privadamente sin el llamador legado**. Siguen
pendientes: autenticador/cliente Prisma compilados y lecturas de autorización
compartidas en el llamador, esquema operativo Identity, finanzas/Alerts, transporte,
retención, sesión Redis y persistencia browser/HA. No se acredita pérdida de host
ni autonomía completa. Próxima misión concreta: contrato remoto de verificación
Control que sustituya las lecturas AuthCore/Prisma del llamador, manteniendo
verificación de generación, permisos, alcance y revocación; sin activación pública.


## Misión 5.8 — verificación Control remota

[Contrato, componentes eliminados y límites](mision5-8-control-remote.md).
Se añade POST /consumer/v2/control/verify exclusivamente al consumidor privado,
apagado por defecto. El Bearer sigue validado por ConsumerAuthenticator/AccessGuard
originales en Identity: no se modifica AuthCore, login o criptografía ni se crea
una nueva credencial de autenticación. La consulta solo lee identidad y verifica
permiso, generación, estación, terminal, acción y vigencia; no prepara ni emite.
Respuesta ligada al contexto, sin cache ni autorización reutilizable.

FuelFlow usa RemoteControl y su paquete propio pg/lock. Ya no carga Nest/JWT/Kiosk,
ConsumerAuthenticator, PrismaService o código compilado de Identity; no necesita
JWT_SECRET/IDENTITY_LAB_RUNTIME. Su rol solo INSERT/SELECT en CallerOperation y no
puede leer User, UserPermissionGrant, AdminControlAccount, AdminControlGrant,
AdminStationAssignment, Station o Terminal. La correlación durable y los recibos
se conservan, sin cambios de transacción del proveedor ni almacenamiento operativo.

Laboratorio `primax-m5-1794781114883-bd60d33a`: **17/17**, exit 0, enfocado
(fullRegression=false; no repetición de caídas PG/Redis). Compiló/ejecutó Identity
con clientes propios y FuelFlow fuera del repositorio con sus dependencias propias.
Cinco grupos de preparación/paridad y doce de integración: identidad/permiso,
revocación/authVersion, cookie/firma rechazada, contexto manipulado/expirado,
reinicio de ambos llamadores, concurrencia, pérdida de respuestas y recuperación
por otra instancia. Un credential/audit/receipt por operación repetida. Verificador
caído: 503 sin nueva admisión ni acceso con autoridad anterior; instancia sana
recupera el recibo. Role SQL verifica negativamente las siete tablas eliminadas.

Comando: `node tools/astra/identity-isolated.cjs --control-remote --consumer-only`.
Evidencia: `evidence/identity-mission5-8-remote.txt`. PostgreSQL/Redis/SMTP nuevos,
credenciales y tmpfs nuevos; contenedores propios detenidos. La superficie de los
27 métodos/rutas conserva paridad y V1 sigue probado. Los comparadores Backend
se detuvieron antes de la comunicación privada; no se desarrolla otro dominio.

Pruebas enfocadas: Identity **39**, cliente V2 **3**, caller/puerto remoto **9**,
Gateway **24**, combinado **75/75**; FuelFlow legado **28/28**; AuthCore/AuthService
Backend **14/14**, dos suites. Build propio Identity/FuelFlow, formato, sintaxis y
git diff --check aprobados. No se repiten Backend completo, Prime/Catalog o lógica
financiera: cambios limitados al circuito privado y la superficie afectada.

Fallos conservados: primer ensayo unitario 9/11 (clasificación de 404 desconocido,
corregida a 503, y prueba lanzada antes de completar build que leyó dist anterior);
`identity-mission5-8-unit-partial.txt`. Primer AuthCore 9/14 con cinco timeouts de
5s en hooks bcrypt/login durante compilación concurrente bajo carga, sin cambios
de fuente; `identity-mission5-8-authcore-partial.txt`. Repetición secuencial de la
misma orden, mismos timeouts/costes/aserciones: 14/14. Salidas y comandos en
`evidence/identity-mission5-8-regression.txt`; no se ocultan intentos fallidos.

Archivos existentes modificados: FuelFlow/lab identity-caller.cjs/test.cjs;
Identity consumer intent.ts/journal.ts/server.ts/main.ts; runners identity-isolated.cjs
y fuelflow-identity-private-checks.cjs; este informe. Nuevos: FuelFlow/lab
remote-control.cjs/test.cjs y package.json/lock; Identity test/control-verify.test.cjs;
informe 5.8 y cuatro evidencias TXT. AuthCore/snapshots, login, clientes productivos,
V1 y trabajo previo conservados. No hay commits, push, merge o cambios de rama.

Integridad: **111 evidencias anteriores** y los **34 JSON** cotejados por SHA-256,
sin modificaciones. Respaldo previo 5.7 verificado: archivo y 276 miembros.
Respaldo previo de esta etapa:
`/home/primax/.local/state/primax-backups/mission5-8-before-20261115T221311Z/pending-work.tar.gz`.
Respaldo final recuperable, SHA-256 de archivo y miembros cotejados con workspace:
`/home/primax/.local/state/primax-backups/mission5-8-final-20261115T223220Z/pending-work.tar.gz` (MANIFEST.json y SHA256SUMS externos).
Sin env ni dos logs históricos sensibles; originales intactos cotejados por hash.
Restaurar en otro directorio sobre el HEAD del manifiesto, no encima del workspace.

No hay bloqueo nuevo para el objetivo privado. Siguen pendientes en Identity:
AuthCore/Prisma de compatibilidad dentro del servicio autorizado, esquema operativo
compartido/relaciones, puentes financieros/Alerts, sesión Redis, transporte/claves,
retención y recuperación ante pérdida de infraestructura. El puerto no es una
capability ni revocación atómica de RPC ya autorizado. No se declara autonomía.
Próximo paso: especificar transporte y autenticación de servicio del puerto para
un ensayo de despliegue seguro, sin activar tráfico público ni abordar otras
separaciones de datos/negocio en esta misión.


## Misión 5.9 — revisión de transporte y decisión requerida

[Propuesta concreta y alternativas](mision5-9-transporte-propuesta.md).
Se revisaron HTTP/Bearer del llamador 5.8, credencial técnica/timingSafeEqual del
proveedor, HMAC/ventana de Gateway y TLS/CA del SMTP sintético. El canal 5.8 aún no
cifra ni autentica a FuelFlow como servicio. HMAC kiosk no identifica a un humano
y sus cabeceras no se deben reutilizar para Control.

Hay dos opciones con consecuencias operativas importantes: **A, recomendada para
el siguiente ensayo**, TLS de servidor + clave exclusiva por servicio con registro
de permisos/vigencia/revocación y nonce compartido; **B**, mTLS con principal técnico
mapeado a certificado y gestión de CA/rotación/revocación, más nonce compartido.
El documento define alcance, autoridad técnica/humana separadas, falla segura,
ventana propuesta y pruebas de cifrado/replay/recuperación. Se solicita autorización
para A o B antes de adoptar, tal como exigió el usuario. No se provisiona un nuevo
mecanismo ni se modifica el transporte actual por una decisión implícita.

La correlación durable no cambia: un reintento futuro tendrá nonce de transporte
nuevo pero callerOperationId/intentId/commandId originales. La identidad técnica
nunca sustituye Bearer, authVersion o permisos humanos. TLS con CA/nombre/vigencia
validados, sin downgrade HTTP ni desactivar verificaciones. Ninguna de estas nuevas
propiedades se presenta como implementada o validada todavía.

**Timeouts 5.8:** se identificaron cuatro hooks hash bcrypt costo 12 y un login de
usuario desconocido que espera dummyHash+compare costo 12. No son consultas HTTP,
PostgreSQL o Redis en esos casos sintéticos. Script nuevo
`tools/astra/identity-timeout-investigation.cjs`: cuatro muestras aprobadas usando
bcrypt real y AuthService compilado, repositorio falso sin JWT emitido; sin cambios
de fuente, costo o deadline. Hash/login sin inyección: 2493/4019ms de pared;
con bloqueo controlado del event loop 5300ms: 5986/9097ms, loop delay máximo 5423ms.
La espera controlada no quema CPU ni carga otros servicios. Se reproduce el mecanismo
de agotar 5s, no el scheduler histórico. Dos CPUs y carga observada no bastan para
atribuir causalidad; no había perfil del proceso original. **Causa histórica exacta
pendiente; el 14/14 secuencial no la resuelve.** No se amplían timeouts ni baja bcrypt.

Evidencias nuevas: `evidence/identity-mission5-9-timeout-diagnostic.txt` y
`identity-mission5-9-review.txt`. No se repiten suites de aplicación: no se modifica
código de servicios/clientes, autenticación o persistencia. Pruebas del transporte
nuevo quedan pendientes de la elección, incluyendo servicio/credencial inválidos,
TLS, expiración/revocación, replay concurrente, interrupción y recuperación. Solo
se ejecutó el diagnóstico descrito y verificaciones de formato/sintaxis/integridad.

Preservación: **115 archivos previos de evidencia** (incluyen los 111 solicitados)
y los **34 JSON** cotejados por SHA-256. Todo código previo de aplicación conservado;
solo este informe existente se actualiza, más nuevos script/propuesta/evidencias.
Rama/HEAD intactos, sin commits/push/merge ni cambios de datos/volúmenes operativos.
Respaldo 5.8 verificado por hash del archivo y sus 286 miembros. Respaldo previo:
`/home/primax/.local/state/primax-backups/mission5-9-before-20261115T223722Z/pending-work.tar.gz`.
Respaldo final recuperable verificado por archivo/miembros y contra workspace:
`/home/primax/.local/state/primax-backups/mission5-9-final-20261115T224330Z/pending-work.tar.gz`, con MANIFEST.json y SHA256SUMS externos.
Se excluyen env y dos logs sensibles históricos; sus originales siguen intactos.

Identity conserva las dependencias 5.8 (Prisma/esquema compartido, AuthCore dentro
del servicio autorizado, finanzas/Alerts, sesión Redis, retención y despliegue).
No se declara autonomía. Próximo paso: aprobación explícita de A o B, implementación
y pruebas de esa alternativa en laboratorio; no abordar otras separaciones ahora.


## Misión 5.9 — implementación autorizada de opción A

[Solución efectiva, pruebas y operación de credenciales](mision5-9a-transporte-laboratorio.md).
Se implementó perfil opcional IDENTITY_SERVICE_TLS_LAB/FUELFLOW_SERVICE_TLS_LAB:
HTTPS nativo Node con CA/nombre/vigencia verificados, mínimo TLS1.2, sin HTTP fallback,
redirects o excepciones inseguras. Solo tres rutas privadas V2. No se cifra por
inferencia el ingreso humano loopback o el salto operacional Identity→proveedor,
que conservan los canales previos; no se amplía esta misión a esos enlaces.

Principal técnico fuelflow-private, keyId y secreto exclusivo aleatorio 32 bytes,
separados del Bearer humano. Registro propio sintético con digest/alcance/notBefore/
expiresAt/revokedAt y ledger único por (keyId,nonce) compartido entre instancias.
Ventana 30s y skew5s, inserción atómica con política Serializable existente, sin
cache, respaldo local ni retry RPC. Credencial/nonce se validan antes de AuthCore;
ambas autoridades son obligatorias. execute resuelve intención y contrasta estación
antes de cualquier consulta de recibo/emisión. No se modifica AuthCore ni el login.

Rotación: provisionar otra keyId/digest/alcance; reemplazar atómicamente el archivo
externo 0600 y revocar la anterior. Se relee por petición; la revocación se revalida
también con conexión TLS reutilizada. No se crea API de Administration. Rol consumidor
solo SELECT del registro e INSERT/SELECT de ledger; FuelFlow sin acceso SQL a ambos.
No se guardan claves planas, body, JWT o token de respuesta en el ledger. Material
TLS/credenciales solo sintéticos/efímeros fuera del repositorio, eliminado al cierre.

El nonce de transporte cambia en un reintento explícito, **callerOperationId,
intentId y commandId no**. Un nonce consumido no acredita commit de negocio. La
unidad terminal/operación/credencial/auditoría/recibo permanece en el proveedor;
no hay transacción distribuida o rollback ficticio. No se promete cancelar un RPC
ya autorizado/en curso al revocar. Los nonces no se eliminan/reciclan en este ensayo.

Laboratorio `primax-m5-1794784451041-35392d2e`: **15/15**, exit 0,
fullRegression=false. Cinco grupos de arranque/paridad/aislamiento y diez de TLS/
autenticación/replay/recuperación, con dos Identity HTTPS y dos FuelFlow privados.
CA desconocida, hostname erróneo, certificado realmente expirado y HTTP plano
rechazados; servicio/secreto inválidos, ventana vencida/futura/excesiva y permisos
técnicos insuficientes rechazados. Seis peticiones con nonce igual entre instancias:
una 200 y cinco 409; body alterado con ese nonce también 409. Registry/ledger sin
permiso SQL devuelven 503 y recuperan tras restaurar permiso, sin fallback.

Se probaron seis ejecuciones concurrentes, reinicios, intenciones distintas de
contenido igual, respuesta TLS perdida después del commit, recuperación en otra
instancia y credencial de terminal revocada: un credential/audit/receipt por operación.
La rotación recupera el recibo original, no emite de nuevo. La clave vieja revocada
falla en la misma conexión TLS; permisos/authVersion humanos revocados siguen
rechazados aun con clave técnica nueva válida. Paridad de superficie de 27 rutas.

Comando: `node tools/astra/identity-isolated.cjs --service-tls --consumer-only`.
Evidencia nueva `evidence/identity-mission5-9a-service-tls.txt`.
Build fresco fuera del repo con fuente d43ecfdfc1f353a6fce56ed9f596479df1d8e6d68600f8b7d0b6560cfe853c7b
y dist a66d96881cc5f875aa8cfced113420bf296b51afa9feaed15331adaa74ade39a.
PostgreSQL/Redis/SMTP nuevos, sin bases/claves/volúmenes previos; contenedores propios
detenidos, archivos efímeros de certificados/secretos borrados. DDL explícito solo
en la nueva base sintética; no se aplican migraciones en startup ni sobre bases reales.

Pruebas enfocadas: Identity **44**, cliente V2 **3**, caller/transporte **12**,
Gateway **24**, combinado **83/83**; FuelFlow legado **28/28**. Build propio Identity/
FuelFlow, sintaxis, formato y git diff --check aprobados. Sin fallos de pruebas o
integración en esta etapa. No se repiten Backend completo, Prime/Catalog o caídas
PG/Redis por cambios confinados al circuito privado; no se atribuye aceptación
completa de contratos funcionales anteriores al cotejo de su superficie. Comandos/
salidas en `evidence/identity-mission5-9a-regression.txt`.

Archivos nuevos: consumer/service-transport.ts y test/service-transport.test.cjs
Identity; prisma/lab-service-transport.sql y lab-service-nonces.sql; FuelFlow/lab
service-transport.cjs/test.cjs; tools/astra/identity-service-tls-fixture.cjs e
identity-service-tls-checks.cjs; informe 5.9a y dos evidencias TXT. Adaptados: consumer
main/server/intent, caller/remote-control/package.json, dos runners privados y la
propuesta histórica 5.9, además de este informe. Sin nuevas dependencias npm.
Snapshots AuthCore, login, clientes productivos, Catalog y Dezkz conservados.

Integridad: **117 evidencias previas** (incluyen las 115 solicitadas) y **34 JSON**
con SHA-256 intactos. Rama/HEAD conservados; sin commits, push o merge. Respaldo
anterior 5.9 revisado por SHA-256 de archivo y 290 miembros. Respaldo previo nuevo:
`/home/primax/.local/state/primax-backups/mission5-9a-before-20261115T230840Z/pending-work.tar.gz`.
Respaldo final recuperable verificado por archivo/miembros y contra workspace:
`/home/primax/.local/state/primax-backups/mission5-9a-final-20261115T232643Z/pending-work.tar.gz`, con MANIFEST.json y SHA256SUMS externos.
No se archivan env ni dos logs históricos sensibles; sus originales quedan intactos.

Los timeouts 5.8 no se declaran resueltos por TLS: la causa histórica exacta sigue
pendiente según diagnóstico 5.9. No se modifican coste bcrypt ni límites para
ocultarlos. Identity aún conserva Prisma/esquema operativo compartido, AuthCore de
compatibilidad, puentes financieros/Alerts y sesión Redis; faltan gestión de secretos/
CA, retención/HA y políticas de despliegue. No hay autonomía ni integración productiva.
Próximo paso concreto: especificar retención, rotación y recuperación del registro/
ledger y ensayar despliegue privado con secretos administrados, manteniendo apagado
el tráfico público y sin ampliar ahora separaciones de negocio.

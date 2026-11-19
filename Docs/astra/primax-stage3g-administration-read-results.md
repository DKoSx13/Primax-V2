# Astra — Etapa 3G: lecturas administrativas acotadas

## Registro previo y clasificación

Rama feat/dezkz-identity-a4-core, referencia
`26d2d86234f28b6950d174745a0a03c145137120`. Sin cambios versionados/staging;
fuentes, archivos protegidos, migraciones y nueve evidencias históricas intactos
por hash. Administración operativa: apps/administration/main.ts → ControlModule.
Contrato de Etapa 1 contrastado con control-customers.controller.ts y Gateway.

No se identifican listados de negocio administrativos anónimos elegibles A.
Las lecturas puras revisadas pertenecen a B por sus controles de acceso.

| Clase | Rutas existentes | Decisión |
|---|---|---|
| B seleccionada | GET /api/v1/control/customers | ADMIN_CUSTOMER_VIEW; datos de cliente con campos condicionales y correo enmascarado para no globales. |
| B seleccionada | GET /api/v1/control/memberships | ADMIN_MEMBERSHIP_VIEW; búsqueda y status opcional; balance sólo global. |
| B seleccionada | GET /api/v1/control/vehicles | ADMIN_VEHICLE_VIEW; actividad/placa/etiqueta/cliente dentro del alcance. |
| B diferida | GET /control/customers/:userId, /memberships/:membershipId, /transactions, /transactions/:transactionId, /receipts/:transactionId | Proyecciones/detalles Control actuales; no se migran sus métodos o mappers. |
| B diferida | GET /control/session, /accounts, /dashboard, /incidents, /incidents/:id | Seguridad de sesión/gestión e informes con reglas propias; no seleccionadas. |
| B diferida | GET /control/operations, /operations/:operationId, /terminals, /inventory, /inventory/movements, /inventory/:stationId/:fuelId/reconciliation, /audit | ControlOperationsService y dependencias actuales; no se extraen ni modifican. |
| B diferida | GET /api/v1/inventory/:stationId/:fuelId/reconciliation | InventoryModule importado por Administration, acceso admin distinto de Control, inspección dentro de atomic. Fuera del lote. |
| C excluida | POST /control/access-requests, /verify-email, /resend-verification, /login, /logout, /accounts y cambios de cuenta/acceso/estado | Cuentas, cookies, grants, asignaciones, auditoría o seguridad mutable. |
| C excluida | POST /control/terminals/:id/status, /inventory/receipts, /inventory/:stationId/:fuelId/reconcile, /incidents/:id/status | Efectos operativos/inventario/auditoría; ninguna extracción. |
| C excluida | POST /api/v1/inventory/:stationId/:fuelId/{reconcile,activate} | Inventario, activación y auditoría; quedan en su implementación original. |
| Fuera de Administration | GET /control/catalog/{stations,inventory} | Las ejecuta Catalog, aunque sean consumidas por Control. |
| Fuera de Administration | GET /admin/alerts y /admin/dashboard; /memberships/me y /vehicles | Identity; alerts además reconcilia y escribe pese a ser GET. No se incluye. |
| Fuera de Administration | /control/payments, /control/assistance, /control/terminal-operations | Excepciones del Gateway hacia Commerce; no se trasladan por su prefijo. |

Las tres seleccionadas usan ControlCustomersService y PrismaService, sin
repositorio separado ni escrituras. Se conservan consultas y proyecciones íntegras.
No se añade un repositorio nuevo para replicar SQL.

## Contratos y permisos previos

AccessGuard de Control conserva Bearer o cookie primax_control, firma/issuer/
audience/expiración, cuenta activa/authVersion y grants actuales. Requiere
SYSTEM_ADMIN o cuenta aprobada/verificada con ADMIN_CONTROL_ACCESS. Firma de
kiosco en Control: 403 antes de autorizar kiosco. Cookie y atributos de login/
logout no cambian. Estas tres lecturas GET no exigen token CSRF en el código
actual: no se añade ni se retira una validación. Los comandos con sus efectos
de seguridad quedan intactos; probar GET sin CSRF no autoriza comandos sin CSRF.

Cada método exige su permiso específico, incluso si el actor es global en una
invocación interna. El guard configura los permisos de SYSTEM_ADMIN como antes.
El helper scope conserva validación de global/stationIds y rechazos por permisos,
estaciones no asignadas o stationId ajeno. No se confía en actor/estaciones enviados
en headers, query o body. Los grants y asignaciones persistidos sólo se leen.

El alcance de membresía/vehículo se deriva de transacciones o autorizaciones en
estaciones asignadas. El predicado de búsqueda debe combinarse mediante AND con
ese alcance; buscar una placa, nombre, número o email ajeno no lo sustituye.
Se conservan filtros anidados para vehículos y última actividad. Un miembro con
actividad en A y B puede aparecer para A, pero sólo con sus relaciones autorizadas
para A. No se inventa una estación propietaria en User o Membership.

Filtros: customers/vehicles admiten stationId UUID opcional y q string de máximo
80; memberships además status ACTIVE/SUSPENDED. q se trimmea y usa contains
insensitive según el método original. Status no se agrega a customers/vehicles.
No hay page/limit aceptados: límite fijo take=100. Customers/memberships ordenan
createdAt desc; vehicles updatedAt desc. No se añade desempate ni metadatos.

Global sin stationId consulta el conjunto permitido globalmente; global con
stationId aplica el filtro. UUID inexistente global: []; no global ajeno: 403 antes
de leer. La consulta no agrega filtro active de Station: un global puede consultar
actividad histórica de una estación inactiva. El guard excluye estaciones inactivas
de las asignaciones actuales del personal. Listas vacías: 200 []; query inválida,
campo extra o paginación no declarada: 400. No se añade 404 por ausencia de filas.

Customers excluye usuarios inactivos tras consultar y condiciona membership a
ADMIN_MEMBERSHIP_VIEW y vehicles a ADMIN_VEHICLE_VIEW. Email no global se enmascara;
balance no global no se devuelve. Memberships mantiene su consulta/proyección
propia, sin uniformar ese tratamiento de User.active con customers. Vehicles
conserva customer/membership null y evidencia de uso conforme la respuesta vigente.
Fechas/Decimal, null, claves, errores y mapper continúan idénticos.

## Diseño del cambio autorizado

Tres métodos del caso de uso agrupado de listados, puerto explícito y adaptadores
inbound/local en Backend/services/administration/src. Las consultas y mappers de
los tres métodos se trasladan literalmente a compatibilidad; la fachada original
delega sólo esas llamadas. Cuatro helpers compartidos (scope, filtros de actividad
y máscara de correo) se trasladan una sola vez a contexto legacy protegido,
reutilizado por los métodos no migrados. Esto evita duplicar reglas de seguridad.
Los demás cuerpos de ControlCustomersService y todos los servicios de escritura
permanecen intactos. Aplicación sólo depende de puertos y Actor puro existente.

Los Dockerfiles Administration y legacy necesitarán copiar el árbol nuevo, sin
cambiar entrypoints. No se activa otro proceso ni autoridad de lectura/escritura.
La comparación utilizará clase original congelada del commit de referencia,
PostgreSQL/Redis nuevos y guard/JWT reales. No se usará login administrativo ni
se modificarán cuentas/grants/asignaciones fuera de los fixtures iniciales nuevos.

## Resultados

Lote completado únicamente para los tres GET seleccionados. No se declara
Administration completo ni equivalencia funcional universal.

### Arquitectura incorporada

```text
ControlCustomersController vigente + AccessGuard vigente
  → ControlCustomersService (fachada compatible)
  → AdministrativeListsAdapter (entrada)
  → AdministrativeLists (aplicación, dependiente de puerto)
  → AdministrativeListSource (puerto)
  → LegacyAdministrativeLists (compatibilidad/persistencia local)
  → PrismaService global existente → única PostgreSQL
```

AdministrativeListsModule compone e inyecta el flujo. Los tipos concretos de
respuesta se infieren del adaptador legacy, sin copiar mappers ni crear un modelo
financiero común. Actor se importa como tipo del contrato puro existente
identity-core/domain; no se invoca Identity. No se introduce dominio artificial
para una proyección de lectura. LegacyCustomerReadContext aloja una sola copia
de los cuatro helpers compartidos, con visibilidad protegida para los dos
consumidores; no expone endpoints. Se verificaron por AST los **17 cuerpos de
métodos originales**: tres trasladados literalmente, cuatro helpers trasladados
literalmente y diez métodos restantes conservados. No cambian consultas,
algoritmos, errores ni mappers.

### Ejecuciones y resultados reales

| Verificación | Evidencia privada local | Resultado |
|---|---|---|
| Línea base previa a extracción | `.cache/astra-stage3g/run-7d8f5b4a6337` | 25 Jest en dos suites; 24 Gateway y 9 empaquetado, sin fallos. |
| Primera ejecución nueva | `run-65f7eb26cfeb` | Falló el tipo de un mock del nuevo test; se corrigió el test, sin cambiar consultas. |
| Primera validación nueva satisfactoria | `run-bc395c490ad8` | 29 Jest, Gateway/empaquetado y cinco compilaciones correctos. |
| Regresión ampliada | `run-cfb6491b3a13` | 47 Jest en siete suites, 24 Gateway, 9 empaquetado; cinco builds correctos. |
| Validación final tras ordenar imports | `run-33c78542b240` | Mismos 47 + 24 + 9 correctos; Catalog, Identity, Administration, Commerce y legacy compilan. |
| Comparación SQL/HTTP inicial satisfactoria | `primax-astra-stage3g-ba98bf0fc670` | 97 comparaciones y 194 solicitudes; tablas/secuencias sin cambios. |
| Comparación reforzada final | `primax-astra-stage3g-bfbe937b33eb` | 97 comparaciones y 194 solicitudes; conexiones de lectura con default_transaction_read_only=on. |

Todas las referencias abreviadas anteriores están bajo `.cache/astra-stage3g/`.
Jest incluye alcance de clientes y detalles no migrados, límites de 100, mock
semántico de filtros Prisma, cookies, alta administrativa con dobles sin base,
dashboard EcoDigital, correo deshabilitado, acceso técnico y nueva aplicación.
Los tests de alta y correo sólo usan mocks; no ejecutan comandos reales.

| Operación | Comparaciones original/nueva | Solicitudes reales | Casos específicos |
|---|---:|---:|---|
| GET /api/v1/control/customers | 32 | 64 | Actividad A/B, relaciones anidadas, enmascarado, balance oculto, permisos relacionados y usuario inactivo excluido. |
| GET /api/v1/control/memberships | 34 | 68 | Filtro status combinado con estación y búsqueda, status inválido, balance y proyección propia. |
| GET /api/v1/control/vehicles | 31 | 62 | Vehículos de actividad autorizada, placa ajena sin resultados, evidencia y serialización. |

En las tres: asignación A/B/múltiple, global, estación explícita/ajena/inexistente/
inactiva, asignación finalizada, falta/revocación de permiso, falta de acceso
Control, aprobación pendiente, cliente no administrativo, sin sesión, token
inválido/vencido, usuario inactivo, authVersion desfasado, cookie, precedencia
Bearer/cookie, rechazo kiosco, UUID inválido, q larga, paginación no admitida y
búsqueda sin resultados. Paridad de JSON completo, orden, null y fechas;
únicamente se excluye timestamp de errores generado por cada solicitud.
Se añaden aserciones independientes sobre los IDs de estaciones permitidas,
vehículos anidados, redacciones y resultados esperados para evitar que una
comparación de dos implementaciones igualmente permisivas parezca suficiente.

Los errores y rechazos HTTP 400/401/403 se comparan con la referencia. No se
agrega un 404 donde el listado vigente devuelve 200 []. No se prueba un comando
POST ni se certifica su política CSRF a partir de estas lecturas.

### Aislamiento y preservación

Se crearon cuatro proyectos nuevos y exclusivos, cada uno con PostgreSQL 17.6,
Redis 7.4, dos volúmenes nuevos verificados vacíos, red interna propia y cero
puertos publicados. Las 36 migraciones existentes se ejecutaron sólo después de
comprobar identidad/rol/base vacía, montajes y etiquetas del proyecto sintético.
No se ejecutaron seeds operativos ni login, altas, grants o asignaciones mediante
comandos de negocio: los datos iniciales son fixtures sintéticos directos.

Los dos primeros intentos de integración (`4c934b569f13`, `77e34d6c10ee`) fallaron
por el fixture: correo con mayúsculas rechazado por user_email_canonical, y
omisión de APP_MODE local en el cliente Redis. Se corrigió exclusivamente el
harness; se preservaron ambos intentos y se usaron proyectos y volúmenes nuevos
en las repeticiones. Ninguna restricción operativa se flexibilizó.

La ejecución reforzada conserva idénticas las 41 tablas (158 filas sintéticas,
incluidas migraciones) y sus secuencias antes/después. Redis responde PONG y
conserva cero claves; estas tres lecturas no dependen de Redis para autorización.
Su accesibilidad no prueba recuperación de sesiones Redis. Se detuvieron sólo
los cuatro proyectos creados, PostgreSQL/Redis con exit 0. Se conservaron ocho
volúmenes nuevos, redes y evidencias. Los tres volúmenes originales 2B siguen
presentes y no se montaron ni iniciaron; T01 no se consultó ni modificó.

Nueve evidencias originales: mismos SHA-256, excluidas del commit. Se verifican
también fuentes de 3F, AuthCore, guard, PasswordReset, Prisma, Gateway, Compose,
36 migraciones y cierre académico. El único cambio en el Dockerfile legacy es
COPY de administration/src; el operativo Compose no cambia.

### Empaquetado y comandos

Comandos ejecutados, con logs privados y manifiesto saneado en
`Docs/astra/evidence/stage3g/review-summary.json`:

```text
node tools/astra/stage3g-administration-validation.cjs --baseline
node tools/astra/stage3g-administration-validation.cjs
node tools/astra/stage3g-postgres-redis.cjs
docker build -f services/administration/Dockerfile -t primax-astra-administration:stage3g .
docker build --target build -t primax-astra-legacy:stage3g .
```

Los dos build Docker se ejecutaron desde Backend. El harness offline copia
fuentes sin .env al contenedor de validación con --network none; allí ejecuta
Jest, node --test gateway/routes.test.cjs, node --test scripts/build-domain.test.cjs,
scripts/build-domain.cjs para cada servicio y tsc -p tsconfig.build.json para
legacy. El harness SQL genera su Compose privado, ejecuta migrate deploy en la
base nueva y detiene únicamente su propio proyecto. No se levantó Compose
operativo. Ambos artefactos nuevos cargan ControlModule y la composición
hexagonal sin bootstrap ni red. Administration mantiene su entrypoint y usuario
node. No se activan estas imágenes en Compose.

### Inventario exacto para el único commit

Modificados:

- `Backend/Dockerfile`: copia de la nueva fuente para build legacy.
- `Backend/services/administration/Dockerfile`: copia para build independiente.
- `Backend/src/control/control.module.ts`: import del módulo de composición.
- `Backend/src/control/control-customers.service.ts`: fachada y contexto compartido.
- `Backend/src/control/control-customers-scope.spec.ts`: inyección del flujo y aserciones de límite/alcance de vehículos.
- `Backend/test/control-customers.e2e-spec.ts`: sólo adaptación de construcción; no se ejecutó su base histórica.

Nuevos:

- `Backend/services/administration/src/application/ports/administrative-lists.ts`.
- `Backend/services/administration/src/application/use-cases/administrative-lists.ts`.
- `Backend/services/administration/src/adapters/inbound/administrative-lists.adapter.ts`.
- `Backend/services/administration/src/adapters/outbound/legacy-administrative-lists.ts`.
- `Backend/services/administration/src/adapters/outbound/legacy-customer-context.ts`.
- `Backend/services/administration/src/bootstrap/administrative-lists.module.ts`.
- `Backend/src/control/administration-lists.spec.ts`.
- `Backend/test/administration-lists.fixture.ts`.
- `Backend/test/administration-lists.integration.cjs`.
- `tools/astra/stage3g-administration-validation.cjs`.
- `tools/astra/stage3g-postgres-redis.cjs`.
- `Docs/astra/primax-stage3g-administration-read-results.md`.
- `Docs/astra/evidence/stage3g/review-summary.json`.

Total: 19 rutas del lote. Las credenciales efímeras, JWT, logs privados y Compose
generado permanecen fuera del commit. No hay contraseñas utilizables ni datos
personales reales en los fixtures versionados; las credenciales de ejecución se
generan aleatoriamente en memoria y bajo .cache ignorado.

### Dependencias, límites y continuación

Se conserva PrismaService global, guard/UsersService, contrato Actor compartido,
lecturas locales de datos actualmente escritos por otros módulos y diez métodos
legacy de la fachada. No se trasladó la propiedad de User, Membership, Vehicle,
movimientos ni inventario. La infraestructura hexagonal no otorga autonomía de
datos ni cambia una transacción por HTTP.

Los tests HTTP usan el controlador, guard, DTO, filtro de errores y composición
Nest reales sobre SQL real. No representan una nueva prueba completa del
bootstrap/throttler, Gateway en red, frontends, login, seguridad CSRF de comandos,
finanzas de escritura, concurrencia o recuperación T01. No se atribuyen a este
lote garantías de producción o restauración no comprobadas.

Aceptación: tres lecturas con paridad y rechazos comprobados, ninguna escritura,
cinco compilaciones y empaquetado correctos, contratos protegidos y evidencias
intactos. Reversión: revertir únicamente el commit de 3G tras autorización,
incluidos composición/tests/COPY; no requiere SQL ni reversión de datos. Ninguna
imagen operativa se sustituyó.

Siguiente incremento recomendado, sujeto a nueva autorización: agrupar los
detalles de cliente y membresía de Administration, reutilizando el contexto
compartido, con pruebas de redacciones e historial por estación. Las escrituras,
inventario, Commerce y los demás servicios quedan fuera de esta entrega.

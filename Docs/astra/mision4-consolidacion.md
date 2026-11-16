# Misión 4 — consolidación (13 noviembre 2026)

Estado vigente: clasificación de negocio aprobada, aceptación final 22/22 y tráfico
existente sin cambios. El inventario legado conserva exposición temporal autorizada.
Véanse el resultado final al pie, `catalog-auth-contracts.md`,
`catalog-inventory-migration.md` e `identity-next-mission.md`.
Las secciones previas conservan el historial y sus limitaciones de cada etapa.

Base verificada: rama `feat/astra-hexagonal-microservices`, HEAD `b99b995`;
`11262d0` conserva la extracción previa. Los ocho JSON sin seguimiento se conservan;
no hay commits, cambios de rama, despliegues ni cambios de datos en esta misión.

## Diagnóstico y límites

`Backend/src/apps/*/main.ts` define cuatro procesos reales. `compose.yaml` usa
la misma imagen Backend para todos; `apps/bootstrap.ts` importa PrismaModule,
AuthCoreModule, AlertsModule y HealthModule. Independencia de procesos no implica
independencia de código ni datos. Todos los procesos originales usan Prisma;
Catalog independiente utiliza pg, sin Prisma ni imports de Backend.

| Servicio / propiedad lógica propuesta | Casos de uso y dependencias actuales | Puertos y adaptadores a consolidar |
|---|---|---|
| Identity: usuarios, vehículos, sesiones, permisos de identidad | AuthModule, MembershipsModule, VehiclesModule; Prisma, JWT, Redis, entrega de recuperación. Memberships mezcla consultas de fidelización con identidad | Autenticar, verificar actor y revocar sesión; puertos de cuentas, sesiones, correo y consulta de membresía; HTTP, PostgreSQL, Redis. Contrato versionado de actor con estación y permisos |
| Catalog: proyecciones de Fuel, Station, Benefit, FuelInventory; sin propiedad de escritura | Listar combustibles, estaciones, beneficios e inventario; pg y PostgreSQL compartido | CatalogReader, Catalog en TypeScript puro; PostgresCatalog y controladores Nest. GET internos v1 con clave; estación opcional confiable |
| Administration: configuración operativa, auditoría y administración de estaciones | ControlModule importa InventoryModule; ControlCustomersService y ControlOperationsService acceden a Prisma. También JWT y RecoveryDelivery; mezcla cuentas, clientes y operaciones financieras | Puertos futuros de auditoría/configuración y clientes de Identity/Commerce. HTTP autorizado; comandos financieros delegados a Commerce, nunca SQL remoto |
| Commerce: transacciones, reservas, inventario mutable, pagos, comprobantes, saldos y fidelización | TransactionsModule, OperationsModule, AssistanceModule; repositorios Prisma y transacciones PostgreSQL | Puertos de pagos, libro financiero, inventario y consulta de identidad; adaptadores HTTP/Prisma actuales. Comandos idempotentes y eventos con outbox antes de separar datos |

La propiedad es lógica y propuesta: hoy las tablas siguen compartidas. Administración
puede configurar estaciones, combustibles y beneficios; Catalog solo proyecta.
InventoryModule dentro de Control es una frontera pendiente: reconciliación y
movimientos pertenecen a Commerce, supervisión a Administration. No trasladar tablas
ni fragmentar transacciones por el nombre de una ruta.

`Backend/gateway/routes.cjs` conserva precedencia: wallet/recharges y pagos de
Control van a Commerce; auth/memberships/vehicles a Identity; lecturas a Catalog;
resto de Control/inventory a Administration. `server.cjs` conserva cookies,
Authorization y solicitud firmada, sin autenticar el actor; timeout 15 s, error 502,
sin reintentos. Su health agregado consulta `/api/v1/health`; el Catalog nuevo
expone `/health` y `/health/ready`: cambiar solamente CATALOG_URL rompería el health.

Riesgos de extracción: firma kiosk y CSRF, revocación y permisos, filtrado de
estación, formatos decimales/fechas, rutas superpuestas de membresías y Control,
y atomicidad de pagos/reservas/saldos. Los controladores antiguos de stations y
fuels filtran según CurrentActor; la clave interna nueva no sustituye esa política.

## Implementación acotada

`services/catalog/src/adapters/http.ts` conecta el filtro existente del caso de uso
con `stationId` opcional en GET stations y fuels/inventory. Rechaza valores vacíos,
repetidos o inválidos con 400; estación inexistente devuelve []. Conserva respuestas
sin parámetro y exige clave antes de resolver datos. Pruebas HTTP reales cubren
ambas rutas y ausencia de clave. No cambia endpoints anteriores ni rutas públicas.

El núcleo domain/application sigue sin Nest, HTTP ni pg. El adaptador conserva
transacciones READ ONLY, límites de conexión y consulta de 5 s, decimales string,
arrays y relaciones de inventario. Es necesario además un rol SELECT: no se ha
certificado el rol real ni se han cambiado permisos de ninguna base.

La integración pública permanece bloqueada por una fachada que derive stationId
del actor autenticado, ignore alcance enviado por el cliente y preserve permisos,
firmas, CSRF y errores. No apuntar el Gateway directamente al servicio interno.
Antes del cambio: probar usuarios anónimos, Prime, Control, kiosk de dos estaciones,
revocación, clave errónea, paridad de cuerpos/fechas/decimales, health diferenciado,
caída y reinicio sin afectar peticiones de Identity/Commerce/Administration.
La caída debe fallar con 502/503 acotado, sin reintentar operaciones financieras.

## Validación de esta misión

- `npm test --prefix services/catalog`: compilación y 5 pruebas aprobadas, con
  casos HTTP adicionales de alcance. Persistencia simulada; no certifica PostgreSQL real.
- Backend: tras `npm ci --prefix Backend --ignore-scripts` y generación local de
  Prisma Client (sin acceso a base), `npm run build --prefix Backend` aprobado;
  `npm test --prefix Backend -- --silent`: 30 suites y 247 pruebas aprobadas.
  Los primeros intentos fallaron por ausencia local de Jest/TypeScript; se resolvió
  instalando el lockfile existente, sin modificar dependencias.
- `node --test Backend/gateway/routes.test.cjs`: 23 aprobadas.
- `docker compose config --quiet`: aprobado.
- Docker disponible 29.9.3; los cuatro procesos QA reportan healthy.
- GET por Gateway QA de Prime (28182): health 200 con seis upstreams up;
  fuels, stations, benefits e inventory: 200, conteos 3/1/3/3.
- No se ejecutaron reinicios ni integración del nuevo Catalog con PostgreSQL:
  el contenedor independiente no estaba activo. La evidencia anterior no cuenta
  como ejecución de esta misión. Tampoco se certifica paridad real nueva.
- CI inspeccionada: `.github/workflows/ci.yml` ejecuta demo, Jest, PostgreSQL,
  contratos y smoke; `catalog.yml` compila, prueba y construye imagen independiente.
  Las pruebas nuevas entran en ese pipeline sin cambiarlo.

## Siguiente misión ejecutable

1. Completar fachada Catalog en el proceso antiguo, detrás de opción desactivada:
   AuthCore resuelve actor; un puerto de lectura consume HTTP interno con timeout,
   clave de servicio y alcance derivado. Conservar adaptador Prisma para reversión.
   Crear laboratorio sintético propio para contratos, fallo/reinicio y rol SELECT.
   Activar tráfico únicamente después de aprobar esa matriz.
2. Identity: extraer casos de uso y puertos de cuentas/sesiones/vehículos, separar
   consultas financieras de Memberships y publicar contrato de actor/revocación.
   Mantener recuperación actual; no implementar nuevos requisitos de correo.
3. Administration: sustituir acceso a cuentas y operaciones por esos contratos;
   extraer configuración/auditoría, dejando movimientos de inventario en Commerce.
4. Commerce al final: inventariar límites de cada transacción SQL; conservar pagos,
   reservas, inventario y saldos juntos. Diseñar clave idempotente persistida,
   outbox en la misma transacción, consumidores deduplicados, reintentos acotados,
   conciliación y recuperación antes de separar persistencia.

Este orden reduce dependencia de autenticación antes de extraer supervisión y
mantiene intacta la frontera financiera. No se mueven proyectos a otras carpetas.

Pruebas existentes inspeccionadas en `Backend/test`: pagos v2, conciliación de
inventario, terminal, Control, recuperación y clientes. Son candidatas a la matriz
de regresión en una base sintética aislada; no se ejecutaron contra QA compartido.
Comparación estática: `fuels.repository.ts`, `stations.repository.ts` y
`benefits.repository.ts` mantienen activos y orden por código; inventario incluye
fuel/station sin excluir inactivos. El orden de inventario no está garantizado en
el repositorio anterior; comparar por claves, además de validar cada objeto.

## Continuación: fachada y PostgreSQL sintético

Implementados `Backend/src/catalog-reader/catalog-reader.ts` y su suite:
CatalogReader selecciona HTTP exclusivamente con `CATALOG_READ_ADAPTER=http`;
por defecto los tres servicios de lectura usan sus repositorios anteriores.
ConfigService inyecta CATALOG_INTERNAL_URL y CATALOG_API_KEY; timeout 5 s,
sin redirecciones, sin reintentos y error 503 si falla la dependencia. Los
controladores conservan AuthCore/CurrentActor: parámetros públicos no se propagan.
El filtrado final usa estación kiosk/terminal y asignaciones de Control no global.
Kiosk sin estación falla con 403. Las lecturas públicas siguen públicas; AuthCore
retorna antes de interpretar tokens en endpoints Public, así que no se afirma
que Control se resuelva en esas rutas. Su rama de filtrado queda preparada para
actores Control ya autenticados. La política actual permite consulta pública
sin estación: no convertir estas rutas en privadas sin aprobar otro contrato.

Gateway mantiene CATALOG_URL dirigido a la fachada antigua. La variable opcional
CATALOG_INTERNAL_HEALTH_URL agrega una sonda catalogRead a `/health/ready`,
sin cambiar el health `/api/v1/health` de la fachada. Sin esa variable, comportamiento
anterior. No se modificó Compose ni variables de contenedores existentes.

`node tools/astra/catalog-isolated.cjs` ejecutado y aprobado: crea exclusivamente
un contenedor PostgreSQL nuevo, nombre único, loopback dinámico y datos en tmpfs;
no monta volúmenes existentes. Crea cuatro tablas sintéticas, fixtures y rol SELECT.
Arranca Catalog real y compara los cuatro GET sin stationId con consultas Prisma
iguales a las de los repositorios anteriores, incluyendo combustible inactivo en
inventario y cadenas decimales. Comprueba estación, denegación de DELETE, caída y
reinicio, persistencia de fixtures durante reinicio de Catalog y health Gateway
200 → 503 → 200. Identity/Commerce/Administration usan upstreams HTTP sintéticos
para comprobar aislamiento de enrutamiento, no procesos completos de negocio.
El contenedor se detiene al finalizar; no se elimina ningún volumen.

Dos intentos iniciales del laboratorio fallaron por URL de usuario mal construida
y por timestamps sintéticos sin zona horaria; corregidos a PostgreSQL URL válida
y timestamptz(3), conforme al esquema real. No fueron regresiones de aplicación.
El script necesita dependencias instaladas en Backend y Catalog, Prisma Client
generado y Catalog compilado; no usa credenciales del entorno existente.

Pruebas adicionales: Catalog 5/5, contratos Gateway 23/23, Compose válido y build
Backend aprobado. La suite de fachada verifica alcance, comportamiento público,
selección predeterminada, clave interna y fallo cerrado sin reintento.

### Qué falta para activar

1. Prueba HTTP completa de la fachada con AuthCore y credenciales sintéticas:
   firma kiosk, terminal, sesión expirada/revocada, alcance y parámetros públicos
   manipulados; verificar explícitamente contrato público y política de Control.
2. Repetir caída/reinicio con los cuatro procesos de negocio completos en un
   Compose nuevo y aislado. La prueba con upstreams sintéticos no cubre sus BD.
3. Desplegar imagen de Catalog en red privada con rol SELECT real, secreto propio,
   TLS según entorno y límites de recursos. Validar versión/esquema y paridad
   contra fixtures ampliados, incluidos vacíos, fechas y caracteres especiales.
4. Configurar solo en entorno de validación la fachada con CATALOG_READ_ADAPTER=http,
   CATALOG_INTERNAL_URL y CATALOG_API_KEY; Gateway conserva CATALOG_URL a fachada
   y añade CATALOG_INTERNAL_HEALTH_URL para readiness. Nunca apuntar el tráfico
   público directamente al puerto de Catalog: no autentica usuarios finales.
5. Aprobar esos resultados antes de habilitar la misma configuración pública;
   reversión: desactivar CATALOG_READ_ADAPTER y retirar sonda interna si se retira
   el servicio. Mantener endpoints y persistencia anteriores durante transición.

Resultado final de Jest: suite completa 31/31, 250/250; después de ampliar dos
casos de transporte HTTP, suite de fachada reejecutada 5/5. El laboratorio real
comprueba también CatalogReader HTTP contra Catalog/PostgreSQL y su 503 durante
la caída. No se cambiaron las ocho evidencias previas (SHA-256 verificado).

## Integración con AuthCore y dominios reales — continuación

Nuevo reproductor: `tools/astra/catalog-full-stack.cjs`. Requisitos: Docker,
dependencias de Backend/Catalog instaladas, Prisma Client generado y ambos builds.

```bash
npm run build --prefix Backend
npm run build --prefix services/catalog
node tools/astra/catalog-full-stack.cjs
```

Cada ejecución crea PostgreSQL/Redis con nombres únicos `primax-m4-full-*`, claves
aleatorias y entorno explícito sin cargar `.env`. Aplica `prisma migrate deploy`
solo a esa nueva base sintética; nunca usa reset ni volúmenes existentes. PostgreSQL
usa tmpfs; Redis sin persistencia. Los contenedores propios quedan detenidos.
Los fixtures incluyen dos estaciones, combustible, inventario, beneficio, usuario,
membresía, cuenta Control, asignación y permisos. Se ejecutan entrypoints reales
Identity/Commerce/Administration, Catalog anterior, otra instancia del catálogo
anterior como fachada HTTP, Catalog independiente y Gateway; no hay mocks de dominio.
La fachada HTTP se activa exclusivamente en ese proceso de prueba; ningún despliegue
existente cambia de configuración.

Se añadieron `BIND_HOST` (Backend/Gateway) y `CATALOG_BIND_HOST` (Catalog) opcionales
para limitar estos procesos locales a 127.0.0.1. Los valores predeterminados de los
despliegues existentes no cambian. Esta prueba acredita aislamiento local, no un
despliegue Docker completo con red privada certificada. Para contenedores: red
interna, sin `ports` del Catalog, rol SELECT y secreto inyectado fuera del repositorio.

Bloqueo de seguridad confirmado por inspección: estaciones e inventario son Public;
AccessGuard retorna antes de interpretar Bearer. Por ello, ni un token Control ni
un token expirado restringen una lectura pública sin firma. El alcance kiosk sí
se deriva de sesión y firma; su política rechaza query strings manipulados.
No es posible garantizar confidencialidad absoluta por estación y conservar a la
vez el listado público sin filtro. Antes de activar debe definirse si esas
proyecciones son públicas; si requieren confidencialidad, aprobar contrato protegido,
migrar consumidores y rechazar acceso anónimo. No se alteró esa política implícitamente.

Los primeros intentos de preparación fallaron por DATABASE_URL_UNPOOLED ausente,
función SQL no instalada con db push y Redis sin autenticación/base /0. Se corrigió
el laboratorio para usar migraciones existentes y Redis autenticado en /0; son
fallos del reproductor, no cambios en datos ni regresiones de negocio.

### Resultados ejecutados de la etapa con dominios reales

Ejecución final `primax-m4-full-1794587232941`: exit 0, 16 comprobaciones aprobadas.
Evidencia resumida sin secretos: `evidence/catalog-mission4-full-stack.txt`.
Ambos builds aprobaron tras añadir las opciones de bind; `git diff --check` limpio.
No se repitieron las suites unitarias anteriores que no fueron modificadas.

- Cuatro GET sin filtro: igualdad HTTP/JSON entre proceso anterior y Gateway con
  fachada HTTP/Catalog nuevo. Ambos usan el esquema real instalado con migraciones.
- Login Identity por contraseña sintética: 200. JWT válido: acceso a membresía;
  firma JWT alterada, expiración y authVersion revocada: 401.
- Miembro sin rol Control: 403. Cuenta ENCARGADO aprobada, permiso y asignación
  sintéticos: sesión 200; revocar permiso ADMIN_CONTROL_ACCESS: 403.
- Firma kiosk válida: solo estación A en estaciones/inventario, con igualdad
  contra respuestas anteriores. Firma inválida: 401. Query `stationId=B` firmada:
  403 por política kiosk. Sesión eliminada de Redis: 401. No se debilitó esa política.
- Catalog directo sin clave: 401. Rol PostgreSQL limitado a SELECT sobre las cuatro
  tablas: DELETE rechazado. Catalog escucha en loopback con configuración propia.
- Catalog detenido: fachada devuelve 503; componente catalogRead cambia up→down.
  Identity/Commerce/Administration y fachada siguen up. Membresía Identity y wallet
  Commerce por Gateway siguen 200; Control conserva rechazo 403 del permiso revocado.
- Reinicio: catalogRead vuelve up y estaciones por fachada responde 200.

Límite del health agregado: Print y OCR no forman parte de este laboratorio;
ambas URLs auxiliares se apuntan a Identity únicamente para evitar destinos por
omisión, y `/health` de OCR allí devuelve 404. Por ello **no se certifica health
agregado 200 de toda la plataforma**: se verifican explícitamente los componentes
Identity, Commerce, Administration, fachada y CatalogRead. No se simula ninguno
de esos cinco procesos. La disponibilidad de operaciones financieras de escritura
no se probó: solo lectura wallet, sin modificar saldos ni pagos.

El caso Public con Bearer expirado devuelve las dos estaciones, conforme al
contrato anterior. Esta comprobación aprobada documenta un **bloqueo para cualquier
promesa de confidencialidad por estación**; no certifica esa propiedad. Falta acordar
y probar un contrato privado para usuarios de Control si se exige ese aislamiento.
Tampoco se han probado aquí SUPER_ADMIN, todas las combinaciones de permisos,
CSRF de escrituras ni credenciales técnicas de terminal; no extrapolar estos resultados.

**Decisión técnica:** Catalog funciona como proceso independiente y su integración
opcional detrás de la fachada supera estas pruebas, pero aún no se autoriza activar
tráfico. Antes: resolver política Public/Control, completar matriz de roles/terminal,
y validar despliegue Docker privado sin publicar puertos, secretos inyectados y
readiness agregado con Print/OCR reales. El laboratorio acredita bind privado local,
no ese despliegue final. No apuntar Gateway directamente al servicio con clave.

Para comenzar independencia de Identity: cerrar esas decisiones de autenticación,
congelar contrato de actor/estación/permisos/revocación y sus pruebas; identificar
qué consultas de Memberships pertenecen a Commerce y mantener la frontera atómica
financiera. No se inició ninguna extracción de Identity en esta etapa.

## Separación pública/privada y plan Identity (etapa actual)

Auditoría y matriz: `catalog-auth-contracts.md`. Se conservan íntegros los cuatro
GET públicos y sus consumidores. El entrypoint de Catalog añade rutas privadas
`/api/v1/control/catalog/inventory` y `/api/v1/control/catalog/stations`, mediante
`PrivateCatalogController`. Reutilizan AccessGuard Control y ADMIN_INVENTORY_VIEW;
no se inventan permisos. ADMIN/ENCARGADO dependen de grants y asignaciones, no de
su etiqueta de rol. SYSTEM_ADMIN mantiene alcance global. Sin estaciones se
rechaza el acceso. stationId ajeno da 403, formato inválido 400. Las rutas actuales
de Control con inventario enriquecido siguen intactas. El routing específico
precede al prefijo Control; se aplica en código, sin desplegar ni activar tráfico.

Validación incremental: build Backend aprobado; suite privada 3/3 y contratos
Gateway 23/23 aprobados. La prueba de Compose usa `--compose` en el reproductor:
construye Catalog, Print demo-server y OCR del repositorio, en red interna sin
ports, con PostgreSQL sintético conectado a esa red. Print es el proceso real de
demostración usado por Compose, no impresión física. La prueba exige health total
200 antes de detener Catalog, y recupera la dependencia tras reinicio.

### Identity: dependencias verificadas y secuencia propuesta

- `apps/identity/main.ts` reúne AuthModule, MembershipsModule y VehiclesModule;
  bootstrap comparte Prisma, AuthCore, Alerts y configuración con todos los dominios.
- `auth/auth.module.ts`: AuthCore aporta AccessGuard global, JWT HS256, UsersModule,
  KioskService/KioskStore y recuperación de contraseña. Commerce importa AuthCore
  (`operations.module.ts`), por lo que extraer solo el entrypoint no independiza Identity.
- `users/users.module.ts`: repositorio Prisma exportado vía UsersService. Identity
  debe ser dueño lógico de usuario, authVersion, credenciales, sesiones y vehículos.
- `memberships/memberships.service.ts`: me consulta saldo, reservas y pendiente;
  historial de transacciones, recompensas y redenciones también usa persistencia
  compartida. Separar perfil/identificador de membresía de la proyección financiera.
- `vehicles/vehicles.module.ts` contiene RecognitionService: la propiedad del
  vehículo es Identity; OCR es adaptador externo, no dependencia del núcleo.

Plan ejecutable, sin implementar extracción:
1. Congelar contrato de actor (tipo, usuario/terminal, estación, grants, versión,
   expiración) y revocación. Determinar validación local frente a introspección y
   comportamiento durante caída; no repartir secreto HS256 entre nuevos repositorios.
2. Introducir puertos de cuentas, sesiones/revocación, vehículos, entrega de correo
   y consulta de membresía; probar núcleo sin Nest ni Prisma. No cambiar registro.
3. Separar consultas Memberships: Identity conserva vínculo/número/perfil; Commerce
   sirve saldo/reservas/deudas, recargas, historial financiero y puntos/redenciones.
   Componer respuesta compatible en fachada; no mover esas escrituras a Identity.
4. Migrar AuthCore de los consumidores a un contrato versionado que preserve firmas,
   CSRF, terminales, grants y authVersion. Añadir pruebas de contrato y fallos.
5. Solo después crear proyecto independiente y plan de propiedad de datos: conservar
   transacciones atómicas de Commerce y diseñar idempotencia/outbox para cambios
   entre dominios. Nada de esta extracción se inició en esta etapa.

Aprobaciones de negocio pendientes: clasificación pública de precios/direcciones/
beneficios; confidencialidad de cantidades/reservas; proyección reducida para Prime;
plan de deprecación del inventario público si se aprueba protegerlo. La coexistencia
de rutas privadas no convierte en confidencial el mismo dato accesible públicamente.

### Aceptación final de esta etapa

Comando: `node tools/astra/catalog-full-stack.cjs --compose`, exit 0.
Laboratorio `primax-m4-full-1794588945438`: **21 comprobaciones aprobadas**.
Evidencia completa sin credenciales: `evidence/catalog-mission4-private-compose.txt`.
Esta ejecución sustituye los bloqueos de despliegue privado/Print/OCR y la matriz
limitada de las etapas anteriores; no sustituye las decisiones de negocio.

- Compose construyó Catalog/Print/OCR reales en red interna, sin puertos publicados
  de Catalog. Solo la base sintética nueva se conecta a esa red. Readiness real
  de los tres servicios aprobada y Gateway agregado HTTP 200 antes de la caída.
- Cuatro contratos públicos comparados por HTTP contra el proceso anterior.
  Inventario se compara por stationId/fuelId: el repositorio anterior no garantiza
  orden. El primer intento falló solo por esa diferencia de orden; se corrigió
  la comparación, no se modificó el contrato de la aplicación.
- Privado: anónimo/expirado rechazados; faltan permisos → 403; ADMIN y ENCARGADO
  con grants vigentes → acceso limitado; sin estaciones → 403; estación ajena
  → 403; UUID inválido → 400; SYSTEM_ADMIN → dos estaciones; grant revocado → 403.
- Firma kiosk, sesión revocada y parámetros manipulados verificados otra vez.
  Credenciales técnicas sintéticas válidas, expiradas y revocadas no conceden
  acceso al catálogo privado de Control (403). Esa ruta rechaza contexto firmado
  antes de validar la credencial técnica: esto prueba separación de privilegios,
  no el ciclo completo de ventas técnicas, que queda fuera del catálogo.
- El fixture expirado inicialmente violó TerminalCredential_dates; corregido para
  mantener emisión anterior a expiración, ambas en el pasado. No se relajó la BD.
- PostgreSQL SELECT, clave interna obligatoria, AuthCore JWT/roles/revocación,
  caída/reinicio de Catalog y disponibilidad real de Identity/Administration/
  Commerce aprobados. Durante caída, lectura wallet por Gateway sigue 200.
  Print es demo-server real del proyecto: no se imprimieron comprobantes físicos.
- Gateway mantiene sonda propia de fachada y sonda catalogRead; la caída de Catalog
  degrada esa dependencia, sin detener los demás procesos. Reinicio restaura lectura
  y readiness. No se han cambiado las configuraciones de despliegues existentes.

Validaciones incrementales adicionales: build Backend final aprobado; pruebas
privadas 3/3; contratos Gateway ampliados 24/24; diff sin errores de whitespace.
No se repitieron las suites anteriores sin cambios. Los ocho JSON conservan hashes.

**Estado:** los bloqueos técnicos del circuito probado (fachada privada, permisos,
red Compose privada, SELECT y health con Print/OCR reales) quedaron resueltos.
No se declara confidencial el inventario público ni se activa tráfico. Hace falta
aprobar la clasificación de datos y, si se decide proteger cantidades/reservas,
el contrato y la migración/deprecación pública. Antes de un despliegue efectivo
hay que aportar configuración y secretos propios del entorno y validar allí el
mismo circuito; el laboratorio no es autorización de producción. Identity conserva
el plan indicado; no comienza su extracción hasta cerrar esas decisiones.

## Decisiones aprobadas: cierre de clasificación y transición

El usuario aprobó públicos los datos generales de estaciones/ubicaciones, precios
y beneficios; privados los litros exactos, reservas, movimientos y administración.
Aprobó mantener temporalmente el endpoint anterior hasta validar la migración y
recibir autorización expresa de retirada. Esta decisión sustituye la clasificación
pendiente de las secciones históricas; no autoriza activar tráfico a Catalog.

Campos y reglas actuales: `catalog-auth-contracts.md` y contrato verificable
`catalog-data-contracts.json`. Ajuste seguro: Cache-Control no-store en inventario
público y privado de la fachada; cuerpos, rutas y autorización permanecen iguales.
La aceptación real ahora verifica los campos públicos exactos, relaciones de
inventario y la presencia explícita de la exposición transitoria. Esa prueba no
presenta el legado como confidencial: deberá cambiar a denegación tras la retirada.

Consumidor crítico identificado: FuelFlow muestra litros exactos al entrar a
pantalla-combustible y recuperar foco. Su gateway hace ese GET sin credenciales.
Control ya consume inventario/movimientos privados enriquecidos; Prime no tiene
consumo directo de inventario encontrado en la búsqueda estática. También dependen
del legado herramientas de snapshots multiterminal, smoke y regresiones v11.
No se asegura ausencia de consumidores externos. `catalog-inventory-migration.md`
detalla archivos, destino, pruebas y puertas de retirada; no se cambia ninguna UI.

La excepción vigente sigue exponiendo anónimamente litros/reservas de estaciones,
incluso relaciones inactivas. no-store no impide leerlos ni borra copias existentes.
La futura migración FuelFlow no puede limitarse a cambiar a una URL de Control:
sus identidades técnicas no tienen permisos administrativos. Debe validarse lectura
privada por estación o un cambio de pantalla; no se inventaron permisos ni una
proyección pública de disponibilidad. Movimientos y auditoría no se trasladan a Catalog.

Preparación de Identity: `identity-next-mission.md`, misión acotada a núcleo y puertos,
con contratos conservados y finanzas en Commerce. Puede autorizarse como siguiente
misión sin activar Catalog, manteniendo el seguimiento de la exposición temporal.
La extracción no se inició y no se propone separar bases ni transacciones en ese paso.

### Resultado final con clasificación aprobada

`npm run build --prefix Backend`: aprobado.
Pruebas ejecutadas en esta etapa:
- Backend: dos suites de fachada/autorización, 8/8.
- Gateway: 24/24 contratos.
- Catalog independiente: build y 5/5 pruebas.
- FuelFlow: kiosk-gateway y vercel-routing, 24/24.
- Prime: services.test.js, 9/9.
- `node tools/astra/catalog-full-stack.cjs --compose`: **22 comprobaciones aprobadas**,
  exit 0. Evidencia: `evidence/catalog-mission4-approved-contracts.txt`.

La aceptación añade verificación de nombres de campos públicos, relaciones del
inventario, exposición temporal conocida y no-store en ambas rutas de inventario.
Con PostgreSQL nuevo y SELECT, Gateway y dominios reales, Compose privado y Print/OCR
reales se comprobaron otra vez permisos, roles, estaciones, firmas, revocación,
compatibilidad, caída y reinicio. Sin datos reales ni cambios de tráfico existente.

Un intento previo terminó con `fetch failed` durante la fase de caída y no se contó
como aprobado. Se reforzó el cliente del reproductor para no reutilizar sockets
inactivos tras comandos síncronos de Docker y para registrar stack/causa ante otro
fallo. La hipótesis de socket caducado no pudo confirmarse con aquel primer log;
la repetición completa aprobó las 22 comprobaciones. No se modificaron Gateway ni
Catalog para ocultar ese error, ni se añadieron reintentos a operaciones de negocio.

**Diagnóstico final:** Catalog está técnicamente validado como servicio de lectura
independiente detrás de fachada autenticada, con contratos públicos/privados definidos.
No está activado y no se declara terminada la migración del inventario. Persiste la
exposición pública temporal expresamente aprobada; retirada solo tras migración
verificada y nueva autorización. Quedan por concretar destino privado/pantalla de
FuelFlow y consumidores externos, no la clasificación de datos ya aprobada.

Podemos preparar el inicio autorizado de Identity por núcleo y puertos conforme a
`identity-next-mission.md`, preservando AuthCore y el contrato de actor. La separación
de procesos/datos exige después resolver autoridad de grants y consistencia de
revocación. No se inició extracción en esta misión. La migración de inventario se
mantiene como trabajo explícito separado; no debe darse por resuelta por activar
Catalog o extraer Identity.

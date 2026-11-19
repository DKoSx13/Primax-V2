# Astra — Etapa 3C: consolidación agrupada de lecturas Catalog

## Inventario previo y alcance

Referencia: `feat/dezkz-identity-a4-core`, HEAD
`6bfbe32a23d73f8e77f19e10d33083b61fc709ec`. Árbol versionado e índice limpios;
fuentes de 3A/3B y nueve evidencias originales verificadas por SHA-256.

| Clase | Operación y rutas existentes | Contrato y decisión |
|---|---|---|
| A, ya migrada 3A | GET /api/v1/fuels | Activos por code asc; array Fuel completo, decimal string y fechas ISO en JSON. Pública; firma de kiosco pasa primero por su autorización. |
| B, ya migrada 3B | GET /api/v1/stations y GET /api/v1/control/catalog/stations | Una lectura compartida; públicas activas por code asc y alcance de actor firmado; Control exige permisos y filtra UUID/estaciones autorizadas. |
| A, pendiente | GET /api/v1/benefits | BenefitsService.list → BenefitsRepository.list o CatalogReader('benefits'); where active=true, orderBy code asc. Array id/code/title/description/category/pointsCost/active/createdAt/updatedAt, sin conversión de puntos. Pública; no filtro por estación ni DTO de búsqueda. Se incluye. |
| B, pendiente | GET /api/v1/fuels/inventory y GET /api/v1/control/catalog/inventory | FuelsService.inventory → FuelsRepository.inventory o CatalogReader('fuels/inventory'). findMany incluye fuel y station; sin where ni orderBy. Decimales liters/reservedLiters y relaciones completas, incluso inactivas. Se incluye con pruebas explícitas de ambas políticas. |
| C, excluida | POST /api/v1/rewards/redeem | Canje y débito atómicos de puntos; Commerce. No es listado de beneficios. |
| C, excluida | POST /api/v1/inventory/:stationId/:fuelId/activate, POST /api/v1/control/inventory/:stationId/:fuelId/reconcile, POST /api/v1/control/inventory/receipts | Activación, conciliación y entradas de inventario de Administration; no se trasladan. |
| Fuera de Catalog | GET /api/v1/control/inventory, /control/inventory/movements, /control/inventory/:stationId/:fuelId/reconciliation y consultas administrativas asociadas | Lecturas operativas de Administration con reglas propias; no se consideran consultas pendientes del proceso Catalog ni se reorganizan. |

El entrypoint Catalog sólo incorpora FuelsModule, StationsModule, BenefitsModule
y PrivateCatalogController. Seis rutas de datos, cuatro lecturas de aplicación;
no hay cuatro consultas adicionales que justifiquen inventar más casos de uso.
Health/readiness y las rutas técnicas del lector alternativo no son nuevas
operaciones de negocio. El proyecto `services/catalog/` permanece intacto y no
se activa como otra autoridad.

## Política B preservada antes de implementar

Inventario público conserva @Public, Cache-Control:no-store y scopeCatalog.
Sin firma (incluso con Bearer/Control cookie), el guard devuelve el catálogo
público actual sin crear actor Control. Con firma, KioskService.authorize debe
autorizar primero y scopeCatalog limita al stationId del actor. No se admiten
filtros públicos: stationId u otros query params se ignoran. Actor kiosco/terminal
sin estación: 403. La exposición global anónima de inventario es un contrato
preexistente y una decisión de producto pendiente; no se aprueba, amplía o corrige
en esta refactorización. No hay ambigüedad sobre lo que hace hoy el código.

Inventario Control conserva AccessGuard de Control, usuario activo/authVersion,
cuenta aprobada/verificada con ADMIN_CONTROL_ACCESS o SYSTEM_ADMIN y el permiso
ADMIN_INVENTORY_VIEW del controlador. No global sin estaciones: 403. UUID fuera
de alcance: 403 antes de leer; firma de kiosco en Control: 403. Anónimo: 401.
stationId opcional UUID, campos extra/vacíos/inválidos/repetidos: 400. Aplica
scopeCatalog y después el filtro autorizado; global sin filtro ve todo el
inventario, incluidas relaciones inactivas. No se añade filtro active aquí.

UUID autorizado sin inventario: 200 []; global con UUID inexistente: 200 [];
UUID inexistente ajeno: 403. Una estación inactiva puede excluirse de las
asignaciones cargadas por el guard; no debe confundirse eso con filtrar las
filas de inventario en Prisma. No se añade 404 para resultados vacíos.
Se conserva el filtro HTTP común y 503 del lector HTTP sin fallback/reintentos.
Inventario no promete orden explícito: no se añadirá orderBy para hacer pasar
comparaciones. No se alteran DTOs, decoradores ni controladores.

## Diseño y validación previstos

Dos casos de uso puros con puertos explícitos, adaptadores que delegan al
repositorio/lector anterior y composición Nest. Beneficios tendrá su módulo de
lectura; inventario reutilizará los proveedores del módulo de combustibles,
evitando un segundo repositorio o cliente Prisma. No hay reglas nuevas de dominio.

Primero regresiones sin red y sin bases, incluyendo 3A/3B, Gateway, empaquetado y
las cuatro compilaciones más legacy. Después una instancia PostgreSQL Docker
17 nueva, volumen y red exclusivos, sin puertos publicados y credenciales
aleatorias sólo en configuración privada ignorada. Antes de inicializar se
verificarán proyecto, mounts, etiquetas, host/db y vacío del directorio de datos.
Sólo migrate deploy sobre esa base nueva; no seeds de aplicación, se revisarán
fixtures mínimos específicos. Ninguna operación sobre volúmenes anteriores.

La integración reutilizará controladores, filtro HTTP y guard vigentes con Prisma
real y JWT efímero real. La autorización técnica de kiosco será un colaborador
controlado, sin Redis/sesiones operativas. Comparará selectores anteriores y
hexagonales contra los mismos datos, con snapshot de datos antes/después de
las lecturas. No certificará el sistema completo ni recuperará T01.

## Resultados

Línea base: `.cache/astra-stage3c/run-b80ce4112483/`, 62 Jest + 24 Gateway + 9
empaquetado = 95 pruebas correctas antes de modificar implementación.
Ronda offline final: `.cache/astra-stage3c/run-c2a3c35b440f/`, Node 22.21.1,
67 Jest + 24 Gateway + 9 empaquetado = **100 pruebas correctas**, cero fallos.
Incluye íntegramente los tests de 3A y 3B; la frontera de imports de aplicación
también inspecciona los nuevos modelos, puertos y casos de uso.

| Build | Resultado |
|---|---|
| Catalog | PASS, 159 archivos, src/apps/catalog/main.js |
| Identity | PASS, 111 archivos, src/apps/identity/main.js |
| Administration | PASS, 95 archivos, src/apps/administration/main.js |
| Commerce | PASS, 171 archivos, src/apps/commerce/main.js |
| Legacy TypeScript | PASS |
| primax-astra-catalog:stage3c | Docker runtime construido y módulo cargado sin conexión |
| primax-astra-legacy:stage3c-build | Docker target build construido |

No se modificaron Dockerfiles ni entrypoints. Sólo Catalog incorpora las fuentes
hexagonales de Catalog en su artefacto independiente. No se cambiaron tags stage2,
3A o 3B ni se activaron estas imágenes en el Compose operativo.

### Integración PostgreSQL real

Proyecto final **primax-astra-stage3c-bf49a488be67**, volumen nuevo
`primax-astra-stage3c-bf49a488be67-pgdata`, red interna exclusiva 10.253.215.32/27,
sin puertos publicados. Se validaron nombre/proyecto vacío, volumen propio y
vacío antes de initdb, único mount del contenedor y red interna sin solapamientos.
Dentro del tester se comprobaron hostname postgres, puerto 5432, base/rol
sintéticos esperados, URLs directa/normal idénticas y cero tablas públicas antes
de ejecutar migrate deploy. Se aplicaron **36 migraciones existentes**, sin
editar archivos y sin ejecutar los seeds de aplicación.

Fixtures revisados: tres estaciones (dos activas y una inactiva), dos combustibles
(uno inactivo), tres beneficios (uno inactivo), tres filas FuelInventory con seis
decimales y relaciones inactivas, cinco usuarios sintéticos y permisos/asignaciones
mínimos de Control. Sin membresías, ventas, pagos, reservas, movimientos, canjes
o impresiones. Los passwordHash de fixture no permiten login; no se prueban login
ni PasswordReset. Las únicas escrituras de inventario son inserciones de datos
de prueba en la base nueva, no comandos de negocio ni modificaciones del escritor.

**42 comparaciones, 84 solicitudes HTTP**, contra la misma base sin escritores
concurrentes durante las lecturas: selectores previos y módulos hexagonales nuevos.
Los controladores, repositorios, ValidationPipe y AccessGuard son reales;
Prisma y JWT HS256 con issuer/audience existentes son reales. UsersService y
UsersRepository leen los usuarios de la base sintética; roles, grants y alcance
de Control también se resuelven desde ella. Las claves JWT son aleatorias,
efímeras y no se publican. KioskService.authorize es un colaborador controlado:
no se certifican HMAC, sesiones técnicas o Redis.

Se comprobaron seis rutas, orden activo de fuels/stations/benefits, representación
decimal exacta, fechas, relaciones inactivas en inventario, ausencia de filtros
públicos, alcance firmado, 401/403, authVersion obsoleta, usuario inactivo, falta
de permisos, stationId ajeno/inexistente, cuatro variantes de filtros 400 y
resultados vacíos autorizados. Se comprueba la diferencia crítica: una estación
inactiva no aparece en /stations, pero su inventario sí permanece visible al
administrador global en la consulta existente, con filtro autorizado.
Los timestamps de error variables se excluyen sólo al comparar cuerpos.

Huella de **las 41 tablas públicas completas**, 67 filas incluidas las migraciones,
antes/después de las peticiones: idéntica
`0cf27fb3de12f686e11f8b21b24208d04e79b30eb83936b8e2836253343cf736`.
No se modificaron datos durante las consultas. El fixture antiguo conserva los
selectores exactos y usa los repositorios/controladores sin cambios; no ejecuta
dos escritores ni levanta un segundo servicio de negocio.

La ronda anterior `primax-astra-stage3c-5445629172a3` ya pasó 39 comparaciones;
se conservaron sus datos y resultados. La ronda final amplió casos de estación
inactiva y acceso público con Bearer, y obtuvo el conteo real de migraciones.
El primer intento `primax-astra-stage3c-684360a18316` falló antes de inicializar
PostgreSQL por agotamiento del pool automático de redes Docker. Se corrigió el
harness para seleccionar una subred explícita libre tras comprobar solapamientos,
y el escape de variables del healthcheck. No se borraron redes o volúmenes para
resolverlo. Ese volumen vacío y sus logs también se conservaron.

Los PostgreSQL creados terminaron detenidos, exit 0; los testers fueron retirados
con --rm. Se conservaron los tres volúmenes nuevos y las evidencias privadas;
ningún contenedor operativo, volumen anterior o expediente T01 se montó ni alteró.

## Arquitectura y archivos

Se añaden modelos de lectura BenefitReadModel e InventoryReadModel, puertos
BenefitListReader/ListBenefitsQuery e InventoryReader/InventoryQuery, casos
ListBenefits/ReadInventory y sus adaptadores de entrada/salida. Beneficios compone
sus proveedores en BenefitsReadModule. Inventario amplía FuelsReadModule para
reutilizar el mismo FuelsRepository y CatalogReader de combustibles; no duplica
consultas, clientes de persistencia ni autoridades de escritura.

Cambios operativos exactos: BenefitsService, BenefitsModule, FuelsService y
Backend/services/catalog/src/bootstrap/fuels-read.module.ts. Los controladores,
repositorios, filtros, AuthCore, PasswordReset, permisos, Prisma/migraciones,
frontends y Gateway permanecen intactos. El caso de uso y puertos no importan
NestJS ni Prisma. No hay nuevas reglas de dominio ni cálculos de puntos/stock.

El manifiesto `evidence/stage3c/review-summary.json` contiene el inventario exacto
de archivos y SHA-256, resultados saneados y guardas de aislamiento. Los tests
añadidos son `Backend/src/catalog-reader/catalog-remaining.spec.ts`, el fixture
compartido `Backend/test/catalog-read.fixture.ts` y el comparador PostgreSQL
`Backend/test/catalog-postgres.integration.cjs`. Los dos nuevos comandos privados
son `tools/astra/stage3c-catalog-validation.cjs` y `stage3c-postgres.cjs`.
Los archivos y evidencias históricos no se modifican; la extensión de los dos
componentes de código de 3A es intencional, sin reescribir sus commits.

```text
node tools/astra/stage3c-catalog-validation.cjs --baseline
node tools/astra/stage3c-catalog-validation.cjs
node tools/astra/stage3c-postgres.cjs
docker build --file Backend/services/catalog/Dockerfile --tag primax-astra-catalog:stage3c Backend
docker build --file Backend/Dockerfile --target build --tag primax-astra-legacy:stage3c-build Backend
```

## Evaluación de cierre y límites

Las **cuatro lecturas de aplicación y seis rutas de datos del proceso Catalog
actual quedan conectadas mediante casos de uso y puertos**, preservando la
autorización en los controladores vigentes. Este lote consolida las lecturas
pendientes identificadas; no exige otra etapa por cada consulta sencilla.

Persisten adaptadores que reutilizan repositorios/controladores legacy,
bootstrap/AuthCore comunes, Prisma y una sola PostgreSQL compartida. El árbol
alternativo services/catalog sigue opcional, sin activación ni retirada. No se
afirma autonomía total del microservicio ni reorganización completa de todo el
Backend. Tampoco equivalencia universal de los tres frontends, despliegue,
rendimiento/concurrencia, transacciones financieras o recuperación productiva.
El cliente HTTP alternativo se regresó con mocks; no se desplegó ese proceso
paralelo en esta integración. La exposición pública de inventario continúa como
riesgo/decisión de producto preexistente, no como autorización administrativa.

T01 e Identity A.4 permanecen intactos. Las nueve evidencias originales se
conservan sin seguimiento y excluidas del commit. No se modifican Identity,
Administration o Commerce: sólo se comprueba su compilación.

Reversión propuesta, previa autorización: revertir el único commit de 3C para
restaurar las delegaciones previas. No hay cambios de esquema o datos operativos
que deshacer; no se deben borrar volúmenes ni evidencias. No se ejecuta reversión.
Se recomienda revisar el cierre de las lecturas Catalog y acordar después el
siguiente objetivo arquitectónico; no se inicia otro servicio ni una fase nueva.

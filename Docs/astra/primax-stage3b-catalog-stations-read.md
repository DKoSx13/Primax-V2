# Astra — Etapa 3B: lectura hexagonal de estaciones

## Registro previo a la implementación

Rama `feat/dezkz-identity-a4-core`; referencia
`a6cf8c648d1bc484eeee16cf29b04ce9f1dcf4f6`. Verificados el contenido del commit
3A, sus quince huellas de fuentes y las nueve evidencias originales 2B sin
seguimiento. No había cambios versionados ni staging.

Se extrae únicamente `StationsService.list()`, lectura que usa el controlador
público **GET /api/v1/stations** y también el controlador vigente
**GET /api/v1/control/catalog/stations**. No son políticas equivalentes ni se
crea una segunda operación. Se mantienen ambos controladores y el alcance se
aplica después de la lectura exactamente donde se aplica hoy.

Implementación vigente: `StationsController.list(actor)` →
`StationsService.list()` → selector CatalogReader/StationsRepository →
`scopeCatalog(rows, actor, row => row.id)`. Por defecto, consulta Prisma exacta
`db.station.findMany({ where: { active: true }, orderBy: { code: 'asc' } })`.
Con `CATALOG_READ_ADAPTER=http`, usa el lector anterior con ruta `stations`.
No se añaden HTTP, SQL, transacciones, escritores ni bases. La alternativa
`services/catalog/` continúa sin activarse ni modificarse.

## Contrato y autorización que deben conservarse

| Contexto | Política anterior que se preserva |
|---|---|
| GET /stations sin firma | `@Public`: estaciones activas globales; no se verifica Bearer ni cookie de Control en esta ruta. Un cliente autenticado sin firma obtiene el mismo catálogo público. No contiene relaciones administrativas. |
| GET /stations firmado | AccessGuard llama a KioskService.authorize antes de reconocer Public; scopeCatalog usa la estación del actor autorizado. Firma rechazada: 401/403 según el error existente del autorizador. Actor kiosco sin estación: 403 Station required. |
| Actores terminal/control en scopeCatalog | Terminal se limita a su estación; Control no global a stationIds; Control global no se filtra. No se presume que Bearer cree un actor Control en una ruta Public. |
| GET /control/catalog/stations | AccessGuard exige usuario activo, authVersion vigente y SYSTEM_ADMIN o cuenta Control aprobada/verificada con ADMIN_CONTROL_ACCESS. El controlador exige además ADMIN_INVENTORY_VIEW. |
| Control no global | Exige estaciones asignadas; filtra por stationIds. stationId fuera de ese conjunto se rechaza con 403 antes de consultar estaciones. |
| Control global | SYSTEM_ADMIN conserva visibilidad de todas las activas y filtro opcional por UUID. No implica acceso a estaciones inactivas. |
| Otros clientes en Control | Anónimo: 401; JWT inválido/inactivo/revocado: rechazo vigente; usuario sin autorización Control o permiso de inventario: 403. Firma de kiosco: 403 antes de autorizar el kiosco. |

La resolución de permisos y estaciones permanece en AuthCore/AccessGuard,
sin modificaciones. Las asignaciones administrativas cargadas por el guard se
limitan a estaciones activas y asignaciones no terminadas. Una asignación sólo a
estación deshabilitada puede dejar el actor sin estaciones y producir el 403 de
falta de asignaciones, no un listado global.

La ruta pública no declara DTO de búsqueda: stationId, q y otros parámetros se
ignoran, sin ampliar la visibilidad que el actor firmado ya tuviera. La ruta
privada usa StationFilter: stationId opcional UUID; vacío, inválido, repetido o
campos adicionales se rechazan con 400 por ValidationPipe. Un UUID válido se
verifica primero contra el alcance y después filtra los resultados.

No existe búsqueda de estación individual ni contrato 404 por UUID en estas
listas. Estación inexistente/deshabilitada: no figura en la consulta activa;
Control global con ese filtro obtiene 200 []. Control no global con UUID ajeno,
exista o no, recibe 403. Con UUID autorizado pero sin fila activa obtiene 200 [].
Las peticiones públicas firmadas autorizadas sin fila para su estación obtienen
200 []; si el autorizador detecta una estación/sesión inválida puede rechazarlas
antes de leer. No se elude esa validación ni se inventa una política nueva.

Respuesta real: array de id, code, name, address, active, createdAt y updatedAt,
sin relaciones incluidas. Date se serializa a ISO; el lector HTTP entrega fechas
string. StationResponseDto documenta los cinco primeros campos y no transforma
la respuesta. Se preservan valores, orden y campos sin proyección nueva.
Los errores mantienen el filtro HTTP común con statusCode, message, path y
timestamp. Falla/configuración HTTP interna mantiene 503; no hay fallback ni
reintento añadido. Los métodos no existentes conservan 404.

No se ha identificado una ambigüedad que exija cambiar la política: la diferencia
Public/Control está explícita en los decoradores y el guard. No se interpreta
el catálogo público como autorización administrativa. Este incremento no evalúa
ni aprueba una modificación de esa decisión de exposición.

## Diseño del incremento único

StationsService delegará list a un adaptador de entrada, puerto ListStationsQuery
y caso de uso ListStations. El puerto StationListReader reutilizará el selector
anterior y StationsRepository/CatalogReader. Bootstrap compondrá esos proveedores
una vez en el módulo de estaciones; no se duplica persistencia. El modelo de
lectura pertenece a aplicación; no hay reglas de dominio nuevas.

Los Dockerfiles de 3A ya copian todo Backend/services/catalog/src. No requieren
otra modificación. Las pruebas cubrirán ambas superficies existentes con el
guard y controladores reales, colaboradores simulados y comparador del selector
anterior; no bases operativas ni volúmenes anteriores.

## Resultados

Línea base antes de cambiar implementación: ejecución
`.cache/astra-stage3b/run-2ff7173bcc28/`, 22 pruebas Jest, 24 Gateway y 9 de
empaquetado correctas. Ejecución final:
`.cache/astra-stage3b/run-5af8c6c8c3ae/`, Node 22.21.1.

| Verificación final | Resultado |
|---|---|
| Nuevas pruebas de estaciones | 40/40 |
| Regresiones de combustibles, fachada, permisos y acceso de recuperación | 22/22 |
| Contratos de enrutamiento Gateway | 24/24 |
| Contratos de empaquetado | 9/9 |
| Compilación Catalog | PASS; 133 archivos; src/apps/catalog/main.js |
| Compilación Identity | PASS; 111 archivos; src/apps/identity/main.js |
| Compilación Administration | PASS; 95 archivos; src/apps/administration/main.js |
| Compilación Commerce | PASS; 171 archivos; src/apps/commerce/main.js |
| Compilación TypeScript legacy | PASS |
| Imagen Catalog primax-astra-catalog:stage3b | Construida; módulo StationsModule cargado sin conexiones; ListStations con puerto vacío devuelve [] |
| Target build legacy primax-astra-legacy:stage3b-build | Construido; no desplegado |

Total final **95 pruebas correctas**; la línea base no se suma como cobertura
nueva. Las 40 pruebas nuevas incluyen cinco de aplicación y 35 HTTP/contrato.
La matriz HTTP compara cuatro composiciones: selector antiguo y nuevo, cada uno
con Prisma simulado y con lector HTTP simulado. Se ejecutan controladores,
AccessGuard, ValidationPipe y filtro de errores vigentes. Sólo sus colaboradores
de persistencia, JWT, usuarios y kiosco se simulan.

Se comprobaron fechas y campos completos sin transformación, referencia del
resultado en aplicación, orden preservado, vacíos, errores sin reintentos ni
fallback; acceso público y filtros ignorados; alcance firmado de A incluso si
se pide B; rechazo antes de leer para firma inválida, Control anónimo, cuenta
no aprobada, falta de permisos, authVersion antigua, usuario inactivo y consultas
fuera de alcance. Se compararon Control con cookie y Bearer, administradores
globales, filtros UUID, ausencias en la proyección activa, validaciones 400 y
métodos/rutas inexistentes 404. Los cuerpos de error coinciden omitiendo sólo el
timestamp variable; también se verifican statusCode, path y presencia de fecha.

La prueba de asignaciones comprueba los argumentos reales enviados por el guard
al ORM (asignación no terminada y estación activa); no prueba su ejecución SQL.
La estación inactiva se representa por su ausencia en la proyección activa,
no por una base real. La autorización de kiosco se simula: no se afirma haber
validado criptográficamente sesiones ni que cualquier estación inválida pueda
llegar al controlador.

La primera ronda `run-37ca55d792bf` detectó TS7034/TS7005 en el nuevo test por
un array sin tipo explícito; no llegó a ejecutar esa suite. Se añadió unknown[]
y se repitió la validación completa en una carpeta nueva. Se conservan los logs
de ambas rondas; el código operativo no se cambió para silenciar el fallo.

## Componentes y archivos del incremento

```text
Backend/services/catalog/src/
  application/station-read-model.ts
  application/ports/station-list-reader.ts
  application/ports/list-stations-query.ts
  application/use-cases/list-stations.ts
  adapters/inbound/stations-read.adapter.ts
  adapters/outbound/existing-station-list.reader.ts
  bootstrap/stations-read.module.ts
```

Son siete módulos TypeScript nuevos. Se modifican sólo dos archivos operativos:
`Backend/src/stations/stations.service.ts` y `stations.module.ts`.
Los cuatro archivos restantes son:

- `Backend/src/stations/stations-hexagonal.spec.ts`.
- `tools/astra/stage3b-catalog-validation.cjs`.
- `Docs/astra/primax-stage3b-catalog-stations-read.md`.
- `Docs/astra/evidence/stage3b/review-summary.json`.

Trece rutas en total. No se modifica ningún archivo existente de 3A, ningún
Dockerfile, controlador, guard, repositorio, esquema o configuración de Gateway.
Sólo Catalog emite los 14 archivos JS/map adicionales; los otros tres servicios
no incorporan el árbol hexagonal de Catalog. No hay dependencias nuevas de npm.

Antes: StationsService seleccionaba directamente CatalogReader o StationsRepository.
Ahora: StationsService → StationsReadAdapter → ListStationsQuery/ListStations →
StationListReader/ExistingStationListReader → las mismas dependencias anteriores.
StationsModule sigue exportando StationsService y registra el controlador anterior.
El módulo de composición registra un único repositorio para esta lectura y usa
el PrismaService global existente. No hay nuevo cliente o escritor de datos.

## Comandos, aislamiento y evidencias

```text
node tools/astra/stage3b-catalog-validation.cjs --baseline
node tools/astra/stage3b-catalog-validation.cjs
docker build --file Backend/services/catalog/Dockerfile --tag primax-astra-catalog:stage3b Backend
docker build --file Backend/Dockerfile --target build --tag primax-astra-legacy:stage3b-build Backend
```

El harness reutiliza el patrón offline de 3A: Docker --rm --network none,
fuentes readonly copiadas a /tmp en un contenedor temporal, dependencias de la
imagen de herramientas de Etapa 2 y resultados en una carpeta nueva ignorada.
No copia .env ni conecta servicios. Supertest sólo abre HTTP local al contenedor;
no publica puertos. Ejecuta Jest focalizado, Node --test de Gateway y empaquetado,
build-domain.cjs para los cuatro servicios y tsc del build legacy. El comando
baseline registra el conjunto de regresión sobre el árbol que exista al invocarlo;
la ejecución histórica indicada arriba se realizó antes de editar StationsService.

Los builds Docker sólo generan Prisma Client y compilan; no migran ni ejecutan
seeds. No se ejecutó Compose, PostgreSQL, Redis, pagos ni impresión. Los tags
stage2 y stage3a se conservan; no se activó la imagen nueva en el Compose.
Contenedores temporales retirados al terminar; no se montaron ni borraron
volúmenes anteriores. Se conservan las nueve evidencias originales byte a byte,
los documentos históricos, logs privados y evidencia saneada con hashes.

## Límites, aceptación y continuación

Cumplidos los criterios pertinentes de esta operación con los recursos indicados.
La paridad comprobada es de aplicación, composición y HTTP con colaboradores
simulados. No se ejecutó PostgreSQL real, planes SQL, JWT criptográfico, Redis,
los tres frontends ni una validación integral de despliegue. El query Prisma y
los controles originales quedan intactos; los mocks no demuestran por sí solos
equivalencia funcional integral ni seguridad productiva.

Persisten los controladores y repositorios legacy, el bootstrap común/AuthCore,
el lector HTTP opcional y PostgreSQL compartido. Otras consultas de Catalog no se
migran. No se modificaron ventas, pagos, inventario, Identity A.4, los demás
servicios, permisos o authVersion. T01 continúa pendiente, sin operaciones sobre
su expediente ni volumen.

Reversión propuesta, sólo si se autoriza posteriormente: revertir el único commit
de 3B para restaurar la composición anterior de StationsService/StationsModule.
No hay migraciones ni cambios de datos que deshacer; no requiere borrar recursos.

Siguiente incremento recomendado: una sola lectura existente de beneficios,
con registro de su contrato y políticas antes de extraerla. No se inicia aquí.
Se detiene el trabajo al verificar el único commit autorizado de esta operación.

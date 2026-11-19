# Astra — Etapa 3A: lectura hexagonal de combustibles

## Registro previo a la implementación

Referencia: rama `feat/dezkz-identity-a4-core`, HEAD
`8086aa98817b25d72ec7e4cf86ad94c39373bf3b`. Las nueve evidencias originales
de 2B permanecen sin seguimiento; no forman parte de esta intervención.

Operación seleccionada: **GET /api/v1/fuels**. Gateway conserva Catalog como
destino. `Backend/src/apps/catalog/main.ts` incorpora `FuelsModule` y el bootstrap
común aplica el prefijo `api/v1`. `FuelsController.list()` llama a
`FuelsService.list()`, que selecciona `FuelsRepository.list()` por defecto o
`CatalogReader.read('fuels')` cuando `CATALOG_READ_ADAPTER=http`.

La ruta tiene `@Public()` y `ApiOkResponse(FuelResponseDto[])`; no exige permisos
de Control ni filtro por estación. El guard vigente permite acceso anónimo a
rutas públicas; una petición firmada de kiosco sigue pasando primero por su
autorización existente. No se añadirá una exigencia de autenticación a esta
consulta pública. Las rutas vecinas de inventario y Control conservan sus
restricciones actuales.

Consulta Prisma exacta: `db.fuel.findMany({ where: { active: true },
orderBy: { code: 'asc' } })`. No hay escrituras, transacción nueva ni otra base.
La respuesta real es el array completo del modelo Fuel: `id`, `code`, `name`,
`pricePerGallon`, `active`, `createdAt`, `updatedAt`. Prisma conserva Decimal y
Date hasta la serialización JSON; el lector HTTP existente entrega strings de
decimal y fechas. No se introducirán proyecciones, redondeos, reordenamientos,
conversión de precios ni filtrados adicionales.

Dependencias actuales: NestJS, PrismaService/FuelsRepository, ConfigService y
CatalogReader; AccessGuard/AuthCore en el bootstrap. La alternativa
`services/catalog/` ya separa aplicación y puerto de persistencia, pero tiene
su propio contrato técnico `x-catalog-key`, SQL y normalización decimal. Sigue
siendo seleccionable por la configuración existente; no se activará ni copiará
su SQL para sustituir la consulta vigente. Se reutilizará su separación por
puertos como patrón, preservando el adaptador Prisma existente y el lector
HTTP opcional. El proceso vigente seguirá siendo Catalog de Backend.

Pruebas existentes relevantes: `catalog-reader.spec.ts` (alcance y cliente
HTTP), `private-catalog.spec.ts` (permisos y estaciones),
`Backend/gateway/routes.test.cjs` (enrutamiento), pruebas privadas de
`services/catalog/test/catalog.test.cjs` y pruebas de empaquetado. Se añadirán
comparaciones antigua/nueva, composición Nest real con persistencia simulada,
serialización y propagación de errores. Las pruebas y compilaciones se ejecutarán
sin red externa, bases, Redis, migraciones, seeds ni servicios operativos.

## Diseño del cambio único

El controlador vigente permanece. FuelsService conserva su método de inventario
y delega únicamente `list()` a un adaptador de entrada. Éste usa el puerto de
entrada y el caso de uso puro ListFuels. El puerto de salida queda implementado
por un adaptador que reutiliza FuelsRepository y CatalogReader con la misma
selección previa. Bootstrap compone una sola instancia de cada proveedor y
exporta las dependencias anteriores para compatibilidad. No existen reglas
de dominio nuevas: la forma de lectura pertenece a aplicación.

La imagen Catalog y la imagen legacy deberán incluir este nuevo árbol de
fuentes para compilarlo; sus comandos de arranque no cambian. Los otros tres
servicios sólo se comprobarán por compilación, sin trasladar su implementación.

## Estructura y componentes reutilizados

```text
Backend/services/catalog/src/
  domain/README.md                 (sin reglas artificiales)
  application/fuel-read-model.ts   (forma de lectura, sin conversión)
  application/ports/fuel-list-reader.ts
  application/ports/list-fuels-query.ts
  application/use-cases/list-fuels.ts
  adapters/inbound/fuels-read.adapter.ts
  adapters/outbound/existing-fuel-list.reader.ts
  bootstrap/fuels-read.module.ts
```

Flujo real: controlador anterior → FuelsService.list → FuelsReadAdapter →
ListFuelsQuery/ListFuels → FuelListReader/ExistingFuelListReader → repositorio
Prisma anterior o CatalogReader anterior. El selector se evalúa en cada llamada,
como antes, sin fallback ni reintento añadido. El bootstrap exporta los mismos
proveedores usados por inventario, sin registrar una segunda implementación de
persistencia. FuelsModule sigue siendo la entrada compatible para el proceso
Catalog y para AppModule legacy. No se registra otro controlador ni proceso.

Se reutilizan controlador, decoradores de acceso/Swagger, consulta Prisma,
serialización HTTP, selección de adaptador y manejo de errores. Del proyecto
alternativo se conserva el patrón de aplicación/puertos, no se importan sus
dependencias, SQL ni reglas de normalización. Su árbol permanece intacto.

## Resultados reales de validación

Ejecución final: `.cache/astra-stage3a/run-14bdb9e879f3/`, Node 22.21.1,
contenedor temporal `--rm --network none`. Fuentes montadas readonly y copiadas
a `/tmp` dentro del contenedor; dependencia de herramientas tomada de la imagen
de validación de Etapa 2. No se cargan archivos .env. No hay PostgreSQL, Redis,
puertos publicados, volúmenes de datos ni comandos de migración/seed en el harness.
Supertest utiliza HTTP local al contenedor con persistencia y servicios de
autorización simulados; se ejecuta la clase AccessGuard vigente sin modificarla.

| Verificación | Resultado |
|---|---|
| Línea base previa: fachada y permisos privados | 8/8 |
| Nueva comparación de selección, identidad de resultados, vacíos, errores, serialización, composición Nest, métodos, rechazos y alcance | 12/12 |
| Regresión fachada, permisos privados y acceso de recuperación de terminal | 10/10 |
| Contratos de enrutamiento Gateway | 24/24 |
| Empaquetado con compilador simulado y directorios temporales | 9/9 |
| Compilación independiente Catalog | PASS; 119 archivos; `src/apps/catalog/main.js` |
| Compilación independiente Identity | PASS; 111 archivos; `src/apps/identity/main.js` |
| Compilación independiente Administration | PASS; 95 archivos; `src/apps/administration/main.js` |
| Compilación independiente Commerce | PASS; 171 archivos; `src/apps/commerce/main.js` |
| Compilación TypeScript legacy | PASS |
| Docker Catalog runtime `primax-astra-catalog:stage3a` | Construcción PASS; módulo cargado y caso vacío ejecutado sin conexión |
| Docker legacy `primax-astra-legacy:stage3a-build` | Target build PASS; no despliegue |

Total de la ronda final: **55 pruebas correctas** (22 Jest + 24 Gateway + 9
empaquetado); las 8 de línea base no se suman como cobertura nueva. Sólo Catalog
contiene los 14 archivos JS/map emitidos de los siete nuevos módulos TypeScript.
Los otros tres artefactos no incorporan este árbol. Los comandos de entrada se
conservan. La imagen runtime Catalog contiene sólo dependencias de producción.

Antes/después: mismo array y objetos en memoria, Decimal/Date intactos y JSON
idéntico; conserva campos adicionales y resultados vacíos. Ambas selecciones
usan la dependencia anterior correspondiente una sola vez, propagan errores y
no recurren a la alternativa al fallar. GET continúa público; query stationId
no cambia esta lista global. POST continúa 404. Peticiones firmadas inválidas
se rechazan antes de la consulta; Control anónimo sigue 401 y kiosco en Control
403. Inventario mantiene la consulta include, Cache-Control no-store y el alcance
de la estación derivada del actor; un kiosco sin estación sigue rechazado.
La falta de configuración HTTP mantiene 503 y el formato del error vigente.

La primera ronda `run-c4e930f4a5e3` pasó Jest y Gateway, pero el nuevo harness
excluyó accidentalmente `build-domain.test.cjs` por su prefijo de nombre. Se
corrigió únicamente ese filtro y se ejecutó la ronda completa en una carpeta
nueva. Ambos expedientes quedan conservados. Una inspección inicial de manifiestos
en la imagen de herramientas encontró que no contiene los artefactos individuales;
se obtuvieron de las compilaciones nuevas, no se dedujeron de esa imagen.

Comandos reproducibles utilizados:

```text
docker run --rm --network none --entrypoint node primax-astra-stage2-validation:test node_modules/jest/bin/jest.js --runInBand --config jest.config.cjs --runTestsByPath src/catalog-reader/catalog-reader.spec.ts src/catalog-reader/private-catalog.spec.ts
node tools/astra/stage3a-catalog-validation.cjs
docker build --file Backend/services/catalog/Dockerfile --tag primax-astra-catalog:stage3a Backend
docker build --file Backend/Dockerfile --target build --tag primax-astra-legacy:stage3a-build Backend
```

El harness registra sus comandos internos: Jest focalizado, Node --test para
Gateway y empaquetado, los cuatro `scripts/build-domain.cjs <servicio>` y
`tsc -p tsconfig.build.json`. Los builds Docker sólo generan Prisma Client y
compilan; no ejecutan migraciones ni seeds. Los tags stage2 no se reemplazaron.
No se ejecutó Compose. Todos los contenedores de comprobación son temporales
y terminaron; no se detuvieron ni modificaron contenedores o volúmenes previos.

## Archivos de este incremento

Modificados:

- `Backend/src/fuels/fuels.module.ts`: importa la composición hexagonal.
- `Backend/src/fuels/fuels.service.ts`: delega sólo list(), conserva inventory().
- `Backend/services/catalog/Dockerfile`: copia el árbol nuevo antes de compilar.
- `Backend/Dockerfile`: misma copia para conservar el build legacy.

Nuevos: las ocho rutas del árbol anterior, más:

- `Backend/src/fuels/fuels-hexagonal.spec.ts`: pruebas comparativas y fronteras.
- `tools/astra/stage3a-catalog-validation.cjs`: ejecución offline reproducible.
- `Docs/astra/primax-stage3a-catalog-fuels-read.md`: registro previo y resultados.
- `Docs/astra/evidence/stage3a/review-summary.json`: resultados y huellas saneadas.

## Aceptación, límites y reversión

Se cumplen los criterios del incremento único bajo las condiciones comprobadas.
No se ha consultado PostgreSQL, verificado un plan SQL real ni repetido el stack
completo o las interfaces. La consulta al ORM permanece idéntica y las pruebas
comprueban sus argumentos; eso no equivale a ejecutar una integración PostgreSQL.
Los rechazos probados usan el guard real con colaboradores simulados, no una
certificación JWT, sesiones o revocación productiva. No se afirma equivalencia
funcional universal, autonomía completa de Catalog ni cierre de T01.

Permanecen pendientes otras lecturas de Catalog, sus adaptadores legacy, bootstrap
común/AuthCore y persistencia compartida; no se cambiaron propiedades de escritura.
No se tocaron precios, inventario, pagos, esquema/migraciones, frontends, Gateway,
Identity A.4 ni sus evidencias. Las nueve evidencias 2B coinciden con sus SHA-256
históricos y siguen excluidas del commit. La historia anterior se conserva.

Reversión propuesta: revertir exclusivamente el commit de 3A mediante autorización
posterior; recupera el selector en FuelsService y los dos Dockerfiles. Sin cambios
de datos o migraciones que revertir. No es necesario borrar volúmenes ni imágenes;
las imágenes stage2 siguen disponibles. No se ejecuta esta reversión ahora.

Siguiente incremento recomendado, sólo tras autorización: una lectura de
estaciones que reutilice estos patrones y demuestre explícitamente el alcance
por actor. No se migra inventario ni otro servicio en este corte. Se detiene
el trabajo al respaldar y verificar este único incremento.

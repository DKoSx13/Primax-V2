# Catalog independiente (extracción de lectura)

Proyecto NestJS compilable con su propio lockfile, sin imports de `Backend` ni
dependencias de sus módulos. Dominio y casos de uso son TypeScript puro; el puerto
`CatalogReader` tiene adaptador PostgreSQL y los controladores son adaptadores HTTP.
La persistencia es solo lectura, con transacciones repetibles y proyección explícita.
No ejecuta migraciones, seeds, reservas, pagos ni ajustes de inventario.

```bash
npm ci --prefix services/catalog
npm test --prefix services/catalog
docker build -t primax-catalog services/catalog
```

Contrato interno v1: `GET /api/v1/fuels`, `/stations`, `/benefits` y
`/fuels/inventory`; arrays con el mismo formato JSON del catálogo anterior.
Decimales se representan como strings; fechas como ISO 8601; activos ordenados
por código. Inventario incluye combustible y estación, incluso inactivos,
para conservar el contrato existente. `x-catalog-key` es obligatorio en todas
las rutas de datos (401 si falta o no coincide). No hay endpoints de escritura.
`/health` comprueba proceso; `/health/ready` comprueba PostgreSQL.

Configuración: `APP_ENV` (dev/qa/staging/production), `PORT`,
`CATALOG_DATABASE_URL` y `CATALOG_API_KEY` de al menos 32 caracteres.
No se cargan `.env` implícitos ni hay credenciales predeterminadas.
El despliegue debe proporcionar un usuario PostgreSQL limitado a SELECT sobre
Fuel, Station, Benefit y FuelInventory, además del modo read-only de la conexión.

## Estado de integración

Se ejecuta como servicio paralelo de comprobación en QA, accesible solo por loopback
28210 y red Docker QA. Se compara por HTTP contra los cuatro endpoints existentes.
El gateway público todavía apunta al catálogo anterior; el cambio de tráfico no está
hecho. Por tanto, la extracción es independiente y verificable, pero no termina la
migración del dominio Catalog. Los datos físicos siguen en PostgreSQL QA compartido.
El servicio no autoriza usuarios ni acepta identidad de estación desde headers
públicos: la futura fachada debe autenticar y conservar el filtrado de estación
que realizan hoy los controladores existentes. No exponer este servicio directamente.

```bash
node tools/astra/catalog.cjs build
node tools/astra/catalog.cjs verify   # solo primera creación; no sobrescribe contenedor
node tools/astra/catalog.cjs restart  # vuelve a comprobar paridad y otros procesos
node tools/astra/catalog.cjs stop     # conserva contenedor y datos
```

El verificador se limita al laboratorio Astra y conserva secretos en un archivo
local excluido de Git, con modo 0600. Su evidencia pública solo contiene conteos.
Las pruebas de aplicación/HTTP usan un puerto de persistencia simulado; `verify`
usa PostgreSQL real. El pipeline propio compila, prueba y construye la imagen;
no publica ni despliega.

Preparación de alcance (misión 4): `GET /api/v1/stations?stationId=<id>` y
`GET /api/v1/fuels/inventory?stationId=<id>` filtran por estación; sin parámetro
conservan el listado completo. Vacíos, valores repetidos o inválidos devuelven 400.
El parámetro debe derivarse del actor en una fachada confiable, nunca copiarse
sin autorización desde una solicitud pública. Esto no habilita el cambio de tráfico.

Fachada preparada en Backend: `CATALOG_READ_ADAPTER=http` selecciona el cliente
interno con `CATALOG_INTERNAL_URL` y `CATALOG_API_KEY`; por defecto sigue Prisma.
El Gateway conserva CATALOG_URL a esa fachada. `CATALOG_INTERNAL_HEALTH_URL`
opcional añade readiness de la dependencia. Ninguna variable se ha activado en
los despliegues existentes. Prueba aislada desde raíz, tras compilar ambos proyectos
y generar Prisma Client: `node tools/astra/catalog-isolated.cjs`.

Separación de contratos: el proceso de fachada Catalog de Backend añade
`GET /api/v1/control/catalog/inventory` y `/control/catalog/stations` para Control,
con ADMIN_INVENTORY_VIEW y alcance por estación. Los cuatro GET públicos anteriores
se conservan; el inventario público aún requiere una decisión de negocio.
Véase `Docs/astra/catalog-auth-contracts.md` desde la raíz del repositorio.
Aceptación con red interna de Compose y Print/OCR reales:
`node tools/astra/catalog-full-stack.cjs --compose` (base sintética nueva).

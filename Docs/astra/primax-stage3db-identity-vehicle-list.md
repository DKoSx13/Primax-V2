# Astra — Etapa 3D-B: listado protegido de vehículos

## Registro anterior a la implementación

Referencia `7e9746f4eb49f475e2bd23942e8b052b179c2b78`, rama
`feat/dezkz-identity-a4-core`. Índice y árbol versionado limpios; fuentes,
archivos protegidos y migraciones de 3C y las nueve evidencias históricas
verificados por hash. No se activa ningún laboratorio Identity/A.4.

Única operación autorizada: **GET /api/v1/vehicles**. VehiclesController.list
recibe CurrentActor y PaginationDto; llama a VehiclesService.list. AccessGuard
resuelve Bearer, verifica firma/issuer/audience/expiración mediante JWT existente,
usuario activo y authVersion, y construye `{kind:'member',userId:user.id}` desde
la cuenta persistida. No toma propietario del query, body o headers arbitrarios.
Una cookie de Control o x-kiosk-key por sí solos no autentican esta ruta.

Prisma exacto: `vehicle.findMany({where:{membership:{userId}},
orderBy:{plate:'asc'},take:query.limit,skip:(query.page-1)*query.limit})`.
No includes ni proyección nueva. Respuesta: array de id, plate, label,
membershipId, createdAt, updatedAt; fechas ISO en JSON. No contiene balances,
deudas, puntos, membresía anidada ni hash de contraseña. **No hay metadatos de
paginación**: se conserva el array. Defaults page=1/limit=20, page entero >=1,
limit entero 1..100, conversión Number por ValidationPipe. Campos extra, filtros
no declarados, userId/membershipId, valores inválidos y repetidos conservan 400.
Una cabecera de propietario ajeno se ignora; nunca sustituye al actor.

Página sin filas o cuenta sin vehículos: 200 []; no 404 por ausencia en el listado.
Falta de Bearer, token inválido/vencido, cuenta inexistente o authVersion obsoleta:
rechazos originales; usuario inactivo: 403. El servicio conserva su rama
`actor.kind==='member' ? repo.list(actor.userId,query) : []`. No se añade una
regla de membresía activa distinta de la consulta original.

Una petición firmada pasa por KioskService.authorize antes de la rama Bearer;
la política kioskRoute excluye GET /vehicles. Se conserva ese rechazo. El guard
puede actualizar límites Redis al autorizar/rechazar sesiones: son efectos de
seguridad preexistentes, no escrituras del listado ni lógica a extraer. No se
invocan login, registro, link, recuperación ni comandos de revocación.

Flujo previsto: controlador original → VehiclesService.list → adaptador inbound
→ puerto/caso ListVehicles → puerto de lectura → VehiclesRepository.list anterior.
Reutiliza el Actor puro vigente de identity-core/domain y PaginationDto por
compatibilidad estructural, sin importar Nest/Prisma en aplicación. No hay nuevas
reglas de dominio. El mismo repositorio sigue atendiendo los otros métodos sin
cambiar su implementación ni autoridad. Sólo cambia la composición y list().

Los Dockerfiles Identity y legacy necesitan copiar el nuevo árbol de fuentes;
no cambian sus entrypoints. Los otros tres servicios se compilan sin modificar
su código. La integración se intentará con PostgreSQL y Redis nuevos, redes y
volúmenes exclusivos, sin puertos publicados ni .env operativos.

## Resultados

Línea base `.cache/astra-stage3db/run-a38b75366757/`: 44 tests Identity,
24 Gateway y 9 empaquetado correctos, sin red ni servicios. Ronda final offline
`.cache/astra-stage3db/run-896dd842a382/`: **76 Identity + 24 Gateway + 9
empaquetado = 109 pruebas correctas**, incluidas 32 nuevas de listado/contrato
y arquitectura. Node 22.21.1. La línea base no se suma como cobertura adicional.

| Compilación | Resultado |
|---|---|
| Identity | PASS; 125 archivos; src/apps/identity/main.js |
| Catalog | PASS; 159 archivos; src/apps/catalog/main.js |
| Administration | PASS; 95 archivos; src/apps/administration/main.js |
| Commerce | PASS; 171 archivos; src/apps/commerce/main.js |
| Legacy TypeScript | PASS |
| primax-astra-identity:stage3db | Docker runtime construido; módulo cargado sin conexiones |
| primax-astra-legacy:stage3db-build | Docker target build construido |

Sólo Identity incorpora los catorce archivos JS/map de los siete módulos nuevos.
No se modifica código ni Dockerfiles de los otros tres servicios. Los comandos
de entrada y el Compose operativo permanecen intactos; no se sustituyen imágenes
activas ni tags previos. Se conserva compatibilidad con el Backend legacy.

La primera ronda `run-e6e45ae9b113` pasó los 44 tests anteriores pero encontró
TS2352 en el tipo del doble de kiosco del nuevo fixture; no ejecutó la suite nueva.
Se corrigió la conversión del doble de prueba y se repitió la ronda completa en
otro directorio. Se conservan ambos expedientes, sin alterar AuthCore.

## Comparación PostgreSQL y Redis reales

Proyecto **primax-astra-stage3db-fa8b9a2a02d2**, red interna 10.253.216.0/27,
sin puertos publicados. Dos volúmenes nuevos exclusivos, pgdata y redisdata,
verificados vacíos y propios antes de inicializarlos. Mounts, proyecto, red y
ausencia de puertos comprobados para ambos contenedores. Credenciales aleatorias
sólo en la configuración privada ignorada; ninguna credencial operativa.

Dentro del tester se validaron host/puerto/base/rol propios, misma URL directa,
cero tablas públicas y namespace Redis exclusivo. Se aplicaron las 36 migraciones
existentes únicamente en esa base vacía, sin modificar sus archivos y sin seeds
de aplicación. Redis inicialmente tenía cero claves.

Fixtures mínimos: cinco usuarios sintéticos (incluidos inactivo y authVersion
inicial diferente), dos membresías nuevas con defaults y cuatro vehículos nuevos
(dos de A, uno de B y uno sin propietario). Se insertan una sola vez antes de
las lecturas; no se llaman register/login/link/updateProfile, cambios de estado,
revocaciones ni operaciones financieras. No se modifican relaciones de vehículos
o membresías durante las peticiones. Las contraseñas de fixture no permiten login.

Se ejecutaron **36 comparaciones anteriores/nuevas, 72 solicitudes HTTP**, con
la misma base y sin escritores concurrentes. Controlador, AccessGuard, JWT
HS256/issuer/audience, UsersService/UsersRepository, Prisma y consulta originales
son reales. También KioskService y KioskStore con Redis real. Se siembran dos
sesiones sintéticas (vigente y vencida) para comprobar el rechazo; no se inicia
una sesión mediante el flujo de login ni se modifica ese algoritmo.

Casos comprobados:

- A sólo obtiene AAA-001/AAA-002, ordenados aunque se insertaron al revés; B sólo
  BBB-001. El vehículo sin propietario queda fuera de ambas respuestas.
- Ausencia de membresía/vehículos y páginas vacías: 200 [], sin sobre ni metadatos.
- page=1/2, limit=1 y máximo 100 conservan resultados, fechas ISO y seis campos
  escalares completos. No se incluyen datos privados del usuario o finanzas.
- userId/membershipId, placa, sort u otros parámetros no declarados, límites y
  páginas inválidos/repetidos: mismo 400. Headers y body GET con propietario ajeno
  se ignoran y conservan sólo los vehículos del actor real.
- Sin autenticación, token inválido, expirado, audiencia incorrecta, cookie Control
  aislada, x-kiosk-key aislada y authVersion anterior: mismo 401; usuario inactivo
  o ausente: mismo 403, sin lectura de vehículos en los tests focalizados.
- HMAC inválido, sesión Redis ausente/vencida: 401. Sesión Redis/HMAC válidos:
  403 por política de kiosco para GET /vehicles. También con un Bearer válido
  presente: la precedencia original de la firma no cambia.

Los errores coinciden excluyendo sólo el timestamp variable, que también se
comprueba presente. Huella de las **41 tablas públicas, 48 filas** antes/después:
`9dfe6c8ea317628a99ac80a089fa3e16af5b2003e6b86d2da9277f093890ca01`, idéntica.
Redis conserva dos claves de fixture y una del limitador original. No se afirma
que toda la petición sea sin escrituras: el control de seguridad Redis mantiene
sus efectos originales; el listado y la aplicación extraída no escriben datos.

PostgreSQL y Redis quedaron detenidos con exit 0; tester temporal retirado.
Volúmenes, red y logs se conservaron. No se montaron ni modificaron volúmenes
anteriores. T01 y sus nueve evidencias permanecen intactos.

## Estructura y archivos

```text
Backend/services/identity/src/
  application/vehicle-read-model.ts
  application/ports/list-vehicles-query.ts
  application/ports/vehicle-list-reader.ts
  application/use-cases/list-vehicles.ts
  adapters/inbound/vehicle-list-read.adapter.ts
  adapters/outbound/existing-vehicle-list.reader.ts
  bootstrap/vehicle-list-read.module.ts
```

VehiclesModule importa VehicleListReadModule; éste provee el único repositorio
usado por VehiclesService tanto para el listado como para los métodos anteriores.
El adaptador outbound delega list sin duplicar Prisma; el caso puro conserva la
misma rama por kind del actor. Se reutiliza únicamente el contrato Actor puro,
no el autenticador alternativo ni los experimentos de services/identity.

Modificados cinco archivos existentes:

- Backend/src/vehicles/vehicles.service.ts: constructor y delegación list.
- Backend/src/vehicles/vehicles.module.ts: composición y repositorio único.
- Backend/src/vehicles/vehicles.service.spec.ts: sólo adaptación al constructor;
  conserva las tres comprobaciones anteriores de búsqueda por placa.
- Backend/services/identity/Dockerfile y Backend/Dockerfile: copian fuentes
  Identity para compilar, sin modificar comandos de arranque.

Nuevos: los siete módulos del árbol, Backend/src/vehicles/vehicle-list-hexagonal.spec.ts,
Backend/test/vehicle-list.fixture.ts, Backend/test/vehicle-list.integration.cjs,
tools/astra/stage3db-identity-validation.cjs, tools/astra/stage3db-postgres-redis.cjs,
este informe y evidence/stage3db/review-summary.json. Diecinueve rutas en total.
Los cuerpos de create, membership y findByPlate y el repositorio completo quedan
idénticos. No se trasladan escrituras, búsquedas individuales ni reconocimiento.

```text
node tools/astra/stage3db-identity-validation.cjs --baseline
node tools/astra/stage3db-identity-validation.cjs
node tools/astra/stage3db-postgres-redis.cjs
docker build --file Backend/services/identity/Dockerfile --tag primax-astra-identity:stage3db Backend
docker build --file Backend/Dockerfile --target build --tag primax-astra-legacy:stage3db-build Backend
```

El modo baseline registra las regresiones sobre el árbol existente al invocarlo;
la ejecución histórica se hizo antes de editar VehiclesService. Los tests offline
usan contenedores --rm --network none y copias temporales de fuentes readonly,
sin .env. Los builds sólo generan Prisma Client y compilan; las únicas migraciones
ejecutadas corresponden al PostgreSQL nuevo del laboratorio, no a bases existentes.

## Dependencias, límites y aceptación

La operación autorizada queda conectada a aplicación/puertos y validada en las
condiciones documentadas. Persisten controlador/repositorio legacy, contrato Actor
compartido y bootstrap/AuthCore, Prisma/PostgreSQL y Redis. No se cambia propiedad
de datos ni se crea un proceso Identity paralelo o una autoridad adicional.

No se certifican equivalencia integral de los tres frontends, carga/concurrencia,
restauración, login/logout, recuperación, vínculo de vehículos ni revocación
concurrente. Las firmas/sesiones se generan como fixtures, aunque las verifican
los componentes reales. El guard global de throttling del bootstrap completo no
forma parte de estas composiciones focalizadas; no se modifica su configuración.
La consulta conserva las políticas originales y no añade filtrado por status
de membresía. No se altera AuthCore, PasswordReset, authVersion, finanzas, Catalog,
Administration, Commerce, Gateway, Prisma o migraciones. A.4 sigue cerrado.

Reversión propuesta, sólo con autorización posterior: revertir el commit único
de 3D-B para recuperar la delegación y composición previas; sin cambios de datos
operativos ni DDL que deshacer. No borrar evidencias o volúmenes. No se ejecuta.

Para continuar Identity hace falta revisar y autorizar otra operación concreta
con su política; no se inicia automáticamente ninguna lectura adicional. El
perfil agregado /memberships/me sigue incluyendo dependencias financieras y no
se presenta como el siguiente paso ya aprobado.

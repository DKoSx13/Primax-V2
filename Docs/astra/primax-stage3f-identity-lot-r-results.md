# Astra — Etapa 3F: Lote R de Identity

## Registro previo a implementación

Referencia inicial `1dcb5836ad2bbbb089c486eba2c9950ad05a2d55`.
Diseño 3E respaldado solo en `f28b96fb56c7d9acffa3810d1943037222d8a928`.
Rama feat/dezkz-identity-a4-core, sin cambios versionados inesperados y nueve
evidencias originales intactas y excluidas. Se implementan sólo cinco lecturas.

| Ruta | Flujo anterior que se conserva |
|---|---|
| GET /api/v1/memberships/me | Actor propio → forUser/findForUser con user(name,email), vehicles y escalares completos → LegacyMembershipCommerce.summary: puntos, reservas RESERVED/DISPENSING sin nuevo filtro mode, deuda; consultas secuenciales. Conserva snapshot balance inicial y spread del registro, fixed(2), cero sólo por agregado null, 404 sin membresía. |
| GET /api/v1/memberships/me/transactions | forUser → repo.transactions por membershipId propio, transactionInclude, createdAt desc/id desc, take/skip → transactionResponse sin requestHash y con receiptResponse. |
| GET /api/v1/memberships/me/rewards | forUser → RewardMovement de membresía propia, mismo orden/paginación, sin cálculo o escritura adicional. |
| GET /api/v1/memberships/me/redemptions | forUser → Redemption propio con Benefit incluido, mismo orden/paginación; no canje ni débito. |
| GET /api/v1/vehicles/:plate | PlateDto y normalizePlate anteriores → findUnique con membership/aliases/user/debts → mismo 404 si inexistente o miembro ajeno → mismo objeto con perfil y dinero formateado. MemberOrKiosk y política técnica permanecen. |

MembershipsController y VehiclesController no cambian. AccessGuard mantiene
Bearer/usuario activo/authVersion; firma de kiosco tiene precedencia y conserva
su whitelist, CSRF, versión y estación. No se infiere un actor de query o headers.
Los historiales conservan PaginationDto, arrays, defaults 1/20 y máximo 100.
Los filtros no declarados y parámetros inválidos conservan sus errores actuales;
no se añade un filtro donde antes se ignoraba el query. Una página vacía devuelve
[], mientras que membresía inexistente produce 404. No se impone estado ACTIVE
adicional a estas consultas. El listado de vehículos 3D-B queda en su caso existente.

No hay escrituras de negocio en estas lecturas. La autorización de kiosco puede
actualizar el limitador Redis original: se conserva ese efecto. PATCH profile
llama me después de confirmar su escritura y create Vehicle llama findByPlate
después de link; conservar esas delegaciones y errores no significa extraer sus
comandos. No se toca updateProfile del repositorio, saveReceiptProfile ni ninguna
transacción. No snapshot común, paralelismo nuevo, caché o HTTP adicional.

Se reutilizan los repositorios, LegacyMembershipCommerce, transactionResponse,
receiptResponse y algoritmo vigente de placa. Los casos de uso puros dependen
de puertos genéricos que conservan los tipos de representación de compatibilidad;
Prisma, Nest y el formato monetario quedan en adaptadores legacy. Se comparte un
helper de búsqueda propia con el servicio anterior para no duplicar el 404 ni
crear un ciclo de delegación. No se activan runtimes experimentales o Identity A.4.

## Resultados

**Cinco operaciones consolidadas; ninguna excluida del lote autorizado.**
No se inicia P, C ni G, ni se migra el ejecutor de finanzas a Commerce.

Línea base `.cache/astra-stage3f/run-1da24dd6ed01/`: 76 pruebas Identity,
24 Gateway y 9 empaquetado correctas. Ronda final offline
`.cache/astra-stage3f/run-4c538c6e5175/`: **100 Identity + 24 Gateway + 9
empaquetado = 133 pruebas correctas**, cero fallos. Las 24 nuevas incluyen
consulta/orden financiero, errores y membresía ausente por operación, contratos
HTTP, propietario, paginación y el fallo de lectura posterior a updateProfile
usando mocks. Las aserciones históricas se conservan; dos fixtures de constructor
se adaptan a la nueva composición. Node 22.21.1, contenedores temporales sin red.

| Build | Resultado |
|---|---|
| Identity | PASS; 143 archivos; src/apps/identity/main.js |
| Catalog | PASS; 159 archivos; src/apps/catalog/main.js |
| Administration | PASS; 95 archivos; src/apps/administration/main.js |
| Commerce | PASS; 171 archivos; src/apps/commerce/main.js |
| Backend legacy | PASS |
| primax-astra-identity:stage3f | Imagen runtime construida; módulos Memberships/Vehicles cargados sin conectar datos |
| primax-astra-legacy:stage3f-build | Target build construido |

Sólo Identity emite las fuentes hexagonales Identity; los otros tres artefactos
no las incorporan. No cambian Dockerfiles, dependencias npm, entrypoints ni Compose.
Los tags anteriores siguen disponibles y las imágenes nuevas no se activan.

## Integración comparativa real por operación

Se conserva la fuente original de MembershipsService y VehiclesService del commit
`1dcb5836ad2bbbb089c486eba2c9950ad05a2d55`, recuperada con git show únicamente
en el directorio privado de cada ejecución. Se carga como referencia en la copia
temporal del tester, con los repositorios/mappers anteriores verificados intactos.
No hay copias de referencia en código operativo ni un Identity paralelo nuevo.

Proyecto final **primax-astra-stage3f-5490e3bb41eb**. Una PostgreSQL nueva y Redis
nuevo, dos volúmenes propios verificados vacíos, red interna 10.253.218.32/27 y
cero puertos publicados. Antes de migrar se verificaron proyecto, mounts, destino,
rol/base, host/puerto, URL directa igual y cero tablas públicas. Se aplicaron las
36 migraciones existentes sin cambiar archivos; no se ejecutaron seeds de aplicación.
Redis también se acreditó vacío antes de sus fixtures.

| Contrato comparado | Casos anterior/nueva | Resultado |
|---|---:|---|
| memberships/me | 14 | PASS |
| memberships/me/transactions | 20 | PASS |
| memberships/me/rewards | 20 | PASS |
| memberships/me/redemptions | 20 | PASS |
| vehicles/:plate, variantes y errores | 19 | PASS |
| Total | **93 comparaciones / 186 solicitudes HTTP** | PASS |

Controladores, AccessGuard, JWT HS256/issuer/audience, UsersService/Repository,
Prisma, KioskService y KioskStore son reales. Las claves son efímeras y sólo los
recursos de prueba reciben configuración sintética. No se cambia la autenticación.

Fixtures revisados y cargados antes de consultar: cinco usuarios, dos membresías,
cuatro vehículos, alias legado, dos estaciones, combustible, beneficio, tres
transacciones con pagos/comprobantes emitidos por el trigger existente, deuda,
movimientos/canje de puntos y autorizaciones de distintos estados. El saldo se
configura exclusivamente en la base nueva para probar la proyección; no se llama
al motor de venta, recarga, link, registro, actualización de perfil o recuperación.
No se trata esta inicialización como una validación de ejecución financiera.

Garantías comprobadas:

- me de A conserva balance/available 12.34, reserved 4.25, total 16.59,
  pendingBalance 3.00 y points 9, con sus campos originales completos. Una
  autorización INTERVENTION_REQUIRED adicional no entra en reserved de me;
  no se uniformó con Wallet. B conserva sus propios valores y no los de A.
- Historiales A/B, arrays vacíos, página vacía, limit/page, orden createdAt/id de
  consultas, Benefit incluido, puntos negativos de canje, receipt.number y
  correlative string; requestHash no aparece. Los errores se comparan omitiendo
  sólo el timestamp variable, cuya presencia se comprueba.
- Token ausente/inválido/vencido/versión anterior, usuario inactivo, cookie Control
  aislada: mismos rechazos. Query userId de me se ignora como antes; en historiales
  userId/stationId y parámetros no declarados se rechazan por el DTO. Propietario
  siempre procede del actor; no se introduce un filtro nuevo por estación al socio.
- Miembro B buscando placa de A: mismo 404; inexistente: 404; placa inválida: 400;
  normalización de placa de miembro conservada. Kiosco autorizado ve la vista
  permitida de placa, incluidos alias y deuda, y un vehículo sin membresía devuelve
  membership:null. No se convierte la política de kiosco en aislamiento de socio.
- Firma inválida, sesión vencida, CSRF incorrecto y sesión de otra estación: mismos
  rechazos reales de seguridad. Kiosco válido no puede acceder a me/historiales;
  las variantes de placa no admitidas por su whitelist siguen rechazadas aunque
  el DTO de miembro pueda normalizarlas.
- Lookup por placa no añade un filtro por estación inexistente en el contrato:
  la sesión válida de kiosco mantiene el acceso que el código anterior permitía.
  Se documenta esa diferencia, sin presentarla como un nuevo permiso administrativo.

Las **41 tablas públicas, 71 filas** conservaron la misma huella antes/después:
`d0711ede45481c1e9fe59d1f0054d2f8dc012e9256bb19c0bc77d69a4b8b69c8`.
Las secuencias de comprobantes también permanecieron iguales: consultar no emite
recibos ni reconstruye referencias. Redis conserva tres sesiones de fixture y
el limitador original. Ese limitador escribe como antes; no se declara que toda
la petición sea de sólo lectura, sino que no cambian datos de negocio SQL.

La primera ejecución integrada `primax-astra-stage3f-2974d463b9f1` ya pasó 92
comparaciones; se conserva íntegra. La final añade rechazo de sesión de otra
estación y usa otro proyecto/volúmenes nuevos, sin reutilizar los anteriores.
Ambos PostgreSQL/Redis quedaron detenidos con código 0; testers --rm retirados.
Se conservaron datos, redes y logs para diagnóstico, sin borrar volúmenes.

## Arquitectura y archivos del incremento

Nueve módulos nuevos en Backend/services/identity/src:

```text
application/ports/membership-reads.ts
application/ports/vehicle-lookup.ts
application/use-cases/membership-reads.ts
application/use-cases/lookup-vehicle.ts
adapters/inbound/membership-reads.adapter.ts
adapters/inbound/vehicle-lookup.adapter.ts
adapters/outbound/legacy-membership-reads.ts
adapters/outbound/legacy-vehicle-lookup.ts
bootstrap/membership-reads.module.ts
```

Se amplía bootstrap/vehicle-list-read.module.ts para compartir su único repositorio
con el lookup. MembershipReadsModule proporciona un único MembershipsRepository
compartido por fachada y lectura. Los puertos genéricos conservan vistas de
compatibilidad tipadas en adaptadores, sin importar ORM/framework en aplicación.

Se modifican seis archivos existentes: el bootstrap Vehicle indicado,
memberships.module.ts, memberships.service.ts, vehicles.service.ts y los dos
fixtures de constructor en vehicles.service.spec.ts y membership-commerce.spec.ts.
Las fórmulas/formatos de placa se trasladan literalmente a un único adaptador;
la composición me reutiliza LegacyMembershipCommerce intacto. El helper propio
de membresía comparte la comprobación 404 con el servicio, sin duplicarla.
Los cuerpos updateProfile y create permanecen idénticos, igual que los repositorios
completos, saveReceiptProfile y los servicios financieros/mappers.

Se añaden también identity-reads.spec.ts, el fixture identity-lot-r.fixture.ts,
el comparador identity-lot-r.integration.cjs, dos herramientas stage3f, este
informe y evidence/stage3f/review-summary.json. El manifiesto ofrece las rutas
exactas y hashes. El diseño 3E se respalda en un commit separado y no se modifica.

Comandos principales:

```text
node tools/astra/stage3f-identity-validation.cjs --baseline
node tools/astra/stage3f-identity-validation.cjs
node tools/astra/stage3f-postgres-redis.cjs
docker build --file Backend/services/identity/Dockerfile --tag primax-astra-identity:stage3f Backend
docker build --file Backend/Dockerfile --target build --tag primax-astra-legacy:stage3f-build Backend
```

El baseline registra regresiones sobre el árbol al invocarlo; la ronda identificada
se hizo antes de editar los servicios. La prueba de commit de perfil seguido de
fallo de lectura usa mocks: no se ejecutó PATCH contra la base integrada ni se
validó de nuevo la escritura financiera. Los builds no migran ni ejecutan seeds.
No se ejecutó Compose operativo, Gateway público o interfaces reales.

## Límites y cierre del lote

Aceptadas técnicamente las cinco lecturas en las condiciones comprobadas, sin
operaciones excluidas. No se certifica equivalencia universal de frontends,
concurrencia o recuperación productiva. Los snapshots financieros siguen sin
garantía común; el throttler del bootstrap completo no forma parte de estas
composiciones focalizadas, aunque la autorización de kiosco real sí se ejercita.

Persisten adaptadores locales, repositorios legacy, fuentes financieras y mappers,
Actor/Prisma/bootstrap/AuthCore compartidos y datos PostgreSQL comunes. El lote
no traslada cálculo ni ejecución financiera a Commerce; sólo establece puertos.
No hay autoridad nueva, caché ni RPC. No se modifican permisos, authVersion,
PasswordReset, schema, migraciones, Gateway, frontends, Catalog, Administration,
Commerce, Identity A.4, saveReceiptProfile o T01. Las nueve evidencias históricas
siguen intactas y excluidas.

Reversión propuesta: revertir sólo el futuro commit de implementación de 3F,
conservar el commit documental 3E y todos los datos/evidencias; no hay DDL ni datos
operativos que deshacer. No se ejecuta esa reversión. Se detiene el trabajo al
verificar el respaldo del lote; P/C/G requieren autorización independiente.

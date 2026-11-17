# Identity A.4 fase 4A — VehicleLink.v1 privado

Estado: **implementado y probado solo en laboratorio sintético**, sin integración
pública ni fase 4B. Base y HEAD conservados:
`a4dc5f59505b4088de1c50c2b8cbed8a95f9b27a`, rama
`feat/dezkz-identity-a4-core`. Al inicio solo estaba sin seguimiento el diseño
`identity-a4-phase4-consistency-vehicle-link-design.md`; se preserva íntegro junto
con los cinco commits anteriores. No se modifica ningún archivo preexistente.

## Arquitectura y única autoridad de escritura

Flujo privado, en proceso, sin rutas ni bootstrap operativo:

1. `PrivateVehicleLinkV1` verifica una credencial mediante el puerto de autorización,
   exige principal member y capacidad propia de comando/lectura, y consulta el
   vínculo Identity 3A por el usuario autenticado. El actor no viene del body.
2. Contrasta expectedMembershipId con ese vínculo y normaliza placa/label usando
   los normalizadores reales del Backend inyectados. Se conserva el formato
   XXX-999, cleanText y límites de label por puntos de código Unicode.
3. `LegacyVehicleLinkAdapter` delega una sola vez en el **método real e intacto**
   `Backend/src/vehicles/vehicles.repository.ts#link`. No contiene ramas alternativas
   de creación/actualización/propiedad ni SQL de escritura de Vehicle.
4. El adaptador añade únicamente una precondición de binding dentro de la misma
   transacción: la membresía operativa por userId debe existir y coincidir con
   expectedMembershipId antes de ejecutar el trabajo original del repositorio.
5. El repositorio original mantiene las comprobaciones de User.active y Membership
   ACTIVE y las ramas de dueño propio/ajeno/sin dueño. La transacción y sus reintentos
   siguen siendo los de `Backend/src/prisma/prisma.service.ts#atomic`.
6. Las consultas delegan la autorización de propietario a `VehiclesService.findByPlate`
   real, usando otra conexión de solo lectura; se devuelve únicamente la proyección
   de vínculo, sin los datos financieros que el proveedor utiliza internamente.

El shim de atomic no abre otra transacción: usa la transacción real existente.
Los proxies del arnés solo programan barreras de concurrencia y cuentan intentos;
no reimplementan SSI, reintentos o reglas de link. El factory inyectado crea el
repositorio real. Varias instancias/clientes de la misma autoridad y base no son
dos escritores independientes. No se usa la copia de link del runtime Identity
compatible ni se crea una tabla Vehicle en la base A.4.

SHA-256 de los fuentes operativos registrados por la evidencia final:

```text
VehiclesRepository: de6fa991ae02381a2e6c1f65c4fc6118304bc99566f59a636d4f6ae30eb4c51f
PrismaService:      04d8563747e90503f96e7df438cbfc98e3ce1d3bebd735f0dd228121c403d0eb
```

## Contrato privado desarrollado

`services/identity/lab/vehicle-link-contract.ts` separa autorización, identidad,
normalización, comando y consulta. Lab queda fuera del include de runtime.

| Elemento | Contenido y semántica |
| --- | --- |
| VehicleLinkCommandV1 | contractVersion=1, operationId UUID, expectedMembershipId UUID, plate y label. Rechaza campos adicionales, incluido userId |
| VehicleLinkAuthorization | authenticate(credential) devuelve principal member acreditado y capacidades `vehicle:link:own` / `vehicle:read:own`; no son nuevos grants AuthCore |
| LegacyVehicleLinkPort | linkForOwner recibe usuario acreditado, membresía esperada, placa/label; no expone dinero ni persistencia Identity |
| LegacyVehicleOwnerReadPort | forOwner; no comandos ni facultad de transferir/desvincular |
| Resultado | contractVersion, operationId, outcome=LINK_CONFIRMED, recovery=STATE_CONVERGENCE_ONLY, vehicleId, membershipId, plate y label persistido; inmutable |
| Errores | INVALID_INPUT, DENIED, NOT_FOUND, BINDING_MISMATCH, OWNERSHIP_CONFLICT, UNAVAILABLE, OUTCOME_UNKNOWN; solo código y outcome, sin texto/SQL/URL del proveedor |
| Outcome de error | NOT_SENT: fallo antes del envío; REJECTED: rechazo conocido por autoridad; UNKNOWN: pudo haber commit, no reintentar automáticamente |

No se inventa CREATED/REPLAYED: el método legado no informa qué rama produjo el
resultado. Un mismo dueño conserva UUID y label persistido, incluso si solicita
otra etiqueta. Una respuesta malformed tras enviar el comando es resultado dudoso,
no una prueba de rollback. Los rechazos conocidos 403/404/409/503 del proveedor se
clasifican por separado. Un error no clasificado tras invocarlo se trata de forma
conservadora como OUTCOME_UNKNOWN, aunque una inspección posterior vea rollback.

`operationId` es **solo correlación** en esta fase: no hay digest, ledger ni deduplicación
durable por clave. Una repetición explícita provoca otra delegación legítima; el
repositorio converge por placa/propietario. No se impide reutilizar la misma clave
con otra intención y no se promete recuperar el resultado original tras reinicio.
El comando no realiza reintentos ocultos; el repositorio conserva los reintentos
locales de transacciones abortadas que ya tenía. Ningún transporte HTTP cambia.

La falta de membresía operativa esperada puede producir NOT_FOUND privado por el
guard adicional; esto no cambia el 403 vigente del POST público. No se implementa
ningún mapeo HTTP nuevo ni se conecta el adaptador a módulos operativos.

## Pruebas realmente ejecutadas

| Ejecución de este corte | Resultado | Evidencia bajo Docs/astra/evidence/ |
| --- | --- | --- |
| Unitarias finales | **82/82**: 58 regresiones anteriores + 24 nuevas | `identity-a4-phase4a-unit-fe720cf2ee95f91923b709aa.json` |
| Integración PostgreSQL final | **15 grupos aprobados**: siete de lectura/provisión previas reutilizadas y ocho de delegación 4A | `identity-a4-phase4a-a4-6e7becbc51d8c31c4f541aed.json` |
| Unitarias iniciales | 81/81, antes de añadir la prueba Unicode | `identity-a4-phase4a-unit-1edf8a42fbbfbf9268d3994e.json` |
| Primera integración completa | 15 grupos, antes de ampliar rechazo de vehículo ya propio suspendido/inactivo | `identity-a4-phase4a-a4-c16a2c18c410db51fb42b2b7.json` |
| Intento de compilación inicial | Falló con 11 diagnósticos TypeScript del archivo nuevo, sin ejecutar escenarios 4A | `identity-a4-phase4a-a4-817f104ab4083c2fa3bc98b9.json` |

El primer fallo fue inferencia de flujo alrededor de un helper never declarado
como const/arrow. Se corrigió solo el archivo nuevo usando declaración de función;
el typecheck posterior pasó. No se alteraron configuraciones ni fuentes previos.
Se preserva la evidencia fallida y no se suma a los resultados aprobados.

TypeScript 5.9.3 y Node 22.21.1 de la imagen local. Se verifican sin emitir núcleo,
3A y contrato/tipos negativos 4A usando opciones reales de tsconfig Identity y
rootDir ampliado únicamente en memoria para lab. Las unitarias usan el transpiler
privado existente; no equivalen a typecheck de todo Backend. No se instaló nada.

### Escenarios e integridad

- Placa propia: mismo UUID, etiqueta y fila completa, sin actualización al repetir.
- Placa existente sin dueño: conserva UUID y adopta label saneado. Placa de otro
  dueño: OWNERSHIP_CONFLICT sin datos del propietario.
- Dos usuarios activos sobre RAC-001 nueva y RAC-002 sin dueño: barrera después
  de ambas búsquedas reales fuerza solapamiento. Un éxito, un conflicto y una sola
  fila; para la existente se preserva el UUID previo.
- Ocho invocaciones concurrentes del mismo propietario: un UUID y una placa;
  reintento posterior con otro label mantiene la etiqueta ganadora.
- Membresía SUSPENDED y usuario inactivo se siembran antes de las pruebas. El
  repositorio real rechaza tanto placa nueva como un vehículo ya propio. No se
  actualizan Membership.status ni User.active durante los casos de negocio.
- Credencial falsificada, propietario pedido distinto, binding operativo cruzado
  y miembro inexistente: rechazo sin escribir. Lecturas propias funcionan; ajenas
  e inexistentes devuelven NOT_FOUND mediante servicio legado real.
- Proveedor no disponible antes de forwarding: UNAVAILABLE/NOT_SENT, sin fila.
  Respuesta perdida inyectada después del commit real: OUTCOME_UNKNOWN y exactamente
  un forwarding. Observación posterior y reintento explícito conservan UUID/label;
  **no prueban recuperación durable ni la respuesta histórica original**.
- Error inyectado tras trabajo legado pero dentro de atomic: rollback, sin Vehicle.
  El llamador recibe resultado conservador desconocido y no reenvía automáticamente.
- Snapshots de las **39 tablas legadas distintas de Vehicle** y las **cinco tablas
  A.4** iguales antes/después. Incluyen membresías, usuarios, saldos, puntos, deudas,
  bienvenida, transacciones y autorizaciones. Las filas Vehicle propias/ajenas y
  de actores inelegibles no se modifican; solo se permiten las altas/vínculos
  deliberados de los escenarios.
- Compra histórica y autorización guest conservan membershipId=null tras vincular
  su Vehicle. Se mantienen vehicleId y los demás campos; no se atribuyen al nuevo
  dueño ni se reasignan compras de miembros.
- El rol escritor de vínculo no puede actualizar Membership/User/Transaction ni
  borrar Vehicle. Las sentencias negativas de privilegios fallan con SQLSTATE 42501;
  no modifican esas filas. El lector Identity tampoco puede leer Vehicle en la
  base legada. No hay un segundo almacén de vínculos.

La ejecución final registró 24 invocaciones del repositorio y 27 intentos de su
transacción: los intentos adicionales corresponden al mecanismo original de
reintentos locales. No son 27 comandos independientes ni una garantía exactly-once.

## Aislamiento del laboratorio

Los runners no aceptan URLs ni nombres de recursos externos. Cada ejecución crea
red interna y PostgreSQL nuevos etiquetados, sin puertos publicados, sin volúmenes
existentes, datos solo en tmpfs y checkout read-only. El helper existente selecciona
una subred /28 libre tras inspeccionar IPAM/rutas; no borra ni reutiliza redes.
La ejecución final usó 10.203.4.0/28.

Se reutilizan imágenes cacheadas con --pull never:

```text
tools:    sha256:38ceee7d6e80b0ed7b3e7d4065312238874d9d10bdbba0dd1152b21ce16fe6e0
postgres: sha256:f3bd19c606e442c3d7bdfa8002e03fe260a1023351e0ea4598032022b68dd6e3
```

Dos bases nuevas separadas: a4_read para identidad/códigos y a4_legacy para el
proveedor Backend. El DDL existente de numeración conserva AllocationReceipt de
fase 2 para preparar fixtures; **no se crea ningún recibo VehicleLink**, outbox,
reserva distribuida o sincronización. El schema legado se materializa desde cero
con DDL Prisma y la función histórica de numeración requerida, como en 3B.
No reproduce todos los triggers/migraciones históricos ni valida operaciones de
venta completas. No se modifican schemas versionados ni bases existentes.

El writer a4_vehicle_writer solo tiene SELECT y capacidad INSERT Vehicle / UPDATE
membershipId,label,updatedAt. Lecturas de propietario usan a4_legacy_reader de
solo lectura; el administrador solo prepara fixtures y audita el dataset. El
código Identity recibe puertos, no credenciales de escritura SQL ni lógica de link.
Los clientes Prisma se generan solo en tmpfs nuevo usando dependencias cacheadas.

Los PostgreSQL propios se detienen verificando etiqueta; sus contenedores y redes
quedan retenidos. No se eliminan recursos anteriores. Los workers efímeros propios
usan --rm y no persisten secretos. Las evidencias no incluyen contraseñas/tokens.

## Límites y riesgos pendientes

1. Autenticación del arnés: credenciales opacas aleatorias asociadas a usuarios y
   permisos sintéticos, más bindings reales del laboratorio 3A. No se probaron JWT,
   AuthCore, revocación de sesiones, firma/transporte entre servicios o guards HTTP.
   Los actores inactivos se admiten deliberadamente en esa frontera sintética
   para probar el rechazo en la autoridad; no es un guard productivo reutilizable.
2. No hay prioridad de suspensión concurrente definida ni probada. Solo se
   verifica estado inelegible previo; no se ejecuta una carrera que modifique
   status. La serialización actual no equivale a revocación instantánea.
3. No existen recibos VehicleLink, persistencia de intenciones ni recuperación tras
   crash/restore. Ausencia de respuesta nunca prueba rollback. Consultar estado
   actual no acredita qué operación lo produjo ni permite cambiar el label.
4. No hay snapshot distribuido, versionado de estados, dominio trasladado ni un
   endpoint de transferencia/desvinculación. UUID user/account/member siguen
   siendo distintos y explícitos; la autoridad revalida el vínculo operativo.
5. La igualdad de tablas prueba ausencia de efectos financieros en estos fixtures;
   no prueba toda la cadena de pagos, invitados en entrega, frontends u OCR reales.
   No se atribuyen causas a CI/TLS/timeouts históricos.
6. 4A corresponde al perfil mínimo autorizado del diseño: operationId de correlación,
   sin las capacidades futuras de recibos/revisiones. No debe promoverse a contrato
   público ni anunciar idempotencia durable.

## Inventario exacto y reproducción

Ocho archivos nuevos de contrato, adaptador, pruebas y herramientas:

```text
services/identity/lab/vehicle-link-contract.ts
services/identity/lab/vehicle-link-legacy-adapter.cjs
services/identity/lab/vehicle-link-contract.test.cjs
services/identity/lab/vehicle-link-contract.types.test.ts
tools/astra/identity-a4-vehicle-link-lab.cjs
tools/astra/identity-a4-vehicle-link-worker.cjs
tools/astra/identity-a4-vehicle-link-scenarios.cjs
tools/astra/identity-a4-vehicle-link-unit-check.cjs
```

Además, este informe `Docs/astra/identity-a4-phase4a-vehicle-link-results.md` y las
cinco evidencias JSON enumeradas en la tabla de resultados: **14 archivos nuevos
4A**. El diseño de fase 4 ya existente es otro archivo sin seguimiento y no se
modifica: **15 sin seguimiento en total**. No hay staging ni cambios versionados.
El cotejo final SHA-256 confirma los 1061 archivos de la línea base inicial
idénticos, sin eliminaciones, incluido el diseño de fase 4. Las comprobaciones
de sintaxis CJS, JSON de evidencias y whitespace pasaron. No se encontraron
credenciales reales ni datos personales reales entre los archivos nuevos; las
coincidencias revisadas son una plantilla de URL, un hash de login ficticio y
correos sintéticos `.invalid`. No hay imports nuevos desde los runtimes examinados.

```text
node tools/astra/identity-a4-vehicle-link-unit-check.cjs
node tools/astra/identity-a4-vehicle-link-lab.cjs
```

## Recomendación para 4B — no iniciada

Revisar primero este diff y las limitaciones del perfil mínimo. Un siguiente corte
autorizado podría caracterizar cambios entre lecturas y definir la recuperación
de comandos dudosos antes de diseñar un recibo durable. Cualquier prioridad de
suspensión, coordinación de escritores, retención/digest de operationId, schema de
recibos o transporte autenticado requiere otra decisión y pruebas propias.
Mantener proveedor único, no crear proyecciones escritoras, no reintentar dinero
y no activar tráfico por haber aprobado este laboratorio. No se inicia 4B ni se
realizan commits automáticamente.

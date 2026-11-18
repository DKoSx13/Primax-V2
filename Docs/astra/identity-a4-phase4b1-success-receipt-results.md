# Identity A.4 fase 4B.1 — recibos de éxito y consulta autoritativa

Estado: **implementado y probado solo en laboratorio nuevo y sintético**. Sin
integración operativa/pública, commit, push, merge o fase 4B.2. Rama conservada:
`feat/dezkz-identity-a4-core`; HEAD:
`0e563ef4f58f726da3b66a850740ecdfbc6337aa`.

## 1. Verificación y preservación

Al inicio solo estaba sin seguimiento el diseño
`Docs/astra/identity-a4-phase4b-durable-recovery-consistency-design.md`; no había
cambios versionados ni staging. Se conservan los seis commits y una línea base
SHA-256 de **1076 archivos**, incluido ese documento. No se modifica ningún archivo
anterior, fuente operativo, configuración, evidencia o contrato público.

Se revisaron los contratos/resultados 3B y 4A, el diseño 4B y los componentes
Backend/Identity. Los resultados anteriores siguen siendo históricos. Este informe
registra ejecuciones nuevas con evidencias propias y no sustituye las antiguas.

## 2. Arquitectura y única unidad transaccional

Un perfil privado nuevo, versión 2, separa autorización de solicitante, binding
Identity, comando y consulta de resultado. **VehicleLink.v1 sigue siendo de
correlación y no se modifica ni interpreta como durable.**

`VehicleSuccessAuthority` recibe el factory del **VehiclesRepository real del
Backend** y su `PrismaService.atomic` real, sin editar ninguno. Decora el puerto
atomic que el repositorio ya usa:

1. En la transacción del proveedor se verifica el usuario/membresía operativos,
   User.active y Membership ACTIVE. Un recibo no evita la autorización vigente.
2. Se consulta recibo por callerNamespace + operationId. Si existe, se compara
   digest/sujeto/membresía y se recupera su resultado sin ejecutar el callback de link.
3. Si falta, se ejecuta el trabajo original de `VehiclesRepository.link`; se
   inserta SuccessReceipt con su Vehicle.id/label real dentro de **esa misma
   transacción**. No hay un commit del vínculo seguido de otro para el recibo.
4. UNIQUE del recibo y los reintentos locales originales arbitran duplicados:
   un intento perdedor revierte íntegros Vehicle y recibo. Un nuevo snapshot puede
   leer el resultado ganador o rechazar digest distinto. El algoritmo de link
   y su política de exclusividad no se copian a otro repositorio.

La validación de elegibilidad del adaptador es necesaria también para replay/
lookup, cuando no se ejecuta link; no es una segunda implementación de creación,
propiedad o actualización de Vehicle. Las escrituras Vehicle siguen exclusivamente
en el callback legado y en la base Backend del laboratorio.

`VehicleSuccessReceiptReader` es una clase separada sin método submit. Sus
transacciones son READ ONLY/RepeatableRead con un rol SELECT. Verifica elegibilidad
actual y sujeto del recibo, y contrasta Vehicle.id/plate/membershipId. Una incoherencia
local da RECOVERY_REQUIRED. No llama al repositorio de escritura ni reconstruye
resultados financieros. Las consultas repetidas y las verificaciones posteriores
a reinicio/restauración registraron **cero invocaciones del repositorio/callback**.

Un replay de **comando** entra en el método legado para interceptar su puerto
atomic, pero omite el callback al encontrar recibo. No confundir esa invocación
de función, los intentos SQL abortados y un efecto de vínculo confirmado.

## 3. Contrato privado y política experimental

| Elemento | Implementación |
| --- | --- |
| DurableLinkCommand | contractVersion=2, operationId UUID, expectedMembershipId UUID, plate y label; rechaza campos adicionales y perfil v1 |
| Autorización | Credencial opaca de fixtures, principal member y capacidades propias `vehicle:link:own` / `vehicle:result:own`; binding 3A conserva user/account/member distintos |
| Namespace | Fijado por el proveedor a `synthetic-identity`; el cliente no lo suministra. Clave SQL compuesta con operationId |
| Digest | SHA-256 UTF-8 de array con orden fijo: versión, SUCCESS_ONLY_V1, PLATE_DTO_V1, namespace, operationId, userId, membershipId, placa y label normalizados |
| Normalización | Funciones reales Backend normalizePlate y cleanText, inyectadas. Diferencias normalizadas equivalentes comparten intención; no hay reglas nuevas sobre códigos OCR |
| Resultado | `{ status: 'COMMITTED', receipt }` o `{ status: 'NOT_OBSERVED' }` para lookup; resultado inmutable y con campos permitidos explícitos |
| Recibo | Versión/política, namespace, operationId, userId, membershipId, vehicleId, digest, placa, label persistido y recordedAt |
| Errores | INVALID_INPUT, DENIED, NOT_FOUND, BINDING_MISMATCH, IDEMPOTENCY_CONFLICT, OWNERSHIP_CONFLICT, UNAVAILABLE, OUTCOME_UNKNOWN, RECOVERY_REQUIRED |

recordedAt es tiempo de registro de la transacción, **no** prueba de instante de
commit ni reloj global de revocación. El recibo no contiene balance, puntos,
documentos, sesión, contraseña o credencial técnica. Digest no es autenticación.

La consulta solicita operationId, pero su userId/membresía se derivan del principal
verificado y de Identity. Recibo ajeno e inexistente se ocultan con NOT_OBSERVED;
no se muestran datos del dueño. Una clave confirmada reutilizada por otro sujeto
o con parámetros distintos produce IDEMPOTENCY_CONFLICT en el comando.

Sin recibo visible se puede ejecutar una intención válida; si un intento previo
fue rechazado y no quedó recibo, **no se conserva su digest**. La política vincula
la clave desde el primer éxito durable, no desde el primer paquete recibido.
No se añade registro PENDING ni persistencia de rechazos para fingir otra garantía.

NOT_OBSERVED no afirma rollback: se probó mientras una transacción con Vehicle y
recibo ya insertados aún no había confirmado, y luego confirmó correctamente.
Un fallo después de posible envío mantiene OUTCOME_UNKNOWN. Un fallo del lookup
es UNAVAILABLE con efecto desconocido, nunca un array vacío o rollback inventado.
También DENIED u otro error de consulta lleva outcome=UNKNOWN respecto a la
operación histórica: rechazar el acceso actual no declara rechazado un commit previo.
No hay reintentos de transporte automáticos; solo reintentos locales clasificados
de atomic, y reenvíos explícitos con misma clave/intención en pruebas.

## 4. Persistencia nueva, exclusivamente experimental

`services/identity/lab/vehicle-link-success-receipt.sql` instala en una base
Backend **nueva** el esquema `vehicle_link_private` y una tabla `SuccessReceipt`.
No añade modelos ni migraciones a ningún schema operativo o a Identity.

- PK `(callerNamespace, operationId)`, con collation C para namespace.
- FK locales restrictivas a User, Membership y Vehicle; no FK hacia otra base.
- CHECK de versión 2, política SUCCESS_ONLY_V1, digest hexadecimal de 64 caracteres,
  placa canónica y label de 1–80 caracteres. Se preservan UUID existentes.
- Timestamp timestamptz(3), resultado mínimo histórico y label realmente persistido.
- Rol escritor SELECT/INSERT en recibo, sin UPDATE/DELETE; trigger inmutable bloquea
  incluso modificaciones accidentales con el administrador del laboratorio.
- Rol lector solo SELECT. Acceso por propietario se aplica en los puertos; no se
  afirma RLS por usuario para la conexión técnica.

Se reutiliza la provisión A.4 existente para fixtures de identificadores. Sus
AllocationReceipt de numeración son otra cosa; no se mezclan claves ni tablas.
No se crea Vehicle en Identity ni una segunda autoridad de propiedad.

## 5. Resultados realmente ejecutados

| Ejecución | Resultado | Evidencia bajo Docs/astra/evidence/ |
| --- | --- | --- |
| Unitarias y regresiones finales | **102/102**, cero fallos: 82 anteriores ejecutadas de nuevo + 20 nuevas | `identity-a4-phase4b1-unit-9c305dea32ff94b93ef79fe4.json` |
| Integración final | **17 grupos aprobados**, incluye outcome desconocido ante consulta denegada | `identity-a4-phase4b1-a4-ee718ee98fde9a2c9d430aac.json` |
| Integración ampliada previa | 17 grupos, antes de precisar outcome de errores de consulta | `identity-a4-phase4b1-a4-c0a03dd9098d8151cb039a52.json` |
| Integración previa del mismo corte | 17 grupos; anterior a ampliar kill antes de commit, cambio de sujeto y FK inexistente | `identity-a4-phase4b1-a4-1dd073e239964109fe6265da.json` |
| Unitarias previas | 101/101, antes de añadir la prueba de outcome de consulta denegada | `identity-a4-phase4b1-unit-39b401a762d0ff0710661856.json` |

Los 17 grupos finales comprenden siete verificaciones reutilizadas de lectura/
provisión A.4, ocho de recibos/seguridad/atomicidad y dos verificaciones adicionales
en procesos/contenedores nuevos: reinicio PostgreSQL y restauración lógica. No
son 17 tests unitarios ni se suman los grupos de distintas integraciones como una suite.

TypeScript 5.9.3 y Node 22.21.1 desde imagen cacheada. El núcleo, contratos 3A y
contrato/tipos negativos nuevos se comprobaron sin emitir, con las opciones reales
del proyecto Identity; rootDir se amplía solo en memoria para lab. No se cambia
tsconfig ni instala dependencias; no equivale a typecheck del Backend completo.

### Escenarios y evidencia de atomicidad

1. **Éxito y consulta:** commit real de Vehicle + recibo. Cinco lookups y replay
   de comando devuelven exactamente el mismo resultado; contador de trabajo
   legado no aumenta para recuperar ese éxito.
2. **Duplicados concurrentes:** barrera después de leer ausencia de recibo fuerza
   dos transacciones a competir por la misma clave. Un recibo/vehículo, mismo
   resultado. Puede ejecutarse trabajo luego abortado; no se promete función exactly-once.
3. **Digest diferente:** petición posterior y carrera simultánea con dos placas
   distintas y misma clave. Solo una intención confirma; otra da conflicto y su
   Vehicle se revierte. Otro usuario con esa clave tampoco la reutiliza.
4. **Dos propietarios/misma placa:** claves diferentes, una fila y un ganador;
   el otro recibe OWNERSHIP_CONFLICT del código legado real.
5. **Rollback:** fallo antes de insertar recibo, tras escribir Vehicle, y otro
   después de ambas escrituras pero antes del commit. No queda Vehicle ni recibo.
   El error genérico del caller se conserva como desconocido hasta consultar.
6. **Proveedor antes del envío:** fallo inyectado conocido como NOT_SENT, sin
   forwarding ni fila. No se atribuye a una caída real de red.
7. **Proveedor muere antes del commit:** se ejecuta trabajo en un proceso hijo
   nuevo y se detiene el callback antes de devolverlo a atomic; se mata únicamente
   ese hijo con SIGKILL. No se envía COMMIT, y no quedan vínculo ni recibo.
8. **Respuesta perdida después del commit:** otro proceso hijo confirma y solo
   señala un fence de ensayo AFTER_COMMIT, sin entregar resultado de negocio.
   El arnés lo mata con SIGKILL y el caller conserva OUTCOME_UNKNOWN. Dos procesos
   nuevos recuperan el mismo recibo/UUID; lookup y replay explícito no duplican efecto.
9. **Ausencia en vuelo:** el writer retiene la transacción antes del commit;
   el lector recibe NOT_OBSERVED. Al liberar la barrera aparece COMMITTED. Se
   demuestra por qué ausencia no es fallo definitivo.
10. **Indisponibilidad de consulta:** excepción inyectada no produce NOT_OBSERVED;
    el error es explícito, sin texto SQL ni datos del proveedor.
11. **Autorización:** credencial falsa, capacidad retirada en el arnés y consulta
    ajena no revelan recibo. Permisos del arnés no son nuevos grants AuthCore.
12. **Suspensión/inactividad previas:** dos fixtures históricos ya inelegibles
    contienen vehículo y recibo sintético; lookup y replay son denegados, al igual
    que un comando nuevo. No se hace UPDATE de Membership.status/User.active ni
    se afirma probar la transición concurrente de activo a suspendido.
13. **Restricciones SQL:** FK a Vehicle inexistente rechazada con 23503; modificaciones
    de recibo rechazadas por permisos o trigger; lector sin capacidad de escribir;
    writer sin permiso para cambiar balance.
14. **Integridad:** las 39 tablas públicas preexistentes distintas de Vehicle y
    las cinco tablas A.4 son iguales antes/después. Las compras y autorizaciones
    guest conservan membershipId=null tras asociar su vehículo. No cambian saldos,
    deudas, puntos, transacciones, bienvenida, usuarios o estados de membresía.

La tabla final tiene diez filas: **ocho recibos obtenidos por comandos reales de
éxito del ensayo y dos fixtures históricos inelegibles sembrados explícitamente**.
No presentar esas dos filas como éxitos de link observados con cuentas suspendidas.
El campo de evidencia successfulReceipts cuenta las diez filas de la tabla;
authorizedReceiptsForRecovery identifica los ocho resultados activos recuperados.

### Reinicios y restauración coherente

Cada ensayo usa un **volumen Docker recién creado**, con nombre/etiqueta aleatorios
verificados y sin adoptar volúmenes existentes. Tras el ensayo primario:

- Se detiene y arranca de forma ordenada el PostgreSQL propio, conservando ese
  volumen nuevo. Un worker nuevo recupera los ocho recibos activos y compara
  hashes completos de las 40 tablas públicas y de la tabla privada de recibos.
- Se hace pg_dump lógico sin propietarios/ACL a memoria y se restaura en otra
  base **nueva**, `a4_legacy_restored`, dentro del clúster sintético. Otro worker
  recupera los ocho resultados exactamente y verifica los mismos hashes.
- Ambos workers registran workCalls=0 y repositoryCalls=0. No se reconstruye el
  resultado invocando link ni se generan otros UUID.

Esto demuestra reinicio del proceso proveedor, reinicio ordenado de PostgreSQL
con almacenamiento conservado y restauración lógica coherente de **la autoridad
Backend y su recibo conjuntamente**. No demuestra pérdida física de disco,
destrucción del volumen, caída abrupta de PostgreSQL, RPO cero, backups antiguos
ni restauración parcial/coordinación global con Identity. No se presenta un dump
en memoria como respaldo productivo.

## 6. Aislamiento y recursos

Runners sin parámetros de URL/volumen externos, redes internas nuevas, PostgreSQL
nuevo con nombre y etiqueta por runId, cero puertos publicados. El volumen se
comprueba ausente antes de crearlo y se valida por etiqueta/montaje. El helper
existente elige /28 no solapada inspeccionando Docker y rutas, sin borrar redes.
Fuentes read-only, workers read-only con tmpfs nuevo para cliente Prisma y ejecución,
capabilities retiradas y no-new-privileges. Imágenes locales con --pull never:

```text
tools:    sha256:38ceee7d6e80b0ed7b3e7d4065312238874d9d10bdbba0dd1152b21ce16fe6e0
postgres: sha256:f3bd19c606e442c3d7bdfa8002e03fe260a1023351e0ea4598032022b68dd6e3
```

La base `a4_read` alberga fixtures A.4 y `a4_legacy` el proveedor Backend nuevo.
Se materializa el DDL legado desde schema Prisma y función histórica necesaria,
como en 4A; no toda la cadena de migraciones/triggers operativos. La única tabla
nueva de recibos vive en esa autoridad Backend. Las URLs solo pueden apuntar al
host aleatorio propio y bases cerradas de la ejecución; credenciales aleatorias
por rol no se escriben al repositorio ni al informe.

Al finalizar se detiene solo PostgreSQL propio tras comprobar etiqueta. Se
conservan los volúmenes nuevos, contenedores detenidos y redes de los tres ensayos;
no se borran ni reutilizan recursos anteriores. Los contenedores de herramientas
creados por el ensayo son efímeros. SIGKILL se aplica solo a los hijos recién
creados y controlados dentro del contenedor de pruebas.

## 7. Garantías demostradas y límites pendientes

**Demostradas en el dataset/fallo ensayados:** un efecto confirmado por clave de
éxito/digest, vínculo y recibo atómicos, exclusividad actual de placa, lookup sin
comando, recuperación de resultado tras pérdida de respuesta/proceso, autorización
de propietario y estado previo, UUID estables, restricciones locales, integridad
financiera y restauración coherente de los datos sintéticos.

**No demostradas ni prometidas:**

- Autenticación real JWT/cookies, AuthCore, Gateway, nonce/firma/transporte privado
  entre máquinas, frontend, OCR o HTTP público. Credenciales y permisos son de
  fixtures; el control de elegibilidad dentro de SQL sí usa datos reales del ensayo.
- Prioridad absoluta de suspensión/desactivación concurrente. Las consultas usan
  snapshots locales y no congelan permisos de otra autoridad. No hay nuevo versionado
  de estado, reservas distribuidas, outbox ni sincronización entre bases.
- Recuperación de commits eliminados por pérdida de almacenamiento o backup
  atrasado. RECOVERY_REQUIRED solo detecta incoherencias locales consultadas;
  no existe fence global de restauración/epoch en este perfil.
- Recuperación automática de intención perdida por Identity. El caller necesita
  conservar clave y parámetros. No hay registro durable PENDING ni archivo/tombstone.
- Reserva de claves de solicitudes rechazadas sin recibo. No se puede comparar
  su antigua intención no persistida; se conserva la política experimental de éxitos.
- Retención/replay/revocación definitivos o ejecución de función exactamente una
  vez. Unicidad y rollback limitan efectos confirmados; puede haber trabajo abortado.
- Equivalencia financiera completa con todos los triggers, pagos o bienvenida
  productivos. No se ejecutan operaciones financieras para recuperar un vínculo.

## 8. Inventario exacto creado

No se modifica ningún archivo previo. Doce fuentes/contratos/pruebas/herramientas:

```text
services/identity/lab/vehicle-link-durable-contract.ts
services/identity/lab/vehicle-link-durable.types.test.ts
services/identity/lab/vehicle-link-success-authority.cjs
services/identity/lab/vehicle-link-success-receipt.sql
services/identity/lab/vehicle-link-success.test.cjs
tools/astra/identity-a4-vehicle-receipt-lab.cjs
tools/astra/identity-a4-vehicle-receipt-worker.cjs
tools/astra/identity-a4-vehicle-receipt-scenarios.cjs
tools/astra/identity-a4-vehicle-receipt-support.cjs
tools/astra/identity-a4-vehicle-receipt-process.cjs
tools/astra/identity-a4-vehicle-receipt-verify.cjs
tools/astra/identity-a4-vehicle-receipt-unit-check.cjs
```

Se añaden este informe `Docs/astra/identity-a4-phase4b1-success-receipt-results.md`
y las cinco evidencias JSON de la tabla de resultados: **18 archivos nuevos 4B.1**.
Con el diseño 4B previo sin seguimiento son **19 sin seguimiento**. Cero staging,
cero cambios versionados, seis commits anteriores y HEAD conservados.
El cotejo final SHA-256 confirma los **1076 archivos previos intactos**, sin
eliminaciones, incluido el diseño 4B. CJS nuevos sin errores de sintaxis, evidencias
JSON válidas y whitespace sin errores. La revisión de contenido no detectó secretos
ni datos personales reales: las coincidencias son la URL parametrizada del runner,
el hash de contraseña ficticio de fixtures y correos `.invalid`. No hay referencias
nuevas a estos componentes en los runtimes operativos inspeccionados.

Reproducción, solo con recursos nuevos:

```text
node tools/astra/identity-a4-vehicle-receipt-unit-check.cjs
node tools/astra/identity-a4-vehicle-receipt-lab.cjs
```

## 9. Diferencias frente a v1 e integración futura

V1 sigue correlacionando operationId sin enviarlo al proveedor. El perfil v2 lo
lleva a la autoridad con namespace y digest, registra éxito y añade un puerto
de consulta. Usa una clase lectora propia y una tabla privada nueva del laboratorio;
no cambia el POST público ni cachea su proyección financiera. No se puede aplicar
retroactivamente a operaciones v1 sin recibo ni deducir un recibo a partir de placa.

Antes de una futura integración operativa harían falta autorización específica
para persistencia/retención y permisos del Backend, perfil/namespace/digest
estables, reautorización y credenciales reales, contrato de resultado desconocido,
puerta de recuperación/backup, y pruebas de todos los escritores implicados.
También revisar tipado de la composición transaccional: el adaptador de laboratorio
puede devolver una fila mínima almacenada al interceptar atomic; no demuestra
que pueda conectarse sin revisión a los DTO/tipos de cualquier módulo operativo.

Recomendación para **4B.2, no iniciada**: revisar estas evidencias y cerrar el
alcance de retención/replay y la respuesta ante restauraciones inconsistentes;
después proponer un ensayo privado acotado de esas garantías y autenticación real.
Cualquier cambio de Backend/AuthCore, schema operativo, prioridad de revocación,
transporte o activación pública exige otra autorización. No avanzar por tener
pruebas verdes ni reinterpretar las políticas experimentales como producción.

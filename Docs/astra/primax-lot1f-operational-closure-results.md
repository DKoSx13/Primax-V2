# Astra — Lote 1F: consolidación final de Commerce

## Referencia y clasificación previa

Base `5ba983d3242cf025ead1e1bd1d640d1e22fa4222`, rama
`feat/dezkz-identity-a4-core`. HEAD correcto, sin modificaciones versionadas ni
staging inicial. Las nueve evidencias históricas permanecen sin seguimiento,
excluidas e intactas por SHA256. Se verificaron ancestros, manifiesto 1E y
`git fsck --connectivity-only --no-reflogs`: sin objetos corruptos o faltantes,
sólo blobs dangling preexistentes. No se eliminaron objetos ni volúmenes.

El inventario se contrastó con §11–12 de 3J, la matriz de 46 filas de 3I y los
controladores vigentes. La clasificación se documentó antes de modificar código:
A = Commerce elegible; B = frontera local de compatibilidad con responsabilidades
compartidas; C = bloqueo para migrar la frontera; D = excepción técnica sin puerto.
**A=9, B=15, C=0, D=0**. Las dependencias compartidas se mantienen; no se supone
que una dependencia de seguridad impida delegar al motor íntegro.

| # 3I | Contract | Class | Family |
|---:|---|:---:|---|
| 7 | GET /api/v1/control/assistance | B | AssistanceWorkflow |
| 8 | GET /api/v1/control/assistance/:id | B | AssistanceWorkflow |
| 9 | POST /api/v1/control/assistance/:id/actions | B | AssistanceWorkflow |
| 10 | GET /api/v1/control/payments/:id | A | ControlPaymentWorkflow |
| 11 | POST /api/v1/control/payments/:id/actions | A | ControlPaymentWorkflow |
| 12 | POST /api/v1/control/terminal-operations/:id/cancel-unpaid | B | ControlOperationRecovery |
| 13 | POST /api/v1/control/terminal-operations/:id/recovery-ticket | B | ControlOperationRecovery |
| 14 | POST /api/v1/control/terminal-operations/:id/resolve | B | ControlOperationRecovery |
| 24 | POST /api/v1/operational-admin/permissions/admin | B | OperationalAdministration |
| 25 | POST /api/v1/operational-admin/permissions/admin/:id/revoke | B | OperationalAdministration |
| 26 | POST /api/v1/operational-admin/pumps | B | OperationalAdministration |
| 27 | POST /api/v1/operational-admin/terminal-pump-assignments/:id/end | B | OperationalAdministration |
| 28 | POST /api/v1/operational-admin/terminals | B | OperationalAdministration |
| 29 | POST /api/v1/operational-admin/terminals/:id/assign-pump | B | OperationalAdministration |
| 30 | POST /api/v1/operational-admin/terminals/:id/revoke | B | OperationalAdministration |
| 36 | POST /api/v1/terminal/assistance | A | AssistanceWorkflow |
| 37 | GET /api/v1/terminal/assistance/:id | A | AssistanceWorkflow |
| 38 | POST /api/v1/terminal/assistance/:id/cancel | A | AssistanceWorkflow |
| 39 | POST /api/v1/terminal/claim | B | TerminalWorkflow |
| 40 | GET /api/v1/terminal/me | B | TerminalWorkflow |
| 41 | POST /api/v1/terminal/operations | A | TerminalWorkflow |
| 42 | GET /api/v1/terminal/operations/:id | A | TerminalWorkflow |
| 43 | POST /api/v1/terminal/operations/:id/close | A | TerminalWorkflow |
| 44 | GET /api/v1/terminal/operations/:id/recovery-state | A | TerminalWorkflow |


Las lecturas/acciones Control de asistencia conservan permisos, scope y la
proyección de nombres de Identity; su autoridad permanece en Commerce. Las siete
operaciones de administración operacional conservan los grants globales y la
escritura actual de terminales/surtidores, aunque se relacionen con usuarios y
estaciones compartidas. No se trasladan a Administration o Catalog. Claim/me y
recuperación Control conservan KioskService, Redis, credenciales, assigned,
SUPER_ADMIN y auditoría. AuthCore no se modifica.

Las cinco antiguas candidatas a excepción técnica —13,24,25,39,40— se conectaron
a puertos como B. **Ninguna de las 24 se excluye ni requiere presumir una excepción
técnica aceptada.** T01 y las limitaciones productivas siguen abiertas; no se
clasifican como funciones resueltas por tener una frontera nueva.

## Familias, composición y archivos

Se verificaron las familias en este orden antes de continuar con la siguiente:
`AssistanceWorkflow` (6 rutas), `OperationalAdministration` (7),
`TerminalWorkflow` (6), `ControlOperationRecovery` (3),
`ControlPaymentWorkflow` (2). Después se ejecutó la regresión agrupada.

Patrón de las 24 entradas: controlador original → adaptador de entrada → caso de
uso → puerto → adaptador local → misma instancia del motor original. Las llamadas
internas del motor permanecen internas. Los cinco puertos y casos de uso son
independientes de NestJS, Prisma y HTTP; los argumentos/actores/resultados se
componen con tipos inferidos de las firmas originales en el adaptador de salida.
No se copian algoritmos, validaciones, cálculos, queries ni unidades de transacción.

Cada familia incorpora cinco fuentes bajo `Backend/services/commerce/src/`:

- `application/ports/{assistance-workflow,operational-administration,terminal-workflow,control-operation-recovery,control-payment-workflow}.ts`
- `application/use-cases/` con los mismos cinco nombres.
- `adapters/inbound/` con los cinco archivos `.adapter.ts`.
- `adapters/outbound/existing-` con los cinco nombres anteriores.
- `bootstrap/` con los cinco archivos `.providers.ts`.

Sólo cinco fuentes existentes cambian imports, inyección o composición:

- `Backend/src/assistance/assistance.controller.ts`
- `Backend/src/assistance/assistance.module.ts`
- `Backend/src/operations/operations.controller.ts`
- `Backend/src/operations/operations.module.ts`
- `Backend/src/operations/control-payments.ts` — únicamente import e inyección del controlador; cuerpo del motor idéntico.

Se mantienen en el controlador los hooks originales: touch/assert de propietario,
limitación de credencial recuperada, trim del motivo del ticket, auditoría de
denegación best effort y liberación de propietario después de cierre recuperado.
Los adaptadores locales de terminal y recuperación usan OperationsService y
KioskService existentes; no registran otro proveedor de seguridad ni escritor.

Pruebas nuevas: cinco `*.boundary.spec.ts` por familia y
`operational-controller-hooks.boundary.spec.ts` bajo `Backend/src/operations/`;
`Backend/test/operational-workflow.fixture.ts`,
`operational-workflow.integration.cjs` y seis escenarios bajo
`Backend/test/operational-scenarios/` (cinco familias y regresión de lectura).
Harness nuevos: `tools/astra/lot1f-operations-validation.cjs` y
`lot1f-operations-postgres-redis.cjs`. Documentación: este informe, matriz final
de 46 contratos, §13 añadida a 3J y resumen saneado con manifiesto de archivos.
La lista exacta y hashes están en `evidence/lot1f-operations/review-summary.json`.

## Pruebas y comparaciones

La referencia restaura desde 5ba983d los cinco archivos de composición/controlador
de 1F; el candidato usa las fronteras nuevas. El harness también restaura fuentes
de referencia sin cambios de lotes previos para sus regresiones. Motores, reglas,
repositorios, esquema y migraciones permanecen idénticos. Ambos brazos usan los
mismos fixtures y condiciones sobre bases distintas, nuevas y sintéticas.

Por ejecución hay una sola PostgreSQL 17.6 y Redis 7.4, red interna, cero puertos
publicados, credenciales nuevas y dos volúmenes propios verificados inexistentes
y vacíos antes de arrancar. Se comprueban host/base/rol antes de las 36 migraciones
existentes y Redis vacío. No seeds ni datos operativos; los fixtures son explícitos.
Se detienen únicamente los recursos propios, conservando volúmenes y evidencias.
No `down -v`, prune, compensaciones ni acceso a T01 o volúmenes históricos.

| Validation | Before / after | Result |
|---|---|---|
| Jest | 167 / 201; 17 / 23 suites | 0 failures |
| Gateway | 24 / 24 | 0 failures |
| Packaging contracts | 9 / 9 | 0 failures |
| Builds | Identity, Catalog, Administration, Commerce, legacy | Five exit 0 |
| Docker images | Four services + legacy | node user, original entrypoints, offline module load |
| HTTP assistance | 65 / 65 | Exact canonical parity; b713efbe56cc |
| HTTP administration | 94 / 94 | Exact canonical parity; 4083f3a2296a |
| HTTP terminal | 61 / 61 | Exact canonical parity; e1d9de0c410c |
| HTTP recovery | 41 / 41 | Exact canonical parity; 7742b9406310 |
| HTTP control-payments | 36 / 36 | Exact canonical parity; dc1eee249822 |
| HTTP reads-regression | 13 / 13 | Exact canonical parity; bc856f39f5ff |
| HTTP finance | 110 / 110 | Exact canonical parity; 046abccec068 |
| HTTP orders | 95 / 95 | Exact canonical parity; 42c4dd54f46c |
| HTTP payments | 127 / 127 | Exact canonical parity; 644e4d0cfa66 |
| HTTP authorizations | 107 / 107 | Exact canonical parity; 7af0ef1457a9 |
| HTTP sale-regression | 38 / 38 | Exact canonical parity; a9ed55f336a8 |


Son **787 comprobaciones HTTP por brazo, 1.574 en las 22 ejecuciones aceptadas**:
297 por brazo para las 24 rutas de 1F, 477 para las regresiones financieras y
13 para lectura protegida. El grupo completo termina en a9ed55f336a8; la pareja
de lectura de72831a21ae/bc856f39f5ff amplía y sustituye su lectura para verificar
también que un userId ajeno en query no cambia el propietario autenticado.
Las dos ejecuciones de esa lectura anterior también pasaron y se conservan;
no se suman dos veces en el total aceptado.

Offline inicial run-776d1236b5ac, final run-0840ad8d488e, Node 22.21.1.
Los números de comandos internos y las secuencias reales por brazo están en el
resumen saneado. Todas las imágenes tienen tags `primax-astra-lot1f-operations-*`;
la verificación de módulos no invoca sus entrypoints de arranque operativo.

Casos relevantes por familia:

| Familia | Evidencia funcional y de consistencia |
|---|---|
| Asistencia | Seis contratos; JWT/terminal/HMAC/DTO/query; terminal y estación ajenos, viewer y personal no responsable; filtros; create/replay/conflicto; ACCEPT/NOTE/RESOLVE/ESCALATE/CANCEL; incidente único de escalación y auditoría; rollback de create/act/cancel; respuesta perdida y concurrencia de create/cancel sin efectos duplicados. |
| Administración operacional | Siete contratos; autoridad SYSTEM_ADMIN original; grants/revokes con efecto real sobre acceso del usuario; inválidos/ausentes/inactivos; asignación entre estaciones; impedir desasignación disponible; revocación de terminal activa conserva atención en intervención y revoca credenciales; rollback de los siete comandos; pérdida de respuesta y duplicado de código; concurrencia de creación protegida por unique. |
| Terminal | Seis contratos; HMAC, credencial inválida/revocada, UUID/DTO; propietario estricto y terminal ajena; claim y touch/lastUsedAt; abrir/leer/cerrar, replay, rollback y concurrencia; pérdida después del commit y reintento explícito; pago pendiente bloquea cierre; credencial recuperada limitada, sin apertura nueva ni lectura ajena, release posterior al cierre. |
| Recuperación Control | Tres contratos; permisos/estación, SUPER_ADMIN, DTO y no-store; cancel/resolve con rollback y replay; rechazo ante pago pendiente, credencial vigente y ticket ya pendiente; ticket demo pendiente válido; SQL/Redis parcial y auditoría de denegación; respuesta perdida y un único ticket concurrente; nunca captura ni certifica el pago. |
| Pagos Control | Dos contratos; permisos VIEW/MANAGE y estaciones; detalle sin escrituras; RESELECT advisory, RETRY original sin capturar PENDING; ESCALATE con rollback, incidente estable y observaciones append-only; concurrencia de RETRY; CANCEL demo y cierre posterior; respuesta perdida/reintento sin otro intento de pago; autorización activa impide cancelar. |

Las regresiones anteriores conservan PREPAGO/POSTPAGO, descuentos, Decimal,
saldo/deuda/puntos, reservas/inventario, perfil fiscal, comprobantes/secuencias,
reembolsos y conciliación parcial, callbacks, dedupe, idempotencia, rollback,
concurrencia y proveedor desconocido. La lectura de transacción conserva
propietario/ajeno, negativos y compatibilidad legacy. No se agregan contratos
fuera del paquete; estas rutas anteriores se ejercitan como regresión.

No se exige idempotencia inventada: crear pump/terminal/grant sin operationId
puede devolver conflicto al repetir; acciones Control pueden añadir auditoría
legítima en otro intento. Se comprueba la ausencia de otro efecto financiero y
se conserva esa auditoría. No se descartan registros para hacer coincidir resultados.

### Comparación de identidades, tiempos y efectos

Se exportan respuestas, todas las tablas de negocio, secuencias y claves/valores
Redis. UUID sembrados literales; UUID generados correlacionados por tabla/clave
natural, sin reescribir datos de las bases. Auditoría aleatoria correlacionada por
acción/target/actor/resultado, contenido de detalles y ordinal. Se conservan todos
los registros y sus vínculos. Los tickets sintéticos y sus hashes se correlacionan
por operación/terminal; no se publican credenciales ni tokens utilizables.

En las cinco familias nuevas se normaliza el valor temporal de fechas de ciclo
de vida conservando explícitamente null frente a fecha presente; así se comparan
revocación, cierre y asignación sin exigir el mismo reloj de dos ejecuciones.
Redis verifica expiración positiva, no el mismo segundo de TTL. Los JSON de
evidencia conservan importes, moneda, estado, referencias y relaciones. En los
harness previos se conservan sus reglas documentadas de normalización; paid_at y
refunded_at del proveedor comercial sintético siguen fijos y comparados.

Las secuencias mantienen huecos originales por rollback, sin renumerar. El
movimiento OPENING_BALANCE del trigger de inventario pertenece al fixture y se
compara; los fixtures de órdenes crean reservas mediante el motor demo original.
No se confunden esos efectos con nuevas escrituras financieras de la frontera.

### Límites y pruebas no aplicables

No se aplica rollback financiero a una lectura que no escribe. Se comprueban
tablas/secuencias y los efectos técnicos originales de GET me/ownership. SQL y
Redis no tienen atomicidad conjunta: claim y ticket pueden conservar registros
Redis después de fallo SQL; se acredita esa conducta y su reintento/conflicto.
Las consultas a proveedor y la auditoría Control tampoco forman una transacción
distribuida nueva. No se incorpora compensación ni retry adicional.

Pérdida de respuesta es una excepción 503 inyectada después del retorno original;
no certifica caída física o reinicio. La credencial limitada de recovery-state
se siembra en Redis como fixture para probar el guard real y sus restricciones;
la emisión de tickets se verifica separadamente con el KioskService original.
No se afirma recuperación funcional completa de T01 ni de todos los estados.
La concurrencia cubre los casos indicados, no todas las intercalaciones posibles.

No se ejecutan pagos/proveedores reales, impresoras, frontends ni Compose final.
Las imágenes y compilaciones no sustituyen la validación integral multiplataforma
de los Lotes 4–5. Se registra Windows anfitrión con Docker Linux; no se acredita
Linux/macOS anfitrión, ARM64 nativo, HA ni autonomía productiva de datos.

### Diagnósticos conservados

Los intentos no aceptados quedan en `.cache/astra-lot1f-operations/` y en el
resumen de proyectos: expectativa inicial que omitía el movimiento de inventario
del trigger; correlación incompleta de UUID aleatorios/assignedAt; fixture de
credencial expirada con fechas inválidas y luego nombre de campo incorrecto;
expectativa de inventario que omitía reservas demo; autorización PREPAGO sintética
sin paymentId; primera pareja de lectura con versiones distintas de correlación
de UUID de recibos. Se corrigieron únicamente fixtures/comparador, sin cambiar
constraints, reglas o motores. Los intentos fallidos no se cuentan como aprobados.

Comandos reproducibles, siempre con recursos sintéticos nuevos:

```text
node tools/astra/lot1f-operations-validation.cjs --baseline
node tools/astra/lot1f-operations-validation.cjs
node tools/astra/lot1f-operations-postgres-redis.cjs --family assistance
node tools/astra/lot1f-operations-postgres-redis.cjs --family administration
node tools/astra/lot1f-operations-postgres-redis.cjs --family terminal
node tools/astra/lot1f-operations-postgres-redis.cjs --family recovery
node tools/astra/lot1f-operations-postgres-redis.cjs --family control-payments
node tools/astra/lot1f-operations-postgres-redis.cjs
```

## Evaluación formal de cierre académico

La matriz final de 46 contratos distingue frontera validada, motor local legacy
de compatibilidad, excepción técnica y bloqueo. Una frontera y un adaptador local
son propiedades compatibles de la misma ruta, no categorías que se suman dos
veces. No se cuenta una ruta sólo porque compile o figure en un módulo NestJS.

| Criterio Commerce de §11 de 3J | Evaluación |
|---|---|
| 46 contratos con dueño y frontera o excepción aceptada | 46 fronteras con familia y motor local explícitos; ninguna excepción sin puerto y ningún bloqueo de frontera. |
| Paquetes financieros y operacionales completados | 1E aceptado; las 24 entradas de 1F implementadas y comparadas. |
| Motores, atomicidad y autoridades originales | Cinco fuentes de inyección/composición modificadas; motores/repositorios intactos, incluido cuerpo de ControlPaymentsService verificado por hash. No nuevos HTTP, escritores o retries. |
| Regresión agrupada y empaquetado | Comparaciones sintéticas de familias nuevas y anteriores, contratos Gateway, builds de cuatro servicios y legacy, cinco imágenes y carga de módulos sin bootstrap operativo. |
| Sin regresiones nuevas y observaciones explícitas | Dentro de los casos aprobados y límites detallados; las incidencias previas permanecen abiertas y trazadas. |

**Commerce cumple los criterios técnicos del cierre académico de su frontera
en el alcance comprobado. No queda un P0 técnico de Commerce pendiente que exija
otra etapa de extracción.** La aceptación de los resultados de 1F corresponde al
responsable; no se presenta como aprobación automática del proyecto completo.

Los P0 globales de 3J que siguen fuera de este lote son concretos: completar y
aceptar los alcances de Lotes 2–3 y su matriz global de 115 contratos, integrar el
arranque Compose reproducible de Lote 4 y acreditar la validación integral y por
plataforma de Lote 5. Se conservan esos lotes finitos; no se agrega una cadena de
nuevas etapas Commerce ni se exige eliminar todos los motores legacy para cerrar.

Permanecen documentados y sin modificación: T01 pendiente de recuperación
funcional; política legacy `x-kiosk-key` sin scope firmado de estación; TARJETA /
`OnlineOrder_method_check` con 500 y rollback preexistentes; capacidades ausentes
de proveedores externos y firma nativa no acreditada; AuthCore/JWT/PasswordReset/
AccessGuard/KioskService, Prisma y bootstrap compartidos. Identity A.4 sigue cerrado.
No se cambia propiedad por campo, autoridad de escritura, authVersion o esquema.

## Recomendación y detención

Tras aceptar 1F dentro de este alcance, se recomienda autorizar el **Lote 2:
cierre Identity y aceptación Catalog**, tal como §6 de 3J: conservar las seis
lecturas Identity y los seis contratos Catalog, clasificar el resto y sus
excepciones, preservar A.4 y las plataformas compartidas. Esta recomendación
no inicia implementación, análisis nuevo de esos servicios ni Compose definitivo.

La entrega permite un único commit local del conjunto de familias verificadas,
con hash comunicado en la respuesta y parent 5ba983d. Sin push ni merge. El estado
final esperado es árbol versionado limpio y exactamente las nueve evidencias
históricas sin seguimiento, verificadas por hash después del commit.
**Detención al completar 1F; Lotes 2–5 no iniciados.**

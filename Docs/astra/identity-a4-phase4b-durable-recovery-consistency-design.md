# Identity A.4 fase 4B — diseño de recuperación durable y consistencia

Estado: **propuesta técnica, sin implementación**. Este corte solo crea este
documento después del respaldo local autorizado. No crea tablas, recibos, outbox,
reservas, migraciones ni código, y no ejecuta pruebas o conexiones a bases.
Todas las garantías futuras se condicionan a decisiones y validaciones indicadas;
ninguna se atribuye retrospectivamente a VehicleLink.v1.

## 1. Respaldo verificado y estado base

Inicio: rama `feat/dezkz-identity-a4-core`, HEAD
`a4dc5f59505b4088de1c50c2b8cbed8a95f9b27a`, exactamente 15 archivos sin seguimiento,
cero cambios versionados y cero staged. Inventario cotejado con el informe 4A:
14 archivos 4A más el diseño previo de fase 4. La revisión de nombres/contenido no
detectó credenciales ni datos personales reales; solo URL parametrizada, hash
ficticio de fixtures y correos `.invalid`.

Se añadieron exclusivamente esas 15 rutas, revisando diff/lista staged, y se creó:

```text
0e563ef4f58f726da3b66a850740ecdfbc6337aa
feat(identity): add A4 private vehicle link delegation laboratory
```

Commit comprobado: 15 altas, 1727 líneas añadidas; padre exactamente a4dc5f5.
Tras el commit el árbol quedó limpio y los 1075 archivos conservaron sus SHA-256.
Los cinco commits anteriores permanecen intactos en su cadena:

```text
a4dc5f59505b4088de1c50c2b8cbed8a95f9b27a
c74d20415a620f695a4119a6079b1a5cd4f5a7ec
4b41af38219b510dc053e07cf9115c859e7f9bca
b314f408b865d56bed0e765f44e7de3b5226da13
df68f698620fcd8a17a4c06256f96d7c7934e95d
```

HEAD durante el diseño: 0e563ef4f58f726da3b66a850740ecdfbc6337aa. Los seis commits
no se alteran; este documento permanece sin seguimiento, sin segundo commit.

## 2. Hechos del código actual y puerta que falta

Fuentes: `Docs/astra/identity-a4-phase4-consistency-vehicle-link-design.md`,
`identity-a4-phase4a-vehicle-link-results.md`,
`services/identity/lab/{vehicle-link-contract.ts,vehicle-link-legacy-adapter.cjs}`,
`Backend/src/vehicles/{vehicles.repository,vehicles.service}.ts`,
`Backend/src/prisma/prisma.service.ts`, los puertos/lectores 3A/3B y el store de
numeración fase 2. Se preservan HANDOFF, límites de propiedad y bloqueo de A.2.

- VehicleLink.v1 acredita principal y binding A.4, normaliza placa/label, y delega
  una vez por invocación al link real del Backend. El guard de membresía esperada
  se ejecuta dentro del mismo atomic del proveedor. No hay segundo algoritmo de link.
- El puerto legado actual **no recibe operationId**. Este solo vuelve al resultado
  como correlación; repetirlo envía otra invocación. No hay digest ni consulta de
  resultado de link. Buscar una placa propia solo muestra su estado presente.
- El repositorio exige User.active y Membership ACTIVE incluso para un vehículo
  ya propio. Propietario ajeno es conflicto; propio no cambia label; uno sin dueño
  conserva UUID al asociarlo. UNIQUE/FK y transacción siguen en el Backend.
- `PrismaService.atomic` usa Serializable y reintentos locales acotados para
  errores conocidos. Son reejecuciones de transacciones abortadas, no un protocolo
  de recuperación de comandos remotos. No acreditan orden absoluto de revocación.
- `VehiclesService.create` enriquece la respuesta después del commit. El fallo de
  esa lectura no revierte el vínculo. No debe recuperarse con un body financiero
  cacheado ni compensarse borrando el vehículo.
- AllocationReceipt de fase 2 pertenece a provisión de número/alias, en otra
  autoridad/dataset. No se puede reutilizar como recibo VehicleLink por compartir
  el nombre operationId.

Los 82 tests y 15 grupos del informe 4A son resultados **históricos para este
diseño**, no repetidos aquí. Probaron convergencia y pérdida de respuesta inyectada,
no recuperación durable tras reinicio, rollback de backups o autenticación real.

## 3. Garantías objetivo y alcance de durabilidad

Objetivo candidato: dentro de una autoridad y generación sanas, con recibos
conservados, una clave vinculada a un comando confirmado identifica un único
resultado y **a lo sumo un efecto confirmado**, junto con la exclusividad actual
de placa. Puede haber varios envíos, consultas e intentos SQL abortados. No se
promete ejecución de función exactamente una vez, éxito eventual bajo partición,
autorización perpetua ni recuperación de cualquier pérdida de almacenamiento.

La durabilidad debe definir su modelo de fallo: caída de proceso con almacenamiento
conservado no equivale a pérdida del disco o restauración anterior a un commit
ya reconocido. RPO, retención, generación de recuperación y mecanismo de backup
requieren aprobación operativa; no se inventan plazos ni RPO cero.

Invariantes no negociables del experimento propuesto:

1. Backend sigue como único escritor operativo de Vehicle y su membershipId;
   Identity no mantiene una segunda tabla autoritativa de propiedad.
2. Si un recibo de éxito existe tras commit válido, su resultado procede del
   mismo commit que el vínculo/no-op. Ningún recibo autoritativo se escribe en
   Identity después de un commit independiente del Backend.
3. Misma clave confirmada y mismo digest: mismo resultado histórico, sin ejecutar
   link para reconstruirlo; digest distinto: conflicto, sin modificar el original.
4. No se regeneran UUID, no se reasignan compras, ni se toca dinero, deuda, puntos,
   reservas financieras o bienvenida. Una operación nueva del mismo dueño sigue
   siendo no-op respecto a label ya vinculado.
5. La autorización actual decide acceso/ejecución; el recibo solo acredita historia.
   Un timeout, un 5xx o un lookup vacío no son evidencia suficiente de rollback.

## 4. Alternativas y recomendación conservadora

| Alternativa | Qué permite | Costes, límites y decisiones |
| --- | --- | --- |
| Mantener v1 y observar placa | Mínimo cambio; repetición converge por propietario | No prueba qué operación creó el vínculo, no detecta reutilización de clave, no recupera respuesta histórica |
| Caché de respuesta/clave en Identity | Reduce llamadas duplicadas mientras vive | Se pierde al reiniciar; TTL y particiones no hacen atómicos cache y Vehicle. No sirve como autoridad de resultado |
| Recibo de éxito local en Backend, mismo commit | Recupera resultados confirmados tras respuesta perdida y caída de proceso con almacenamiento intacto; ninguna doble escritura | Nuevo almacenamiento privado y ampliación transaccional. Vincula clave al primer éxito durable; no conserva automáticamente rechazos previos |
| Registro durable de admisión PENDING y resultado | Fija intención desde la admisión y permite ver progreso/rechazos | Más de una transacción, trabajador/reclamación, leases/fencing y reconciliación. PENDING no prueba ejecución; requiere otro protocolo |
| Intención durable en Identity más recibo Backend | Identity puede retomar automáticamente después de reiniciar si el cliente ya no reenvía | Dos registros con estados independientes, reconciliación y retención correlacionadas. El recibo del Backend sigue decidiendo commit; intención no es permiso |
| Outbox/inbox de resultados | Entrega/reconstrucción de proyecciones y notificaciones | Duplicados y retrasos; no sustituye el recibo ni la validación de elegibilidad. Solo si una necesidad posterior justifica mensajería |
| Reserva/confirmación distribuida o 2PC | Podría coordinar decisiones entre autoridades participantes | Orden, cancelación, fencing, disponibilidad y recuperación del coordinador por acordar; no necesaria para el primer recibo local y no autorizada |

Recomendación para revisión: **recibo de éxito en la base del Backend y en la
misma transacción que el link legado**, con lookup autoritativo separado y replay
sujeto a autorización actual. Empezar sin outbox, registro PENDING ni intención
Identity. El cliente/caller debe conservar operationId y la intención para poder
recuperar; si no puede, la recuperación automática de Identity es otra capacidad.
No se selecciona ni crea esta arquitectura por efecto del documento.

### Límite importante: ¿qué significa consumir una clave?

En el perfil recomendado solo un éxito confirmado fija durablemente clave/digest.
Si la primera petición se rechaza y no hay recibo, una petición posterior con esa
clave no puede compararse con la intención anterior. Podría ser válida tras cambiar
el estado y también podría llevar otro contenido. No afirmar que este perfil
rechaza toda reutilización desde el primer paquete recibido.

Si el negocio exige fijar intención o rechazos desde la primera admisión, hace
falta un registro durable previo o un protocolo adicional para rechazos. No basta
insertar REJECTED después de una excepción en una transacción PostgreSQL abortada:
hay que resolver savepoints/transacciones, carreras y política de reautorización.
Recomendar comenzar con el límite explícito del primer éxito; requiere aceptación.

## 5. Ubicación y modelo conceptual del recibo

Modelo candidato, **sin DDL ni schema implementado**: registro privado de resultado
VehicleLink en la misma base autoritativa que Vehicle, escrito solo por el proveedor.

| Campo conceptual | Regla |
| --- | --- |
| logicalAuthorityId, callerNamespace, operationId | Clave única del dominio VehicleLink; caller acreditado por el proveedor. No namespace libre del body ni fingerprint de certificado que cambie con su rotación |
| contractVersion, policyVersion, normalizationVersion | Selección explícita del perfil durable, independiente de v1 de correlación |
| requestDigest | Hash determinista calculado/validado por la autoridad, ligado a la intención normalizada y principal, no a secretos |
| subjectUserId, membershipId y referencia de binding acreditada | UUID existentes; no se infieren por placa, alias, email o DNI. accountId de A.4 no se convierte en FK operativa por conveniencia |
| vehicleId, plate, persistedLabel | Resultado mínimo histórico del vínculo; conservar label real cuando el pedido era no-op. No snapshot de balance, perfil financiero ni credenciales |
| committedGeneration, committedAt | Procedencia del commit; timestamp descriptivo, no orden global de revocación |

Las referencias locales/FK restrictivas son una opción a validar para el laboratorio,
no una migración aprobada. Una FK a Vehicle no prueba por sí sola que su dueño
presente siga siendo el del resultado histórico. No añadir FK entre bases.
Permisos, backup, retención y acceso al label deben revisarse: puede contener
texto personal aunque los fixtures públicos sean sintéticos. El hash no cifra datos.

La clave no debe incorporar una nueva epoch en cada reinicio/restauración: hacerlo
crearía una clave nueva para un replay antiguo y permitiría otro efecto. La
generación se comprueba como fence/control de recuperación, separada de la
identidad lógica estable de la operación. El dominio separa esta clave de pagos,
provisión de números y cualquier UUID coincidente en otro contrato.

### Digest y ejemplos de intención

Definir codificación UTF-8 y orden/tipos cerrados de campos: dominio/perfil,
principal userId, expectedMembershipId, binding lógico que corresponda, plate y
label normalizados y versión de normalización. No aplicar NFC ni otras nuevas
equivalencias sin aprobación. Excluir credenciales, nonces de transporte, firma,
deadline, hora de intento y versión de certificado; pueden cambiar al reenviar
la misma intención. Los fences de recuperación no se cambian silenciosamente.

Recomendación a revisar: equivalencia según DTO actual, incluyendo cleanText y
reglas Unicode. Alternativa estricta: ligar también la entrada original; rechaza
variaciones triviales y debe versionarse. No heredar automáticamente el digest de
AllocationReceipt, que conserva entrada/orden de aliases de otra operación.

Ejemplo: operación X pidió label «Nuevo», pero el vehículo ya propio conserva
«Anterior». El recibo guarda digest de «Nuevo» y resultado «Anterior». Reenviar X
con label «Anterior» sería conflicto de intención, aunque el link legado aislado
hubiera sido no-op; con una clave nueva seguiría siendo un no-op válido. Esta
restricción privada nueva necesita aprobación y no se introduce en v1.

## 6. Unidad transaccional propuesta y carreras de duplicados

Secuencia conceptual, no implementación:

1. Acreditar caller/principal y validar perfil/intención antes del envío. La
   autoridad comprueba binding y autorización vigente; no confía solo en el
   snapshot A.4, un TTL o un grant recibido de un cliente.
2. Entrar en una única unidad atomic del Backend. Comprobar la generación vigente
   y recibo por clave con un snapshot coherente, y reautorizar donde corresponda.
3. Si hay recibo visible y autorizado: comparar digest/versiones/subject; devolver
   resultado histórico si coincide, o conflicto si difiere. No volver a ejecutar
   link ni actualizar label para fabricar una respuesta.
4. Si no hay recibo visible y la autoridad está sana: ejecutar el trabajo legado
   de link **una vez por intento transaccional**, sin copiar su lógica. Insertar
   el recibo con el resultado real antes de confirmar esa misma transacción.
5. La unicidad de clave arbitra solicitudes concurrentes. Si otra transacción
   gana, el intento perdedor debe abortar íntegro, incluidas sus escrituras Vehicle;
   reintentar con snapshot nuevo permite leer el recibo y comparar intención.
6. Responder éxito solo después de confirmar. Si se pierde confirmación/respuesta,
   mantener UNKNOWN y consultar por clave, sin generar otra operationId.

No se promete un único intento SQL: dos peticiones con la misma clave pueden
haber entrado en trabajo concurrente. Unicidad + rollback local impiden **dos
efectos confirmados**. Esto solo vale mientras no existan efectos externos dentro
del callback. No añadir pagos, bienvenida, HTTP o mensajes no transaccionales allí.

Un lock de clave puede reducir trabajo repetido, pero no debe simular exclusión:
`SELECT FOR UPDATE` de un recibo inexistente no reserva la clave. En Serializable,
esperar un lock tampoco refresca una instantánea antigua; se necesita reinicio
transaccional o protocolo probado. UNIQUE y manejo de colisiones siguen siendo
defensa obligatoria. No establecer un orden de locks nuevo sin inventariar
User/Membership/Vehicle y los bloqueos financieros actuales.

**Encaje con el código actual:** el shim 4A ya recibe el callback de link dentro
de atomic, pero no recibe operationId ni sabe devolver un recibo en vez de una
fila Vehicle. Tampoco hay un chequeo de elegibilidad reusable para replay sin
ejecutar link. Hace falta un adaptador/puerto privado transaccional nuevo, con
tipado y reautorización revisados; no envolver por fuera el commit y escribir
después el recibo. Si para ello fuera imprescindible editar un archivo existente,
se debe pedir autorización antes de hacerlo. No se crea otra implementación de link.

La política existente de atomic no distingue por sí sola todas las colisiones de
recibo/placa. La futura prueba debe clasificar key/digest conflict frente a 40001,
40P01 y P2002 reintentable, sin cambiar silenciosamente su presupuesto de cinco
intentos. Un agotamiento puede terminar en indisponibilidad; no prometer siempre
409 ni éxito eventual ante concurrencia arbitraria.

## 7. Contratos privados que necesitarían ampliarse

Recomendar un **perfil durable explícito y versionado**, por ejemplo un contrato
privado v2, en lugar de reinterpretar VehicleLink.v1. Nombre/versión pendientes.
Los comandos v1 históricos no tienen recibos: no se pueden reconstruir desde
Vehicle ni anunciar recuperables retrospectivamente.

| Puerto candidato | Ampliación propuesta |
| --- | --- |
| DurableVehicleLinkCommand | Recibe operationId, perfil/política, caller acreditado, principal/binding, intención y fence esperado; lleva la clave hasta la autoridad transaccional |
| VehicleLinkResultRead | Lookup no mutante en primario autoritativo por clave y sujeto autorizado, con digest/perfil esperado; devuelve resultado histórico/procedencia o ausencia no definitiva |
| CurrentVehicleOwnerRead | Sigue separado: estado actual no equivale a recibo histórico ni a autorización para link |
| AuthorityRecoveryRead | Indica generación, salud de recuperación y capacidad durable; no inventa versión cero cuando falta |
| InternalReconciliationRead | Consulta restringida para operaciones dudosas/recuperación, sin reactivar usuarios ni tocar dinero |

Un recibo confirmado devolvería clave, digest/perfil, resultado mínimo de vínculo
e indicación histórica/generación; no un me/Vehicle financiero cacheado. El lookup
se sirve desde la autoridad, no una réplica retrasada o proyección Identity.
Ninguno de estos nombres crea una URL ni modifica HTTP público.

Autenticación técnica y autorización humana son distintas. La identidad lógica
del caller debe sobrevivir rotación de credenciales y verificarse por el proveedor.
Un retry de transporte puede necesitar nonce/firma nuevos con la misma clave de
negocio. Anti-replay de transporte no reemplaza idempotencia de operación.
No distribuir JWT_SECRET ni cambiar AuthCore para habilitar estos puertos.

## 8. Política de resultado desconocido

Separar **estado del efecto histórico** y **autorización/resultado de la solicitud
actual**. Un 403 actual puede coexistir con un commit anterior; no lo borra.

| Observación | Significado permitido | Conducta propuesta |
| --- | --- | --- |
| Validación/credencial falla antes del envío | NOT_SENT para ese intento | No hay delegación; no inferir nada sobre envíos anteriores de la misma clave |
| Rechazo de negocio acreditado por autoridad antes de confirmar | REJECTED de ese intento | Sin efecto de ese intento; en perfil de solo éxitos no hay garantía de conservar rechazo/digest |
| Recibo COMMITTED visible y autorizado | Resultado histórico confirmado, sujeto a salud/generación | Devolver el mismo resultado mínimo; no reejecutar link ni finanzas |
| Digest/subject distinto de recibo confirmado | IDEMPOTENCY_CONFLICT | No modificar el recibo ni el efecto original; no revelar datos de otro sujeto |
| Timeout, desconexión o 5xx después de posible envío | OUTCOME_UNKNOWN | Conservar clave e intención; lookup posterior, nunca otra clave para resolverlo |
| Lookup sin fila | NOT_OBSERVED | Puede haber transacción en vuelo, rechazo no guardado, envío no recibido o restauración atrasada; no equivale a FAILED |
| Fuente no disponible | UNAVAILABLE del lookup, efecto aún desconocido | No interpretar vacío, no asumir rollback ni consultar una réplica como autoridad |
| Generación/corte de recuperación no acreditados | RECOVERY_REQUIRED | Suspender reenvío/ejecución afectada hasta reconciliar; no incrementar epoch del pedido para eludir el bloqueo |

No declarar IN_PROGRESS/PENDING durable si solo se guardan recibos de éxito:
tal estado no existiría en ese perfil. Si se aprueba admisión durable, su máquina
de estados y reclamación serán un diseño/ensayo adicional.

Después de NOT_OBSERVED, un reenvío deliberado **con la misma clave e intención**
puede ser seguro si el protocolo transaccional está probado y la generación sana:
la unicidad resuelve incluso un primer intento aún en vuelo. No necesita adivinar
si aquel intento abortó. Eso no autoriza reintentos automáticos ilimitados ni el
reenvío cuando el proveedor está en recuperación dudosa. Presupuesto/deadline y
quién decide reanudar son decisiones pendientes.

Un 503 del Gateway o una lectura enriquecida posterior no prueba rechazo de la
transacción. No transportar ciegamente la clasificación `getStatus(503)=>REJECTED`
del adaptador 4A a cualquier capa futura. El protocolo debe distinguir fase,
procedencia y recibo; sin evidencia de resultado, UNKNOWN es conservador.

## 9. Suspensión, desactivación, permisos y orden verificable

El chequeo de link permanece en Backend. El recibo no concede derecho a vincular
ni evita la comprobación de elegibilidad. Propuestas a comparar:

| Política de orden | Garantía posible | Requisitos/limitaciones |
| --- | --- | --- |
| Orden serial compatible actual | Operaciones solapadas pueden ordenarse link–revocación o revocación–link; una operación nueva iniciada tras estado inelegible confirmado debe rechazarlo | Caracterizar conexiones y escritores reales; no prometer prioridad por hora física de commit |
| Barrera estricta por agregado | Un punto acordado de revocación impide confirmar comandos con fence anterior | Revisiones, locks/fences y participación de todos los escritores de estado/actividad/permisos relevantes; resolver deadlocks/disponibilidad |
| Reserva de autorización/confirmación | Un permiso durable coordina fases entre autoridades | Reserva de placa y elegibilidad, vencimiento, fencing, coordinador y reconciliación; una firma/TTL simple no basta |

Recomendación conservadora: primer recibo no cambia el orden de negocio actual.
Si se necesita prioridad estricta, detener ese perfil hasta acordar participantes
y prueba de orden. No asignar autoridad de Membership.status a Identity/Commerce
sin aprobación. La búsqueda previa no encontró un setter público de suspensión;
eso no excluye escritores externos/scripts y no completa su inventario.

User.active puede cambiar desde Control mediante actualización anidada; el guard
y AuthCore mantienen permisos/authVersion y sesiones. authVersion no versiona
Vehicle ni Membership.status. Si la autorización viene de otra autoridad,
una consulta remota previa o TTL no elimina la ventana hasta commit. No afirmar
revocación instantánea sin coordinación y sin auditar todos sus escritores.

### Replay después de suspensión o desactivación

Alternativa recomendada para revisar: mantener autorización vigente de la llamada
pública/privada. Si ahora deniega, no ejecutar link ni entregar información privada
por un recibo antiguo; conservar el recibo COMMITTED. Un reconciliador interno
con permisos propios podría acreditar el resultado histórico, sin reactivar al
usuario ni devolver su body financiero a una sesión revocada.

Alternativa: permitir consulta histórica al antiguo principal con otra capacidad
específica; cambia política de acceso y necesita aprobación. No seleccionarla
para facilitar recuperación. La desactivación puede ser detenida ya por el guard
con 401; la suspensión puede dar 403 del comando. No convertir automáticamente
ninguno en 201 porque exista un resultado previo.

Comando nuevo después de suspensión: rechazo actual. Replay de éxito anterior:
resultado histórico solo si el acceso actual lo permite. Intento anterior
rechazado sin recibo: no tiene una reserva de clave ni permiso antiguo reutilizable.

## 10. Reinicio, restauración e integridad financiera

### Reinicio sin pérdida de almacenamiento

Recibo y Vehicle confirmados se recuperan juntos desde la base autoritativa.
Si el proceso cae antes del commit, la transacción se resuelve según PostgreSQL;
si cae durante la confirmación, el caller consulta. Identity no puede recuperar
una intención que solo vivía en su memoria: el caller debe reenviar clave/payload,
o aprobarse una intención durable adicional. No generar otra UUID de operación
en el bootstrap ni reenviar indiscriminadamente todas las placas conocidas.

### Restauraciones parciales

Un recibo local no resuelve una restauración que perdió tanto vínculo como recibo
después de haber reconocido el éxito a un cliente. Sin WAL/copia que permita
recuperarlo, no puede garantizarse conservación de aquel UUID ni «exactly once».
Una copia del recibo en Identity tampoco reconstituye automáticamente el estado
financiero ni convierte dos commits independientes en uno.

Antes de reanudar, comprobar manifiesto de recuperación: autoridad lógica,
generación, corte/checkpoint local, cobertura de recibos, bindings de UUID y
versiones de contrato. LSN solo es comparable en su propio contexto; no ordenar
LSN entre bases. Un campo de epoch restaurado desde el mismo backup antiguo no
detecta por sí solo el rollback: requiere control de restauración acreditado o
registro operativo independiente. Reinicio normal no debería inventar generación.

| Corte observado | Respuesta de recuperación propuesta |
| --- | --- |
| Vehicle y recibo restaurados juntos a corte acreditado | Validar FK/contexto y frontera de commits reconocidos; solo entonces habilitar consultas/reenvíos del perfil |
| Recibo existe pero Vehicle/referencia falta | RECOVERY_REQUIRED, sin recrear filas desde el recibo por iniciativa del consumidor |
| Vehicle existe pero recibo esperado falta | Estado actual no demuestra operación original; no fabricar recibo ni atribuir efecto por placa |
| Identity conserva intención más reciente que Backend | Mantener dudosa; no reemitir con otra clave, no cambiar UUID ni propietario para converger |
| Backend más reciente que Identity | Recuperar binding/proyección desde fuente acreditada; no borrar recibos ni retroceder la autoridad |
| Solo parte de tablas restaurada con FK aparentemente válidas | Comparar también contexto/UUID y checkpoints: las FK no prueban mismo propietario histórico ni coherencia con otra base |

La liberación de cuarentena, RPO, horizonte de reintentos y posibilidad de recuperar
commits reconocidos requieren decisión operativa. No se propone reparación por
last-write-wins, búsqueda de nombre/placa o renumeración. Caducar un timeout o lease
no autoriza a deshacer un commit en duda.

### Protección financiera

El conjunto de escritura permitido al futuro comando es Vehicle más su recibo
privado, dentro de la autoridad aprobada. Todo lo demás conserva escritores y
referencias actuales. En particular:

- No cambiar Transaction/FuelAuthorization.membershipId/vehicleId, compras guest,
  recibos de venta, saldos, deudas, puntos, pagos ni campos de bienvenida.
- No usar el propietario presente de una placa para atribuir compras pasadas;
  las referencias capturadas en su contexto operacional siguen siendo la fuente.
- No regenerar Vehicle.id o Membership.id después de un resultado reconocido;
  ante pérdida de datos, restauración aprobada, no compensación implícita.
- No almacenar respuesta financiera para replay. Una consulta posterior compone
  sus fuentes actuales con autorización actual, independiente del recibo de link.
- No borrar/desvincular/reasignar como rollback distribuido. No hay transferencia
  pública aprobada ni un comando financiero que pueda repetirse para reparar link.

## 11. Retención, seguridad y capacidad

No se elige un TTL. Retención debe cubrir reintentos válidos, operaciones dudosas
y restauraciones permitidas. Borrar una clave mientras puedan llegar duplicados
antiguos puede volver a admitirla. Tombstones o archivo son alternativas futuras:
conservar evidencia de clave/digest/resultado suficiente, no fingir ausencia y
volver a ejecutar. Política de almacenamiento, acceso y expiración necesita aprobación.

Lookup por clave debe verificar caller y sujeto actualmente autorizados antes de
exponer resultado; clave ajena e inexistente deben ocultarse sin datos de otro
propietario. Nunca aceptar callerNamespace, rol o userId sin acreditar. Un digest
coincidente no es autenticación. Aplicar límites de tamaño/tasa/plazo al transporte
futuro sin modificar ahora contratos públicos ni compartir secretos AuthCore.

## 12. Plan experimental y aceptación, todavía sin ejecutar

Todos los pasos necesitan autorización nueva. L = demostrable en laboratorio
privado nuevo tras implementar el protocolo aprobado; D = depende además de
decisión de negocio, infraestructura o autenticación real.

| Corte propuesto | Alcance | Puerta de aceptación |
| --- | --- | --- |
| 4B.1 Modelo de protocolo y contratos privados | Perfiles/versiones, clave/digest, dos ejes de resultado, límite de rechazos | L: transiciones/fallos y serialización; no declarar atomicidad PostgreSQL por mocks |
| 4B.2 Recibo de éxito transaccional nuevo | Solo base/DDL de laboratorio y adaptación privada alrededor del link real | L: efecto/recibo atómicos y UUID estables; ni lógica de link duplicada ni dos commits presentados como uno |
| 4B.3 Caídas y consulta autoritativa | Failpoints, procesos nuevos, respuesta perdida, retry concurrente | L: mismo resultado con misma clave y almacenamiento conservado; UNKNOWN no dispara otra clave |
| 4B.4 Restauración correlacionada | Dos bases nuevas, cortes adelantados/atrasados y generación acreditada | L/D: detectar divergencia y cuarentena; promesa sobre commits reconocidos depende de RPO/backup aprobado |
| 4B.5 Seguridad y compatibilidad de transporte | Guards reales sintéticos, credenciales de servicio, Gateway y consumidores | D: solo con alcance aprobado; no activación pública por tener pruebas verdes |

Casos obligatorios para implementar posteriormente:

| Prueba | Nivel y criterio |
| --- | --- |
| Dos envíos misma clave/intención | L: un recibo y como máximo un efecto confirmado; misma proyección histórica, aunque haya intentos abortados |
| Misma clave, dos contenidos concurrentes | L: un ganador; perdedor revierte íntegro y devuelve conflicto tras observar recibo. Ni Vehicle extra para su otra placa ni cambio de label |
| Clave igual después de primer rechazo sin recibo | L/D: demostrar el límite del perfil; no afirmar comparación con intención no guardada. Rechazos durables requieren otro diseño |
| Dos propietarios, misma placa, claves diferentes | L: un solo propietario por UNIQUE/reglas actuales; recibos solo para comandos válidos, sin filtrar dueño ajeno |
| Mismo propietario, distintas claves/labels | L: no-op de negocio conserva label; recibos pueden registrar operaciones distintas sin mutar el vínculo |
| Fallo entre escritura Vehicle e inserción de recibo, y al revés | L: rollback de ambos; sin fila parcial, UUID huérfano o recibo de un cambio no confirmado |
| Caída inmediatamente después del commit | L: lookup recupera resultado; no reenviar con nueva clave ni depender de memoria del proceso muerto |
| Desconexión antes/durante/después del envío | L: NOT_SENT solo cuando se sabe; resto UNKNOWN/lookup; error de red/5xx no demuestra rollback |
| Lookup vacío con primera transacción en vuelo | L: NOT_OBSERVED no es FAILED; retry misma clave resuelve mediante el protocolo sin segundo efecto |
| Muerte de Identity y de Backend por separado | L: conservar intención en caller para reenviar; sin ella no prometer auto-resume. Backend vuelve a leer su recibo durable |
| Suspensión/desactivación completa antes de una llamada nueva | L: denegación actual; ningún recibo histórico otorga permiso nuevo |
| Suspensión/permisos solapados con link y con replay | L/D: caracterizar orden serial. Prioridad estricta solo con escritores/fence aprobados y barreras deterministas |
| Replay de éxito previo tras suspensión | L/D: no reescritura ni reapertura de acceso; conservar COMMITTED aunque la solicitud actual esté denegada |
| Credencial/caller/sujeto falsificado o rotado | L/D: aislamiento por sujeto y namespace; rotación no crea una clave nueva. AuthCore/JWT reales se prueban aparte |
| Réplica o generación antigua | L: no usar ausencia como prueba; fuente no autoritativa rechazada, recuperación incoherente queda bloqueada |
| Restore parcial con recibo sin Vehicle o inverso | L/D: cuarentena sin fabricar filas/recibos. Recuperar un éxito que se perdió en todos los backups no se promete |
| Retención y duplicado muy tardío | L/D: política/tombstone aprobados antes de afirmar deduplicación; un TTL no restablece automáticamente permiso de ejecución |
| Integridad financiera | L: comparar todas las tablas preexistentes distintas de Vehicle, incluidas referencias guest y bienvenida; solo Vehicle y recibo nuevo pueden cambiar por el comando |
| Regresión 0–4A | L: ejecutar nuevamente suites pertinentes, conservar fallos/evidencias; no sumar conteos de sesiones históricas |
| Cuerpos HTTP y frontend | D: v1/public API intactos; no declarar paridad financiera/frontend por probar solo recibo mínimo |

Infraestructura: bases, red y almacenamiento persistente de ensayo **nuevos**,
datos sintéticos, fuentes read-only e imágenes ya disponibles. Un tmpfs eliminado
al parar PostgreSQL no demuestra recuperación durable; crash/restart necesita
almacenamiento nuevo que sobreviva a ese fallo. No reutilizar volúmenes o recursos
retenidos anteriores ni borrarlos para liberar redes. Failpoints/barreras privados,
no sleeps como única coordinación ni cambios operativos para hacer pasar tests.

El laboratorio puede probar el protocolo bajo su modelo de fallo. Autenticación
real, todos los escritores de revocación, Gateway, triggers históricos completos,
backups/RPO y operación en producción siguen siendo puertas distintas.

## 13. Impacto potencial y autorización requerida

Archivos candidatos futuros, **no creados**:

```text
services/identity/lab/vehicle-link-durable-contract.ts
services/identity/lab/vehicle-link-receipt-authority-adapter.cjs
services/identity/lab/vehicle-link-receipt-lab.sql
services/identity/lab/vehicle-link-durable.test.cjs
tools/astra/identity-a4-vehicle-link-recovery-lab.cjs
tools/astra/identity-a4-vehicle-link-recovery-worker.cjs
```

La persistencia pertenecería al proveedor Backend del laboratorio, no a Identity.
No se modifica ningún schema operativo ni se propone ejecutar una migración sobre
bases existentes. Adaptar VehicleLink.v1/puertos ya creados sería otro permiso;
recomendación: perfil nuevo que preserve v1 y sus evidencias. Si la composición
transaccional exige tocar el repositorio real/atomic, detener y solicitar permiso,
sin duplicar su algoritmo en archivos nuevos para eludir el límite.

Decisiones explícitas antes de implementar:

1. Aprobar o rechazar recibo de éxito local como primer perfil y su modelo de fallo.
2. Clave/namespace estables, normalización/digest y semántica del primer rechazo.
3. Versión privada nueva frente a capacidad negociada; no reinterpretar v1.
4. Reautorización de replay y quién puede consultar historia tras suspensión;
   acceso del reconciliador, sin privilegios implícitos ni cambios AuthCore.
5. Orden serial actual frente a barrera estricta y lista completa de escritores
   participantes. No introducir prioridad absoluta por decisión técnica unilateral.
6. Ubicación/retención/FK/acceso del recibo, políticas de archivo/tombstones y
   almacenamiento de ensayos que sobreviva a reinicio.
7. Generación de recuperación, checkpoints, RPO y autoridad para levantar cuarentena;
   ninguna garantía de éxito reconocido tras restauración arbitrariamente antigua.
8. Necesidad de intención durable Identity, outbox o admisión PENDING: quedan fuera
   del primer perfil conservador salvo nueva autorización.
9. Alcance de transporte, deadline/presupuesto de reintentos y posteriores pruebas
   con guard real/Gateway/frontends, sin activación automática.

Entrega: un solo documento nuevo de diseño, después de un único commit de respaldo.
No se implementó persistencia ni recuperación 4B, ni se alteró ninguna evidencia.
El cotejo final confirma los 1075 archivos anteriores idénticos por SHA-256;
únicamente este documento está sin seguimiento. No hay cambios versionados ni
staging. HEAD conserva el sexto commit, con sus cinco ancestros intactos;
whitespace revisado sin errores. No hubo push, merge o pruebas nuevas en este diseño.

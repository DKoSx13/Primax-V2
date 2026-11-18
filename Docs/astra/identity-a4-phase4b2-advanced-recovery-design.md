# Identity A.4 fase 4B.2 — diseño de recuperación avanzada

Fecha: 2026-11-18. Estado: **diseño técnico exclusivamente; implementación pendiente de autorización expresa**.
Este documento es el único archivo nuevo de este corte de diseño. No contiene DDL ejecutable ni cambios de código.

## 1. Respaldo de 4B.1 y trazabilidad

Se verificó la rama `feat/dezkz-identity-a4-core` y el HEAD inicial
`0e563ef4f58f726da3b66a850740ecdfbc6337aa`. Había exactamente 19 archivos sin
seguimiento, sin cambios versionados ni staging. El inventario del informe 4B.1
coincidió: doce fuentes/contratos/pruebas/herramientas, cinco evidencias JSON, el
informe de resultados y el diseño previo 4B. Los cinco JSON eran válidos y
registraban éxito. La revisión de contenido no detectó secretos, credenciales
reales ni datos personales reales en esos archivos: solo generación aleatoria de
credenciales de ensayo, URL parametrizada, hash ficticio y correos `.invalid`.

Se usaron las 19 rutas explícitas para staging; se revisaron las altas, su contenido
contra los archivos y whitespace antes de crear un único commit local:

```text
747d3cd1ed4376fa6acf18fc15913b6e133a8326
feat(identity): add A4 private durable success receipt laboratory
```

Son 19 altas y 2351 líneas añadidas; padre exactamente el HEAD autorizado. El árbol
quedó limpio inmediatamente después. La cadena anterior permanece íntegra:

```text
0e563ef4f58f726da3b66a850740ecdfbc6337aa
a4dc5f59505b4088de1c50c2b8cbed8a95f9b27a
c74d20415a620f695a4119a6079b1a5cd4f5a7ec
4b41af38219b510dc053e07cf9115c859e7f9bca
b314f408b865d56bed0e765f44e7de3b5226da13
df68f698620fcd8a17a4c06256f96d7c7934e95d
```

Además de comprobar hashes/padres Git, se cotejó antes/después una huella SHA-256
de los 1094 archivos existentes, ordenados por ruta (ruta UTF-8, byte NUL,
contenido binario, byte NUL por archivo):
`1a3cc8000023a418ceb1bf47999777e77c6f3fd112f5f664572c9e3dfb9a7360`.
Así se preservó también el contenido local sin normalizar saltos de línea.
La identidad del autor del commit procede de la configuración Git existente y no
es parte del dataset sintético revisado. No hubo push, merge ni reescritura de commits.

## 2. Referencias locales y garantías existentes

Este análisis se basa en el código del checkout y sus evidencias, sin ejecutar
laboratorios, pruebas nuevas ni conexiones a bases:

- [Resultados 4A](identity-a4-phase4a-vehicle-link-results.md) y [diseño 4B](identity-a4-phase4b-durable-recovery-consistency-design.md).
- [Resultados 4B.1](identity-a4-phase4b1-success-receipt-results.md), sus cinco JSON y las evidencias finales de 102/102 unitarias y 17 grupos de integración. Son resultados históricos, no ejecuciones de este diseño.
- [Contrato durable](../../services/identity/lab/vehicle-link-durable-contract.ts), [autoridad y lector](../../services/identity/lab/vehicle-link-success-authority.cjs), [DDL del laboratorio](../../services/identity/lab/vehicle-link-success-receipt.sql).
- [Repositorio Vehicle](../../Backend/src/vehicles/vehicles.repository.ts), [atomic](../../Backend/src/prisma/prisma.service.ts), [guard](../../Backend/src/auth/access.guard.ts), [núcleo Identity](../../Backend/src/identity-core/identity.ts) y [adaptador AuthCore](../../Backend/src/identity-adapters/authcore.ts), examinados en lectura.
- `Backend/src/control/control.service.ts`: ejemplo de desactivación de cuenta administrativa con actualización anidada de User y authVersion. No constituye inventario completo de escritores de suspensión/desactivación.

4A usa operationId como correlación. 4B.1 añade el perfil privado v2
SUCCESS_ONLY_V1: clave `(callerNamespace, operationId)`, digest de intención,
Vehicle y recibo en la misma transacción Serializable del Backend. La autoridad
inyecta el repositorio real, conserva sus reglas y omite su callback al recuperar
un éxito. El lector separado usa SELECT y snapshot READ ONLY/RepeatableRead.
Lookup verifica elegibilidad vigente y Vehicle.id/plate/membershipId; una
incoherencia local devuelve RECOVERY_REQUIRED. No comprueba integridad global.

Los recibos son inmutables, con FK restrictivas y sin UPDATE/DELETE para el writer.
No hay PENDING durable, archivo, tombstones, intención durable en Identity ni
barrera global de recuperación. Los ensayos demostraron reinicio con almacenamiento
conservado y restore lógico coherente; no pérdida física, RPO cero, backups antiguos
ni prioridad de suspensión concurrente. Las credenciales son del arnés, no JWT real.

## 3. Arquitectura propuesta

Mantener al Backend como único escritor operativo de Vehicle y autoridad del
resultado. Ampliar gradualmente el protocolo privado mediante capacidades/versiones
explícitas; no reinterpretar v1 ni modificar silenciosamente v2 o sus evidencias.
Los siguientes son componentes conceptuales futuros, no archivos/tablas creados:

```text
Solicitante -> autenticación vigente -> binding Identity -> política de comando/consulta
                                   -> transporte privado autenticado
Backend: control de recuperación -> autorización local -> autoridad VehicleLink
                                                      -> atomic legado
                                                         Vehicle + recibo de éxito
         lector de resultados (solo lectura) -> recibo/archivo + validación local
         reconciliación restringida -> diagnóstico/cuarentena, sin ejecutar link
Control de recuperación independiente -> procedencia de backup y generación autorizada
```

El control de recuperación permite admitir comandos solo en una autoridad cuya
continuidad esté acreditada. Es un control separado de Membership.status y no
concede derechos al solicitante. Un índice mínimo de claves consumidas, si se
aprueba, pertenece al protocolo Backend; Identity puede conservar intenciones,
pero nunca decide que Vehicle confirmó ni escribe Vehicle.

Invariantes propuestos:

1. Un éxito nuevo conserva la única transacción Vehicle/recibo; no se inserta un recibo después de un commit independiente.
2. Una clave consumida nunca vuelve a considerarse nueva por limpieza, reinicio, rotación de credenciales o cambio de generación.
3. Replay de éxito acreditado entrega el resultado histórico autorizado, sin volver a ejecutar el callback de link ni finanzas.
4. Ausencia, falta de permisos e indisponibilidad no prueban que un comando histórico haya fallado.
5. Una autoridad sin continuidad acreditada bloquea las operaciones afectadas antes de ejecutar trabajo legado.
6. Ni reconciliador ni lector recrean vehículos, UUID, recibos o referencias perdidos.

La futura integración exigiría revisar la composición/tipado del adaptador del
laboratorio. El diseño no afirma que baste registrarlo en un módulo operativo.

## 4. Retención: conservar resultado y reservar identificador son necesidades distintas

### 4.1 Horizonte y consecuencias

No existe hoy un plazo contractual de replay ni un mecanismo que rechace por
antigüedad las claves UUID. Un UUID no acredita fecha de admisión. Por ello ningún
TTL finito permite eliminar a ciegas una clave y conservar deduplicación ilimitada.
La recomendación provisional es conservar los recibos confirmados mientras no
se apruebe un mecanismo alternativo que preserve las claves y la cobertura de recuperación.
Esto es una condición de seguridad, no un plazo legal o una obligación de retención perpetua.

Antes de fijar tiempos hay que acordar: horizonte de reintentos offline/colas,
duración de consultas históricas, máximo retraso de reconciliación, backups que
pueden volver a servicio y tratamiento de operaciones dudosas. La conservación
del resultado completo debe cubrir el servicio de consulta prometido y los casos
abiertos; la reserva de clave debe cubrir toda admisión posible de duplicados.
Sin límite verificable de admisión, este segundo horizonte permanece abierto.
No basta tomar el mayor TTL de cachés: pueden llegar solicitudes antiguas por
fuera de esas cachés y reaparecer datos tras un restore.

Eliminar un recibo todavía consultable rompe recuperación de respuesta perdida y
puede convertir un éxito en NOT_OBSERVED. Suprimir también la clave permite que
un comando antiguo se ejecute otra vez. Que la placa propia actualmente converja
no demuestra seguridad futura: cambian estado, propiedad y datos restaurados;
además se pierde el resultado/UUID histórico de esa operación.

### 4.2 Alternativas

| Alternativa | Garantía y coste | Condición de uso |
| --- | --- | --- |
| Recibo completo en línea | Replay exacto y unicidad local; crecimiento y exposición de label/placa | Opción inicial conservadora; medir volumen, backup y acceso antes de limitar |
| Archivo íntegro más índice local de clave consumida | Resultado histórico recuperable con más latencia; dependencia del archivo | Índice siempre consultado por submit; archivo íntegro, verificable y con política de acceso/backup |
| Tombstone mínimo durable | Impide nueva ejecución; puede comparar digest conservado | Si elimina el resultado, no puede prometer replay exacto ni SUCCESS; comunicar resultado no recuperable |
| Ventana de admisión verificable y cierre irrevocable de épocas | Podría permitir purgar claves de épocas cerradas | Perfil nuevo con época/fecha de admisión autenticadas y cierre conservado fuera del backup regresivo; UUID libre actual no basta |
| TTL de recibo sin reserva de clave | Reduce espacio | Rechazada: admite reutilización y confunde borrado con ausencia original |

Un tombstone conceptual conserva dominio/namespace/operationId, versión/digest
si su conservación está aprobada, sujeto mínimo protegido y procedencia de
consumo. No basta una caché o filtro probabilístico como única autoridad: deben
existir decisiones exactas y durables para admitir una clave nueva. Si se purgan
digest/sujeto, toda reutilización de la clave debe bloquearse de forma genérica;
ya no puede afirmarse que se compararon parámetros ni devolverse datos del dueño.
Los UUID y hashes también pueden ser vinculables; minimizar datos no los anonimiza.

### 4.3 Eliminación y archivado seguros, solo tras aprobación

La tabla actual prohíbe borrar incluso con trigger para el administrador del lab.
No se propone desactivarlo ahora. Un protocolo futuro debe publicar una reserva
durable de clave antes de retirar el recibo en línea, verificar copia íntegra y
garantizar que submit consulta ambos durante todo el traslado. Un crash en cada
paso debe dejar el recibo o la reserva, nunca una ventana de readmitir la clave.
La respuesta solo procede del recibo confirmado/archivo acreditado, nunca de la
existencia aislada del índice. Si archivo falla: UNAVAILABLE/OUTCOME_UNKNOWN,
sin fallback a link. Si solo queda tombstone sin resultado: OUTCOME_UNKNOWN con
motivo interno RESULT_UNAVAILABLE; clave bloqueada, sin SUCCESS inventado.

Una cuarentena, obligación de conservación aprobada o reconciliación abierta
impide purgar su evidencia automáticamente. Backup, réplicas y archivo deben
participar de la política de supresión: borrar en línea no garantiza eliminación
física. Cifrado/borrado de claves requiere gestión de claves y compatibilidad con
backups aprobadas; tampoco elimina la necesidad de reservar identificadores.
Un restore antiguo debe reaplicar el catálogo de claves consumidas y cierres
acreditados antes de admitir comandos; no debe resucitar permisos ni claves libres.

## 5. Replay e idempotencia

### 5.1 Semántica en dos ejes

Los siguientes son nombres de análisis del futuro contrato, no renombres aplicados
al código. En 4B.1 el éxito se llama COMMITTED y los conflictos son errores tipados.
Separar siempre el resultado de la solicitud actual del conocimiento del efecto histórico:

| Categoría | Evidencia requerida / alcance | Conducta |
| --- | --- | --- |
| SUCCESS | Recibo confirmado íntegro, procedencia sana y acceso actual permitido; equivale al COMMITTED existente | Resultado histórico mínimo inmutable; no demuestra permisos futuros ni estado financiero actual |
| CONFLICT | Clave consumida con digest/sujeto diferente, o conflicto de propiedad del comando actual | Distinguir IDEMPOTENCY_CONFLICT de OWNERSHIP_CONFLICT; no modificar ni revelar el resultado ajeno |
| NOT_OBSERVED | Lookup autorizado y fuente consultable sin recibo visible para ese sujeto | Solo observación de ese snapshot; puede haber operación en vuelo, rechazo no guardado, ocultación de recibo ajeno o pérdida de datos |
| OUTCOME_UNKNOWN | Posible envío/commit sin prueba suficiente, o resultado perdido no recuperable | Conservar clave/intención; consultar o cuarentena; no sustituir por otra clave |
| Rechazo de autorización | Identidad, capacidad, binding o estado vigente no permite esta solicitud | No ejecutar ni revelar historia. El efecto previo sigue UNKNOWN para ese llamador |
| UNAVAILABLE | No se pudo consultar/verificar autoridad, archivo o autorización | Nunca devolver ausencia como sustituto; conocimiento del efecto histórico UNKNOWN |
| RECOVERY_REQUIRED | Integridad/continuidad incompatible o no acreditada | Bloquear operación afectada y remitir diagnóstico al reconciliador autorizado |

Un rechazo antes del envío puede indicar NOT_SENT de ese intento; un rechazo
acreditado por el proveedor, REJECTED de ese intento. Ninguno invalida un commit
anterior de la clave. Un 401/403 de lookup nunca debe etiquetar la operación
histórica como rechazada. NOT_OBSERVED **no garantiza que la operación nunca ocurrió**.

### 5.2 Reglas de comando y consulta

| Caso | Regla propuesta |
| --- | --- |
| Misma clave y mismo digest confirmado | Reautorizar; validar continuidad/recibo y devolver el mismo resultado sin callback. Si falta permiso, denegar sin borrar éxito |
| Misma clave y parámetros/sujeto distintos | CONFLICT sin efecto nuevo. Versiones/normalización incompatibles no se reinterpretan; rechazar perfil o requerir recuperación |
| Equivalencia normalizada | Mantener normalizadores y serialización versionados de 4B.1; no añadir NFC/OCR/equivalencias nuevas implícitas |
| Duplicados concurrentes iguales | Unicidad del recibo más rollback integral; puede haber trabajo abortado. Relectura en snapshot nuevo recupera ganador; agotamiento conserva UNKNOWN |
| Clave igual y digests distintos concurrentes | Un solo éxito durable; intento perdedor revierte también su Vehicle. No garantizar que gane el primero en llegar por red |
| Claves distintas, misma placa | Reglas exclusivas del repositorio Backend. Mismo dueño conserva label/UUID; otro dueño recibe conflicto sin datos ajenos |
| Primer rechazo sin recibo | SUCCESS_ONLY_V1 no conserva intención rechazada. Reutilización posterior no puede compararse con ella; fijar desde admisión exigiría otro perfil |
| Operación pendiente/desconocida | No hay PENDING persistido hoy. Memoria del cliente o timeout no certifica progreso ni rollback; consultar manteniendo la clave |
| Reinicio sin pérdida | Reautenticar y recuperar mediante recibo; el caller conserva clave e intención. Reiniciar no genera namespace, operationId o generación nuevos |
| Respuesta perdida tras commit | OUTCOME_UNKNOWN inicial; lookup autorizado recupera SUCCESS, sin reenviar dinero ni llamar a link para reconstruir resultado |
| Consulta sin recibo en autoridad acreditada | NOT_OBSERVED; reenvío deliberado de la misma clave/intención solo bajo control sano. Un primer intento en vuelo competirá por la misma unicidad |
| Consulta tras restore/pérdida no acreditados | La ausencia no habilita submit; RECOVERY_REQUIRED/cuarentena prevalece sobre tratar la clave como nueva |
| Tombstone sin resultado | No ejecutar; resultado histórico OUTCOME_UNKNOWN/RESULT_UNAVAILABLE. Digest distinto conservado permite conflicto; sin digest bloquear genéricamente |

No añadir retries de transporte ocultos. Un futuro presupuesto de consultas/reenvíos
requiere límites y cancelación definidos; cancelar la espera no cancela un commit.
atomic conserva sus cinco intentos y errores locales clasificados; no se amplía
ni se convierte automáticamente un 503 en prueba de rollback histórico.

Si se requiere recuperar sin cooperación del caller, alternativa: intención
durable en Identity con la misma clave y payload normalizado. Es un registro de
intención, nunca un recibo Backend ni permiso. Admitir PENDING en Backend fijaría
la intención antes del éxito, pero exige estados, reclamación, leases/fencing y
resolución de ejecutores antiguos. Expirar un lease no demuestra que no hubo
commit. Ambas ampliaciones quedan fuera del primer corte recomendado.

### 5.3 Namespace, digest y resultado esperado

La identidad lógica estable del servicio determina namespace por configuración
acreditada del proveedor, separada de certificados/tokens rotables y del namespace
de pagos o AllocationReceipt. No aceptar userId, rol, namespace o digest del body
como autoridad. No añadir epoch a la clave para escapar de cuarentena.

Conservar exactamente la receta existente para v2: SHA-256 UTF-8 del array
`[2, SUCCESS_ONLY_V1, PLATE_DTO_V1, namespace, operationId, userId, membershipId,
plateNormalizada, labelSolicitadoNormalizado]`. La autoridad calcula/compara;
el hash no autentica ni cifra. El label persistido puede diferir del pedido si
Vehicle ya era propio: **no se puede recomputar el digest de intención usando
solo el label del recibo**. Para comprobarlo se necesita la intención original
acreditada o material de integridad independiente. No declarar corrupto un recibo
por esa diferencia válida ni fabricar un digest nuevo.

Mejoras candidatas: validar en el consumidor el namespace esperado, política y
digest esperado al recibir respuesta de submit; el #view actual valida formato y
sujeto, pero no compara namespace con una identidad de proveedor esperada ni
recalcula el digest de la intención. Lookup actual recibe solo operationId; añadir
digest esperado requiere capacidad/versión privada acordada, no cambio silencioso.
Sin intención disponible, lookup puede recuperar el recibo autorizado con su
digest, pero no afirmar que verificó una intención que el caller perdió.

## 6. Restauración, pérdida y cuarentena

### 6.1 Unidad y control previo de recuperación

Restaurar una autoridad coherente requiere Vehicle, recibos, User/Membership,
restricciones y referencias históricas del Backend en un corte compatible; un
dump solo de Vehicle/recibos no acredita consistencia financiera. La recuperación
de la base completa es una operación futura de infraestructura explícitamente
autorizada, no una modificación de transacciones financieras por este protocolo.
Identity conserva su autoridad de bindings y necesita procedencia compatible;
no hay snapshot distribuido probado. Nunca comparar LSN de bases diferentes.

Proponer estados de control separados: CLOSED (inicio/restauración sin verificar),
VALIDATING, READY (cobertura acreditada) y QUARANTINED (divergencia). Son estado de
recuperación, no valores de Membership.status. Ante pérdida de control o cambio
de procedencia, cerrar admisión. Un reinicio normal con continuidad acreditada
puede volver a READY sin crear otra identidad de operación.

La barrera requiere aplicación en todos los procesos del perfil antes de entrar
en atomic y protección contra cambios durante la transacción. Un chequeo HTTP
previo aislado no basta. En recuperación hay que detener admisión, drenar o
invalidar escritores antiguos, impedir split brain y verificar el fence vigente
en la unidad transaccional con una coordinación que el controlador respete.
Una lease sin fencing verificable permite que un proceso pausado confirme tarde.
Los comandos v1 y otros escritores operativos no quedan cubiertos por envolver
solo el laboratorio v2: inventariarlos y definir parada/coordinación antes de
prometer barrera global. Actualmente esa garantía no existe y no se activa aquí.

Secuencia conceptual antes de habilitar operaciones:

1. Aislar instancia restaurada y mantener admisión cerrada; confirmar que no existe otro primario/escritor admitido.
2. Validar manifiesto protegido: autoridad lógica, identidad de backup/corte/timeline local, versiones, cobertura de recibos/archivo/índice y evidencia de integridad. Count o MAX(recordedAt) no acreditan completitud.
3. Contrastar con control independiente del almacenamiento restaurado: último corte acreditado, catálogo de claves/cierres y frontera de éxitos reconocidos si existe. Una epoch dentro del mismo backup regresivo no detecta su propia regresión.
4. Auditar FK, unicidad, UUID, correspondencia recibo–Vehicle–Membership–User, bindings Identity y referencias históricas en lectura. Cero escrituras de reparación. Verificar además privilegios/trigger/rol lector: `--no-acl` de un dump no restaura permisos por sí solo.
5. Comparar recibos/manifiestos y fuentes independientes; distinguir vehículos legítimos previos a v2 de operaciones v2 cuyo recibo falta. No exigir un recibo por cada Vehicle preexistente ni deducir recibos por placa.
6. Delimitar intervalo/namespace/claves afectados con evidencia. Si no puede delimitarse, cuarentena de toda la autoridad del perfil, incluidas claves aparentemente nuevas; la pérdida pudo borrar ambas filas.
7. Emitir informe verificable y obtener liberación explícita del responsable autorizado; registrar evidencia/fence de apertura. Si la continuidad no puede acreditarse, permanecer cerrado.

Un checkpoint periódico puede acotar incertidumbre pero deja un intervalo sin
cobertura. Garantizar recuperación de cada éxito reconocido ante pérdida física
exige que la política de confirmación y durabilidad cubra ese fallo; una copia
asíncrona o manifiesto atrasado no demuestra RPO cero. No se selecciona aquí una
tecnología de replicación ni se promete reconstruir información perdida en todas
las copias. Incluso un backup coherente antiguo puede haber perdido éxitos ya
reconocidos: integridad interna y continuidad histórica son comprobaciones distintas.

### 6.2 Tratamiento por escenario

| Estado observado | Diagnóstico y conducta |
| --- | --- |
| Vehicle y recibo coherentes, corte completo acreditado | Validar procedencia, permisos y vínculo; permitir consulta/replay del mismo resultado al quedar READY |
| Backup coherente anterior a éxitos reconocidos | La coherencia local no basta; bloquear intervalo sin cobertura y buscar backup/WAL acreditados. No admitir otra vez esas claves |
| Vehicle existe, recibo esperado perdido | Estado presente no acredita qué operación lo produjo; OUTCOME_UNKNOWN/RECOVERY_REQUIRED. Recuperar copia auténtica si existe; no insertar recibo derivado de Vehicle |
| Recibo existe, Vehicle falta | Violación de unidad/referencias; cuarentena, sin recrear Vehicle a partir del recibo. FK normalmente lo impide; restore parcial con constraints deshabilitadas puede introducirlo |
| Recibo existe, Vehicle sin dueño o con otro membershipId/plate/UUID | Estado incompatible en este perfil, RECOVERY_REQUIRED; no reasignar propietario para hacerlo coincidir |
| Vehicle y recibo faltan | Indistinguible de nunca recibido solo con la base local; control externo/cobertura decide cuarentena, no el lookup vacío |
| Recibo/Vehicle locales coherentes, binding Identity incompatible | Bloquear acceso/ejecución afectados; comparar fuentes y cortes de UUID, sin crear otra membresía ni usar email/placa para resolver identidad |
| Recibos/archivo/índice de generaciones incompatibles | No fusionar por last-write-wins; conservar copias y procedencia, bloquear admisión hasta conciliación acreditada |
| Pérdida física del almacenamiento | Restaurar únicamente desde fuentes íntegras acreditadas con procedimiento autorizado; si no existen, declarar pérdida/resultado desconocido y mantener cuarentena |
| Referencias financieras huérfanas o UUID cambiados | Recuperación incompatible; escalar diagnóstico de solo lectura, sin retocar Transaction/FuelAuthorization ni fabricar UUID sustitutos |

Una futura transferencia legítima o cambio de label exigiría semántica histórica
versionada; hoy no existe ese flujo aprobado. Diferencia de label actual aislada
no prueba corrupción del digest original; debe investigarse con evidencia de
cambios permitidos, no actualizar el recibo inmutable para ocultarla.

### 6.3 Expediente y liberación

La cuarentena registra conceptualmente clave cuando se conoce, sujeto protegido,
intención/digest disponibles, fuentes/cortes, evidencia del éxito reclamado,
motivo y alcance, responsable y resolución. No contiene tokens, contraseñas ni
respuesta financiera. Si el estado de cuarentena no es durable/externamente
verificable, no sobrevive al fallo que pretende contener. Su persistencia es una
decisión futura, no una tabla creada en este diseño.

Separar diagnóstico de reparación: preservar copias, buscar respaldo auténtico,
validar procedencia y emitir resolución. Liberar exige continuidad o aislamiento
verificable del segmento dudoso, pruebas del fence y autorización del responsable
de recuperación. No hay liberación automática por tiempo, ausencia repetida,
coincidencia de placa o aprobación de un cliente. Si la pérdida es irrecuperable,
la autorización humana no convierte el resultado en SUCCESS ni prueba no ejecución.

Conservar Vehicle.id, Membership.id, User.id y referencias históricas originales.
No reasignar compras guest con membershipId=null al dueño presente, ni modificar
vehicleId, saldos, deuda, puntos, bienvenida o transacciones para reconciliar link.
No recrear automáticamente vehículos, identificadores o recibos perdidos. Una
restauración autorizada de evidencia auténtica es distinta de sintetizarlos.

## 7. Autenticación y autorización futuras, sin cambiar AuthCore/JWT

El guard y el núcleo existentes verifican token, User.active y versión de sesión
`ver` frente a User.authVersion; Control consulta además grants vigentes y scope.
El adaptador AuthCore reutiliza JwtService configurado; no está registrado como
nueva integración operativa por este diseño. authVersion no versiona Membership.status
ni el propietario de Vehicle. Las capacidades `vehicle:link:own` y
`vehicle:result:own` del laboratorio no son grants AuthCore ya instalados.

Proponer un adaptador futuro alrededor de interfaces existentes que derive el
principal del verificador confiable y aplique una política explícita de capacidades.
No trasladar el catálogo de Control ni permitir actor admin/kiosk por conveniencia.
userId/accountId/membershipId siguen siendo UUID distintos, con binding acreditado
y contraste con la membresía operativa dentro de la autoridad.

| Riesgo | Regla de diseño / límite |
| --- | --- |
| JWT válido criptográficamente pero revocado | Verificar estado/versión vigente; el recibo no exime esa comprobación. Si la fuente falla, denegar por indisponibilidad sin afirmar no ejecución |
| Permiso retirado durante una llamada | Revalidar según punto de decisión acordado; snapshots previos dejan ventana. Orden estricto requiere coordinación adicional de todos los escritores |
| Suspensión de membresía / usuario desactivado | Rechazar comandos nuevos, replay y lookup propios conforme a política vigente conservadora; conservar éxito histórico |
| Acceso a historia tras suspensión | Por defecto, sin bypass del recibo. Alternativa: capacidad histórica independiente aprobada, solo lectura y con scope propio; no habilitarla implícitamente |
| Reconciliador privilegiado | Identidad técnica/capacidad distintas, mínimo alcance, auditoría y sin submit ni escritura Vehicle. No iniciar módulo Administration para implementarlo |
| Servicio autenticado suplanta usuario | Credencial técnica acredita caller; no autoriza cualquier subject. Delegación de usuario ligada a acción, audiencia, intención y contexto verificado |
| Rotación/revocación de credencial técnica | Mantener namespace lógico; rotación no libera claves. Credencial revocada no consulta/ejecuta aunque conserve un recibo |
| Enumeración entre usuarios | Autenticar antes de buscar, filtrar sujeto, misma forma externa para ajeno/inexistente, errores sin datos del dueño y logs protegidos; medir diferencias de tiempo/estado |
| Respuesta de proveedor equivocado o digest alterado | Validar namespace esperado, versión, sujeto, operationId y digest cuando existe intención esperada; rechazar respuesta incompatible como UNKNOWN |
| Archivo, caché o log filtra datos | Aplicar autorización a cada consulta, evitar caché compartida entre sujetos, minimizar campos y redacción de logs; no persistir JWT/credenciales en recibos |

Transporte técnico candidato: mTLS o credencial de servicio acotada y rotatoria;
delegación de principal verificada por un componente confiable usando los puertos
existentes. La elección depende de las capacidades reales de despliegue, aún no
acreditadas. No distribuir JWT_SECRET ni inventar soporte actual de issuer/audience
o claves públicas. La futura especificación debe fijar validación de firma,
algoritmos, emisor/audiencia cuando existan, expiración y revocación; si los puertos
actuales no permiten una garantía, declararla pendiente en lugar de modificar AuthCore.

Un nonce/fecha/firma de transporte evita usos indebidos del canal y puede cambiar
en cada intento; no forma parte del digest de negocio. Anti-replay del transporte
no sustituye la unicidad durable. Un recibo válido no es bearer token, permiso,
sesión vigente ni autorización para reconstruir identidad.

## 8. Concurrencia con suspensión y desactivación

La transacción actual lee elegibilidad local y ejecuta link más recibo dentro de
Serializable; atomic reintenta conflictos clasificados. Eso permite una
interpretación serial de las transacciones participantes según su aislamiento,
pero no fija prioridad de suspensión ni un orden por tiempo de llegada o por
recordedAt. Una lectura que vio ACTIVE puede solaparse con una suspensión y
ordenarse antes de ella aunque la respuesta llegue después. El guard previo y
un chequeo remoto no quedan incorporados automáticamente a esa serialización.
El lector RepeatableRead tampoco congela una revocación concurrente.

| Alternativa | Orden verificable y garantías | Cambios/dependencias |
| --- | --- | --- |
| Mantener orden compatible actual | Si la inelegibilidad local ya es visible al inicio del nuevo snapshot, rechazar; solapados pueden ordenarse de ambas formas | Caracterizar escritores reales y aislamiento; no prometer prioridad absoluta |
| Bloqueo común por usuario/membresía | Link y suspensión se ordenan por adquisición de bloqueo mantenido hasta commit; gana quien obtiene el punto común primero | Todos los escritores deben participar, orden de locks documentado y pruebas de deadlock; auditar actualizaciones que ya bloquean filas y rutas externas |
| Revisión/fence de autorización local | Decisión ligada a revisión; revisión antigua no puede confirmar después del punto común de revocación definido | El check y la revocación deben entrar en conflicto/coordinarse atómicamente. Leer revisión sin lock/CAS no basta; nuevo mecanismo requeriría autorización |
| Coordinación entre autoridades | Punto de revocación acreditado por coordinador/reserva y fencing del ejecutor | Participación de Auth/estado/Backend, manejo de partición, caída, leases y disponibilidad; una firma corta o TTL no elimina carrera |

Un lock de recibo inexistente no reserva una clave; esperar un lock tampoco
garantiza que un snapshot Serializable antiguo vea un cambio reciente. El
protocolo elegido debe reiniciar/validar snapshots según su implementación y
preservar UNIQUE/rollback. No usar recordedAt como instante de commit o reloj
global. Un orden comprobable requiere identificar el punto de decisión y su
evidencia (p. ej., secuencia/revisión acreditada), no comparar relojes de servicios.

Recomendación: conservar el orden actual como límite explícito del siguiente
laboratorio y ensayar barreras deterministas mediante puertos de prueba. No se
ha encontrado/acreditado aquí un inventario completo de setters de suspensión;
scripts, SQL y futuros escritores también importan. Si se exige que desde la
confirmación de suspensión ningún link anterior pueda confirmar, hay que acordar
una barrera que drene/invalide intentos y todos sus participantes. No puede
prometerse con la transacción actual por sí sola. Ninguna alternativa modifica
Membership.status o AuthCore en este corte.

## 9. Plan incremental candidato

Todos los cortes siguientes requieren nueva autorización; están en orden de
dependencia y se pueden detener por separado. La primera eventual implementación
debe limitarse a laboratorio privado nuevo y sintético. Cambios operativos,
persistencia nueva, migraciones o pruebas que escriban estados requieren permiso
específico adicional; esta planificación no lo concede.

### Corte 1 — Semántica y validación del contrato privado

- **Objetivo:** formalizar los dos ejes de resultado, namespace esperado y comparación de digest; preservar v1/v2 históricos.
- **Componentes:** contrato/adaptador de laboratorio nuevo, fixtures y pruebas de tipos; ningún bootstrap operativo.
- **Riesgos:** romper equivalencias de normalización o confundir label pedido con persistido; filtrar existencia por conflicto.
- **Dependencias:** decisiones D1/D2/D5 de la sección 11 y contratos 4B.1.
- **Pruebas:** T01–T07, T19; vectores de serialización y respuestas incompatibles.
- **Aceptación:** misma intención da mismo digest/resultado; diferencia confirmada da conflicto sin efecto; lookup nunca dispara submit; errores separan autorización e historia.
- **Autorización:** perfil/capacidades nuevas y archivos de laboratorio; sin modificar los contratos históricos por defecto.

### Corte 2 — Control de recuperación y cuarentena

- **Objetivo:** impedir ejecución cuando continuidad/fence no se acreditan; caracterizar cierre durante operación.
- **Componentes:** puertos/controlador y reconciliador de solo lectura de laboratorio; representación de estado de recuperación por aprobar.
- **Riesgos:** estado restaurado se autoacredita, ejecutores antiguos confirman o bloqueo incompleto se anuncia global.
- **Dependencias:** corte 1, D4/D6; modelo de fallo, autoridad independiente y alcance de todos los escritores.
- **Pruebas:** T08–T14, T20, T22 con fuentes/barreras simuladas antes de persistencia real.
- **Aceptación:** CLOSED/QUARANTINED rechazan antes del callback; ausencia de control nunca abre; caída/reinicio no elimina cuarentena; no se inventan filas.
- **Autorización:** representación durable/fence y futura persistencia solo en recursos nuevos. Una barrera operativa global sigue siendo otra autorización.

### Corte 3 — Recuperación coherente e inconsistente en laboratorio

- **Objetivo:** validar diagnóstico real de cortes coherentes, antiguos y parciales, conservando UUID/referencias.
- **Componentes:** herramientas nuevas de backup/restore y auditoría sobre bases/volúmenes sintéticos nuevos; repositorio Backend real intacto.
- **Riesgos:** confundir hashes internos con continuidad completa, adoptar recursos previos o presentar un dump como backup productivo.
- **Dependencias:** corte 2 y aprobación de recursos/procedencia de prueba D4; reutilizar principios de aislamiento, no recursos anteriores.
- **Pruebas:** T08–T14, T20–T22; datasets parciales preparados explícitamente y etiquetados.
- **Aceptación:** detección antes de habilitar comandos; cero reparaciones automáticas, cero llamadas link al diagnosticar; informe distingue pérdida recuperable de irrecuperable.
- **Autorización:** crear recursos nuevos y ensayos destructivos solo de recursos propios nuevos expresamente incluidos; nunca bases operativas o evidencias históricas.

### Corte 4 — Retención, archivo y reserva de claves

- **Objetivo:** demostrar que mover/purgar resultados no libera una clave consumida.
- **Componentes:** almacenamiento privado/índice/archivo y herramientas de laboratorio según alternativa seleccionada.
- **Riesgos:** ventana sin clave, restore resucita claves libres, tombstone se anuncia como resultado exacto; exposición de label/digest.
- **Dependencias:** cortes 1–3, D2/D3/D4; política de consulta/retención y capacidad de almacenamiento medidas.
- **Pruebas:** T05, T06, T15–T18, T21; crash en cada paso de traslado y carreras con replay/limpieza.
- **Aceptación:** un recibo o reserva exacta protege la clave siempre; archivo caído no activa link; tombstone sin resultado permanece desconocido y bloqueado; restore respeta claves consumidas.
- **Autorización:** alternativa/plazos justificados, datos mínimos y protocolo de eliminación; nuevo DDL solo si se autoriza aparte, sin desactivar hoy el trigger histórico.

### Corte 5 — Adaptación de autenticación real sin alterar AuthCore

- **Objetivo:** probar composición con verificador/puertos existentes y política vigente de capacidades en laboratorio.
- **Componentes:** adaptador privado y fixtures JWT/grants/sujetos de prueba; transporte técnico candidato aislado.
- **Riesgos:** permisos inventados, servicio suplanta usuario, revocación cacheada y filtración de historia.
- **Dependencias:** corte 1 y control del corte 2; D5/D7, disponibilidad de puertos reales. No requiere activar HTTP público.
- **Pruebas:** T07, T19, T23–T25; tokens exclusivamente sintéticos, claves de ensayo nuevas.
- **Aceptación:** credencial válida es necesaria pero no suficiente; revocados/suspendidos/inactivos no obtienen bypass; rotación mantiene namespace y aislamiento entre sujetos.
- **Autorización:** política y transporte elegidos, alcance de pruebas/adaptador; AuthCore y PasswordReset siguen intactos. Si sus interfaces no bastan, registrar bloqueo técnico.

### Corte 6 — Orden concurrente y revisión de preparación

- **Objetivo:** caracterizar el orden actual y, solo si se aprueba, ensayar una alternativa coordinada de suspensión.
- **Componentes:** arnés de carreras, puertos de elegibilidad/revisión/fence y auditoría de escritores. No se cambia Membership.status operativo.
- **Riesgos:** afirmar prioridad a partir de sleeps/relojes; deadlocks; writers que eluden el punto común.
- **Dependencias:** cortes 2/3/5 y D6; inventario de escritores antes de garantizar coordinación real.
- **Pruebas:** T02/T03/T04, T20, T26/T27 con barreras antes/después del punto definido; primero simulación sin setters operativos.
- **Aceptación:** ambos órdenes solapados explicados por evidencia; si se ensaya fence, ejecutor antiguo no confirma después del punto acordado; límites distribuidos explícitos.
- **Autorización:** política de orden y participantes; cualquier actualización de estado incluso en ensayo real debe autorizarse expresamente. Integración operativa, migraciones y activación pública siguen fuera.

## 10. Matriz de pruebas futuras y aceptación

**No ejecutadas en este corte.** U = unitarias/contrato; L = laboratorio nuevo;
I = integración de autenticación/coordinación con interfaces reales, solo bajo
alcance aprobado. No sumar resultados históricos a estas pruebas futuras.

| ID / nivel | Escenario | Criterio verificable |
| --- | --- | --- |
| T01 U/L | Misma clave/digest, lookup y replay repetidos | Resultado histórico idéntico; cero callback extra para éxito recuperado |
| T02 L | Misma clave/digest concurrentes con barrera de ausencia | Un recibo y a lo sumo un efecto confirmado; admitir intentos abortados |
| T03 L | Misma clave/digests distintos concurrentes | Un ganador; perdedor sin Vehicle extra y conflicto tras observar clave; agotamiento UNKNOWN sin éxito falso |
| T04 L | Dos dueños y misma placa; mismo dueño con claves distintas | Exclusividad Backend; UUID/label legado conservados; sin exponer otro propietario |
| T05 U/L | Rechazo sin recibo y reuso posterior | Demostrar límite SUCCESS_ONLY_V1; no comparar con intención nunca persistida |
| T06 U/L | Normalización, namespace y digest/versiones alterados | Vectores deterministas; perfil incompatible rechazado; label persistido diferente válido no invalida digest del pedido |
| T07 U/I | Sin capacidad, credencial falsa, sujeto/binding cruzados | Sin callback ni filtración; rechazo actual no declara rechazado un éxito histórico |
| T08 L | Proceso cae antes/durante/después de commit | Antes: rollback observado; durante: UNKNOWN hasta evidencia; después: mismo recibo/UUID sin reconstrucción |
| T09 L | Lookup vacío mientras commit está en vuelo | NOT_OBSERVED seguido de SUCCESS posible; nunca fallo definitivo por ausencia |
| T10 L | Reinicio con volumen conservado y restore coherente | Hashes/cortes acreditados, UUID/resultados iguales; lector con cero repositoryCalls/workCalls |
| T11 L | Restore coherente antiguo pierde éxito reconocido | Control independiente detecta cobertura insuficiente; no readmitir clave borrada |
| T12 L | Vehicle presente sin recibo esperado y viceversa | Cuarentena antes de comandos; cero creación/reparación automática |
| T13 L | Ambos ausentes después de pérdida | Incompletitud detectada por procedencia externa; local vacío no certifica nunca ejecutado |
| T14 L | Binding cruzado, dueño/UUID/plate incompatibles, FK aparentemente válidas | Diagnóstico explícito; no reasignar ni regenerar identificadores |
| T15 L | Archivado compite con submit/lookup; crash en cada paso | Clave siempre protegida por recibo/reserva; resultado íntegro o indisponibilidad explícita |
| T16 U/L | Tombstone con/sin digest y resultado eliminado | Sin callback; conflicto solo si acreditado, UNKNOWN si resultado no recuperable; sin SUCCESS fabricado |
| T17 L | Archivo/control indisponible o generación antigua | Fallo cerrado para ejecución afectada; no convertir errores en NOT_OBSERVED |
| T18 L | Replay antiguo tras purga/restauración/rotación | Misma identidad lógica y clave bloqueada; ningún efecto adicional |
| T19 U/I | Respuesta extranjera, namespace inesperado/digest alterado | Rechazo sanitizado UNKNOWN, sin exponer recibo; consulta ajena e inexistente con misma forma externa |
| T20 L/I | Cierre de recuperación con transacción en curso, proceso pausado y segundo primario | Fence/drenaje impide confirmación tardía según política; ausencia de coordinación impide declarar READY |
| T21 L | ACL/trigger/roles tras restauración | Lector sin escritura y writer limitado; inmutabilidad restaurada; fallar antes de abrir si falta protección |
| T22 L | Pérdida física simulada en recurso nuevo autorizado y backup incompleto | Declarar cobertura/RPO reales; preservar cuarentena si no puede acreditarse continuidad |
| T23 I | JWT expirado, ver antigua, usuario inactivo, membresía suspendida | Denegar comando/replay/lookup según política; recibo intacto, no permiso histórico |
| T24 I | Credencial técnica rotada/revocada; delegación forjada | Namespace estable tras rotar; revocado/forjado sin acceso; digest no actúa como autenticador |
| T25 I | Revocación de capacidad y cachés/archivo entre sujetos | Reautorización vigente; cero cuerpo o datos ajenos en respuesta/logs; medir diferencias de acceso |
| T26 L/I | Link/suspensión solapados en ambos órdenes y suspensión previa | Caracterizar órdenes permitidos sin prioridad ficticia; estado inelegible previo rechaza |
| T27 L/I | Alternativa lock/revisión/fence aprobada y writer no participante | Evidencia del punto común y rechazo de revisión obsoleta; inventario incompleto bloquea garantía estricta |
| T28 L | Integridad financiera y regresiones | Tablas fuera de Vehicle/recibo iguales; referencias financieras originales, guest membershipId=null; sin replay de dinero |

T28 y regresiones de perfiles anteriores aplican transversalmente a cada corte
que ejecute integración. Usar datasets, redes, volúmenes y evidencias nuevos,
fuentes operativas read-only y barreras deterministas; no pruebas en bases
operativas, no reutilizar/borrar recursos históricos ni reescribir sus evidencias.
Pruebas de lógica no sustituyen atomicidad real ni durabilidad del almacenamiento.

Puerta global de aceptación: scope aprobado por corte, matriz relevante aprobada,
ausencia de modificaciones fuera del alcance, Backend único escritor Vehicle,
ningún UUID o vínculo recreado para ocultar pérdida, resultados desconocidos
conservadores, acceso vigente y límites de RPO/revocación documentados. Pruebas
verdes de laboratorio no autorizan despliegue, tráfico ni nuevos dominios.

## 11. Decisiones pendientes de autorización

| Decisión | Propuesta para revisar | Consecuencia de no decidir |
| --- | --- | --- |
| D1 Semántica/perfil | Mantener SUCCESS_ONLY_V1 y sus límites; nueva capacidad para validación reforzada | No cambiar contratos ni prometer intención fijada desde primer paquete |
| D2 Replay y horizonte | No reutilizar claves consumidas; mantener reenvío explícito misma intención | Sin límite autenticado de admisión, reserva de claves sin fecha de purga segura definida |
| D3 Retención/archivo | Inicialmente conservar recibo; evaluar archivo íntegro más reserva exacta, plazos basados en servicio de consulta/backups/casos abiertos | No ejecutar limpieza ni elegir TTL arbitrario |
| D4 Recuperación | Control independiente, cortes/cobertura acreditados, responsables de cuarentena y RPO/RTO por definir | No prometer recuperación de pérdida física ni habilitar autoridad dudosa |
| D5 Permisos históricos | Mantener denegación vigente; reconciliación separada de solo lectura | No habilitar consulta de usuario suspendido/desactivado por tener recibo |
| D6 Orden de suspensión | Caracterizar orden actual; garantía estricta solo con punto común y escritores inventariados | Sin prioridad absoluta ni cambios a Membership.status |
| D7 Transporte/autenticación | Componer puertos existentes sin modificar AuthCore; seleccionar credencial técnica/delegación | No afirmar JWT/mTLS/revocación real probados ni compartir secretos |
| D8 Alcance de siguiente corte | Autorizar primero corte 1 privado; cada persistencia, recurso y ensayo adicional con alcance explícito | Solo diseño; ninguna implementación 4B.2 |
| D9 Intención durable/PENDING | Posponer salvo necesidad de auto-resume o reserva desde admisión | Caller conserva clave/payload; no recuperación autónoma de intención perdida |

Toda eventual tabla/migración, coordinación operativa, cambio de Backend o prueba
que escriba estados necesitará autorización específica. No se proponen cambios
financieros, traslado de Vehicle a Identity ni modificaciones AuthCore/PasswordReset.
FuelFlow, Primax Prime, Administration y Commerce quedan fuera del trabajo.

## 12. Estado de entrega y límite de este corte

Tras el commit de respaldo solo se crea este documento, sin staging ni segundo
commit. Verificación final: rama conservada, HEAD `747d3cd1ed4376fa6acf18fc15913b6e133a8326`,
seis ancestros iguales a la lista inicial, 19 altas en el respaldo, cero cambios
versionados y cero staging. Único archivo sin seguimiento: este documento.
Los 1094 archivos preexistentes conservan exactamente la huella de la sección 1;
enlaces locales, UTF-8 y whitespace del documento comprobados. Los siete commits
se conservan, sin push ni merge. No se ejecutan pruebas de producto/laboratorio
nuevas, tablas, migraciones, bases, servicios o tráfico; solo comprobaciones
estáticas documentales y de integridad Git/archivos.
**Detener aquí: implementar 4B.2 exige autorización expresa posterior.**

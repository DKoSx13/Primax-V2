# Identity A.4 — diseño de fase 2: persistencia experimental privada

Estado: **propuesta para revisión; ninguna persistencia implementada**.
Autorización de este corte: inspección local y creación exclusiva de este documento.
Las recomendaciones siguientes no constituyen decisiones de negocio aprobadas.

## 1. Base, preservación y comprobación previa

- Repositorio local: `AAA2/Primax-V2`.
- Rama verificada: `feat/dezkz-identity-a4-core`.
- HEAD: `b4594ef80bd923a449fc923b01159e2d4aeb3deb`.
- La rama `handoff/astra-identity-catalog-2026-11` conserva ese mismo commit.
- Los cuatro archivos de fases 0/1 siguen sin seguimiento y se preservan sin editar.
  No se hace staging, commit, push, merge ni cambio de rama.

Fuentes: `HANDOFF-ASTRA.md`, continuidad 5.10, informes de propiedad A.1, bloqueo
A.2, perfil A.3, contratos/auditoría de datos e
`identity-a4-invariants-and-core.md` en `Docs/astra/`. Se contrastaron además el
núcleo, los generadores vigentes, los esquemas y el DDL/adaptador privados A.1/A.3.

### Compatibilidad del núcleo TypeScript

`services/identity/tsconfig.json` configura commonjs, target ES2022, lib ES2022/DOM,
strict y rootDir src; incluye src/**/*.ts. El módulo nuevo usa interfaces borrables,
bigint, Promise y exports compatibles por inspección con esa configuración. No
introduce imports externos, decoradores, top-level await ni extensiones de import
TypeScript que necesiten opciones nuevas. El build emitiría el módulo dentro de
dist; compilar un archivo incluido no equivale a importarlo desde el runtime.

El archivo de pruebas usa el JavaScript compilado en ejecución normal y el fuente
solo cuando se pasa explícitamente --experimental-strip-types. La ejecución fuente
previa fue con Node v24.22.1; no se demuestra con ella soporte de ese comando en
todas las versiones admitidas por engines >=22. La eliminación de tipos no es
typecheck. No se modifica automáticamente ese mecanismo.

No hay tsc en PATH ni TypeScript instalado bajo services/identity/node_modules o
Backend/node_modules; tampoco se encontró en las ubicaciones globales Node/npm o
VS Code comprobadas. `npm.cmd root -g` identificó la ubicación global sin instalar
paquetes. Por tanto, **no se ejecutó comprobación estática con compilador**. No se
detectó incompatibilidad del núcleo por inspección; la compatibilidad de compilación
permanece sin confirmar. No se ejecutan npm install, npx, build ni generate.

La invocación inicial de npm.ps1 fue bloqueada por la política de PowerShell; la
consulta de ubicación se repitió con npm.cmd sin alterar la política del sistema.

## 2. Objetivo y arquitectura del laboratorio propuesto

Demostrar, únicamente con fixtures sintéticos, asignación y consulta privada de
número/contador/alias, integridad local y recuperación sin duplicar asignaciones.
No demostrar todavía registro público autónomo ni migración de membresías reales.

Flujo propuesto, sin código ni listener nuevo:

1. Runner privado valida opt-in sintético y crea sus propios recursos.
2. Caso de uso de provisión recibe IDs explícitos y una identidad de operación.
3. Núcleo puro existente formatea el ordinal; el adaptador controla SQL, locks,
   restricciones y transacción. No se implementa otro algoritmo de formato.
4. Adaptador implementa MembershipCodeLookup con una vista consistente de datos.
5. Pruebas consultan resultados y recibos; no hay conexión con Gateway o clientes.

El puerto de lectura existente permanece intacto. Un puerto de provisión futuro
sería privado del laboratorio y aceptaría operationId, membershipId, accountId,
aliases explícitos y versión del contrato/política. No aceptaría saldo, bienvenida,
status, Vehicle, permisos, documentos, contraseña ni credenciales humanas.

El propietario lógico futuro de número/contador/alias es Identity. Todos los
escritores y esquemas operativos actuales permanecen donde están. No se escribe
simultáneamente en la tabla compartida y el laboratorio; este último nunca es un
segundo maestro de datos reales.

## 3. Modelo recomendado, condicionado a aprobación

Propuesta: base nueva y esquema exclusivo `identity_a4_private`, sin objetos ni FK
en public, identity_private o esquemas de otros dominios. Los nombres son candidatos.
Se recomiendan cinco tablas: tres del dominio de códigos y dos auxiliares acotadas.
No se incluyen instrucciones DDL ejecutables en este documento.

| Tabla candidata | Campos principales | Papel y restricciones propuestas |
| --- | --- | --- |
| AccountReference | accountId UUID PK | Ancla local de fixtures; solo identificador sintético, sin cuenta, email, contraseña, active ni authVersion. No es una réplica de Account. |
| MembershipIdentity | membershipId UUID PK; accountId UUID UNIQUE NOT NULL; createdAt timestamptz(3) | Identidad estable de la membresía. FK local RESTRICT a AccountReference. Una membresía por cuenta en este laboratorio, conforme al vínculo actual. No contiene dinero, perfil ni status. |
| MembershipCode | code varchar(30) PK con comparación determinista exacta; membershipId UUID NOT NULL; kind CANONICAL o ALIAS; createdAt timestamptz(3) | Registro único de números y alias. FK local RESTRICT a MembershipIdentity. La misma clave no puede pertenecer a dos tipos o propietarios. |
| MembershipNumberCounter | id=1 PK; value BIGINT no negativo | Contador transaccional singleton, inicializado explícitamente en la base nueva; nunca una secuencia ni MAX+1 durante asignación. |
| AllocationReceipt | operationId UUID PK; requestDigest; contractVersion; policyVersion; membershipId UUID UNIQUE; canonicalCode; allocatedOrdinal BIGINT positivo; committedAt timestamptz(3) | Recibo de provisión sintética, insertado en la misma transacción. FK local a MembershipIdentity y al código/propietario canónico; vincula retry con el mismo resultado. No es recibo financiero. |

### Número y alias en una tabla

MembershipCode representa dos colecciones lógicas: números (kind CANONICAL) y
alias históricos (kind ALIAS). No se añade otra columna number mutable a
MembershipIdentity: la consulta obtiene el canónico desde el registro, evitando
dos maestros del mismo dato. El adaptador devuelve la forma { id, number } que
espera el núcleo; byAlias devuelve la identidad y su número canónico, no solo la
fila del alias.

Un índice único parcial sobre membershipId para kind CANONICAL impediría dos
canónicos. Ese índice **solo garantiza como máximo uno**. Para exigir exactamente
uno al confirmar, se propone una restricción diferida mediante constraint trigger
sobre los cambios de membresía/códigos, validando el estado final. Debe cubrir alta,
cambio y borrado de ambos lados, no solo el camino feliz del adaptador. El runner
no permitirá sesiones que deshabiliten triggers; el escritor no tendrá DELETE ni
UPDATE sobre identidades/códigos. La implementación SQL/Prisma de esta regla debe
probarse; no se afirma que Prisma pueda expresarla íntegramente en su esquema.

El recibo debe referenciar el par (code, membershipId) mediante clave candidata
única; además, una comprobación diferida debe exigir kind CANONICAL. Así no basta
referenciar cualquier código de otra membresía o un alias del mismo propietario.
El único tipo de recibo previsto es provisión inicial completa; la edición de alias
no forma parte de este primer laboratorio.

### Validación e identidad

- Propuesta para fixtures nuevos: clave almacenada ASCII en mayúsculas, 4..30
  caracteres [A-Z0-9-], coherente con el núcleo. Los canónicos además cumplen la
  sintaxis PRIME-<letras><001..999>. Los aliases no se fuerzan a esa sintaxis.
- Comparación exacta determinista (por ejemplo collation C), no citext ni
  comparación dependiente de collation del entorno. La normalización de entrada
  se elige por contrato; no se oculta en el puerto SQL.
- Validar en adaptador y SQL; un CHECK debe rechazar espacios, caracteres ajenos,
  sufijo canónico 000 y tipos inválidos incluso al eludir el adaptador.
- Campos code, kind, membershipId, accountId y recibos son inmutables para el rol
  del laboratorio. Sin endpoints de renumeración, transferencia o eliminación.
- Las FK locales impiden alias y recibos huérfanos. No existen FK a tablas reales.
- membershipId y accountId se suministran desde un manifiesto sintético explícito.
  No se generan de nuevo al reintentar ni se infieren por código/email/DNI.
- AccountReference comprueba existencia del ancla local, **no** existencia,
  actividad ni autoridad de una cuenta en A.1/A.3 o producción. Sus fixtures se
  crean antes de provisión; no se afirma atomicidad de alta de Account en este corte.
- Los fixtures pueden reproducir UUID de un conjunto sintético A.1/A.3 en recursos
  nuevos para comprobar correspondencia. No se leen ni copian bases existentes.

El registro único cambia la capacidad de admitir colisiones respecto al esquema
vigente. Se propone solo para el futuro laboratorio, pendiente de aprobación; no
es una limpieza ni una migración silenciosa de datos operativos.

## 4. Concurrencia y asignación transaccional

Diseño del comando privado propuesto, todo contra una única base nueva:

1. Validar opt-in, IDs, lista de alias, modo explícito de normalización y versión.
   Construir un digest determinista del comando inmutable. No incluir secretos.
2. Abrir una transacción SERIALIZABLE con esperas/tiempo acotados. Si existe recibo
   para operationId, comparar todos los bindings/digest/versiones y devolver el
   mismo resultado; datos distintos implican conflicto.
3. Bloquear la fila id=1 del contador y volver a comprobar el recibo. Toda provisión
   y carga de códigos del laboratorio respeta este mismo orden de bloqueo. Un
   snapshot serializable obsoleto puede abortar: no asumir que reconsultar refresca
   automáticamente la instantánea de PostgreSQL.
4. Crear MembershipIdentity con los UUID suministrados y reservar primero sus alias
   explícitos. Si un alias pertenece ya a otro miembro o tipo, abortar sin renombrar,
   fusionar o omitirlo. Duplicados en la petición se reportan; no se borran en silencio.
5. Incrementar el contador mediante UPDATE RETURNING en esa transacción. Formatear
   con el núcleo. Intentar insertar la clave CANONICAL. Solo un conflicto de la PK
   code permite omitir el candidato ocupado y continuar; no ignorar otras
   restricciones. No usar una excepción SQL capturada para seguir en una transacción
   abortada: usar inserción condicional dirigida a esa clave o savepoint definido.
6. Cuando el candidato queda reservado, insertar AllocationReceipt y comprobar
   invariantes diferidas. Confirmar membresía, aliases, canónico, contador y recibo
   en el mismo commit. Solo después devolver éxito.

Reservar aliases antes del candidato evita asignar como canónico un alias de esa
misma petición. La PK única protege también contra otro escritor concurrente que
intente reservar una clave; no basta con un SELECT previo ni un mutex en Node.

La reserva de claves en **ambos** tipos es la diferencia propuesta frente al
asignador actual, que omite solo Membership.number. Debe aprobarse expresamente;
la implementación productiva no se sustituye.

### Errores, reintentos y límites

- Reintentar la transacción completa, con mismos IDs/operationId, solo ante
  serialización/deadlock reconocidos; propuesta de máximo cinco intentos, con
  demora acotada, pendiente de confirmar en el diseño ejecutable.
- Una carrera sobre operationId requiere rollback y lectura en transacción nueva
  del recibo ganador; devolverlo solo si coincide el comando. No reintentar
  indiscriminadamente cada P2002/23505.
- Conflictos de accountId, membershipId o alias son definitivos y distintos de un
  candidato canónico ocupado. FK, formato y restricciones no son reintentables.
- Contador inexistente produce error de preparación, sin crear otro contador ni
  calcular MAX+1 como fallback. Ningún ordinal se entrega antes del commit.
- Antes de exceder BIGINT firmado se rechaza la asignación sin wraparound. El
  adaptador también verifica varchar(30). El núcleo no debe truncar ni convertir
  el ordinal a Number. Inicializar el contador en el límite se ensayará con fixtures.
- Acotar candidatos/tiempo por transacción para evitar bucles largos bajo muchos
  códigos ocupados; agotar el presupuesto aborta y revierte todo. El presupuesto
  será configuración técnica del laboratorio, no renumeración de datos históricos.

## 5. Fallos, resultado incierto y recuperación

| Situación prevista | Resultado requerido |
| --- | --- |
| Error antes de commit, incluso tras incremento o reserva de aliases | Rollback completo de membresía/códigos/contador/recibo; anclas preparadas antes permanecen |
| Violación al validar exactamente un canónico | Commit rechazado y rollback completo |
| Dos conexiones asignan simultáneamente | Serialización/constraints producen números distintos; ningún propietario duplicado |
| Respuesta perdida después de commit | Mismo operationId y bindings recuperan el recibo, sin asignar otro número |
| Operación todavía en vuelo y recibo no visible | Ausencia no prueba rollback; retry con la misma identidad compite mediante locks/unicidad y consulta resultado, sin inventar éxito/fracaso |
| Caída o timeout de PostgreSQL | Error explícito/resultado incierto; no fallback en memoria, no nuevo operationId automático |
| Reinicio del proceso llamador | Debe conservar el comando y sus IDs para consultar/reintentar; el recibo no reconstruye una identidad de petición perdida |
| Recibo contradice código/UUID | Fallo cerrado y diagnóstico; no reparar o reasignar automáticamente |

El operationId y comando sintético deben quedar conservados por el runner/llamador
antes del intento. No se requiere otro servicio para este laboratorio, pero perder
esa identidad impide prometer idempotencia al reiniciar. El recibo es de provisión;
no se reutilizan los diarios/recibos técnicos V2 ni se amplía su autoridad.

Mantener todos los recibos y códigos durante este corte: sin GC ni reutilización.
Un backup de código no es backup de PostgreSQL. Una futura restauración debe
incluir anclas, identidades, códigos, contador, recibos y manifiesto del llamador
desde un punto coherente. No recomputar el contador por MAX ni aceptar backup
parcial silenciosamente. Restaurar en otro laboratorio nuevo y bloquear escrituras
si faltan bindings o el manifiesto no corresponde.

Un restore consistente atrasado conserva solo su punto de recuperación, no commits
posteriores ya reconocidos. Conservar el manifiesto de resultados esperados permite
detectar la pérdida y bloquear; para recuperar esos commits se necesita otro backup
o WAL. No se promete cero pérdida sin definir/probar RPO y procedimiento de recuperación.

Para pruebas normales se propone PostgreSQL nuevo con tmpfs y proceso lector/escritor
en loopback. Eso no acredita durabilidad tras destrucción del almacén. Un ensayo de
durabilidad requeriría, con autorización posterior, un volumen exclusivo recién
creado y comprobado por identificador del ensayo, sin reutilizar volúmenes existentes.
También puede comprobarse caída del proceso Node manteniendo viva la base sintética.
Debe distinguirse ese caso de reiniciar/destruir el contenedor PostgreSQL con tmpfs.

## 6. Compatibilidad con A.1/A.3 y aislamiento

- No modificar schemas, SQL, clientes generados, adaptadores ni evidencias de A.1/A.3.
  Ambos DDL existentes crean identity_private: no deben concatenarse ni aplicarse
  sobre el mismo esquema. A.4 tiene base/esquema y cliente propios.
- AccountReference es un ancla de prueba de UUID, sin cuentas ni perfiles duplicados.
  La posible integración futura con Account en un esquema Identity propio requiere
  otro diseño; no crear FK hacia Account de una base A.1/A.3 existente.
- El laboratorio no ejecuta AuthService.register ni conecta su persistencia a
  AuthCore/PasswordReset. Tampoco introduce copias de grants, status o Vehicle.
- Prohibir cargar .env operativo y rechazar URLs externas, nombres de base no
  creados por el runner o volúmenes preexistentes. Loopback por sí solo no demuestra
  que una base sea nueva: comprobar propiedad del recurso y nonce del ensayo.
- Rol instalador limitado al recurso nuevo; rol de ejecución sin DDL/DELETE ni
  lectura de dominios ajenos. Permisos por tabla/columna para permitir solo altas,
  lecturas y actualización del contador. Sin actualización de claves/recibos.
- El runner usa credenciales nuevas y no registra contraseñas/URLs completas.
  Evidencias sintéticas nuevas con nombre exclusivo; no recrear las históricas.
- Detener únicamente recursos identificados como propios. Cualquier limpieza
  destructiva y política sobre volúmenes requeriría alcance aprobado adicional.

Estas medidas preservan por ausencia de integración AuthCore, reset, registro,
membresías/vehículos reales, finanzas, bienvenida, FuelFlow, Prime y Backend. No son
una nueva regresión funcional de esos componentes ni una autorización de despliegue.

## 7. Alternativas de negocio y recomendación técnica

Todas las recomendaciones son propuestas, no políticas activadas.

| Decisión | Alternativa | Ventaja | Riesgo y compatibilidad | Recomendación |
| --- | --- | --- | --- | --- |
| Colisión canónico/alias | Conservar precedencia canónica y comparación específica actuales | Reproduce los dos comportamientos legados | Mantiene ambigüedad; no impide colisión entre tablas | Mantener como fixture negativo de compatibilidad en memoria, no confundir con política resuelta |
| Colisión canónico/alias | Registro único; rechazar nueva colisión | Prevención en la base, una clave/un propietario | No puede representar sin decisión una colisión histórica; omitir candidatos reservados cambia el asignador | Preferida solo para nuevos fixtures, si se autoriza; datos ambiguos se reportan y bloquean, nunca se reescriben |
| Colisión canónico/alias | Renombrar/eliminar alias o fusionar propietario | Facilita una carga aparente | Rompe tarjetas, UUID y relaciones; imposible deducir ganador legítimo | No recomendar automatización; exige decisión caso por caso y plan separado |
| Normalización | Exacta | Reproduce helpers y claves actuales; no amplía coincidencias | No reproduce llamadores que hacen trim/uppercase | Almacenar claves exactas validadas; modo de entrada obligatorio por operación |
| Normalización | Trim+uppercase explícito | Compatible con Alerts y otros llamadores que ya lo hacen | Puede juntar entradas antes distintas; necesita analizar colisiones y caracteres de entrada | Ensayar como modo declarado, sin convertirlo en default global |
| Normalización | Reparación OCR, quitar guiones o transformar prefijos | Puede mejorar captura de imagen | Adivina identidad y mezcla gramáticas; incompatible con conservación exacta | Fuera del laboratorio; OCR requiere contrato propio |
| Unicidad conjunta | Dos tablas e índices independientes | Se parece al esquema legado | No evita colisión cruzada; validar con SELECT tiene carreras | Solo comparación de comportamiento, insuficiente como prevención |
| Unicidad conjunta | Dos tablas y guardia/registro común transaccional | Mantiene tablas separadas | Complejidad de sincronización, triggers y duplicación de claves | Alternativa posible, menos simple para este corte |
| Unicidad conjunta | Registro único con kind | PK garantiza exclusividad entre ambos tipos | Requiere invariantes de exactamente un canónico y aprobación de política | Modelo recomendado descrito arriba, condicionado a autorización |
| Identificadores históricos | Preservar UUID y código antiguo como alias | Mantiene referencias y reconocimiento | Exige retención y tratamiento explícito de conflictos | Recomendado; sin borrar ni reutilizar en este corte |
| Identificadores históricos | Nuevos UUID con tabla de mapeo | Permite modelo separado | Multiplica identidades y exige migrar todos los lectores/FK | No recomendado para A.4; fixtures nuevos sí pueden tener UUID propios, luego inmutables |
| Membership.status | Mantener autoridad/proveedor actuales | Conserva unidad de lectura y decisiones vigentes | Identity no es aún autónomo en estado | Recomendado ahora; omitir status del esquema A.4 |
| Membership.status | Trasladarlo a Identity o dividir afiliación/elegibilidad | Límite lógico potencialmente más claro | Carrera con efectos financieros, nueva semántica y coordinación | Diseño posterior y autorización; no una réplica TTL ni cambio de nombre del campo |
| Vínculo Vehicle | Mantener comando transaccional actual tras un puerto futuro | Conserva exclusividad, estado y UUID | Dependencia transitoria del proveedor legado | Recomendado; esta fase 2 no implementa siquiera ese puerto de escritura |
| Vínculo Vehicle | Mover solo el vínculo a Identity | Acerca la autoridad lógica aprobada | Requiere autoridad de placa/existencia, orden ante revocación y consistencia con operaciones | Corte posterior con pruebas reales y autorización |
| Vínculo Vehicle | Copiar Vehicle completo | Simplifica joins locales | Duplica maestro y excede propiedad autorizada | No recomendar |

Un alias igual al canónico de su propia membresía también requiere decisión: el
registro único representaría una sola clave CANONICAL. No eliminar automáticamente
la fila histórica redundante ni afirmar que byAlias conserva idéntica procedencia;
clasificar y pedir aprobación antes de cualquier importación. La fase 2 propuesta
no importa datos reales y no intenta resolver esos casos históricos.

## 8. Riesgos técnicos y mitigaciones

| Prioridad | Riesgo | Mitigación de diseño y límite |
| --- | --- | --- |
| P0 | Datos reales/volúmenes confundidos con laboratorio | Recurso nuevo demostrado por runner, URL propia, rol limitado y sin carga de .env |
| P0 | Dos maestros o cambio del registro público | Cero integración/routing; fixtures únicamente; conservar transacción actual |
| P0 | Colisión cruzada y otro propietario | PK conjunta propuesta, FK y rechazo explícito; aprobación de política antes de implementar |
| P0 | Alias huérfano o miembro sin número | FK locales y validación diferida de exactamente un canónico, probada al commit |
| P0 | Retry tras resultado desconocido asigna otra identidad | IDs/operationId estables, recibo atómico, binds inmutables y consulta/retry con la misma identidad |
| P1 | Snapshot inconsistente entre byNumber y byAlias | Adaptador de consulta ligado a una transacción de lectura con snapshot consistente; no compartir un transaction client global |
| P1 | Prisma no representa CHECK/índice parcial/trigger | DDL de laboratorio futuro explícito y pruebas SQL negativas; no suponer que el schema generado contiene todas las garantías |
| P1 | Reintento indiscriminado de conflictos | Clasificar serialización, operationId, candidato ocupado y conflictos definitivos por separado |
| P1 | Contención del contador o exceso de candidatos | Orden de locks fijo y timeout/presupuesto; sin secuencia o caché local de números |
| P1 | Restauración atrasada pierde commits reconocidos | Manifiesto de resultados, restore coherente y fallo cerrado; RPO/WAL a definir, sin prometer recuperación inexistente |
| P1 | Normalización cambia identidad o hash financiero | Modo explícito/versionado; conservar input para bindings; no tocar huellas operativas |
| P1 | Schema nuevo cambia A.1/A.3 | Base/esquema/cliente separados y cotejo SHA-256 de los archivos anteriores |

Para lecturas, un futuro adaptador enlazado a snapshot REPEATABLE READ o superior
puede satisfacer las dos consultas del núcleo. Debe abrir/cerrar la transacción
por resolución y devolver una proyección mínima. No ampliar el puerto actual ni
afirmar snapshot solo por usar la misma conexión.

## 9. Archivos candidatos para una implementación futura

Solo se crearían después de autorización; ninguno existe por efecto de este diseño:

- `services/identity/prisma/lab-owned-membership-a4.prisma`: cliente exclusivo.
- `services/identity/lab/owned-membership-a4.sql`: DDL solo de laboratorio nuevo,
  no dentro del directorio de migraciones productivas.
- `services/identity/lab/owned-membership-a4-store.cjs`: adaptador de provisión,
  consulta consistente y recibos; podría cargar el núcleo compilado independientemente.
- `services/identity/lab/owned-membership-a4-store.test.cjs`: pruebas unitarias del
  adaptador y clasificación de errores, sin afirmar consistencia real con mocks.
- `tools/astra/identity-owned-membership-a4-lab.cjs`: recursos nuevos, fixtures,
  concurrencia, fallos y cotejos de preservación.
- `Docs/astra/identity-a4-phase2-private-persistence-results.md`: resultados reales
  posteriores, sin reescribir este diseño ni evidencias antiguas.
- Evidencia nueva con nombre exclusivo bajo `Docs/astra/evidence/`, revisada antes
  de publicar; ningún commit/push se deduce de aprobar el ensayo.

La forma de cargar/compilar el núcleo debe decidirse tras disponer del compilador
existente, sin ejecutar generate/build del runtime a ciegas. Si se necesita agregar
configuración o instalar dependencias, informar y acordar el alcance antes.

No modificar core.ts, su README/prueba, documentos previos, package scripts,
schemas actuales, snapshots, AuthCore, PasswordReset, Commerce, Gateway o clientes
como parte implícita de esa futura implementación.

## 10. Pruebas previstas y criterios de aceptación

**Ninguna prueba PostgreSQL ni conexión a base se ejecutó en este corte.**

| Grupo futuro | Casos mínimos | Criterio de aceptación |
| --- | --- | --- |
| Preparación/aislamiento | Rechazar URL ajena, base/volumen existente, falta de opt-in, falta de fila contador, rol indebido | No acceder a recursos externos ni reparar configuración silenciosamente |
| Restricciones | IDs huérfanos, dos canónicos, cero canónicos, alias sin miembro, recibo con alias/otro miembro, clave inválida, ordinal negativo | SQL rechaza, incluido commit diferido; ausencia de filas parciales |
| Numeración | 999/A001, A999/B001, Z999/AA001, ordinal >2^53, contador al límite, código canónico/alias ya ocupado | Formato intacto, sin conversión a Number ni reutilización de clave |
| Concurrencia | Dos procesos/conexiones; altas de distintas cuentas; misma cuenta; mismo operationId igual/distinto; alias disputado | Sin duplicados, un ganador por identidad/clave; recibo coherente; rechazos clasificados |
| Rollback | Fallo tras alta, alias, incremento, reserva canónica, recibo y validación al commit | Se revierten todos los efectos de provisión y contador; anclas preparadas intactas |
| Retry y respuesta perdida | Commit con respuesta perdida, petición aún en vuelo, Node reiniciado con manifiesto original | Mismo número/UUID/recibo y ninguna segunda asignación |
| Lectura | Canónico, alias histórico, desconocido, puerto caído y dos lecturas con escritura concurrente | {id, number} estable dentro del snapshot, ausencia distinta de error, sin datos financieros |
| Normalización | exact y trim-uppercase por contrato; alias no canónico; equivalencias/collisiones sintéticas | Sin defaults implícitos, sin reparación OCR ni reescritura de códigos |
| Restauración | Punto consistente, backup incompleto/desalineado/atrasado, command manifest perdido | IDs/contador/recibos coherentes o escrituras bloqueadas; no afirmar rollback por ausencia |
| A.1/A.3 | Anclas sintéticas comunes en recursos nuevos, hashes de archivos y sentinela ajeno | Cuenta/perfil previos intactos; FK solo locales; sin préstamos de credenciales o URLs |
| Preservación | Hashes de tracked y cuatro archivos previos; ausencia de imports/rutas nuevos | Cambios solo en rutas aprobadas; FuelFlow/Prime/backend operativos desconectados del ensayo |

La aceptación exige resultados reales documentados por grupo, no sumar pruebas
históricas ni presentar casos en memoria como concurrencia/durabilidad. Una prueba
de reinicio con tmpfs destruido no es recuperación durable. Fallos previos de CI y
timeouts de autenticación no quedan resueltos por aprobar este laboratorio.

## 11. Comprobaciones de este corte y puerta de implementación

Comprobaciones realizadas: rama/HEAD/status; lectura de configuración y fuentes;
localización de compilador sin instalaciones; hashes SHA-256 de los cuatro archivos
anteriores; comparación de archivos tracked con HEAD y revisión de whitespace del
documento nuevo. No se repitieron las 15 pruebas de fase 1 ni sus cotejos históricos.

Hashes de referencia de fases 0/1 para cotejo final:

| Archivo | SHA-256 |
| --- | --- |
| Docs/astra/identity-a4-invariants-and-core.md | DE92C539D263A8BAD44F382854E52397FE6BAE764E0413DC6BFACB9A533F1ADA |
| services/identity/src/membership-codes/core.ts | AAD8489A0322638FFCCCC2259457BE325E0BAA0377274778D9B07E1A41981B21 |
| services/identity/src/membership-codes/README.md | 1FD70E9AA8012574197970CECF0E136C362F5DE40888ABC04DBCA4CD2B5926FD |
| services/identity/test/membership-codes.test.cjs | 24BF19B31A95F588A7A25E1B9C9DBC32D570758C2A5C71D0EE3ACFAA9E6DA01E |

Antes de implementar se requiere autorización nueva que elija al menos: registro
único o alternativa, política de colisión y códigos redundantes, normalización de
entrada/almacenamiento, anclas de UUID, recibo de provisión y alcance de recursos de
recuperación. Status y Vehicle se excluyen del esquema recomendado; moverlos exige
una decisión posterior independiente. Aprobar este documento no activa políticas,
persistencia, migraciones, tráfico, commits ni publicación.

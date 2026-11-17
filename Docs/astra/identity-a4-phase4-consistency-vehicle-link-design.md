# Identity A.4 fase 4 — consistencia entre proveedores y vínculo Vehicle

Estado: **diseño técnico, no implementado**. Único cambio autorizado: este documento.
No se modifica código, esquema, contrato público, propiedad física, configuración,
evidencia ni dato. No se ejecutan pruebas, migraciones, conexiones a bases o
servicios, ni commit/push/merge. Todas las propuestas siguientes necesitan un
nuevo alcance de implementación autorizado; no constituyen decisiones de negocio.

## 1. Base verificada y alcance de la inspección

Rama: `feat/dezkz-identity-a4-core`. HEAD inicial y final esperado:
`a4dc5f59505b4088de1c50c2b8cbed8a95f9b27a`. Árbol limpio antes del diseño.
Cinco commits consecutivos preservados sobre el handoff b4594ef:

| Commit completo | Contenido |
| --- | --- |
| df68f698620fcd8a17a4c06256f96d7c7934e95d | Invariantes, núcleo y persistencia A.4 fases 0–2 |
| b314f408b865d56bed0e765f44e7de3b5226da13 | Diseño fase 3 y lecturas 3A |
| 4b41af38219b510dc053e07cf9115c859e7f9bca | Seguridad de alcance Control |
| c74d20415a620f695a4119a6079b1a5cd4f5a7ec | Integración privada y paridad 3B |
| a4dc5f59505b4088de1c50c2b8cbed8a95f9b27a | Expectativa de seguridad del comprobador |

Se captura una línea base SHA-256 de los 1060 archivos preexistentes. Al cierre
solo debe aparecer este documento sin seguimiento; los 1060 deben ser idénticos.

Continuidad revisada: `HANDOFF-ASTRA.md`, informes de propiedad A.1/A.3 y diseño
RecoveryPolicyPort A.2, `identity-a4-invariants-and-core.md`, diseño/resultados de
persistencia fase 2, diseño de lecturas fase 3, resultados 3A/3B y sus componentes.
No se reabren PasswordReset, AuthCore, Administration ni Commerce autónomos.

La inspección de `Backend/src`, `Backend/gateway`, `services/identity/src` y
consumidores FuelFlow/Prime no encuentra importaciones/rutas públicas de los
componentes A.4 del laboratorio. `Backend/gateway/routes.cjs` usa el destino
llamado `identity` para membresías/vehículos; ese nombre no significa A.4:
`Backend/src/apps/identity/main.ts` carga módulos legados. El runtime separado de
`services/identity/src/main.ts` también conserva sus adaptadores y guardas de
perfil sintético, sin importar A.4 lab. Confirmación limitada al repositorio;
no se audita la configuración ni conectividad de instalaciones externas.

Resultados de 3B consultados, **históricos para este diseño**: 58 unitarias,
13 grupos de integración, 22 comparaciones, 42 comprobaciones HTTP (40 Control)
y 14 grupos de regresión fase 2. Sus evidencias siguen en
`Docs/astra/evidence/identity-a4-phase3b-*` y
`identity-a4-phase2-a4-85c364e550500e4aae7b7b61.json`.
No son pruebas de concurrencia distribuida. 3B usó fixtures estables, dos bases
del mismo clúster nuevo, actores sintéticos y DDL derivado del schema; no toda la
cadena de migraciones/triggers. No acredita frontend, JWT real o finanzas completas.

Control conserva AND y validación de alcance del tercer commit. El comprobador
se actualizó en el quinto, manteniendo OCR y autorización. El texto del informe
3B sobre expectativa obsoleta describe su corte histórico; la etiqueta de log
del runner 3A sigue antigua. No se altera ninguno de esos antecedentes.

## 2. Comportamiento vigente de Vehicle y dependencias

Fuentes principales:

- `Backend/src/vehicles/vehicles.repository.ts`: `link`, `membership`, `findByPlate`, `list`.
- `Backend/src/vehicles/vehicles.service.ts`: autorización member, normalización,
  vínculo y lectura posterior enriquecida.
- `Backend/src/vehicles/{vehicles.controller,plate.dto,create-vehicle.dto}.ts` y
  `Backend/src/memberships/profile.dto.ts`: rutas, validación y cleanText.
- `Backend/src/prisma/prisma.service.ts`: `atomic`; `Backend/src/common/document-conflict.ts`
  y `http-error.filter.ts`: clasificación de conflictos/errores.
- `Backend/prisma/schema.prisma`: User, Membership, Vehicle y referencias de
  Transaction/FuelAuthorization; FK históricas restrictivas en migraciones.
- `services/identity/src/persistence/{vehicles.repository,identity-db,atomic}.ts`:
  implementación compatible existente, no el store A.4.
- `services/identity/src/adapters/{vehicles.service,financial-reads}.ts` y
  `services/identity/src/ports.ts`: vista financiera delegada tras vincular.
- `services/identity/lab/{membership-a4-read.ts,membership-a4-read-store.cjs,
  membership-a4-compatible-read.ts,membership-a4-legacy-read-provider.cjs}`:
  lecturas experimentales y composición de 3B.

### 2.1 Semántica exacta de link

1. `POST /api/v1/vehicles` usa el DTO, y `VehiclesService.create` exige actor
   member. No toma un userId propietario del body: utiliza actor.userId.
2. La placa se recorta, convierte a mayúsculas, elimina espacios/guiones y vuelve
   al formato `XXX-999`; el DTO acepta tres alfanuméricos y tres dígitos. Label
   pasa por cleanText y debe medir 1–80 caracteres. Esto no es normalización de
   códigos de membresía ni prueba de propiedad legal de un vehículo.
3. `VehiclesRepository.link` ejecuta `db.atomic`: lee Membership por userId con
   User.active, exige ACTIVE y usuario activo, y después busca Vehicle por plate.
4. Placa inexistente: crea Vehicle y asigna membershipId. Placa registrada sin
   dueño (`membershipId=null`): actualiza vínculo/label conservando Vehicle.id.
5. Otro dueño: ConflictException. Mismo dueño: devuelve el registro sin cambiar
   label ni UUID. **Primero comprueba elegibilidad incluso al repetir el vínculo**.
6. No hay operación pública de transferencia, desvinculación o borrado en las
   rutas revisadas. No se añade una como compensación técnica.
7. El servicio, tras el commit de link, hace otra lectura `findByPlate` para
   construir la respuesta. Un fallo de esa lectura puede ocurrir con vínculo
   ya confirmado. En el runtime Identity compatible la vista además es remota.

El UUID es la identidad estable; plate tiene índice único y membershipId una FK
local a Membership. Hay muchos vehículos por membresía y dueño opcional por
vehículo. SQL garantiza unicidad del texto almacenado; no se encontró en el modelo
una restricción que haga equivalentes todas las grafías de placa. La exclusividad
de una placa normalizada depende también de los escritores y validaciones.
No se deben fusionar variantes históricas ni reconstruir UUID automáticamente.

Límite concreto de la evidencia anterior: los fixtures de vehículos de
`tools/astra/identity-a4-compatible-read-scenarios.cjs` se insertan directamente
con placas como `T0A003`, sin pasar por el DTO. Su paridad de lectura no demuestra
normalización de POST/link (`T0A-003`). Se conservan esos fixtures y resultados;
las pruebas futuras de vínculo deberán cubrir explícitamente el formato público.

`PrismaService.atomic` usa Serializable, hasta cinco intentos, y reintenta P2034,
P2002 elegible y SQLSTATE 40001/40P01 vía P2010, con backoff. Conflictos documentales
definitivos no se reintentan; el agotamiento genera 503. No es un recibo durable ni
un reintento HTTP garantizado. Dos procesos de una misma autoridad pueden servir
comandos sobre la misma base; autoridad única no exige un único proceso.

**Límite de concurrencia actual:** exclusividad e invariantes se resuelven dentro
de esa base, con restricciones y reintentos. No se ha probado en este corte toda
carrera. Si suspensión/desactivación se solapa con link, Serializable admite un
orden serial equivalente; no garantiza que una revocación que confirme antes del
commit físico de link siempre lo preceda en ese orden. No hay aquí bloqueo
explícito de User/Membership en link ni protocolo obligatorio de todos sus
escritores. No se diagnostica una explotación; se identifica una garantía que
no debe prometerse sin decisión y pruebas específicas.

### 2.2 Lectores y efectos que deben conservarse

| Consumidor | Dependencia exacta y conservación |
| --- | --- |
| Prime | `Frontend_2_PrimaxPrime/js/services/index.js`: POST vehicles y refreshData tras respuesta; usa m.vehicles y selección por placa; alias local de UI no es MembershipCodeAlias |
| FuelFlow | `Frontend_1_FuelFlow/src/js/{apiClient,plateCamera,membershipCode,script}.js`: GET vehicles/:plate, código capturado, status, aliases y proyección financiera |
| OCR | `Backend/src/vehicles/recognition.service.ts`: candidato de placa normalizada y búsqueda como kiosk; código reconocido no autoriza vínculo ni venta; gramática de membresía A/AA sigue fuera |
| Commerce actual | `Backend/src/transactions/{authorizations.service,transactions.service,transactions.repository}.ts`: coteja placa, UUID, código/alias, User.active y Membership.status en sus propias operaciones |
| Pagos/bienvenida | `Backend/src/payments/{welcome,payment-lifecycle,online-orders}.ts` y wallet/rewards: mantienen sus escritores, recibos y referencias; ningún callback de link debe ejecutarlos |
| Control | `Backend/src/control/control-customers.service.ts`: alcance por actividad/estación y grants, independiente de que un actor member pueda vincular |

POST vehicles mantiene el 201 normal de Nest tras respuesta correcta; 400 de
DTO, 401 del guard, 403 de actor/elegibilidad, 409 de dueño ajeno y eventual 503
por conflicto temporal. El filtro HTTP actual fija body/path/timestamp y puede
traducir P2002 a 409. El contrato privado no sustituye esos mapeos.
GET vehicles lista solo para member y conserva orden/paginación; findByPlate
oculta a un miembro ajeno con 404, mientras permite el contexto kiosk vigente.
No convertir kiosk en propietario ni concederle el comando de vínculo.

## 3. Matriz de autoridades y escritores

Autoridad física vigente y recomendación conceptual se separan. No hay una
transferencia de propiedad por escribir esta tabla.

| Dato | Autoridad/escritor actual identificado | Autoridad conceptual propuesta y límite |
| --- | --- | --- |
| User.id, User.active, autenticación y authVersion | Backend/AuthCore y adaptadores compatibles; registro en `users/users.repository.ts`; desactivación anidada desde `control/control.service.ts`; guard consulta autoridad vigente | Cuenta Identity conceptual, pero AuthCore sigue operativo. No reutilizar authVersion como versión de vínculo/estado |
| Cuenta/perfil A.1/A.3 | Stores privados de fixtures y esquemas propios de laboratorio | Solo experimental; AccountReference A.4 no acredita actividad de una cuenta remota |
| Membership.id/userId | Transacción de registro del proveedor compartido; copias compatibles bajo sus límites sintéticos | Identity conceptual, UUID preservados; A.4 no sustituye registro ni infiere accountId=userId |
| Número, contador y alias operativos | `Backend/src/users/{users.repository,membership-number,membership-code}.ts`; migración histórica de numeración/alias | Identity conceptual; registro único A.4 es solo política experimental, sin resolver colisiones históricas por defecto |
| Códigos/recibos A.4 | `services/identity/lab/owned-membership-a4-{store.cjs,port.ts}` y SQL privado | Autoridad únicamente sobre el dataset sintético, sin estado, Vehicle ni dinero |
| Membership.status | Campo operativo compartido; creación ACTIVE y consumidores existentes; no se identificó setter público de suspensión en la búsqueda de Backend/src | Mantener proveedor actual. Autoridad final y todos los escritores externos/futuros siguen por acordar; ausencia de endpoint no prueba ausencia de SQL/scripts |
| Vehicle.id/plate/label y membershipId | `Backend/src/vehicles/vehicles.repository.ts`; implementación compatible en `services/identity/src/persistence/vehicles.repository.ts` | Vínculo exclusivo, responsabilidad conceptual Identity; materialización sigue en Backend. Propiedad completa de Vehicle no transferida ni decidida |
| Datos demo/fixtures Vehicle | `Backend/prisma/seed.ts` hace upsert con update vacío; herramientas nuevas de 3B crean fixtures | No son un escritor productivo nuevo ni una fuente maestra. Inventariar también scripts/importaciones antes de imponer normalización/versionado global |
| Balance, deudas, puntos, pagos, reservas, bienvenida y referencias financieras | `wallet/wallet.repository.ts`, `transactions/*`, `payments/*`, `rewards/*` del Backend; registro habilita bienvenida | Proveedores actuales/Commerce conceptual; ningún escritor A.4 |
| Perfil ligado a recibos | `memberships/memberships.repository.ts` y `transactions/transactions.service.ts` mediante saveReceiptProfile | A.3 privado no reemplaza estos escritores ni permite separar su transacción automáticamente |

Los dos repositorios link existentes no autorizan dos bases dueñas de la misma
placa. Para un futuro comando debe existir **una autoridad lógica y una sola
materialización de escritura**; el adaptador remoto delegaría a ella. No activar
ambos repositorios contra bases independientes para luego reconciliar dueños.

## 4. Consistencia de lecturas: lo demostrado y lo que falta

3A toma un snapshot local READ ONLY/RepeatableRead de identidad y códigos; sus
bindings son un manifiesto sintético inmutable. 3B resuelve esa identidad, lee
un ancla legada y luego me o vehicles. Comprueba coincidencia de IDs/número y
pertenencia de vehículos, pero son lecturas separadas. Me también compone datos
mediante varias consultas legadas. No hay transacción distribuida ni detección
de todos los cambios entre esas observaciones.

`observedAt`, updatedAt y un TTL son observaciones, no barreras de autorización.
Timestamp igual no prueba ausencia de cambios; actualización y reversión puede
producir ABA; una versión de sesión no versiona Ownership/Status. Un número/alias
correcto tampoco prueba pertenencia actual del vehículo ni habilita consumo.

Propuesta de niveles privados, para decidir antes de implementar:

| Nivel | Garantía/limitación |
| --- | --- |
| Observación 3B actual | Coincidencia de identificadores en fixtures/observaciones; ninguna promesa de frescura o atomicidad global |
| Vista operativa local coherente | Una transacción de lectura del proveedor materializa identidad legada, estado y vínculo; A.4 se compara fuera de ella. Mejora un lado, no crea snapshot entre bases |
| Vista con versiones acreditadas | Cada autoridad entrega epoch y revisión; el consumidor comprueba binding/compatibilidad. Solo sirve si todos los escritores relevantes incrementan las revisiones atómicamente |
| Decisión de comando | La autoridad de escritura revalida dentro de su transacción y aplica el orden acordado; no acepta una vista de lectura como permiso durable |

Ante inconsistencia, candidato privado no apto: error explícito sin cuerpo
mezclado, sin saldo inventado ni fallback que amplíe permisos. El tráfico legado
seguiría elegido mientras A.4 esté apagado; esto no autoriza un nuevo fallback
público. No reintentar una lectura que reconcilia/escribe: `/admin/check-plate`
y alertas no se convierten en queries puras por su nombre.

## 5. Riesgos de concurrencia y fallos

| Riesgo | Prioridad | Medida propuesta / límite |
| --- | --- | --- |
| 1. Modificación simultánea entre autoridades | P0 para comandos | Una escritura autoritativa, revalidación local; consulta remota previa no sustituye coordinación |
| 2. Lectura desactualizada o ABA | P1 para vista; P0 si se usa para autorizar | Metadatos/revisiones de fuentes y rechazo de mismatch; no decidir vínculos/finanzas por TTL |
| 3. Pérdida de comunicación | P1 disponibilidad; P0 si abre acceso | Error UNAVAILABLE/resultado desconocido según fase, sin convertirlo en ausencia/elegibilidad |
| 4. Respuesta perdida tras commit | P0 | Hoy solo puede observarse estado actual; futuro recibo junto al vínculo en la autoridad, sin suponer rollback por timeout |
| 5. Suspensión/desactivación durante operación | P0 | Acordar orden serial admisible frente a barrera estricta; incluir cada escritor de estado y revocación relevante |
| 6. Dos propietarios/duplicación de placa | P0 | UNIQUE/FK y único escritor autoritativo; normalización versionada del DTO; nunca aceptar dos éxitos para dueños distintos |
| 7. UUID y referencias financieras mezclados | P0 | Conservar IDs y contexto de autorización/compra, sin remapear por placa/código o dueño actual |
| 8. Restauración parcial/retroceso de revisiones | P0 | Checkpoints por autoridad, epoch de recuperación y cuarentena antes de reanudar; las FK locales no detectan faltantes remotos |
| 9. Reintentos duplican efectos | P0 | operationId estable y digest en recibo autoritativo; entregas duplicadas posibles, efecto una vez por clave válida |
| 10. Fallo entre varios proveedores | P0 | Estado durable explícito y reconciliación; no compensar borrando Vehicle o revirtiendo dinero |

P0 indica bloqueo de una futura integración con esa garantía, no incidente
productivo demostrado por esta revisión. No se modificó ningún supuesto fallo.

## 6. Alternativas de arquitectura, sin selección automática

| Alternativa | Ventajas | Riesgos/requisitos |
| --- | --- | --- |
| A. Backend escritor de vínculo y elegibilidad; Identity delega | Mantiene unidad local, FK, IDs y lógica actual; menor cambio inicial | Dependencia del proveedor; no autonomía completa. El transporte necesita autenticación, plazos y clasificación de resultado desconocido |
| B. Versiones y comprobación optimista entre fuentes | Detecta respuestas obsoletas y facilita comparación/reconciliación | Leer dos veces o comparar solo en Identity deja otra carrera antes del commit; para impedirla se requiere fence/CAS aplicado por el escritor y participación de todos los cambios de estado |
| C. Un escritor + outbox/inbox y proyecciones de lectura | Recuperación de mensajes y consumidores idempotentes; ninguna doble escritura autoritativa | Proyección eventualmente consistente, atrasos y orden por agregado; no autoriza por sí sola un comando ni suspensión instantánea. Outbox junto al cambio local y retención/recuperación aprobadas |
| D. Reserva durable y confirmación coordinada | Orden explícito entre elegibilidad y vínculo, resultado recuperable | Ambos extremos durables, fencing, vencimiento acordado, cancelación/reconciliación, reserva contra la autoridad de placa. No basta token firmado/TTL. Cambia disponibilidad y orden de negocio |
| E. Transacción distribuida/2PC | Puede coordinar commits de participantes preparados que realmente lo soporten | Bloqueos en duda, recuperación coordinador, disponibilidad, backups y autorización aún por resolver; dos transacciones Prisma locales no son 2PC |
| Doble escritura independiente y reparación posterior | Independencia aparente | No recomendada para exclusividad: puede confirmar dos dueños y comprometer referencias financieras; no es una alternativa compatible sin nuevas reglas |

Recomendación técnica para evaluar primero: A en laboratorio y caracterización
del contrato actual; eventualmente C para proyecciones no autoritativas. B o D
solo después de acordar las garantías de suspensión y todos los escritores.
**No se selecciona ni activa una migración, outbox, reservas o autoridad nueva.**

### Versiones propuestas, todavía inexistentes

- `sourceEpoch`: identifica la generación/dataset de cada autoridad tras una
  recuperación. Un reloj no sustituye este fence; su autoridad/control de cambio
  debe acordarse. Un backup restaurado no debe fingir ser la instancia vigente.
- `eligibilityRevision`: cubre estado de membresía y actividad de usuario si una
  autoridad puede coordinarlos; si no, dos revisiones y protocolo entre autoridades.
- `bindingRevision`: cambio de propietario/referencia de placa, sin usar número
  de membresía como versión. `namespaceRevision` solo si se aprueba versionar códigos.
- Revisiones crecientes dentro de una generación; comparar epoch y revisión,
  nunca ordenar LSN de instancias distintas ni usar authVersion como sustituto.

No existen estas columnas/tokens como efecto del diseño. Todos los escritores,
scripts, importaciones y recuperación tendrían que respetar el mismo protocolo.
Las revisiones solo observadas al inicio no impiden cambios posteriores. Una
garantía estricta requiere validar el fence al confirmar, bajo el orden acordado.
Antes de añadir bloqueos, inventariar el orden existente de User/Membership/
Vehicle/recibos en todos los participantes para evitar ciclos y no romper los
bloqueos financieros actuales. `SELECT FOR UPDATE` de una placa inexistente no
reserva esa clave: la exclusividad debe seguir respaldada por UNIQUE en la única
autoridad y, si se aprueba una reserva previa, por su mecanismo durable de clave.

## 7. Contrato privado propuesto VehicleLink.v1

Es una especificación candidata, **sin endpoint, implementación o tabla nueva**.
No sustituye el puerto actual `Vehicles.link(userId, plate, label): Promise<void>`
de `Backend/src/identity-core/ports.ts` ni el POST público.

### 7.1 Puertos y autoridades

| Puerto candidato | Responsabilidad |
| --- | --- |
| IdentityBindingRead | Resolver user/account/member acreditados; conservar UUID y procedencia; sin mutaciones |
| OperationalVehicleRead | Consultar ancla, vehículo y pertenencia actual, con contexto member/kiosk autorizado según operación; sin dinero inventado |
| OperationalEligibilityRead | Vista informativa de active/status/revisiones si se aprueban; explícitamente no es permiso para el comando |
| VehicleLinkCommand | Delegar al único escritor de placa/vínculo; revalidación, transacción local y eventual recibo |
| VehicleLinkOperationRead | Consultar resultado durable por operación, con autorización propia; no ejecutar de nuevo el vínculo |
| VehicleLinkReconciliation | Puerto interno restringido que compara recibos/estado/proyecciones; no expuesto a clientes ni conectado en este corte |

Identity conoce el concepto de vínculo y orquesta la delegación; el adaptador
Backend conserva materialización y chequeos transaccionales actuales. El puerto
de comando no importa cálculos financieros. Las queries no llaman link, allocators,
receipts de provisión ni pagos. Un recibo A.4 de numeración no es un recibo de link.

### 7.2 Mensaje de comando candidato

| Campo | Tipo/regla propuesta | Autoridad y compatibilidad |
| --- | --- | --- |
| contractVersion | literal 1 | Versiona contrato privado, no HTTP público |
| operationId | UUID estable de la operación | Para idempotencia durable futura; hoy link no lo recibe. Nueva clave por reintento no recupera la operación original |
| callerIdentity / actorContext | Credencial técnica y principal member acreditado, con alcance de comando | No aceptar rol/userId libres del body ni compartir claves JWT; transporte nuevo requiere decisión específica |
| expectedMembershipId | UUID existente | Contrastar con membresía encontrada por actor.userId dentro de la autoridad; nunca crearla si falta |
| bindingReference | Referencia acreditada user/account/member del dataset | accountId no equivale a userId. Si no puede verificarse, detener candidato; no añadir columna operativa por inferencia |
| plate | string de placa normalizada con perfil del DTO actual | No aplicar reglas de códigos de membresía ni corregir datos históricos silenciosamente |
| label | string saneado actual, 1–80 | Mismo dueño no cambia label; no usarlo para transferir propiedad |
| normalizationProfile | Versión privada fija del algoritmo plate/cleanText existente | Digest sobre valores contractuales normalizados. Si cambia el algoritmo, versionarlo antes de aceptar replay |
| expectedEpoch/revisions | Opcionales solo como perfil de capacidad aprobado | No inventar revisión 0 ni afirmar fence donde el proveedor no lo soporta; sin capacidad requerida, error explícito |

El digest futuro incluiría versión, identidad del caller/principal, membershipId,
binding de dataset relevante, plate, label y perfil de normalización con una
codificación determinista acordada. No se guardan credenciales/tokens. Debe
acordarse qué equivalencias de entrada comparten digest; no heredar el digest de
ventas ni reemplazar el alias capturado de una compra por un canónico.

### 7.3 Semántica de ejecución propuesta y diferencias actuales

1. Verificar caller y principal actuales; validar DTO privado y binding. Rechazar
   actor ajeno sin consultar ni revelar su placa/recibo. La credencial técnica no
   concede permiso humano por sí sola.
2. En el proveedor, resolver membresía por usuario; comprobar expectedMembershipId,
   User.active y Membership.status en la unidad de escritura, no con una respuesta
   A.4 o caché como sustituto. Evitar una llamada remota con bloqueos SQL retenidos.
3. Ejecutar las mismas tres ramas: crear, asociar Vehicle existente sin dueño,
   o no-op para mismo dueño; conflicto para otro. No mover/eliminar Vehicle.
4. Si se autoriza recibo durable: escribir efecto y recibo inmutable en la **misma
   transacción del proveedor que modifica Vehicle**. Envolver por fuera el método
   link actual, que abre su propia transacción, no haría atómico el recibo.
   Haría falta una adaptación transaccional privada autorizada.
5. Misma clave y digest: un resultado durable; distinta petición con la misma
   clave: conflicto, sin cambiar label/vínculo. Otro operationId para el mismo
   dueño sigue siendo no-op de negocio, no edición de etiqueta.
6. Responder resultado de vínculo, no una vista financiera nueva. El adaptador de
   compatibilidad conserva aparte la lectura enriquecida y errores públicos.

Resultado candidato: `operationId`, `contractVersion`, `outcome=COMMITTED`, acción
`CREATED|LINKED_EXISTING|ALREADY_OWNED`, `vehicleId`, `membershipId`, `plate`, label
persistido, y epoch/revisión solo si están acreditados. La lectura durable puede
devolver `NOT_OBSERVED`, `COMMITTED`, `REJECTED` o `IN_DOUBT/RECOVERY_REQUIRED`
según protocolo aprobado. Sin registro de operación actual, no simular esos estados.

Errores privados candidatos: INVALID_INPUT, DENIED, NOT_FOUND (recurso ajeno o
inexistente según lectura), NOT_PROVISIONED/BINDING_MISMATCH, OWNERSHIP_CONFLICT,
IDEMPOTENCY_CONFLICT, STALE_REVISION, CAPABILITY_UNAVAILABLE, UNAVAILABLE y
OUTCOME_UNKNOWN/RECOVERY_REQUIRED. Son propuestas independientes de los errores
3A existentes y **no se añaden ni mapean a HTTP en este diseño**. Mensajes de
conflicto no deben revelar UUID o datos del otro propietario.

### 7.4 Decisiones de negocio que el contrato no puede ocultar

**Suspensión/desactivación:** alternativa compatible inicial: el orden serial
admisible actual para operaciones solapadas. Alternativa más estricta: una barrera
durable por agregado que coordine todos los escritores y haga preceder la
revocación según un punto acordado. La segunda no se obtiene con TTL ni con leer
active dos veces; requiere autorización sobre participantes, bloqueos/fences y
progreso durante caídas. Desactivación completada antes del inicio de una nueva
operación debe observarse como rechazo; no extender una autorización antigua.

**Replay tras suspensión:** hoy el mismo dueño recibe 403 si ya no es elegible,
aunque el primer link hubiera confirmado. Devolver 201 por un recibo histórico
cambiaría ese comportamiento. Recomendación a revisar: mantener autorización
vigente para la respuesta pública; recibo como resultado histórico interno,
consultable solo con permisos actuales del solicitante/reconciliador. No usarlo
para volver a habilitar una cuenta ni otorgar acceso a su proyección financiera.

**Response perdida y label:** el resultado durable de vínculo no es la respuesta
HTTP enriquecida original. Devolver un body financiero cacheado sería otra
política de frescura/acceso. Una placa propia consultada después puede confirmar
estado convergente, pero no demostrar qué petición lo creó ni recuperar el label
solicitado si la rama original era no-op. Retención y alcance del recibo requieren
decisión antes de habilitar replay.

## 8. Recuperación, reconciliación y reversión

| Punto del fallo | Conducta segura propuesta |
| --- | --- |
| Lectura A.4 o legada no disponible | Finalizar candidato con error; solicitud de lectura posterior toma otro snapshot. No crear datos faltantes ni inferir cero financiero |
| Antes de enviar comando | Sin evidencia de envío no hay efecto confirmado; conservar clave. Si no se sabe si se envió, tratarlo como dudoso |
| Aborto local conocido | Rollback local; reintentos acotados solo para fallos clasificados, con la misma intención. Ningún pago/bienvenida como efecto de link |
| Commit seguido de pérdida de respuesta | OUTCOME_UNKNOWN para el llamador; consultar recibo autoritativo con la misma clave. No ejecutar comando con otra clave |
| Falla lectura enriquecida después del vínculo | No revertir el vínculo ni dinero. Registrar separación entre resultado de comando y disponibilidad de la vista; conservar contrato público hasta aprobar adaptación |
| Caída/reinicio del orquestador | Recuperar intención durable solo si se aprobó almacenarla; sin ella no prometer recuperación automática. Estado en memoria no acredita commit |
| Publicación de evento falla tras commit | Si se aprueba C, outbox local conserva evento y reintenta entrega; inbox evita aplicar dos veces. No reenviar el comando financiero |
| Recibo ausente pero proveedor restaurado | Ausencia no demuestra rollback: detener reenvío hasta comprobar generación/checkpoint y registros correlacionados |
| Bases restauradas a cortes distintos | Cuarentena de integración/comandos afectados; comparar manifiestos y reconstruir proyección desde autoridad intacta, sin fabricar UUID/recibos |
| Conflicto de propietarios o referencias financieras | No elegir por timestamp, placa o saldo. Escalar discrepancia; sin unlink, delete, reasignación o compensación financiera automática |

Una futura reserva necesitaría estados durables PREPARED/COMMITTED/CANCELLED/
IN_DOUBT, número de fence, vencimiento definido por autoridad y consulta de
recuperación. Expirar la reserva no puede deshacer un commit confirmado ni liberar
una placa cuyo resultado está dudoso. La confirmación debe ser repetible; el
alcance de reservas y el coordinador son decisiones adicionales, no parte actual.

### Restauración y referencias

Diseñar un manifiesto de recuperación correlacionado con dataset/epoch de cada
autoridad, checkpoint local/outbox, recibos, versiones de contrato y bindings de
UUID. Los LSN/checkpoints se interpretan dentro de cada proveedor, no como reloj
global comparable. Si se necesita un corte coordinado, aprobar pausa/fencing de
escritores y protocolo de backup; una copia de dos bases en momentos diferentes
no lo proporciona. Las proyecciones regenerables no sustituyen la copia durable
de la autoridad, sus recibos o su historia de códigos.

Fase 2 comprueba contador/recibos y restauración **local**; no puede descubrir
por FK que el Membership operativo desapareció en otra base. Un contador válido
no prueba coherencia de todo el sistema. La recuperación debe validar también
correspondencia de miembros, Vehicle.id/membershipId, aliases, operaciones en duda
y referencias de Transaction/FuelAuthorization antes de reanudar.

Conservar los UUID históricos y relaciones financieras; no regenerar miembro o
vehículo por placa/email/código. Un vehículo antes sin dueño puede tener compras
históricas: vincularlo hoy no rellena retroactivamente membershipId en compras,
autorizaciones, recibos, deudas o puntos. TransactionsService preserva el contexto
de autorización y no convierte una compra guest en miembro por un alta intermedia.
La asociación actual de Vehicle no debe reinterpretar la evidencia de la venta.

## 9. Plan de validación sintética y criterios de aceptación

**Ninguna prueba de esta sección se ejecutó durante el diseño.**
S: puede caracterizarse después, con autorización de laboratorio, usando código
actual, recursos nuevos y datos sintéticos; no necesita decidir una arquitectura
distribuida nueva. D: depende de decisiones adicionales o componentes inexistentes.
S no significa autorización de implementación implícita.

| Caso | Nivel | Ensayo y criterio |
| --- | --- | --- |
| Dos usuarios, misma placa nueva | S | Barreras que solapen ambas transacciones; un solo Vehicle y dueño; nunca dos éxitos para distintos miembros. Caracterizar 409 frente a agotamiento 503, sin prometer éxito de todos los reintentos |
| Dos usuarios, placa existente sin dueño | S | Mismo UUID original; una asignación, otra denegada/conflictiva; no sobreescritura del ganador |
| Mismo usuario, reintentos concurrentes | S | Un Vehicle, UUID estable, ninguna edición de label al repetir. Si la creación compite con labels diferentes, el label ganador permanece |
| Suspensión antes del inicio | S | Fixture SUSPENDED ya confirmado; vínculo y repetición propia rechazados, sin cambiar Vehicle |
| Suspensión solapada | S/D | S caracteriza el orden serial permitido; D exige prioridad estricta solo tras aprobar barrera, escritores y punto de orden. No usar sleep como sincronización única |
| Desactivación de usuario | S/D | Completa antes del inicio: rechazo. Solapada: caracterizar guard y transacción por separado; prioridad estricta/revocación distribuida requiere protocolo |
| Caída del proveedor remoto | S | Fault injection en lectura de ancla/vista: indisponibilidad, sin cuerpo parcial o dinero cero; recuperación posterior sin escrituras |
| Respuesta perdida tras commit | S/D | S confirma vínculo existente pese a fallo de respuesta; no afirma recibo. D usa el recibo futuro y prueba mismo resultado/UUID tras reinicio, sin segunda escritura |
| Reinicio antes/durante/después | S/D | S verifica rollback/commit local por estado. D recupera intención/recibo durables y operación dudosa sin memoria del proceso anterior |
| Misma operationId, distinto contenido/caller | D | Conflicto de digest/identidad; ninguna modificación ni filtración; retención y ámbito de clave aprobados |
| Sin dueño / dueño propio / dueño ajeno | S | Rama, UUID, etiqueta y errores actuales; propio no cambia label, ajeno no revela datos; nunca transferencia implícita |
| Normalización | S | ABC123, abc-123 y espacios resuelven a ABC-123 por DTO; entradas inválidas 400. No añadir equivalencia a datos SQL históricos sin decisión |
| Aislamiento de lecturas | S/D | S: member A no lee Vehicle de B; kiosk conserva solo sus accesos existentes y no puede usar link; Control mantiene grants/estación. D: acceso a recibos del nuevo contrato, una vez implementado y autorizado |
| Estado cambia entre ancla y cuerpo | S/D | S detecta mismatches de IDs/código/vehículos que 3B verifica y registra lo no detectable. D verifica tokens de revisión/fence; nunca atribuir a S garantía de snapshot global |
| Restauración parcial con FK locales válidas | S/D | S reproduce discrepancia entre dos bases nuevas y exige bloqueo del candidato. D valida epochs/checkpoints, recibos y reanudación aprobada; ausencias dudosas no disparan reprovisión |
| Referencias financieras históricas | S | Fixtures con Vehicle sin dueño y referencias existentes: link solo altera vínculo/label permitido; Transaction/FuelAuthorization/recibos/saldos/puntos/bienvenida permanecen byte-equivalentes |
| Invitado que se registra durante entrega | S/D | Caracterización aislada de contexto de compra actual; sin reinterpretar membershipId/vehicleId por el dueño nuevo. Ejecutar transacciones reales de venta requeriría autorización y entorno completo específico |
| Alias y número ambiguos | S/D | S conserva diferencias legadas y política privada A.4; jamás elegir dueño por código global ante choque. Resolver colisiones históricas requiere decisión separada |
| Outbox duplicada, fuera de orden y perdida | D | Tras aprobar C: deduplicación, orden por agregado/epoch, huecos detectados, proyección reconstruible; ningún replay de comandos financieros |
| Reserva vence con confirmación dudosa | D | Tras aprobar D: no dos dueños, fence antiguo rechazado, consulta durable antes de liberar; particiones y reinicios reproducibles |
| Body y errores públicos | S/D | Comparar POST/GET vehicles, me, DTO/Parse/guard/filtro con autenticación real sintética y transporte privado propuesto. Perfil D si exige nuevos componentes; no cambiar 201/403/404 o redondeos para igualar |
| Regresión anterior | S | Núcleo/códigos, store/lecturas/composición, seguridad Control y OCR existente conservados; comparar resultados de ejecuciones nuevas, sin reutilizar conteos históricos |

Infraestructura futura: redes internas y bases/volúmenes nuevos o tmpfs con IDs
de ejecución; puertos de laboratorio no públicos, dependencias disponibles sin
instalación automática, imágenes fijadas y fuentes read-only. Fixtures propios,
sin copiar respaldos privados. Barreras/failpoints deterministas en arnés privado,
no modificaciones de código operativo para facilitar pruebas. Probar con conexiones
reales y aislamiento correspondiente; mocks no acreditan SSI, FK o durabilidad.

Para crash/restore usar almacenamiento **nuevo** que sobreviva al reinicio que
se ensaya; parar tmpfs y perderlo no es una prueba de recuperación durable. No
usar los recursos retenidos de 3B ni borrar otros contenedores/redes/volúmenes.
Para equivalencia con esquema operativo completo se necesitaría preparar solo
recursos nuevos con la cadena histórica autorizada, incluidos triggers; el DDL
de paridad 3B es suficiente para sus lecturas pero no prueba todos los efectos.

Criterios comunes: historial de eventos/errores por operación sin secretos;
snapshots antes/después; datos de negocio solo cambian donde el caso de vínculo
lo permite; ningún cambio financiero; ausencia de filas/UUID duplicados; no dos
dueños; estados dudosos explícitos; ninguna concesión por indisponibilidad;
fuentes/versions acreditadas; resultados reproducibles y fallos preservados.

## 10. Plan incremental propuesto y archivos candidatos

Todo corte requiere autorización posterior. No se comienza aquí ninguno.

| Corte propuesto | Alcance pequeño | Puerta de aceptación |
| --- | --- | --- |
| 4.1 Caracterización del proveedor actual | Pruebas S de link/normalización y carreras locales con el repo real, sin contrato público nuevo | Exclusividad, labels/UUID, orden observado y errores documentados, sin cambios financieros |
| 4.2 Consistencia de lectura privada | Comparador entre snapshots locales y fuentes que cambian, sin convertir lecturas en autorización | Clasificar lo detectable/no detectable, procedencia, errores y cero escrituras; ninguna promesa distribuida falsa |
| 4.3 Comando/recibo privado experimental | Solo si se aprueba autoridad/orden/idempotencia: efecto y recibo en proveedor sintético autoritativo | Respuesta perdida/reinicio/replay/digest y autorización actual demostrados; sin 2 transacciones independientes presentadas como una |
| 4.4 Reconciliación/backup | Si se aprueba protocolo: generaciones, manifiestos y, opcionalmente, outbox/inbox o reservas | Recuperación de cortes inconsistentes sin duplicar dueño ni reescribir referencias; particiones y reordenamientos cubiertos |
| Puerta posterior pública | Diseño y pruebas de transporte/guards/Gateway/consumidores con datos sintéticos | Revisión específica de autorización, CI y despliegue; ninguna activación automática |

Archivos nuevos candidatos, no creados:

```text
services/identity/lab/vehicle-link-contract.ts
services/identity/lab/vehicle-link-legacy-adapter.cjs
services/identity/lab/vehicle-link-consistency.test.cjs
tools/astra/identity-a4-vehicle-link-lab.cjs
tools/astra/identity-a4-provider-consistency-worker.cjs
Docs/astra/identity-a4-phase4-validation-results.md
```

Un recibo, outbox o reserva requeriría además un DDL **exclusivamente de laboratorio
nuevo**, en la autoridad aprobada; no se define una migración productiva. La
necesidad de cambiar `Backend/src/vehicles/vehicles.repository.ts` o el adaptador
compatible para una unidad transaccional distinta exigiría autorización expresa.
Los módulos/gateway/frontends, esquema operativo, AuthCore y código financiero
no son candidatos de modificación en estos primeros cortes privados.

## 11. Decisiones que requieren autorización

| Decisión | Alternativas y recomendación técnica para revisión |
| --- | --- |
| Autoridad física del vínculo | Mantener escritor Backend delegado frente a traslado posterior a Identity. Recomendar conservar Backend inicialmente; traslado exige plan de FK, escritores y corte sin dual-write |
| Autoridad definitiva de Membership.status y User.active | Preservar autoridades actuales o coordinar otra autoridad. No atribuir status a Identity/Commerce por conveniencia; inventariar todos los escritores antes de un fence |
| Orden suspensión/desactivación–vínculo | Orden serial actual frente a barrera estricta de prioridad. Caracterizar primero; elegir la segunda cambia disponibilidad y requiere participación explícita de escritores |
| Idempotencia durable y replay | Estado convergente actual frente a recibo autoritativo. Recomendar estudiar recibo para recuperar respuesta perdida, sin convertir automáticamente un 403 actual en éxito histórico |
| Clave/digest/retención | Alcance de caller, normalización, cambios de label, TTL/retención y acceso a recibos; no borrar claves mientras puedan existir reintentos/operaciones financieras referidas |
| Frescura de lectura | Observaciones separadas, snapshot operativo local o revisiones acreditadas. No usar caché/TTL como autorización; presupuesto/timeout y body parcial necesitan contrato aprobado |
| Reservas, outbox y coordinador | Ninguno, proyección eventual o protocolo durable. Adoptar solo por garantía requerida y pruebas de fallos, sin seleccionar automáticamente arquitectura nueva |
| Recuperación correlacionada | Checkpoint coordinado/pausa frente a reconstrucción de proyecciones desde autoridad intacta; definir epochs y quién levanta cuarentena, sin comparar relojes globales falsos |
| Propiedad completa de Vehicle | Mantenerla operativa; el alcance Identity conceptual se limita al vínculo. No trasladar atributos/filas por introducir un puerto |
| Desvinculación/transferencia/borrado | No existen como flujo público revisado; introducirlos sería negocio nuevo con referencias financieras y requiere otra propuesta |
| Compatibilidad futura | Transporte privado, mapeo de errores, autorización real, frontend/OCR y despliegue son puertas posteriores; aprobar laboratorio no abre rutas |

Entrega de este corte: un documento nuevo y el repositorio preservado. Se termina
en diseño; no se implementa la fase 4 ni se solicitan permisos sobre cambios
operativos todavía no preparados para revisión.

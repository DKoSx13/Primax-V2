# Identity A.4 — fase 3: diseño de lecturas privadas compatibles

Estado: **análisis y propuesta; sin adaptadores implementados ni integración**.
Este corte autoriza crear exclusivamente este documento. Las rutas privadas,
puertos, opciones y archivos candidatos descritos abajo todavía no existen.

## 1. Estado inicial verificado y alcance de la evidencia

- Rama: `feat/dezkz-identity-a4-core`.
- HEAD y rama original `handoff/astra-identity-catalog-2026-11`:
  `b4594ef80bd923a449fc923b01159e2d4aeb3deb`.
- Archivos tracked sin cambios frente a HEAD; 16 archivos sin seguimiento al inicio,
  enumerados con SHA-256 en el anexo. No se hace staging, commit, push ni merge.
- Se cotejaron los 1006 archivos de la línea base capturada antes de fase 2:
  **ninguno cambiado**, incluidos los cinco archivos protegidos de fases anteriores.
- Se capturaron hashes de los 1017 archivos actuales para cotejo al terminar este
  diseño. Las evidencias de fase 2 guardan resultados y checksum del snapshot SQL,
  no hashes individuales de todos sus fuentes: ese checksum no sirve como hash de
  código. El anexo establece una huella actual, sin inventar un manifiesto histórico.
- No se encontraron referencias a membership-codes, owned-membership-a4,
  identity_a4_private o A4_UNIFIED en los componentes operativos examinados:
  Backend/src, Backend/gateway, services/identity/src (excluido el propio núcleo y
  README), compose.yaml, workflows y los tres frontends. Se revisó además la
  composición de services/identity/src/main.ts. Compilar el núcleo por include de
  TypeScript no equivale a conectarlo al runtime.
- No se ejecutaron bases, pruebas, compilaciones, peticiones HTTP ni operaciones
  Docker en este turno. No se inspeccionó ni alteró un despliegue externo.

Se revisaron el handoff, las invariantes y el diseño/resultados A.4, junto con
controladores, servicios, repositorios, guard, filtro HTTP, Gateway y consumidores.

### Resultados de fase 2 revisados, no repetidos

| Evidencia en Docs/astra/evidence/ | Resultado registrado |
| --- | --- |
| identity-a4-phase2-a4-b4f0c1562bb88bce5263eacf.json | Fallo de preparación: servidor temporal listo antes de existir la base |
| identity-a4-phase2-a4-7d6f767235d024a0954650c4.json | 9 grupos primarios; restore fallido por stdin no transmitido |
| identity-a4-phase2-a4-388190850142658691857203.json | 12 grupos aprobados |
| identity-a4-phase2-a4-9ba6aa4ea5db19437c335595.json | 14 grupos aprobados: 1 typecheck y 13 integración; success=true |

El informe de fase 2 registra 23/23 unitarias en una ejecución distinta. No sumar
ensayos ni presentarlos como pruebas actuales. El typecheck registrado corresponde
al núcleo, no al proyecto entero. No hay aceptación HTTP/frontend de A.4.
La evidencia final registra PostgreSQL propio detenido y redes retenidas; no se
verificó nuevamente el estado de esos recursos en este corte.

## 2. Inventario de fuentes y consumidores

Todas las rutas de archivos son relativas al repositorio.

| Área | Fuentes exactas relevantes |
| --- | --- |
| Membresía pública | Backend/src/memberships/memberships.controller.ts; Backend/src/memberships/memberships.service.ts; Backend/src/memberships/memberships.repository.ts |
| Vehículos públicos | Backend/src/vehicles/vehicles.controller.ts; Backend/src/vehicles/vehicles.service.ts; Backend/src/vehicles/vehicles.repository.ts; Backend/src/vehicles/plate.dto.ts |
| Contratos documentados y reales | Backend/src/common/response.dto.ts; Backend/prisma/schema.prisma; Backend/src/common/pagination.dto.ts; Backend/src/setup-app.ts; Backend/src/common/http-error.filter.ts |
| Autorización vigente | Backend/src/auth/access.ts; Backend/src/auth/access.guard.ts; Backend/src/identity-core/domain.ts |
| Núcleo/puertos A.4 | services/identity/src/membership-codes/core.ts; services/identity/lab/owned-membership-a4-port.ts; services/identity/lab/owned-membership-a4-store.cjs |
| Runtime Identity sintético previo | services/identity/src/main.ts; services/identity/src/persistence/memberships.repository.ts; services/identity/src/persistence/vehicles.repository.ts; services/identity/src/adapters/memberships.service.ts; services/identity/src/adapters/vehicles.service.ts |
| Finanzas actuales | Backend/src/identity-adapters/membership-commerce.ts; Backend/src/wallet/wallet.controller.ts; Backend/src/wallet/wallet.service.ts; Backend/src/wallet/debt.ts; Backend/src/transactions/transaction.model.ts |
| Bridge privado previo | services/identity/src/ports.ts; services/identity/src/adapters/financial-reads.ts; services/identity/src/adapters/compatibility-port.ts; tools/astra/identity-compatibility-bridge.cjs |
| Control | Backend/src/control/control-customers.controller.ts; Backend/src/control/control-customers.service.ts; Frontend_3_PrimaxControl/js/control-api.js; Frontend_3_PrimaxControl/js/app.js |
| OCR | Backend/src/vehicles/recognition.controller.ts; Backend/src/vehicles/recognition.service.ts; services/identity/src/compatibility/vehicles/recognition.service.ts; PlateRecognition/app.py |
| FuelFlow | Frontend_1_FuelFlow/src/js/apiClient.js; Frontend_1_FuelFlow/src/js/membershipCode.js; Frontend_1_FuelFlow/src/js/primeBalance.js; Frontend_1_FuelFlow/src/js/plateCamera.js; Frontend_1_FuelFlow/src/js/script.js |
| Prime | Frontend_2_PrimaxPrime/js/services/membershipService.js; Frontend_2_PrimaxPrime/js/services/index.js; Frontend_2_PrimaxPrime/js/services/apiClient.js; Frontend_2_PrimaxPrime/js/services/transactionsService.js; Frontend_2_PrimaxPrime/js/services/rewardsService.js; Frontend_2_PrimaxPrime/js/services/walletService.js; Frontend_2_PrimaxPrime/js/app.js |
| Gateway | Backend/gateway/routes.cjs; Backend/gateway/server.cjs |

Fuentes de continuidad adicionales: Docs/astra/HANDOFF-ASTRA.md,
Docs/astra/identity-data-contracts-proposal.md y
Docs/astra/identity-data-fk-audit.md. Los contratos V2 candidatos de esos documentos
siguen siendo propuestas, no APIs que puedan consumirse ya.

### Qué permite y qué no permite A.4 actual

Actualmente resolve(code, normalization) devuelve identidad mínima y procedencia.
lookup(operationId) consulta un **recibo de provisión**, no una membresía por UUID.
No se debe reutilizar ese nombre como si operationId y membershipId fueran iguales.

A.4 no implementa todavía búsqueda por usuario/UUID ni listado público de alias,
y no contiene status, active, perfil, Vehicle o dinero. Su accountId es un ancla
sintética: no demuestra identidad con User.id. Por tanto no basta envolver resolve
para sustituir me/vehicles. La fase 3 necesita lecturas nuevas, mapeo explícito y
composición, manteniendo autoridad operativa y permisos en proveedores actuales.

## 3. Contrato interno propuesto: IdentityMembershipRead.v1

Primero como puerto tipado en laboratorio; transporte HTTP privado solo tras otra
autorización. No se agrega una ruta pública por UUID/usuario/código.

### Operaciones y selectores

| Operación candidata | Entrada obligatoria | Salida disponible en A.4 | Ausencia/limitación |
| --- | --- | --- | --- |
| byMembershipId | membershipId UUID | Identidad mínima y códigos en snapshot | NOT_FOUND si falta en dataset A.4 |
| byAccountId | accountId UUID | Misma identidad, por relación local única | No equivale a buscar User.id |
| forUser | userId derivado del actor o target Control autorizado | Usa IdentityBindingRead para userId → accountId → membershipId | MAPPING_UNAVAILABLE/NOT_PROVISIONED si no existe correspondencia acreditada |
| resolveCode | code string y normalization explícito | membershipId, accountId, canonicalNumber, matchedBy y matchedCode | INVALID_INPUT, NOT_FOUND o error de dependencia; nunca autocrear |
| aliasesForMember | membershipId UUID | Lista completa de aliases en ese snapshot | Lista vacía solo tras lectura exitosa y miembro existente |

Identidad mínima propuesta: contractVersion=1, membershipId UUID, accountId UUID,
canonicalNumber string y legacyNumbers string[]. En resolveCode, matchedBy es
CANONICAL o ALIAS y matchedCode es la clave consultada tras el modo explícito.
Son obligatorios en ese resultado; no se usa un campo number ambiguo para mezclar
entrada OCR y número canónico. byMembershipId/byAccountId no incluyen matchedBy.
Una lista vacía de alias es válida; un error no se representa como lista vacía.

No devolver AllocationReceipt, requestDigest, ordinal, contador ni su estado al
consumidor de lectura. No devolver status/vehicles/finance=null como si A.4 fuera
la fuente de esos datos. La identidad de códigos y la proyección compuesta son
contratos distintos.

Toda respuesta interna exitosa incorpora metadatos separados: sourceDatasetId,
source=A4 o LEGACY, observedAt UTC y schemaVersion. observedAt indica observación,
no versión de negocio. La base A.4 no tiene revisión distribuida: no inventar una
ni afirmar que sus timestamps igualan createdAt/updatedAt históricos.

### Identidad usuario-cuenta

IdentityBindingRead.v1 devuelve un vínculo explícito userId/accountId/membershipId
para el dataset autorizado. En laboratorio: manifiesto sintético fijo preparado
antes de las consultas y contrastado con ambas fuentes. No comparar por email,
DNI, número o similitud textual; tampoco asumir igualdad por formato UUID.

Fuera del laboratorio no existe aún una fuente aprobada de ese mapeo. Una futura
autoridad Identity podrá ofrecerlo, pero esta fase no migra cuentas ni crea otro
escritor. Si A.4 carece del fixture y el proveedor legado sí tiene la membresía,
clasificar NOT_PROVISIONED/PARITY_NOT_READY: no convertirlo automáticamente en 404
público, ni crear una fila A.4 desde la lectura.

### Errores internos y transporte opcional

Resultado tipado o error de dominio: FOUND, NOT_FOUND, INVALID_INPUT, DENIED,
NOT_PROVISIONED, BINDING_MISMATCH, UNAVAILABLE y INVALID_UPSTREAM_RESPONSE.
La implementación deberá distinguir explícitamente ausencia de indisponibilidad.

Si se aprueba un transporte privado, se propone un único POST de lectura con
selector discriminado, por ejemplo /internal/identity-a4/v1/read, excluido del
Gateway y sin publicación de puerto. Ejemplo de mapeo interno para revisión:
200 FOUND; 400 entrada inválida; 401 credencial técnica ausente/inválida;
403 servicio fuera de alcance; 404 ausencia dentro de alcance;
409 binding/dataset incoherente; 503 indisponibilidad/respuesta inválida.
Este mapeo es privado y pendiente: no añade esos estados a contratos públicos.

Servicio técnico autenticado no equivale a actor humano autorizado. TLS/credencial
y alcance por método deben reutilizar un patrón privado aprobado, sin repartir
JWT_SECRET ni modificar AuthCore. El ensayo TLS histórico no protege por inferencia
este nuevo salto. Para el primer laboratorio basta un adaptador en proceso con
actor de prueba ya verificado; eso tampoco prueba seguridad de transporte.

## 4. Matriz de compatibilidad HTTP y comportamiento

Prefijo existente /api/v1. Los estados se infieren del código inspeccionado,
no de una nueva ejecución HTTP. POST sin @HttpCode conserva el default Nest 201;
debe fijarse en fixtures de paridad antes de integrar.

### Rutas, permisos, ausencia y dependencia

| Contrato actual | Éxito/cuerpo actual | AuthN/AuthZ actual | Ausencia y errores observados por código | Composición privada propuesta |
| --- | --- | --- | --- | --- |
| GET /memberships/me | 200; objeto Membership expandido, user, vehicles y resumen financiero | Guard vigente; flujo member con userId del actor | Sin membresía 404; token inválido 401; usuario inactivo 403 en rama member; error SQL no convertido 500 | Binding + identidad A.4, resto del proveedor legado; inicialmente comparar, no servir A.4 |
| GET /memberships/me/transactions | 200; array paginado de transactionResponse | Mismo actor vigente | Sin membresía 404 en Backend; en runtime Identity sintético se delega al bridge; error preservado por perfil | Mantener proveedor/historial y membresía por UUID estable; no recalcular recibos |
| GET /memberships/me/rewards | 200; array paginado | Guard vigente | Igual distinción ausencia/dependencia; page/limit inválidos 400 | Passthrough del proveedor de puntos |
| GET /memberships/me/redemptions | 200; array con benefit | Guard vigente | Igual; no inventar [] al caer proveedor | Passthrough del proveedor de canjes |
| GET /vehicles | 200; array crudo de Vehicle con orden plate asc, page/limit | Servicio lista solo para actor member; devuelve [] para otros actores que alcancen el método | Sin filas []; paginación inválida 400; fallo SQL 500 | Owner derivado de actor y vehículo legado; A.4 solo valida vínculo de IDs |
| GET /vehicles/:plate | 200; id, plate, label, membership objeto o null | @MemberOrKiosk y guard vigente; miembro ajeno oculto con 404 | Placa inválida 400; inexistente/otro dueño 404; vehículo sin membresía sigue 200 con null | Fuente Vehicle legada + identidad y alias A.4 + perfil/finanzas legados, conservando todos los campos |
| POST /plate-recognition kind=plate | 201; plate nullable, confidence, threshold, recognized y vehicle nullable | @KioskOnly; firmas/sesión/clave según guard/configuración existentes | Imagen inválida 400; OCR deshabilitado/caído 503; placa válida desconocida puede recognized=true y vehicle=null | No cambiar OCR; aplicar lectura compatible solo tras resultado, conservando semántica |
| POST /plate-recognition kind=membership | 201; number capturado, confidence, threshold, recognized y membership nullable | @KioskOnly vigente | Código desconocido/umbral bajo: respuesta exitosa recognized=false; error de proveedor no es NOT_FOUND | Resolver código admitido por filtro vigente; status/placas desde legado; no ampliar gramática |
| GET /control/customers y /:userId | 200; lista o detalle de cliente con campos condicionales | Control vigente + ADMIN_CUSTOMER_VIEW y scope; campos según otros grants | Sin estaciones 403; detalle fuera de alcance 404; UUID inválido 400; error DB 500 | Backend mantiene elegibilidad por actividad y proyección; no búsqueda global A.4 expuesta |
| GET /control/memberships y /:membershipId | 200; lista o detalle de membresía | ADMIN_MEMBERSHIP_VIEW + guard Control/scope; detalle delega a customer con permiso interno añadido | 403 permiso/estación; detalle ausente/fuera de scope 404; UUID inválido 400 | Idéntica proyección legada con identidad cotejada; bloqueo de q explicado abajo |
| GET /control/vehicles | 200; lista con customer/membership nullable y evidencia operacional | ADMIN_VEHICLE_VIEW + scope por actividad | Sin filas []; falta scope/grants 403; fallo DB 500 | Leer Vehicle y evidencia en proveedor temporal; no crear Vehicle en A.4 |
| GET /memberships/me/wallet | 200; importes decimales y movements | Guard vigente; ruta Gateway a Commerce | Sin membresía 404; fallos conservados | No cambiar routing ni sustituir este proveedor |

El guard tiene ramas de firma kiosk anteriores al manejo normal de JWT/decoradores.
No se afirma que poner un decorator member garantice por sí solo toda la matriz:
probar solicitudes firmadas y actores inesperados en cada ruta antes de integrar.
Esta propuesta no agrega rechazos a esos contratos ni corrige AuthCore.

PATCH /memberships/me/profile y POST /vehicles siguen siendo escrituras fuera de
fase 3. Su respuesta final enriquecida depende de lecturas, pero el diseño no
repite la escritura para recuperar una lectura fallida ni promete rollback de un
commit anterior. /auth/login, /auth/register y PasswordReset permanecen fuera.

### Campos, tipos, obligatoriedad y procedencia

R = clave presente en la respuesta normal; N = nullable; C = presencia condicional;
estos significados no se confunden con atributos Swagger. Los servicios devuelven
más campos que response.dto.ts: la matriz preserva el cuerpo real, no lo reduce
al DTO documentado.

| Proyección | Campos/formatos a preservar | Procedencia y regla privada |
| --- | --- | --- |
| me: identidad | id, userId UUID R; number string R; status ACTIVE/SUSPENDED R | id/number A.4 solo tras binding verificado; userId/estado legado; accountId no se agrega al cuerpo público |
| me: perfil y metadatos | dni/passport/ruc/businessName R,N; createdAt/updatedAt UTC ISO R; user {name,email} R | Proveedor actual; no sustituir timestamps con fecha de provisión A.4 ni importar A.3 al runtime |
| me: bienvenida | welcomeAvailable boolean R; welcomeReservedOperationId/welcomeTransactionId UUID R,N | Proveedor financiero/legado; no omitir ni recalcular |
| me: finanzas | balance,reserved,available,total,pendingBalance strings decimales de dos posiciones R; points entero R | LegacyMembershipCommerce; available es balance y total incluye reserva según cálculo vigente. A.4 no hace aritmética ni convierte a Number |
| me: vehículos | vehicles array R; cada fila contiene id,plate,label,membershipId,createdAt,updatedAt del modelo | Legado; sin imponer un orden nuevo (la relación de me no define orderBy) |
| Vehicle listado | id UUID, plate normalizada, label, membershipId N, timestamps R | Modelo legado; arrays paginados, sin envelope ni total nuevo |
| Vehicle detalle | id,plate,label R; membership R,N | Legado; ausencia de vínculo no equivale a vehículo inexistente |
| Vehicle.membership | id,number,legacyNumbers[],status,name,balance,dni N,ruc N,businessName N,pendingBalance R | number/aliases comparables con A.4; todos los demás campos del proveedor. No añadir passport que este detalle no devuelve |
| OCR membership | number capturado R; confidence/threshold number R; recognized boolean R; membership R,N con {number,status,vehicles:[{plate}]} | number exterior puede ser alias; number interior es canónico. No agregar id ni finanzas a ese subobjeto |
| OCR plate | plate string N; confidence/threshold number; recognized boolean; vehicle R,N | Un reconocido puede no existir en base; conservar recognized y null independientemente |
| Control cliente | id de User, name,email,active,registeredAt; membership objeto o null; vehicles[]; lastActivityAt en lista u operations[] en detalle | Email enmascarado salvo global; ausencia por permiso no es fallo del proveedor |
| Control membresía lista | id de Membership,number,status,customer{id de User,name,email},createdAt,lastActivityAt N; balance C solo global | Mantener formas y omisiones, sin convertir campos restringidos en null/0 nuevos |
| Control membresía detalle | id,number,status,createdAt; balance y points C solo global | La forma difiere de lista y de me; no devolver un DTO universal |
| Control vehículos | id,plate,label,status=REGISTERED,customer N,membership N,lastActivityAt N,plateEvidence | REGISTERED es estado de proyección Vehicle, no Membership.status |
| Historiales | UUID, fechas ISO, decimales/recibos/nullables y orden actuales; arrays | Continuar transactionResponse y proveedores existentes; no reconstruir desde A.4 |

me no añade actualmente legacyNumbers por la consulta mostrada; ese campo pertenece
a Vehicle.membership. No ampliarlo por conveniencia. Los arrays de alias tampoco
tienen orden explícito en la consulta legada: se puede comparar equivalencia de
conjuntos internamente para diagnóstico, pero no reordenar el cuerpo público como
efecto de la integración.

### Errores y perfiles de compatibilidad

Distinguir dos perfiles de referencia, no mezclarlos en una promesa de paridad:
(A) Backend compartido actual; (B) runtime Identity sintético con CompatibilityPort.
El segundo ya convierte fallos de fetch/JSON/upstream no admitidos en 503, transmite
400/401/403/404/409 y usa timeout 4 s, sin redirects/reintentos. Backend directo
puede devolver 500 ante SQL no tratado. Gateway conserva 502 al fallar su upstream,
su timeout vigente y no reintenta operaciones.

HttpErrorFilter conserva statusCode, message (string o array), path y timestamp,
más detalles permitidos de errores financieros. No añadir matchedBy, provenance,
observedAt, códigos privados o bodies de upstream a respuestas públicas. En paridad,
congelar reloj o comparar timestamp por regla explícita; no ignorar otras diferencias.

Para un transporte nuevo se recomienda distinguir:
- 401 humano del guard: conservarlo como tal; Prime invalida sesión.
- 401/403 por credencial técnica entre servicios: error interno de dependencia,
  candidato a 503 del compositor; nunca hacerlo pasar por expiración humana.
- 404 de A.4 sin fixture frente a miembro legado existente: NOT_PROVISIONED.
- UUID/código que identifica a otra membresía entre fuentes: BINDING_MISMATCH,
  sin mezclar dinero/vehículos; bloquear el candidato experimental.
- Proveedor caído/respuesta mal formada: error, nunca finanzas 0 ni estado ACTIVE,
  ni []/null para simular un resultado exitoso.

Cambiar la propagación actual de CompatibilityPort no está autorizado. Los mapeos
nuevos y la diferencia entre 500/503 requieren aprobación antes de servir el
candidato; primero se observan en laboratorio sin alterar respuestas actuales.

## 5. Autorización, Control y OCR: fronteras que no se pueden inferir

### Autorización y alcance

La fachada recibe el actor ya verificado por AuthCore. userId, permisos, stationIds
y global no se aceptan de query/body del navegador. Una cuenta técnica solo puede
invocar sus métodos autorizados; no recibe lectura universal de PII por poseer clave.

Flujo member: derivar userId del actor, acreditar binding y ocultar recursos de otro
propietario como lo hace la ruta legada. Nunca exponer byUser/byUUID internos como
un buscador público. Flujo kiosk: conservar exactamente el acceso vigente de cada
ruta; no inventar filtrado de Vehicle por estación solo porque hay stationId en
actor, ni conceder privilegios Control. Una placa ajena a la estación no tiene
por sí sola un vínculo exclusivo con esa estación.

Control depende de grants vivos, aprobación, correo/asignaciones vigentes y
SYSTEM_ADMIN según guard. Las consultas además exigen su permiso específico.
Membership y Vehicle no tienen un stationId maestro: el alcance de esas vistas
se deriva de actividad Transaction/FuelAuthorization en las estaciones autorizadas.
Ese proveedor debe seleccionar los IDs permitidos y filtrar datos antes de enriquecer
con Identity. No pedir todos los usuarios a A.4 y filtrar únicamente en el navegador.

Preservar filtros, máscara de email, topes y orden: listas Control take=100,
detalle operations hasta 50; no sustituirlas por paginación de Prime. El detalle
de membresía añade ADMIN_CUSTOMER_VIEW internamente para delegar en customer; no
transformar eso en un requisito nuevo de grant al usuario sin decisión expresa.

### Hallazgo bloqueante de alcance con búsqueda q

En Backend/src/control/control-customers.service.ts, membershipStationFilter(ids)
devuelve un OR entre actividad de transacciones y autorizaciones. customers y
memberships construyen where expandiendo ese objeto y después otro objeto con
OR de búsqueda cuando q no está vacío. En JavaScript el último OR sobrescribe al
anterior: la condición de estación deja de formar parte de ese where. Los includes
de actividad/vehículos siguen filtrados, pero eso no vuelve a limitar las filas de
membresía seleccionadas ni los datos personales proyectados. La consulta vehicles
usa AND y no presenta esa misma composición.

Es un hallazgo estático concreto; no se ejecutó explotación ni prueba HTTP/SQL.
No se puede afirmar confidencialidad por estación de esas búsquedas ni copiar
ese resultado como criterio de seguridad aprobado. Alternativas:
1. Mantener Control totalmente fuera del primer corte experimental.
2. Autorizar por separado corrección acotada y regresiones del proveedor, usando
   conjunción de alcance y búsqueda; solo después fijar una referencia segura.
3. Simular la consulta corregida en laboratorio para diseñar el contrato; no
   describirla como paridad del código actual ni desplegarla silenciosamente.

Recomendación: opción 1 para iniciar lecturas A.4; una corrección de Control exige
autorización separada. No restringir unilateralmente q, cambiar permisos ni integrar
esas rutas para ocultar el problema.

### OCR

Se preservan el POST, imagen base64, kind plate/membership, umbral y respuestas.
RecognitionService solo consulta membresía cuando pasa su filtro de código y
confianza. PRIME-A001/PRIME-AA001 son válidos para el núcleo, pero las gramáticas
OCR Python/Nest actuales no cubren todos esos formatos. Registrar esa diferencia
no autoriza ampliar recognized=true ni corregir el OCR en fase 3.

En kind=membership, la respuesta exterior conserva el texto capturado; el interior
resuelve canónico/alias y consulta status/placas legados. recognized depende del
estado actual, no de que A.4 haya encontrado una clave. En kind=plate, Vehicle 404
se representa como vehicle=null sin borrar un reconocimiento válido; 503 no se
convierte en un falso 404. El candidato se revisa en FuelFlow y se vuelve a verificar
en backend: nunca usar OCR como autoridad de vínculo o de pago.

## 6. Arquitectura de lectura y puertos propuestos

Propuesta de flujo sin nuevos escritores:
actor verificado → fachada compatible → binding/selector → lectura de identidad
A.4 + proveedores legados de estado/perfil/Vehicle/finanzas → comprobación de UUID
→ serializador específico de ruta. Gateway mantiene sus rutas actuales.

| Puerto candidato | Responsabilidad | Adaptador propuesto y límites |
| --- | --- | --- |
| IdentityMembershipRead.v1 | Identidad por UUID/accountId/código y alias | SQL SELECT sobre A.4 en snapshot READ ONLY, rol exclusivamente SELECT; no reutilizar credenciales de provisión |
| IdentityBindingRead.v1 | Relación user/account/member del dataset | Manifiesto sintético fijo primero; futura autoridad pendiente. No sincroniza ni repara |
| LegacyMembershipProfileRead.v1 | status, perfil, datos de usuario y metadatos necesarios | Proveedor temporal externo a Identity; SELECT y proyección mínima por UUID |
| LegacyVehicleRead.v1 | listByMember y findByPlate, propiedad/existencia actuales | Proveedor legado sin nuevos writes ni copia Vehicle en A.4 |
| LegacyFinancialProjectionRead.v1 | Resumen/historial según perfil legado | Reutiliza proveedores/cálculos actuales; no SQL financiero en Identity |
| LegacyControlScopeRead.v1 | IDs/campos permitidos por actor y evidencia operacional | Queda fuera del primer corte; no replica Station/grants/operaciones |
| CompatibleMembershipView / CompatibleVehicleView | Composición/serialización por ruta | No es maestro de datos; falla ante binding incoherente y no inventa campos |
| ReadParityProbe | Comparación offline de referencia/candidato | Solo datasets sintéticos y métodos sin efectos; resultados fuera del cuerpo público |

Las firmas privadas deberán ser discriminadas por selector y devolver proyecciones
tipadas, no unknown universal. En esta fase solo se documentan; no se cambian los
puertos previos ni el resolve(): Promise<unknown> de fase 2.

### Composición financiera conservadora

Primera opción recomendada: tomar el cuerpo legado como referencia completa y
cotejar en sombra sus IDs/número/aliases con A.4. La respuesta sigue siendo la
legada, porque ese modo fue elegido antes de la solicitud, no por un fallback
oculto después del fallo experimental.

Para construir un candidato en laboratorio se puede reutilizar finance/me y
finance/vehicle del bridge privado actual. Esos contratos mezclan perfil y dinero;
no representan todavía autonomía financiera. finance/me recibe userId, por lo que
un wrapper por membershipId debe comprobar binding antes de invocarlo, sin cambiar
el proveedor ni buscar la cuenta financiera por número.

No recalcular puntos/pendiente/reservas ni usar A.4 como fuente de bienvenida. No
reescribir datos de comprobantes. LegacyMembershipCommerce ya usa un snapshot de
balance y consultas separadas: no prometer una instantánea distribuida más fuerte
al agregar observedAt. Distintos proveedores pueden observar momentos diferentes.

### Ausencia de modificaciones durante lecturas

Adaptador A.4 dedicado con SELECT y transacción READ ONLY; sin provision(), UPDATE
de contador ni acceso a recibos como efecto lateral. No crear/provisionar fixtures
faltantes desde una consulta. Preparación de datos, cuando se autorice, pertenece
al runner previo a las pruebas y no al camino de lectura.

Excluir /admin/alerts, /admin/dashboard y /admin/check-plate del sondeo genérico:
AlertsService.list reconcilia deudas y checkPlate puede escribir BusinessAlert.
Un POST de OCR es lectura de dominio, pero no se reintenta ni duplica automáticamente.
Las verificaciones de ausencia de escrituras cubren tablas de negocio; AuthCore/
kiosk puede mantener contadores de seguridad o sesiones en Redis según conducta
actual, que no debe eliminarse para hacer pasar una prueba de solo lectura.

### Disponibilidad y recuperación de lectura

Una operación privada tiene deadline explícito, sin redirects, sin reintentos
automáticos inicialmente y sin cachear decisiones de autorización. Mantener el
timeout actual de cada proveedor en su perfil de referencia; el presupuesto global
y posible deadline nuevo requieren aprobación y pruebas contra el Gateway.

Tras un error de lectura, cerrar/descartar la transacción, devolver error explícito
y permitir una solicitud nueva con un snapshot nuevo. No reciclar un transaction
client ni contestar con un body parcial anterior. La recuperación del proveedor
debe restaurar la siguiente lectura, sin comandos de compensación ni asignación de
operationId de provisión. Una lectura anterior no autoriza una operación financiera.

## 7. Riesgos y alternativas

| Prioridad | Riesgo | Alternativa/recomendación, sin activarla |
| --- | --- | --- |
| P0 | A.4 no tiene datos suficientes para la vista pública | Mantener proveedores y serialización legados; comenzar por identidad en sombra |
| P0 | userId/accountId inferidos o distintas membresías mezcladas | Manifiesto/binding acreditado, igualdad de UUID y rechazo del candidato |
| P0 | q elimina el filtro de estación en Control | No integrar Control; decidir corrección separada antes de aprobar paridad segura |
| P0 | Lectura termina creando miembros o duplicando escritores | Rol SELECT dedicado; prohibir provisión desde lookup y no sincronizar |
| P0 | Consulta devuelve dinero de otra cuenta o cero ante fallo | Binding antes de finanzas, propagación de errores, proveedor único de cálculo |
| P1 | A.4 carece de fila y se transforma en 404 público | Clasificar NOT_PROVISIONED; modo legado sigue elegido; no promoción |
| P1 | Snapshot local presentado como consistencia global | Metadatos de observación por fuente y fixtures estables; decisión posterior sobre frescura |
| P1 | Cambiar 401 técnico cierra la sesión Prime | Separar credenciales humanas/técnicas y aprobar mapeo del nuevo adaptador |
| P1 | Ampliar normalización altera alias o huella de compra | Modo explícito por operación; no canonicalizar el código enviado en reintentos de venta |
| P1 | DTO reducido pierde campos que usan clientes | Referencia del body real y serializador por ruta; ninguna nueva envoltura pública |
| P1 | OCR y gramática A.4 divergen | Paridad con behavior actual y casos negativos conocidos; corrección OCR separada |
| P1 | Listas cambian orden/topes, null u omisiones | Conservar consulta/proyección legadas; fijar reglas de comparación por ruta |
| P1 | Shadow duplica efectos indirectos | Allowlist de lecturas; excluir alertas y escrituras, sin espejo de compras |
| P2 | Dependencia del bridge carga artefactos Backend | Aceptar proveedor temporal explícito; no afirmar despliegue autónomo completo |

No se recomienda una réplica de perfil/estado/vehículos en A.4 para simplificar el
join: introduce frescura, revocación y otro ciclo de escrituras no autorizados.
Tampoco repartir JWT_SECRET ni construir Administration/Commerce para resolverlo.

## 8. Plan incremental propuesto, sin ejecutar

1. Aprobar este contrato y decidir el primer corte: identidad por UUID/usuario/código
   en laboratorio, con Control/OCR ampliado fuera del alcance inicial.
2. Crear después archivos nuevos de puerto/adapter READ ONLY, manteniendo intactos
   núcleo y provisión fase 2. Añadir manifiesto sintético de correspondencias y
   pruebas locales de errores/serialización. Sin HTTP ni cambio de runtime.
3. En recursos nuevos, comparar lectura legada sintética con A.4 y construir vistas
   candidatas usando proveedores existentes como comparador. Fixtures compatibles
   y fixtures deliberadamente incompatibles se reportan por separado.
4. Ensayar me/vehicles y consumidores FuelFlow/Prime con los mismos cuerpos,
   autorización real sintética y caídas. Todo en hosts de laboratorio privados,
   sin modificar frontends ni rutas operativas.
5. Diseñar transporte privado y selección apagada, si se autoriza después, con
   credenciales/deadlines/errores aprobados. No activar por haber aprobado paridad.
6. Evaluar Control solo tras resolver q/alcance y OCR ampliado solo tras decisión
   expresa de gramática. Una integración pública/migración de datos es otra etapa.

No hay “promoción automática” por tener pruebas verdes. Fallos de CI conocidos y
timeouts históricos mantienen su estado abierto; este diseño no los diagnostica.

## 9. Pruebas previstas y puertas de aceptación

Ninguna de estas pruebas fue ejecutada en este turno. S = realizable después con
datos sintéticos y recursos nuevos; D = requiere decisión adicional antes de
considerar aceptable una integración.

| Prueba | Datos/precondición | Criterio |
| --- | --- | --- |
| Identidad por UUID/user/canónico/alias | S: binding explícito, dos miembros, aliases legados | Mismos UUID y canónico; entrada exterior preservada; accountId no inferido |
| Dataset no provisionado o binding cruzado | S: fila faltante/IDs distintos | Diferencia clasificada; sin 404 público falso, mezcla ni INSERT |
| Paridad de me y Vehicle | S: campos no cero, nullables, bienvenida reservada y perfil | Body/estado HTTP iguales al perfil elegido; ninguna propiedad nueva/omitida |
| Numeración/aliases fronterizos | S: PRIME-001/A001/AA001, PRIM históricos y colisiones | Resolver formatos válidos; discrepancia legado/registro único detectada, sin reescribir |
| Propietario member | S: JWT de A y recurso B; IDs manipulados | 404 de recurso ajeno conforme a ruta; no PII/dinero de B |
| Firmas/actores inesperados | S: kiosk, terminal, miembro, expirado/revocado, llamadas firmadas | Conducta de cada guard/ruta caracterizada; no nuevas concesiones |
| Control grants y estación | S+D: dos estaciones, global/no global, cero asignaciones, revocación | 401/403/404 correctos; máscaras/omisiones conservadas; sin escape con q |
| Regresión específica q | S+D: solo actividad en estación B y actor limitado A, q coincide | Prueba debe revelar el comportamiento actual; no aprobar fuga como paridad. Aceptación de corrección exige autorización separada |
| OCR actual | S: proveedor simulado con imagen/respuesta controlada; luego OCR real sintético | Umbral, number capturado, recognized/null/errores idénticos; no confundir conocido con reconocido |
| Gramática OCR ampliada | D: aprobación de corrección | Caso PRIME-A001/AA001 sin modificar estado/vínculo; fuera del primer corte |
| FuelFlow/Prime/Control consumidores | S: mismos módulos y API sintética | legacyNumbers conserva comparación; Prime refreshData/listAll/401 y campos; Control roles/arrays sin UI modificada |
| Fallos externos | S: timeout, redirect, 404, 401 técnico, JSON inválido, proveedor financiero caído | Error distinguible, sin dinero inventado ni logout humano por error técnico del candidato; mapping aprobado antes de servir |
| Recuperación de lectura | S: proveedor cae y vuelve | Primera falla explícita; siguiente lectura correcta, sin replay de comandos ni caché insegura |
| Conservación de estado/UUID | S: ACTIVE/SUSPENDED en legado y A.4 sin estado | status exacto viene del proveedor; UUID estables, no derivados de código |
| Solo lectura | S: snapshots antes/después de todas las tablas, rol SELECT y auditoría SQL | Cero cambios de negocio, contador/recibos intactos, ninguna autoprovisión; seguridad Redis evaluada aparte |
| Cambios concurrentes de fuentes | S+D: perfil/status/Vehicle modificados entre consultas por fixture | No prometer snapshot global; detectar mismatch donde hay binding/revisión; aprobar política de frescura antes de integrar |
| Errores HTTP | S: reloj controlado y ambos perfiles de referencia | Igual status/message/path/details y regla de timestamp; Gateway 502 distinto de error de servicio |

La igualdad se compara sobre datasets equivalentes y estables. No ignorar
diferencias financieras ni ordenar indiscriminadamente arrays. En listas sin orden
garantizado se documenta por separado equivalencia semántica y body recibido; en
historiales/listado Vehicle se exige el orden contractual. Ausencia legítima de
datos por permiso no puede confundirse con fallo del proveedor.

Puede usarse PostgreSQL nuevo y fixtures del proveedor legado para paridad real;
mocks sirven para errores/puertos, no demuestran paridad de cálculos financieros.
No reutilizar los contenedores/redes/volúmenes de fase 2 para ejecutar esos ensayos
sin autorización. No se copia información productiva.

## 10. Archivos candidatos y decisiones para autorizar

### Archivos nuevos propuestos primero

- services/identity/lab/membership-a4-read-port.ts
- services/identity/lab/membership-a4-read-store.cjs
- services/identity/lab/membership-a4-read-store.test.cjs
- tools/astra/identity-a4-read-parity-lab.cjs
- Docs/astra/identity-a4-phase3-read-parity-results.md y evidencias nuevas

Son nombres candidatos; no existen por efecto de este diseño. El lector nuevo
debe separarse del store de provisión sin editar los cinco archivos protegidos
ni acoplar métodos de escritura a la fachada.

### Archivos existentes que solo podrían modificarse en cortes posteriores aprobados

| Finalidad posterior | Candidatos, no cambios autorizados ahora |
| --- | --- |
| Selección/composición de lecturas Identity | services/identity/src/adapters/memberships.service.ts; services/identity/src/adapters/vehicles.service.ts; services/identity/src/ports.ts |
| Proveedor/contrato privado legado | services/identity/src/adapters/financial-reads.ts; services/identity/src/adapters/compatibility-port.ts; tools/astra/identity-compatibility-bridge.cjs |
| Fachada del Backend si se aprueba | Backend/src/memberships/memberships.service.ts; Backend/src/vehicles/vehicles.service.ts; sus módulos de composición |
| Corrección separada Control | Backend/src/control/control-customers.service.ts y Backend/test/control-customers.e2e-spec.ts, solo bajo autorización específica |
| Corrección separada OCR | Backend/src/vehicles/recognition.service.ts; copia Identity; PlateRecognition/app.py y sus pruebas, con revisión de snapshots |
| Aceptación de contratos | Backend/gateway/routes.test.cjs; Frontend_1_FuelFlow/tests/prime-flow.test.js; Frontend_2_PrimaxPrime/tests/services.test.js; pruebas Control y laboratorio Astra |

No es necesario modificar Gateway/routes ni clientes para el primer laboratorio.
No se requieren cambios de AuthCore, PasswordReset, Membership.status, Vehicle,
transacciones, finanzas o esquemas para diseñar/ensayar esas lecturas.

### Decisiones pendientes de autorización

1. Contrato mínimo, nombres/tipos de resultados privados y primer conjunto de rutas
   cuya paridad se ensayará; recomendación: identidad + me/vehicles en laboratorio.
2. Fuente del binding userId/accountId/memberId; manifiesto sintético primero,
   ninguna autoridad productiva deducida.
3. Normalización explícita por llamador y manejo de NOT_PROVISIONED/colisiones;
   no aplicar la política experimental sobre datos históricos.
4. Fuentes de perfil/estado/Vehicle/finanzas y perfil de referencia A o B; no
   reducir ni ampliar cuerpos públicos.
5. Mapeo nuevo de errores técnicos, deadline, caché/frescura y cualquier transporte.
6. Mantener Control fuera inicialmente y decidir si se autoriza corrección
   independiente del alcance con q.
7. Mantener OCR actual o autorizar aparte ampliación de gramática.
8. Ejecución de nuevos ensayos sintéticos, sin reutilizar recursos existentes.
9. Cualquier integración posterior al runtime, aunque tenga opción apagada; no se
   deduce de aprobar este diseño ni de una futura batería verde.

## Anexo: inventario inicial sin seguimiento y huellas actuales

Estos 16 archivos ya existían antes de este documento. Se preservan sin editar.
Los hashes del diseño actual se cotejan al terminar el turno; no son evidencia de
ejecución de pruebas.

| Archivo | SHA-256 al inicio de este corte |
| --- | --- |
| Docs/astra/evidence/identity-a4-phase2-a4-388190850142658691857203.json | 8905b4132d5cfeed60899f5dcf21befc82d661f0beaed6f555e9045908cbd508 |
| Docs/astra/evidence/identity-a4-phase2-a4-7d6f767235d024a0954650c4.json | 84d51b75381a62a1daf61172e5084ed53d3bf6896a67d2283c3f5f2e86fc8e3d |
| Docs/astra/evidence/identity-a4-phase2-a4-9ba6aa4ea5db19437c335595.json | 4e17fe89c25c350038ccb7f19d3a5585e7c240d803811dbfd5bc2e9e4655bcdf |
| Docs/astra/evidence/identity-a4-phase2-a4-b4f0c1562bb88bce5263eacf.json | 19390dd06ea95f0a1638f1c895ae21a98e5969f86296759009500211e0885dd1 |
| Docs/astra/identity-a4-invariants-and-core.md | de92c539d263a8bad44f382854e52397fe6bae764e0413dc6bfacb9a533f1ada |
| Docs/astra/identity-a4-phase2-private-persistence-design.md | 36eb02388a59f73ef3d7e04fcfd4251a9d62a424e56bb1bd3d18d6b8cc2ef773 |
| Docs/astra/identity-a4-phase2-private-persistence-results.md | 372e410dbdb331f26f3395f0ae3b01115cf0e12d1b02f941e8ce70be25727d86 |
| services/identity/lab/owned-membership-a4-port.ts | 8e5e843a3c2e3ee46524df30219729ef5e4b9af3ecc4b9130c333fef8d1898ac |
| services/identity/lab/owned-membership-a4-store.cjs | 17e4916d3e3e3e0a1a1c91ded1788b5720965a3194eff37f9d2f59a19fb9cd09 |
| services/identity/lab/owned-membership-a4-store.test.cjs | 184b8d49c9ffb0ed793d5c7e0a6eecfba199ddb8e6e30758a347833d67664b51 |
| services/identity/lab/owned-membership-a4.sql | 2e7ef6bae4bb38d175639b6c5ed2e14317872735dd252fd919f2558d14d0ccd8 |
| services/identity/src/membership-codes/README.md | 1fd70e9aa8012574197970cecf0e136c362f5de40888abc04dbca4cd2b5926fd |
| services/identity/src/membership-codes/core.ts | aad8489a0322638ffcccc2259457be325e0baa0377274778d9b07e1a41981b21 |
| services/identity/test/membership-codes.test.cjs | 24bf19b31a95f588a7a25e1b9c9dbc32d570758c2a5c71d0ee3acfaa9e6da01e |
| tools/astra/identity-owned-membership-a4-lab.cjs | b52583c96b098f63f3cb65970deb95795f895396b2947dcc0a731e70756a59e5 |
| tools/astra/identity-owned-membership-a4-worker.cjs | e69fdfc6d1840c87a493059fcc0961c3d08156ee54bd7a96d66cfb03fcaf8e84 |

Único archivo creado en este corte:
Docs/astra/identity-a4-phase3-compatible-reads-design.md.
Se termina en diseño: no se implementan adaptadores, endpoints ni fase posterior.

# Astra — Etapa 3I: lectura protegida de transacción de Commerce

## Registro previo

Referencia `4721cb2925d9ee5df72564f91a8a51c60ab30788`, rama
feat/dezkz-identity-a4-core. Árbol versionado e índice inicialmente limpios;
nueve evidencias originales intactas y excluidas. Hashes de 3H, fuentes protegidas
y 36 migraciones comprobados antes del cambio.

Operación única: GET /api/v1/transactions/:id. TransactionsController.get usa
MemberOrKiosk (access=either) y ParseUUIDPipe; TransactionsService.get llama
TransactionsRepository.byId (findUnique con transactionInclude), comprueba
propietario cuando actor.kind=member y retorna transactionResponse. Ausencia o
miembro ajeno: mismo 404. Sin escrituras ni atomic en este flujo. create y los
demás métodos financieros conservan sus cuerpos y transacciones originales.

El mapper original elimina requestHash, reduce membership sin userId y conserva
los demás campos/relaciones actuales, incluidos importes, pagos, deuda, recibo y
fechas. Sólo amount tiene su conversión explícita toFixed(2); no se normalizan
otros Decimal ni se ocultan campos adicionales aprovechando la extracción.

AccessGuard permanece intacto. Miembro: Bearer válido, User activo/authVersion,
sin sustitución por query/headers/cookie Control. Kiosco firmado: KioskService
valida firma HMAC de método/URL/cuerpo/headers, ventana de tiempo, sesión Redis,
versión, expiración, autenticación, CSRF, lista de rutas y estación de transacción.
Rechaza otra estación antes del controlador. GET incrementa el limitador técnico
operations en Redis, incluso para algunas solicitudes luego rechazadas; se
conserva como efecto legítimo, sin escrituras financieras. Query en ruta firmada
no está permitido por kioskRoute. Errores de guard y servicio no se uniforman.

La clave legacy x-kiosk-key conserva su compatibilidad vigente fuera de modo
academic: guard genera actor kiosk sin stationId y no aplica el authorize firmado.
No se amplía ni se presenta como aislamiento por estación de esa credencial
legacy; una política más restrictiva necesita autorización específica. En academic
se rechaza. Los modos/configuración de firma y los permisos no se modifican.

Diseño: controlador y servicio vigentes → adaptador de entrada → caso de uso
puro → puerto → adaptador local → único TransactionsRepository original. El
adaptador local conserva literalmente el cuerpo get y usa el mapper existente;
no se copia cálculo ni se crea otro repositorio. Composición en providers del
módulo Transactions existente para reutilizar su única instancia de repositorio.

## Resultados e inventario

Operación consolidada exclusivamente en su alcance comprobado. Los demás
contratos de Commerce siguen en sus implementaciones vigentes.

### Arquitectura y archivos

```text
TransactionsController.get + AccessGuard / KioskService vigentes
  → TransactionsService.get (fachada)
  → TransactionReadAdapter (entrada)
  → ReadTransaction (aplicación)
  → TransactionReadSource (puerto)
  → LegacyTransactionRead (compatibilidad local)
  → TransactionsRepository.byId original → PostgreSQL única
  → transactionResponse original
```

transactionReadProviders se registra en TransactionsModule. Inyecta el repositorio
ya provisto por ese módulo; no registra otro. Actor se usa como contrato puro
compartido. Los tipos de respuesta se infieren del mapper vigente, sin duplicar
modelos de dinero, cálculos o reglas. No se añade dominio artificial para una
proyección. La aplicación depende sólo del puerto, sin NestJS/Prisma/HTTP.

Archivos nuevos:

- Backend/services/commerce/src/application/ports/transaction-read.ts.
- Backend/services/commerce/src/application/use-cases/read-transaction.ts.
- Backend/services/commerce/src/adapters/inbound/transaction-read.adapter.ts.
- Backend/services/commerce/src/adapters/outbound/legacy-transaction-read.ts.
- Backend/services/commerce/src/bootstrap/transaction-read.providers.ts.
- Backend/src/transactions/transaction-read.spec.ts.
- Backend/test/commerce-transaction-read.fixture.ts.
- Backend/test/commerce-transaction-read.integration.cjs.
- tools/astra/stage3i-commerce-validation.cjs.
- tools/astra/stage3i-postgres-redis.cjs.
- Docs/astra/primax-stage3i-commerce-transaction-read-results.md.
- Docs/astra/evidence/stage3i/review-summary.json.

Modificados:

- Backend/src/transactions/transactions.service.ts: dependencia y delegación de get.
- Backend/src/transactions/transactions.module.ts: providers de lectura sobre repositorio existente.
- Backend/services/commerce/Dockerfile y Backend/Dockerfile: COPY del árbol nuevo para los dos builds; mismos entrypoints.
- Backend/src/transactions/transactions.service.spec.ts y critical-integrity.spec.ts: inyección del nuevo argumento, mismas aserciones financieras.
- Backend/test/v11-closure.e2e-spec.ts y v11_2-demo.e2e-spec.ts: sólo construcción compatible; no se ejecutaron estas bases históricas.

Total: veinte rutas, detalladas en el manifiesto. No hay cambios en controladores,
repositorio, mapper, AuthCore, Identity, Catalog, Administration, Gateway, frontends,
Prisma, migraciones o Compose operativo.

### Ejecuciones

| Comprobación | Resultado | Evidencia privada bajo .cache/astra-stage3i |
|---|---|---|
| Línea base previa | 46 Jest, 24 Gateway y 9 empaquetado correctos | run-4eda353aa001 |
| Primera validación nueva | 53 Jest y cinco builds correctos, además de Gateway/empaquetado | run-03ecac8f670d |
| Regresión ampliada final | 99 Jest en ocho suites, 24 Gateway, 9 empaquetado y cinco builds correctos | run-75b38435b6e1 |
| Primera integración | Falló el fixture al omitir SOLES_PER_POINT al componer el módulo real; sin cambios operativos | primax-astra-stage3i-a612cdafed60 |
| Integración final | 42 comparaciones y 84 solicitudes HTTP correctas | primax-astra-stage3i-a30820f54e54 |
| Preservación AST | Tres cuerpos originales idénticos: create, settleReservation y get en su destino | source-proof.json |
| Imágenes | Commerce runtime y legacy build correctos; módulos cargan sin bootstrap/red | image-commerce.log, image-legacy.log |

La nueva integración incluye TransactionsModule real y sus providers. La rama
original utiliza la clase congelada del commit de referencia, su repositorio y
mapper originales. Ambas ramas usan el mismo SQL, guard, KioskService y Redis,
y tokens emitidos/verificados con cada JwtService real. No se ejecuta login ni
comando financiero para preparar las condiciones.

Los 99 tests incluyen propiedad/ausencia/errores/mapper y límites de aplicación;
regresiones existentes de venta, autorización, integridad crítica, pagos demo,
kiosco, enrutamiento Nest completo con persistencia simulada y acceso técnico.
Las regresiones financieras unitarias usan mocks, no certifican aislamiento SQL
del motor de escritura. Los tres builds ajenos a Commerce no emiten archivos
del nuevo árbol services/commerce ni cambian su artefacto de entrada.

### Seguridad y paridad reales

- Propietario A/B autorizado; miembro ajeno rechazado aunque pertenezca a la
  misma estación; miembro sin membresía y venta sin membresía rechazados con 404.
- Sin token, token inválido/vencido, authVersion desfasado, usuario inactivo,
  cookie Control y UUID inválido conservan respuestas. Query/headers de usuario
  o membresía no sustituyen el actor; query de paginación de miembro sigue
  ignorada, sin agregar un contrato de lista.
- Firma inválida/fuera de ventana, sesión expirada/no autenticada/versión o
  estación incompatibles y CSRF incorrecto son rechazados como antes. Kiosco
  firmado accede a ventas de distintos propietarios sólo en su estación, y a
  ventas invitadas; otra estación devuelve 403, inexistencia 404, ruta/query no
  permitidas 403. Firma válida tiene precedencia sobre token Bearer inválido.
- Límite técnico agotado conserva 429. Clave legacy válida/incorrecta y su
  precedencia frente a Bearer se verifican; en academic sigue rechazada y la
  firma sigue admitida. No se confunden ambos modelos de acceso.
- JSON completo idéntico, incluidos Decimal, fechas, pago parcial, deuda y
  recibo/correlativo. Sólo se excluye timestamp de errores, generado por cada
  petición. Se verifican independientemente amount='50.00', estados, propiedad,
  ausencia de requestHash/userId en la proyección de membresía y membership=null
  para invitado. No se imponen redacciones nuevas sobre relaciones existentes.

El caso de uso acepta exclusivamente el actor que entrega la composición
confiable. El control de estación del kiosco firmado sigue en el guard; no se
atribuye al método get una comprobación que antes no tenía. La credencial legacy
no tiene ese filtro; restringirla requiere una decisión de seguridad explícita,
no una modificación silenciosa durante la extracción.

### Integridad financiera y aislamiento

Dos proyectos nuevos exclusivos, cada uno con PostgreSQL 17.6, Redis 7.4,
dos volúmenes nuevos comprobados vacíos, red interna exclusiva y cero puertos
publicados. Se verifica identidad/rol/base vacía, URL, etiquetas y montajes antes
de las 36 migraciones existentes. No se ejecutan seeds operativos.

Los datos iniciales son sintéticos: cinco usuarios, membresías, ventas, pagos,
deuda, puntos y recibos de fixture, sin invocar motores de cobro ni proveedores.
Las dos ramas HTTP usan default_transaction_read_only=on. Se mantienen idénticas
las 41 tablas, 67 filas y secuencias, incluido receipt_boleta_seq=5. Ninguna
consulta crea, emite, reimprime o renumera comprobantes.

Redis no queda artificialmente sin escrituras: seis sesiones sintéticas conservan
su contenido. Sólo existen sus claves y dos contadores operations esperados,
con expiración verificada. Uno parte de 240 para probar agotamiento y termina
en 242 tras dos rechazos; el de sesión válida registra exactamente 18 incrementos.
Los cuerpos financieros se mantienen iguales a pesar de esos efectos técnicos.

Se conservaron ambos intentos, cuatro volúmenes nuevos y redes/evidencias. Sólo
se detuvieron sus proyectos; PostgreSQL y Redis terminaron con exit 0. Ningún
volumen histórico se montó o arrancó. T01 no se consultó ni modificó.
Credenciales, claves de firma y tokens efímeros no se versionan: sólo memoria y
Compose/logs privados en .cache ignorado. Nueve evidencias originales intactas.

Comandos principales:

```text
node tools/astra/stage3i-commerce-validation.cjs --baseline
node tools/astra/stage3i-commerce-validation.cjs
node tools/astra/stage3i-postgres-redis.cjs
docker build -f services/commerce/Dockerfile -t primax-astra-commerce:stage3i .
docker build --target build -t primax-astra-legacy:stage3i .
```

Los builds Docker se ejecutaron desde Backend. El harness offline usa --network
none y copia fuentes sin .env a una ruta temporal. Ejecuta Jest, contratos Gateway,
contratos de empaquetado, build-domain.cjs por servicio y tsc legacy. El harness
SQL sólo usa su Compose generado; no activa imágenes en Compose operativo.

## Matriz de Commerce pendiente

Inventario de 46 contratos de negocio y once archivos de controlador, contrastado
con Etapa 1 y los archivos actuales intactos. S = lectura consolidada en 3I;
A = lectura sin dependencias especiales apta para agrupar; B = lectura protegida
con dependencias explícitas; C = comando/transacción que mantiene atomicidad;
D = bloqueado para una extracción de lectura por permisos, inventario,
reconciliación, recuperación o efectos secundarios. Cuando se superponen,
se usa la dependencia dominante; D también contiene comandos financieros.
No hay A sin restricciones identificadas: no se inventa una consulta pública.

| # | M?todo y ruta | Clase | Dependencia / estado |
|---:|---|---|---|
| 1 | GET /api/v1/authorizations | B | pendingBefore con olderThanMinutes; s?lo revisi?n, no libera reservas. GET de lista fuera de allowlist firmada; conservar rechazo y compatibilidad legacy. |
| 2 | POST /api/v1/authorizations | C | Reserva, progreso, intervenci?n/liberaci?n o lectura seg?n m?todo; saldo e inventario conservan sus transacciones. |
| 3 | GET /api/v1/authorizations/:id | B | Estado v?a repositorio, kiosk; misma autorizaci?n t?cnica/estaci?n, sin liquidar ni liberar. |
| 4 | POST /api/v1/authorizations/:id/intervention | C | Wallet/canje o autorizaci?n con ledger/reglas financieras originales. |
| 5 | POST /api/v1/authorizations/:id/progress | C | Wallet/canje o autorizaci?n con ledger/reglas financieras originales. |
| 6 | POST /api/v1/authorizations/:id/release | C | Wallet/canje o autorizaci?n con ledger/reglas financieras originales. |
| 7 | GET /api/v1/control/assistance | B | Lectura Control ADMIN_INCIDENT_VIEW y scope estaci?n/status; l?mite 100. |
| 8 | GET /api/v1/control/assistance/:id | B | Detalle Control en alcance con eventos/incidencias y referencias financieras. |
| 9 | POST /api/v1/control/assistance/:id/actions | D | Acci?n Control con permisos, estado/auditor?a o recuperaci?n; no autorizada en 3I. |
| 10 | GET /api/v1/control/payments/:id | B | Lectura Control ADMIN_INCIDENT_VIEW y estaci?n de operaci?n; proyecci?n financiera, sin retry. |
| 11 | POST /api/v1/control/payments/:id/actions | D | Acci?n Control con permisos, estado/auditor?a o recuperaci?n; no autorizada en 3I. |
| 12 | POST /api/v1/control/terminal-operations/:id/cancel-unpaid | D | Acci?n Control con permisos, estado/auditor?a o recuperaci?n; no autorizada en 3I. |
| 13 | POST /api/v1/control/terminal-operations/:id/recovery-ticket | D | Acci?n Control con permisos, estado/auditor?a o recuperaci?n; no autorizada en 3I. |
| 14 | POST /api/v1/control/terminal-operations/:id/resolve | D | Acci?n Control con permisos, estado/auditor?a o recuperaci?n; no autorizada en 3I. |
| 15 | POST /api/v1/memberships/me/recharges | C | Wallet/canje o autorizaci?n con ledger/reglas financieras originales. |
| 16 | GET /api/v1/memberships/me/wallet | B | JWT miembro propietario, historial/saldo/reservas/deuda; repositorio vigente. |
| 17 | POST /api/v1/online-orders | C | Pago/proveedor, idempotencia y resultado financiero; mantener atomicidad y recuperaci?n. |
| 18 | GET /api/v1/online-orders/:id | D | GET status puede consultar proveedor y reconciliar/escribir; excluido de lectura pura. |
| 19 | POST /api/v1/online-orders/:id/cancel | C | Pago/proveedor, idempotencia y resultado financiero; mantener atomicidad y recuperaci?n. |
| 20 | POST /api/v1/online-orders/:id/demo-confirm | C | Pago/proveedor, idempotencia y resultado financiero; mantener atomicidad y recuperaci?n. |
| 21 | POST /api/v1/online-orders/:id/notify | C | Pago/proveedor, idempotencia y resultado financiero; mantener atomicidad y recuperaci?n. |
| 22 | POST /api/v1/online-orders/:id/refund | C | Pago/proveedor, idempotencia y resultado financiero; mantener atomicidad y recuperaci?n. |
| 23 | POST /api/v1/online-orders/:id/reselect | C | Pago/proveedor, idempotencia y resultado financiero; mantener atomicidad y recuperaci?n. |
| 24 | POST /api/v1/operational-admin/permissions/admin | D | Permisos o terminal/asignaci?n, autoridad actual y auditor?a; no trasladar a otro servicio. |
| 25 | POST /api/v1/operational-admin/permissions/admin/:id/revoke | D | Permisos o terminal/asignaci?n, autoridad actual y auditor?a; no trasladar a otro servicio. |
| 26 | POST /api/v1/operational-admin/pumps | D | Permisos o terminal/asignaci?n, autoridad actual y auditor?a; no trasladar a otro servicio. |
| 27 | POST /api/v1/operational-admin/terminal-pump-assignments/:id/end | D | Permisos o terminal/asignaci?n, autoridad actual y auditor?a; no trasladar a otro servicio. |
| 28 | POST /api/v1/operational-admin/terminals | D | Permisos o terminal/asignaci?n, autoridad actual y auditor?a; no trasladar a otro servicio. |
| 29 | POST /api/v1/operational-admin/terminals/:id/assign-pump | D | Permisos o terminal/asignaci?n, autoridad actual y auditor?a; no trasladar a otro servicio. |
| 30 | POST /api/v1/operational-admin/terminals/:id/revoke | D | Permisos o terminal/asignaci?n, autoridad actual y auditor?a; no trasladar a otro servicio. |
| 31 | GET /api/v1/payments/:id/partial-refund | D | GET state dentro de atomic con access=admin; POST report muta resultado financiero/ledger. |
| 32 | POST /api/v1/payments/:id/partial-refund | C | GET state dentro de atomic con access=admin; POST report muta resultado financiero/ledger. |
| 33 | POST /api/v1/payments/:id/refund | C | Pago/proveedor, idempotencia y resultado financiero; mantener atomicidad y recuperaci?n. |
| 34 | POST /api/v1/payments/webhook | C | Pago/proveedor, idempotencia y resultado financiero; mantener atomicidad y recuperaci?n. |
| 35 | POST /api/v1/rewards/redeem | C | Wallet/canje o autorizaci?n con ledger/reglas financieras originales. |
| 36 | POST /api/v1/terminal/assistance | D | Asistencia, estado y auditor?a; dependencias de terminal/estaci?n. |
| 37 | GET /api/v1/terminal/assistance/:id | B | Lectura de solicitud restringida a terminal y estaci?n; no cancela ni resuelve. |
| 38 | POST /api/v1/terminal/assistance/:id/cancel | D | Asistencia, estado y auditor?a; dependencias de terminal/estaci?n. |
| 39 | POST /api/v1/terminal/claim | D | Ciclo de atenci?n/claim/ownership y concurrencia de inventario; mantener escritor actual. |
| 40 | GET /api/v1/terminal/me | D | GET con touchTerminalOwner y terminalCredential.lastUsedAt; no es lectura pura. |
| 41 | POST /api/v1/terminal/operations | C | Ciclo de atenci?n/claim/ownership y concurrencia de inventario; mantener escritor actual. |
| 42 | GET /api/v1/terminal/operations/:id | B | Lectura con credencial terminal, ownership y l?mites de operaci?n recuperada; efectos t?cnicos Redis. |
| 43 | POST /api/v1/terminal/operations/:id/close | C | Ciclo de atenci?n/claim/ownership y concurrencia de inventario; mantener escritor actual. |
| 44 | GET /api/v1/terminal/operations/:id/recovery-state | D | Lectura de recuperaci?n limitada a recoveredOperationId, ownership y estado multi-tabla. |
| 45 | POST /api/v1/transactions | C | Venta, pago, puntos, reserva e inventario: misma frontera at?mica. |
| 46 | GET /api/v1/transactions/:id | S | 3I: repositorio/mapper originales, propietario miembro y kiosco autorizado. |

Conteo: B=8, C=18, D=19, S=1. El inventario restante contiene 45 contratos; ninguno se implementa en esta etapa.

## Lotes finitos recomendados, sin autorización implícita

1. **Lecturas de miembro y kiosco (tres B):** wallet y dos consultas de
   authorizations. Reutilizar repositorios/mappers, probar propietario y límites
   técnicos. La lista de autorizaciones no está en la allowlist del kiosco
   firmado; debe conservarse su rechazo y compatibilidad legacy, sin habilitarla
   por iniciativa del refactor. Salida: paridad real y mismos rechazos, sin SQL
   de escritura ni cambios financieros.
2. **Lecturas Control y terminal (cinco B):** assistance lista/detalle y estado
   terminal, control/payments detalle, terminal/operations detalle. Un bloque
   agrupado con pruebas de permisos/estación/credencial/owner y efectos Redis
   existentes. Salida: contratos y scope equivalentes, sin mutaciones de negocio.
3. **Diseño acotado para cuatro GET D:** online-order status puede contactar
   proveedor y reconciliar/escribir; terminal/me escribe lastUsedAt y refresca
   ownership; partial-refund.get conserva atomic; recovery-state requiere una
   credencial limitada a operación recuperada. No convertirlos en lecturas puras
   por su verbo HTTP. Requieren autorización explícita y fixtures de recuperación
   nuevos, jamás T01 ni volúmenes históricos.
4. **Comandos C por fronteras completas, no por rutas:** venta/autorización,
   órdenes/proveedor/webhook/reembolsos, wallet/canje y apertura/cierre de atención.
   Delegar inicialmente al motor local existente; conservar cada atomic, locks,
   idempotencia, ledger, inventario y numeración. Aceptación adicional: replay,
   conflictos, rollback, concurrencia, resultados ambiguos y proveedor simulado.
   No sustituir atomic por varias llamadas HTTP.
5. **D de permisos/asistencia/recuperación:** contratos específicos antes de
   mover composición. Mantener SYSTEM_ADMIN, grants actuales, asignaciones,
   auditoría, ownership y tickets; no trasladarlos a Administration sólo por su
   consumidor Control. Cambiar políticas/AuthCore exige otra autorización.

Esta lista es un inventario finito de trabajo, no una secuencia de etapas ya
aprobadas. Commerce no queda completo por consolidar un GET: persisten las
dependencias de módulos Payments, Rewards, Wallet, Incidents, Operations,
Assistance, AuthCore/Kiosk, Prisma/atomic y tablas compartidas con los demás
servicios. No cambia ningún escritor ni la propiedad del esquema.

## Aceptación y límites

3I cumple el alcance de una lectura: contratos y rechazos comprobados, consulta
y mapper originales, tres cuerpos de método preservados, cinco compilaciones,
empaquetado y comparación SQL/Redis aislada correctos. Las pruebas focalizadas
no certifican frontends/Compose completos, concurrencia productiva, restauración,
sesiones de recuperación ni motores financieros de escritura. La clave legacy
sin alcance por estación queda como limitación de seguridad existente y decisión
pendiente, no como garantía del kiosco firmado.

Reversión eventual: revertir sólo el commit 3I previa autorización, restaurando
composición/constructores/COPY; sin SQL ni modificación de datos. Imágenes
operativas no sustituidas. Identity A.4 sigue cerrado y T01 abierta e intacta.
Sin push ni merge; no se inicia otro flujo financiero tras esta entrega.

# Astra — Etapa 3H: detalles administrativos y evaluación del bloque de lecturas

## Registro previo

Referencia `5bd1369166238913eec86796bbcd0d93a9ed5e4f`, rama
`feat/dezkz-identity-a4-core`. Árbol versionado e índice inicialmente limpios;
nueve evidencias originales sin seguimiento conservadas por SHA-256. Fuentes,
evidencias, hashes de 3G y 36 migraciones verificados antes de modificar código.

Se seleccionan cuatro GET protegidos de ControlCustomersController:

| Ruta /api/v1/control | Método vigente | Lecturas y contrato que se preservan |
|---|---|---|
| /customers/:userId | ControlCustomersService.customer | membership.findFirst con actividad por estación; user, vehículos autorizados, agregado de puntos y últimos movimientos según permisos. Cliente sin membresía o sin alcance: 404. |
| /memberships/:membershipId | membership | scope exige ADMIN_MEMBERSHIP_VIEW, findUnique obtiene userId, delega customer con ADMIN_CUSTOMER_VIEW añadido internamente como antes. Retorna sólo membership; conserva sus errores y orden. |
| /transactions/:transactionId | transaction | findUnique con relaciones; si no existe, 404 antes de scope; existente ajena o sin ADMIN_TRANSACTION_VIEW: 403. Proyección original de operación, recibo, estados y campos por permiso. |
| /receipts/:transactionId | receipt | findUnique con recibo/datos de venta; inexistente 404 antes de scope; exige ADMIN_RECEIPT_VIEW y estación autorizada; sin galones positivos/placa confirmados 409. Retorna copia demo schemaVersion 2, sin emitir, persistir ni imprimir. |

No hay atomic, comandos, recuperación, locks ni escrituras en esos métodos.
Leer importes/estados no transfiere la responsabilidad financiera. Las consultas
de historial y puntos de customer se mantienen distintas de otras proyecciones.
Se conservan límites 50+50 y combinación descendente con límite final 50.
Sin reglas de dominio nuevas, caché, HTTP entre servicios ni repositorio duplicado.

AccessGuard y controlador permanecen intactos: Bearer/cookie primax_control,
JWT issuer/audience/expiración, usuario activo/authVersion, aprobación/verificación,
grants y asignaciones activas. Firma kiosco prohibida en Control. Estos GET no
exigen CSRF en el código actual; no se cambia la política ni se infiere seguridad
de POST. El ID de la URL identifica el recurso, nunca el alcance del actor.
ParseUUIDPipe conserva errores 400. No existe DTO Query en los cuatro detalles:
los parámetros de consulta no cambian el recurso ni el alcance, y no se agrega
validación nueva. No tienen paginación HTTP; se conservan límites internos.

Cliente/membresía requieren actividad en estación asignada para el personal;
sin asignaciones, 403. SYSTEM_ADMIN mantiene alcance global, incluidos datos
históricos de estaciones inactivas. Correo enmascarado para no globales; balance
y puntos sólo globales con permiso de membresía. Vehículos y operaciones se
incluyen según permisos y estación; cliente inactivo en detalle conserva su
comportamiento original, distinto del filtrado del listado. Recibo conserva
campos fiscales/identificativos que permite ADMIN_RECEIPT_VIEW para esa estación.
No se uniforman redacciones ni mensajes de inexistencia/autorización.

Diseño: cuatro métodos literales en adaptador local, caso de uso y puertos puros,
adaptador de entrada y composición dentro de services/administration/src.
Los mappers originales compartidos con transactions se trasladan una sola vez
al contexto legacy protegido ya existente. El listado transactions permanece en
la fachada; los tres listados 3G no se extraen de nuevo. Consultas/mappers se
verificarán contra el commit de referencia y PostgreSQL sintético de sólo lectura.

## Resultados y matriz final

Lote de cuatro detalles consolidado y validado. Los siete GET de clientes,
membresías, vehículos y detalles cuentan con flujo hexagonal real. **Esto no
cierra todas las lecturas ni convierte Administration completo en hexagonal**:
quedan catorce GET legacy y dieciséis comandos, con los matices de la matriz.

### Componentes y reutilización

Flujo: controlador original → ControlCustomersService →
AdministrativeDetailsAdapter → AdministrativeDetails → AdministrativeDetailSource
→ LegacyAdministrativeDetails → PrismaService global existente.
AdministrativeDetailsModule compone los proveedores; no se crea otro cliente
Prisma. Los casos de uso y puertos no importan NestJS, Prisma o HTTP. Actor sigue
siendo el contrato puro compartido. No se añade una capa de dominio sin reglas.

Se trasladan literalmente cuatro cuerpos de métodos y tres mappers/helpers
(receiptState, transactionProjection, authorizationProjection). Estos últimos
residen una sola vez en LegacyCustomerReadContext, reutilizado por el listado
transactions que permanece en la fachada. Los cuatro helpers de 3G siguen
idénticos. Prueba AST: trece cuerpos originales de la fachada preservados en sus
destinos, más los cuatro helpers originales del contexto. El único cambio en
la llamada interna membership → customer es su ubicación en el mismo adaptador
local; se mantiene el actor derivado y el orden de consultas.

### Pruebas reales

| Ejecución | Resultado | Evidencia local privada bajo .cache/astra-stage3h |
|---|---|---|
| Línea base antes del cambio | 47 Jest, 24 Gateway, 9 empaquetado; correctos | run-05528d151e4b |
| Pruebas nuevas y regresiones | 63 Jest en ocho suites, 24 Gateway, 9 empaquetado; correctos | run-2a4e0894f70e |
| Compilación | Identity, Catalog, Administration, Commerce y legacy: exit 0 | Mismo run, cinco logs/manifiestos |
| Primera comparación integrada | Correcta, incluye detalles y regresiones de 3G | primax-astra-stage3h-6b35793bc007 |
| Comparación integrada reforzada | 231 comparaciones, 462 solicitudes; correctas | primax-astra-stage3h-c7c0e0c5d279 |
| Preservación literal de métodos | Trece cuerpos y cuatro helpers idénticos | source-proof.json |
| Docker independiente/legacy | Dos builds correctos; carga de módulos sin bootstrap/red | image-administration.log, image-legacy.log |

La comparación final incluye 97 casos de los listados 3G y 134 casos de detalles.
Se usa la clase original congelada del commit de referencia; sus tres listados
delegan al flujo 3G que se conserva, y sus cuatro detalles/mappers se ejecutan
con sus cuerpos originales. La nueva composición utiliza el controlador,
AccessGuard, UsersService/Repository, JWT, DTO/pipes, filtro de errores y módulos
de inyección reales. Se compara JSON completo y orden; sólo se omite el
timestamp generado para cada respuesta de error.

Se verifican cuentas aprobadas/rechazadas por permisos, permiso revocado,
asignación terminada/inactiva/ausente, rol por sí solo insuficiente, acceso Control
ausente, aprobación pendiente, cuenta deshabilitada/no verificada, cliente no
administrativo, token ausente/inválido/vencido, usuario inactivo y authVersion
desfasado. Cookie GET con/sin header CSRF conserva la respuesta; Bearer inválido
prevalece sobre cookie válida, kiosco sigue 403. No se prueban comandos POST.

Entre estaciones: cliente/membresía ajenos devuelven 404; transacción/recibo
existentes ajenos, 403. Estación en query no amplía alcance. UUID inválido, 400;
inexistencia, 404; falta de permiso puede preceder o seguir la búsqueda según
el método original. Se prueba explícitamente ese orden sin uniformarlo.

Asersiones independientes de la comparación comprueban IDs/vehículos autorizados,
historial del cliente compartido restringido a estación A y autorización sin venta,
correo enmascarado, pertenencia/operaciones ocultas por permiso, balance/puntos
sólo globales, permiso de membresía sin acceso directo a la ruta customer,
cliente inactivo y cliente sin actividad con las respuestas vigentes. Recibo:
409 sin cantidad confirmada, permiso antes de ese 409, copia demo y campos
fiscales sintéticos de factura. Las pruebas unitarias cubren además siete estados
de pago del recibo y propagación de fallo sin consulta de respaldo más permisiva.

Los fixtures financieros son datos iniciales de prueba, no una ejecución o
certificación del motor de cobros. No se capturaron pagos reales ni se imprimió.

### Aislamiento y ausencia de escrituras

Dos proyectos exclusivos, cada uno con PostgreSQL 17.6 y Redis 7.4 nuevos,
dos volúmenes nuevos verificados vacíos, red interna propia y cero puertos
publicados. Identidad de base/rol, URL, etiquetas, montajes y base vacía se
comprueban antes de aplicar las 36 migraciones existentes. No se ejecutan seeds
operativos. Los datos iniciales/grants/asignaciones sólo son fixtures nuevos;
no se llama a comandos de negocio para prepararlos.

Las dos ramas de comparación usan conexiones con
default_transaction_read_only=on. En la ejecución final, las 41 tablas y 235 filas
persistidas mantienen su huella; las secuencias no cambian. Redis responde PONG
y mantiene cero claves. Los GET seleccionados no utilizan Redis para decidir
su autorización: se acredita conectividad y ausencia de efectos, no recuperación
de sesiones. Se detuvieron sólo los recursos de ambos proyectos; PostgreSQL y
Redis terminaron con exit 0. Cuatro volúmenes nuevos, redes y logs se conservaron.
Los volúmenes históricos no se montaron ni iniciaron. T01 no se consultó ni alteró.

### Comandos y archivos

```text
node tools/astra/stage3h-administration-validation.cjs --baseline
node tools/astra/stage3h-administration-validation.cjs
node tools/astra/stage3h-postgres-redis.cjs
docker build -f services/administration/Dockerfile -t primax-astra-administration:stage3h .
docker build --target build -t primax-astra-legacy:stage3h .
```

Builds Docker desde Backend; harness offline con --network none, copia temporal
sin .env y node_modules del artefacto de validación existente. Ejecuta Jest,
node --test gateway/routes.test.cjs, node --test scripts/build-domain.test.cjs,
scripts/build-domain.cjs por servicio y tsc -p tsconfig.build.json legacy. El
harness SQL genera su Compose privado, migrate deploy sólo sobre base sintética
y parada del proyecto propio. No se usa Compose operativo. Dockerfiles conservan
el COPY de 3G, entrypoints y configuración; las imágenes nuevas no se activan.

Se modifican seis rutas:

- Backend/services/administration/src/adapters/outbound/legacy-customer-context.ts: tipos y tres helpers originales compartidos.
- Backend/src/control/control-customers.service.ts: delegación de cuatro detalles, resto preservado.
- Backend/src/control/control.module.ts: composición de detalles.
- Backend/src/control/control-customers-scope.spec.ts: construcción del flujo nuevo; conserva aserciones 3G.
- Backend/test/administration-lists.fixture.ts: composición de prueba con el módulo nuevo.
- Backend/test/control-customers.e2e-spec.ts: construcción adaptada; no se ejecuta contra su base histórica.

Se crean once rutas:

- Backend/services/administration/src/application/ports/administrative-details.ts.
- Backend/services/administration/src/application/use-cases/administrative-details.ts.
- Backend/services/administration/src/adapters/inbound/administrative-details.adapter.ts.
- Backend/services/administration/src/adapters/outbound/legacy-administrative-details.ts.
- Backend/services/administration/src/bootstrap/administrative-details.module.ts.
- Backend/src/control/administration-details.spec.ts.
- Backend/test/administration-details.integration.cjs.
- tools/astra/stage3h-administration-validation.cjs.
- tools/astra/stage3h-postgres-redis.cjs.
- Docs/astra/primax-stage3h-administration-details-and-closure.md.
- Docs/astra/evidence/stage3h/review-summary.json.

Total del commit: diecisiete rutas. Evidencia saneada y hashes en el manifiesto;
credenciales efímeras, JWT y Compose privado sólo en memoria/.cache ignorado.
Los identificadores fiscales de pruebas son valores sintéticos, no información
de personas o empresas reales. Nueve evidencias originales intactas y excluidas.

## Matriz completa de Administration

Inventario de las 37 declaraciones de negocio de los cuatro controladores
actualmente importados por ControlModule/InventoryModule. Se excluye health
común del bootstrap. A = lectura hexagonal consolidada; B = lectura legacy
pendiente; C = comando administrativo; D = lectura bloqueada para esta extracción
por contexto transaccional/política de acceso que necesita revisión específica.
Las restricciones D de comandos figuran en la columna de dependencia. C incluye
efectos HTTP y comandos rechazados: no significa que existan dieciséis escritores.
Todas las rutas de la tabla tienen prefijo /api/v1.

| # | Método y ruta | Clase | Estado, permiso o dependencia pendiente |
|---:|---|---|---|
| 1 | GET /control/customers | A | 3G, ADMIN_CUSTOMER_VIEW, actividad por estación y redacciones. |
| 2 | GET /control/memberships | A | 3G, ADMIN_MEMBERSHIP_VIEW. |
| 3 | GET /control/vehicles | A | 3G, ADMIN_VEHICLE_VIEW. |
| 4 | GET /control/customers/:userId | A | 3H, ADMIN_CUSTOMER_VIEW, datos relacionados condicionados. |
| 5 | GET /control/memberships/:membershipId | A | 3H, ADMIN_MEMBERSHIP_VIEW y delegación interna vigente. |
| 6 | GET /control/transactions/:transactionId | A | 3H, ADMIN_TRANSACTION_VIEW y estación de la fila. |
| 7 | GET /control/receipts/:transactionId | A | 3H, ADMIN_RECEIPT_VIEW; no emisión ni impresión. |
| 8 | GET /control/transactions | B | Lectura pura con filtros financieros/fecha y merge de dos fuentes; límite de cuatro impide incluirla en 3H. Mappers compartidos ya preservados. |
| 9 | GET /control/session | B | ControlService.session/sessionFor; lectura de contexto de seguridad, sin alterar grants. Requiere contrato específico de contexto actual. |
| 10 | GET /control/accounts | B | ControlService.pending, exige global y SUPER_ADMIN; datos personales de cuentas. No equiparar con alcance por estación. |
| 11 | GET /control/dashboard | B | ADMIN_DASHBOARD_VIEW, proyecciones de múltiples tablas y agregados temporales; requiere fixtures de fecha/estación propios. |
| 12 | GET /control/incidents | B | ADMIN_INCIDENT_VIEW, stationId obligatorio, status y límite 100. |
| 13 | GET /control/incidents/:id | B | ADMIN_INCIDENT_VIEW, estación de incidencia, relaciones financieras; sin cambio de estado. |
| 14 | GET /control/operations | B | ADMIN_OPERATION_VIEW, merge de operaciones con filtros y límite; no confundir con recuperación/finalización. |
| 15 | GET /control/operations/:operationId | B | ADMIN_OPERATION_VIEW, lecturas de autorización/venta/terminal/reserva/incidencia; requiere paridad de estados incompletos. |
| 16 | GET /control/terminals | B | ADMIN_TERMINAL_VIEW, asignaciones, surtidores, última actividad de credencial y usuario; lectura pura. |
| 17 | GET /control/inventory | B | ADMIN_INVENTORY_VIEW, inventario de estaciones activas y Decimal disponible; sólo proyección. |
| 18 | GET /control/inventory/movements | B | ADMIN_INVENTORY_MOVEMENT_VIEW, estación obligatoria, orden sequence/fecha, límite 200 y serialización BigInt. |
| 19 | GET /control/audit | B | ADMIN_AUDIT_VIEW, stationId/actor/acción/fechas, límite 200, datos personales permitidos; no registra evento al consultar. |
| 20 | GET /control/inventory/:stationId/:fuelId/reconciliation | D | ADMIN_INVENTORY_VIEW; inspect dentro de db.atomic, sin escritura en inspect pero contexto de inventario transaccional preservado. |
| 21 | GET /inventory/:stationId/:fuelId/reconciliation | D | access=admin distinto de Control; mismo inspect atomic. No unificar políticas ni extraer por similitud de ruta. |
| 22 | POST /control/access-requests | C | Alta/verificación, correo deshabilitado según modo; seguridad/cuenta/auditoría fuera del lote. |
| 23 | POST /control/verify-email | C | Consumo de verificación/estado; seguridad mutable. |
| 24 | POST /control/resend-verification | C | Verificación/correo, controles de seguridad. |
| 25 | POST /control/login | C | Credenciales, JWT/cookie; AuthCore/políticas no autorizados. |
| 26 | POST /control/logout | C | Limpieza de cookie; efecto HTTP, no escritor SQL por sí mismo. |
| 27 | POST /control/accounts | C | Alta de User/cuenta/grants/asignaciones/auditoría dentro de atomic; no dividir la transacción. |
| 28 | POST /control/accounts/:userId/approve | C | Aprobación y asignación de permisos/estaciones, auditoría. |
| 29 | POST /control/accounts/:userId/access | C | Actualización de acceso mediante approve; misma autoridad actual. |
| 30 | POST /control/accounts/:userId/reject | C | Estado de cuenta y auditoría; fuera del alcance. |
| 31 | POST /control/accounts/:userId/disable | C | Reautenticación, User.active/authVersion y auditoría; requiere aprobación específica, sin trasladar a Identity por HTTP. |
| 32 | POST /control/incidents/:id/status | C | Estado/resolución/auditoría; no se migra como lectura. |
| 33 | POST /control/terminals/:id/status | C | Actualmente permiso ADMIN_TERMINAL_MANAGE y 409 controlado; no escribe. Conservar el rechazo, no activar una escritura nueva. |
| 34 | POST /control/inventory/receipts | C | Abastecimiento, ledger, idempotencia y auditoría en atomic; bloqueado por inventario transaccional. |
| 35 | POST /control/inventory/:stationId/:fuelId/reconcile | C | ADMIN_INVENTORY_RECONCILE, reconciliación/auditoría, backfill y locks; bloqueado. |
| 36 | POST /inventory/:stationId/:fuelId/reconcile | C | access=admin; mismo motor actual de inventario. No crear otra autoridad. |
| 37 | POST /inventory/:stationId/:fuelId/activate | C | Activación de inventario transaccional; bloqueado para 3H. |

Conteo: **7 A, 12 B, 2 D y 16 C**. Hay 21 lecturas de negocio: siete
consolidadas, doce puras pendientes y dos inspecciones transaccionales excluidas.
No se ocultan las pendientes ni se da por cerrado todo Administration. Los GET
revisados de este inventario no mutan datos por sí mismos; las inspecciones D
conservan atomic. /admin/alerts pertenece a Identity y puede reconciliar/escribir,
por lo que no se incorpora por ser GET. /control/catalog/{stations,inventory}
pertenece a Catalog; /control/{payments,assistance,terminal-operations}, a Commerce.

## Definición finita de cierre académico y dependencias

Los cuatro procesos/artefactos independientes ya existen, pero la frontera
hexagonal de Administration sigue parcial. El cierre académico completo requiere:

1. Cerrar un inventario único de estos 37 contratos, con puertos y composición
   explícitos para los casos propios de Administration, manteniendo atomicidad
   y escritor actual. No exige autonomía física de tablas ni otra base.
2. Resolver las doce lecturas B en un bloque final acotado con regresiones
   agrupadas, si se autoriza; no una etapa por ruta. Las dos D requieren decisión
   explícita sobre cómo conservar el puerto transaccional de inventario y las
   dos políticas de acceso existentes. No son escrituras que puedan simularse
   como lecturas triviales.
3. Tratar los dieciséis comandos como frontera separada, por familias: cuentas/
   seguridad y administración operativa/inventario. Una extracción futura puede
   delegar localmente al motor vigente; no requiere reescribirlo, pero debe
   autorizarse expresamente. Las transacciones de alta/grants y ledger siguen
   enteras con el ejecutor actual. AuthCore/PasswordReset permanecen compartidos
   hasta una decisión propia; no se presupone permiso para cambiarlos.
4. Evidencia comparativa de contratos y permisos por familia, pruebas negativas,
   base sintética, cinco builds y arranque aislado del servicio completo. Los
   comandos financieros/de inventario requieren pruebas de idempotencia,
   rollback, concurrencia y recuperación además de HTTP.

No hay un número abierto de nuevas fases implícitas. 3H se cierra como lote de
cuatro detalles; los doce B, dos D y comandos quedan enumerados con salida
verificable. Si se acepta una meta académica más acotada de demostración del
patrón, los siete GET ya la demuestran, pero **no debe llamarse Administration
hexagonal completo** sin resolver o excluir formalmente el resto.

Dependencias conservadas: PrismaService/atomic compartidos, esquema único,
AccessGuard/JWT/UsersService, contrato Actor, ControlService y ControlOperationsService
legacy, InventoryReconciliationService, correo/recovery y proyecciones de tablas
escritas por Identity/Commerce. La consulta multi-tabla no es un snapshot global
ni una garantía de consistencia entre momentos; se preserva el orden original
y Promise.all. La arquitectura no corrige T01, no transfiere tablas ni modifica
la independencia de recuperación de Identity A.4.

## Recomendación concreta para Commerce y límites

Preparar, bajo una nueva autorización, una primera lectura de Commerce:
GET /api/v1/transactions/:id. La inspección puntual confirma TransactionsController.get
→ TransactionsService.get → TransactionsRepository.byId → transactionResponse,
sin escrituras en ese flujo. Su acceso member/either-kiosk no equivale a Control:
miembro ajeno recibe 404; kiosco requiere conservar la autorización vigente.
Antes de extraerla se deberá registrar ese contrato y probar miembro propietario,
ajeno, kiosco válido/inválido y recursos ausentes sobre datos sintéticos. No
copiar la proyección administrativa ni modificar TransactionsService.create.

Este primer cambio permitiría definir puertos Commerce alrededor del repositorio
existente, dejando ventas, pagos, reservas, ledger y cierre de operación con sus
transacciones originales. No sustituir por llamadas HTTP ni usar T01 para validar
recuperación. Commerce no se inició en 3H; sólo se recomienda su entrada acotada.

Límites de esta validación: composición HTTP focalizada real, no stack completo,
frontends, bootstrap/throttler, login, POST-CSRF, restauración, carga/concurrencia
ni motor financiero de escritura. No constituye certificación productiva. Ningún
cambio en Gateway, frontends, Prisma/migraciones, AuthCore, permisos, Identity,
Catalog o Commerce; cierre A.4 y T01 intactos. No se activan imágenes nuevas en
Compose. Reversión eventual: revertir sólo el commit 3H tras autorización, sin SQL,
conservar evidencias y volver a la composición 3G. Sin push ni merge.

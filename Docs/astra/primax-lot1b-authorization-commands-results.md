# Astra — Lote 1B: cuatro fronteras de autorizaciones Commerce

## Registro previo a implementación

Rama feat/dezkz-identity-a4-core; referencia
`c9f010bf4d236d9518cae9c114026b74b1d7c69b`. Árbol versionado e índice limpios;
nueve evidencias históricas sin seguimiento intactas/excluidas. Cadena de commits,
fuentes protegidas del primer comando transaccional y migraciones verificadas.
Se contrastaron la matriz 3I y el plan 3J: sólo los cuatro comandos siguientes.

Todos pertenecen a AuthorizationsController y AuthorizationsService operativos.
Se conservan DTOs, defaults, pipes UUID y el mapper authorizationResponse. La
frontera propuesta delega una vez al método correspondiente; no sustituye
algoritmos, repositorios, bloques atomic o fases con efectos externos.

| Ruta y método | Estado, consultas/escritores y unidad original | Replay, contrato y errores |
|---|---|---|
| POST /api/v1/authorizations | create: POSTPAGO valida vehículo/membresía/código, actividad, estación/fuel/precio/stock, lock de Membership y capacidad de crédito; atomic reserva stock, saldo, FuelAuthorization y WalletMovement. PREPAGO conserva su intent atomic, resolución del pago demo y atomic final de autorización/activación de reserva; no es un atomic global. | 201. POSTPAGO usa requestHash/operationId; PREPAGO usa además prepaidInFlight y su fingerprint original. Clave distinta 409, datos inválidos/saldo 400 con campos actuales, ausencia 404; resultados ambiguos mantienen REVIEW/incidencias, no cobran de nuevo por el adaptador. |
| POST /api/v1/authorizations/:id/progress | progress: atomic, RESERVED/DISPENSING; precio histórico y reserva ACTIVE/contexto verificados. Avance monótono hasta autorizado; actualización FuelAuthorization dispara débito físico/ledger SQL. No crea pago ni puntos. | 200. Avance igual o menor retorna persistido sin nuevo UPDATE/débito; exceso o volumen incongruente 400; estado/contexto incompatible 409; ausencia 404. |
| POST /api/v1/authorizations/:id/release | release: snapshot previo. RELEASED o SETTLED/CANCELLED retorna existente. Con consumo >0 delega al TransactionsService.create original para cerrar financieramente; no duplica ese algoritmo. Sin consumo, atomic: libera stock y saldo POSTPAGO; PREPAGO demo permite devolución/PaymentEvent actuales, proveedor externo sin confirmación rechaza. | 200. Conserva unión de respuestas: autorización o resultado de venta, según rama. Estados no reservados 409; un avance concurrente puede exigir reintentar como hoy. No añade retry ni compensación. Puede emitir recibo sólo mediante el cierre existente con consumo. |
| POST /api/v1/authorizations/:id/intervention | intervention: atomic. SETTLED/RELEASED devuelve estado; otro estado pasa a INTERVENTION_REQUIRED. Actualiza TerminalOperation activa/version y auditoría una vez; reserva pasa a REVIEW; IncidentsService registra incidente según condiciones originales. | 201 por default Nest, sin uniformarlo a 200. Repetición conserva efectos deduplicados y posible campo incident; ausencia 404. No libera stock/saldo ni prosigue despacho automáticamente. |

### Seguridad y efectos técnicos previos

KioskOnly y AccessGuard permanecen intactos. Firma HMAC, ventana temporal,
sesión/versión/estación y CSRF son comprobados por KioskService; las rutas por ID
verifican estación de la autorización. Create conserva binding de operationId y
credencial técnica/TerminalOperation para nueva operación; ownership existente
se comprueba donde corresponde. Miembros con Bearer no adquieren permiso de
escritura. La política legacy x-kiosk-key se conserva, incluidas sus restricciones
actuales de nueva venta/reserva. No se habilita un endpoint nuevo.

Redis mantiene sesiones, límites de operaciones, ownership y bindings de creación;
su efecto no es una transacción PostgreSQL+Redis. El pre-hook checkPlate de create
se conserva antes del motor cuando mode no es PREPAGO y hay código: BusinessAlert
puede persistir aunque el motor rechace o revierta. Ningún otro método gana ese
pre-hook. No cambian firmas, permisos ni authVersion.

PREPAGO de create ya usa componentes de pagos y OnlineOrder internamente. Se
preservan esas llamadas/fases como parte del motor de autorización, sin implementar
fronteras de pagos/órdenes ni invocar sus endpoints como funcionalidades nuevas.
release con despacho ya usa el cierre de venta; se conserva esa delegación interna.
Sin cambios de reglas o partición de transacciones, las cuatro son elegibles.

## Resultados

Las cuatro operaciones fueron consolidadas; ninguna excluida. Flujo:
controlador original (guard/DTO/pre-hook originales) → AuthorizationCommandsAdapter
→ AuthorizationCommands → AuthorizationCommandEngine → ExistingAuthorizationCommands
→ misma instancia AuthorizationsService. Cada método delega exactamente una vez;
no hay retry, catch, conversión de DTO ni nuevo motor. La aplicación y el puerto
no importan NestJS, Prisma ni HTTP. No se inventó dominio para una delegación.
El bootstrap agrega providers al TransactionsModule vigente, sin otro proceso,
repositorio, escritor o base. Los GET existentes siguen usando el servicio original.

### Ejecuciones reales

| Ejecución | Resultado | Evidencia local privada |
|---|---|---|
| Línea base offline | 104 Jest, 24 Gateway y 9 empaquetado, correctas | .cache/astra-lot1b-authorizations/run-0c0f1529db39 |
| Final offline | 112 Jest en 10 suites, 24 Gateway y 9 empaquetado; cero fallos | .cache/astra-lot1b-authorizations/run-b112005984df |
| Builds independientes | Identity, Catalog, Administration y Commerce: exit 0; legacy: exit 0 | logs build-* del final offline |
| Autorizaciones antes | 107 comprobaciones HTTP, 24 casos sintéticos | primax-astra-lot1b-authorizations-6812a79b0f05 |
| Autorizaciones después | 107 comprobaciones; comparación completa coincidente | primax-astra-lot1b-authorizations-5c725038ef83 |
| Regresión POST transactions antes | 38 comprobaciones, 11 casos | primax-astra-lot1b-authorizations-d6c5fdd233bf |
| Regresión POST transactions después | 38 comprobaciones; comparación coincidente | primax-astra-lot1b-authorizations-e608f2e1f5c6 |

Las carpetas de integración están bajo .cache/astra-lot1b-authorizations/. Se
conservan resultados, snapshots, logs y estados finales. El resumen versionable
está en Docs/astra/evidence/lot1b-authorizations/review-summary.json. Los Compose
privados, inspecciones y logs pueden contener credenciales efímeras sintéticas:
se excluyen del commit, al igual que las nueve evidencias históricas protegidas.

Comandos ejecutados: node tools/astra/lot1b-authorizations-validation.cjs --baseline;
node tools/astra/lot1b-authorizations-validation.cjs; node
tools/astra/lot1b-authorizations-postgres-redis.cjs. El primer harness ejecuta
Jest focalizado, node --test para Gateway/empaquetado, build:identity,
build:catalog, build:administration, build:commerce y build legacy dentro de un
contenedor sin red ni volúmenes de datos. Se construyeron imágenes con Dockerfiles
existentes de Commerce y Backend legacy, tags lot1b-authorizations; no se cambió
Compose operativo. Identificadores y verificaciones de artefactos en el resumen.

### Comparación y criterios demostrados

- Create: POSTPAGO y PREPAGO demo, alias de membresía, saldo insuficiente,
  consentimiento de deuda, miembro inactivo, precio desactualizado, monto inválido,
  código ajeno y alerta preexistente. Replay de operationId conserva autorización;
  digest diferente rechaza 409. Dos creates PREPAGO concurrentes invocan el pago
  demo una sola vez. Rechazo y resultado desconocido conservan las fases originales:
  Payment REJECTED/CANCELLED o PENDING/REVIEW respectivamente; sin nuevo intento
  automático ni autorización inventada.
- Progress: avance válido, igual y menor; exceso y galones incompatibles; estados
  SETTLED/INTERVENTION_REQUIRED rechazados. Concurrencia produce un solo movimiento
  físico de DISPENSE para el mismo avance.
- Release: POSTPAGO sin consumo restaura saldo; PREPAGO demo sin consumo conserva
  devolución y su replay. Consumo parcial conserva cierre de venta POSTPAGO/PREPAGO,
  pago, puntos y comprobante del motor original. Repeticiones no duplican efectos.
- Intervention: POSTPAGO con avance y PREPAGO pagado sin despacho; replay conserva
  TerminalOperation.version, incidente INC_001 y auditoría; estados cerrados son
  no-op. No se libera reserva automáticamente.
- Para cada comando se inyectó fallo después de una escritura dentro de su atomic:
  inserción de autorización, actualización con débito físico, liberación de saldo,
  o incidente/auditoría. El snapshot de negocio completo vuelve al previo; posterior
  reintento explícito funciona. No se afirma atomicidad global del proveedor/Redis.
- Para cada comando se simuló respuesta 503 después de completar el método original;
  el reintento explícito recupera el resultado sin nuevos efectos de negocio. No se
  simuló una caída física de PostgreSQL ni se cambió el protocolo de recuperación.
- Para cada comando hubo dos solicitudes concurrentes reales al fixture HTTP.
  Se comprobaron deduplicación, versión y efectos esperados; no es prueba de carga
  ni demostración de todas las intercalaciones posibles.
- Miembros propios/ajenos no adquieren permiso KioskOnly. Firma inválida, timestamp
  vencido, sesión ausente, CSRF incorrecto, credencial inválida, ownership ajeno,
  estación ajena, recurso inexistente y DTO inválido mantienen códigos originales.
  Las rutas por ID rechazan recursos de otra estación en modo firmado. Cookies,
  firmas y credenciales de la prueba no se publican como evidencia.

Se compararon respuestas y todas las tablas de negocio, importes, reservas,
estados, referencias, hashes y secuencias. Los UUID sembrados se mantienen literales;
el fixture proporciona el mismo UUID sintético a la inserción de autorizaciones en
ambos brazos, conservando literales los requestHash que incluyen authorizationId.
Los demás UUID generados se correlacionan por tabla/clave natural. El sufijo UUID
aleatorio de cada observación PAYMENT_REVIEW_RECORDED se correlaciona por operación
y número de observación, conservando cantidad, contenido y relaciones. Se excluyen
timestamps de ciclo de vida y metadatos _prisma_migrations; los ganadores concurrentes
se comparan como multiconjunto de respuestas. No se modifican datos para normalizar:
la correlación sólo se aplica a la evidencia exportada.

Autorizaciones: 2 ventas y 2 comprobantes por brazo, receipt_boleta_seq=2,
terminal_operation_op01_seq=24. Regresión venta: 9 ventas y 9 comprobantes,
receipt_boleta_seq=10 (incluye hueco por rollback original), op01_seq=11; factura
sin uso. Igualdad de snapshots y secuencias en ambas comparaciones. La regresión
reutiliza sin cambios commerce-sale.fixture.ts y commerce-sale.integration.cjs.

### Aislamiento, incidencias del harness y preservación

Cada brazo creó un proyecto, PostgreSQL 17.6, Redis 7.4, red interna y dos volúmenes
nuevos verificados vacíos antes del arranque. Cero puertos publicados. Credenciales
aleatorias exclusivas. Se comprobó host, base y rol antes de aplicar las 36
migraciones existentes, sólo a esas bases vacías. No seeds ni bases operativas.
Se detuvieron únicamente contenedores propios; volúmenes y evidencias conservados.
Los tres volúmenes históricos siguen existentes y no se montaron ni arrancaron.

Se preservan también intentos no aceptados: run-ed1d1368e23d (tipado del mock
unitario corregido); proyectos 1bb355010280 y 8e2e8a5cdfef (fixture de autorización
foránea sin relación requerida corregido a POSTPAGO válido); 7ae44b8aef12 (faltaba
APP_MODE=local en el entorno de la prueba demo); par 2e52fa45482a/dd6ca9a20222
(107 casos correctos por brazo, comparación aún diferenciaba UUID aleatorios y
hashes derivados). No fueron regresiones del motor; no se alteraron sus fuentes.
Sus logs/volúmenes se preservan y están detenidos. La ejecución aceptada es el
conjunto de cuatro proyectos indicado arriba, sin ocultar estos intentos.

### Inventario exacto para el único commit

Dos archivos operativos modificados sólo para enrutar y componer:

- Backend/src/transactions/authorizations.controller.ts
- Backend/src/transactions/transactions.module.ts

Once archivos nuevos:

- Backend/services/commerce/src/application/ports/authorization-commands.ts
- Backend/services/commerce/src/application/use-cases/authorization-commands.ts
- Backend/services/commerce/src/adapters/inbound/authorization-commands.adapter.ts
- Backend/services/commerce/src/adapters/outbound/existing-authorization-commands.ts
- Backend/services/commerce/src/bootstrap/authorization-commands.providers.ts
- Backend/src/transactions/authorization-commands.spec.ts
- Backend/test/authorization-commands.integration.cjs
- tools/astra/lot1b-authorizations-validation.cjs
- tools/astra/lot1b-authorizations-postgres-redis.cjs
- Docs/astra/primax-lot1b-authorization-commands-results.md
- Docs/astra/evidence/lot1b-authorizations/review-summary.json

### Límites y siguiente familia

Persisten AuthorizationsService, repositorios, TransactionsService, pagos internos,
wallet, inventario, incidentes y bootstrap compartidos como adaptadores locales de
compatibilidad. No hay autonomía de código/datos completa. Se mantiene una sola
PostgreSQL por sistema y las unidades transaccionales locales actuales.

La llave legacy x-kiosk-key sigue sin filtro de estación para comandos por ID fuera
del modo académico; la prueba documenta su no-op sobre autorización foránea cerrada.
No se presenta como aislamiento productivo ni se amplía/corrige esa política.
Las pruebas son sintéticas: no certifican proveedores reales, frontend completo,
arranque Compose integral, impresión física, crash recovery ni todos los patrones
concurrentes. T01 sigue pendiente, sin finalización ni compensación. A.4 permanece
cerrado académicamente. Ningún otro microservicio/familia fue migrado.

Los cuatro comandos cumplen el alcance comprobado de Lote 1B; no implica equivalencia
universal. Próximo incremento propuesto, sólo con nueva autorización: familia de
ciclo de vida de pagos agrupada por unidades atómicas existentes, con inventario
previo de reembolsos/reconciliación y sus bloqueos externos; mantener órdenes en una
familia posterior. No iniciar nuevas rutas hasta aprobar alcance y pruebas.

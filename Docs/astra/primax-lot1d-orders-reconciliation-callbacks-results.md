# Astra — Lote 1D: órdenes, reconciliación y callbacks

## Análisis previo a implementación

Referencia eb0d893cb0534e6cebcca903a884f74e1cd1d421, rama
feat/dezkz-identity-a4-core. Sin modificaciones versionadas; nueve evidencias
históricas excluidas e intactas por SHA256, ancestros íntegros y tres volúmenes
históricos existentes. No se montan ni usan. Se reutiliza inventario 1C y matriz 3J,
contrastados con OnlineOrdersService/Controller, webhook y adapters de proveedor.

Las ocho entradas siguientes son elegibles como delegación al motor original.
No se cambia ninguna regla de confirmación, secreto, recuperación ni reintento.

| Entrada HTTP / controlador | Motor y contrato vigente | Consistencia, efectos y riesgos |
|---|---|---|
| POST /api/v1/online-orders, OnlineOrdersController.create | OnlineOrdersService.create, MemberOrKiosk, DTO original, 201. Actor miembro sólo deuda propia; kiosco sólo autorización PREPAGO, firma/sesión/CSRF/credencial/owner/binding/estación. | atomic de intent CREATING, Payment PENDING y reserva PENDING_PAYMENT/welcome o lock Membership para deuda; provider.create posterior, luego PENDING. operationId/digest replay, 409 colisión/cobro activo, 400 datos/precio/importe, 401/403 actor, 404 deuda ajena. Ambigüedad conserva CREATING+REVIEW/incidente, nunca otro cargo automático. |
| GET /api/v1/online-orders/:id, .status | .status, MemberOrKiosk, UUID, 200. owns y binding de estación; miembro ajeno 404, kiosco no puede órdenes de usuario/deuda. | No lectura pura: recuperación CREATING por referencia, consulta proveedor, valida ID/referencia/importe/PEN/paid_at, atomic de captura/rechazo. Escribe Payment/OnlineOrder/Event y, para deuda, Membership/WalletMovement/MembershipDebt/Transaction. Unknown conserva REVIEW/incidente; 409 incoherencia; 503 adapter insuficiente. |
| POST /api/v1/online-orders/:id/demo-confirm, .confirmDemo | .confirmDemo, MemberOrKiosk+owns, DTO importe/PEN, 201. Requiere perfil y provider demo; PENDING/CAPTURED y referencia demo. | provider.confirm original y status posterior. 409 proveedor/importe/estado; simulación fuera de perfil 503. Sin confirmación comercial inventada. |
| POST /api/v1/online-orders/:id/cancel, .cancel | .cancel, MemberOrKiosk+owns, 201. CANCELLED replay, sólo PENDING/providerId. | status previo, provider.cancel con cancel:orderId, status posterior exige CANCELLED. 409 no confirmado/estado, 503 adapter sin cancel; no rollback distribuido. |
| POST /api/v1/online-orders/:id/reselect, .reselect | .reselect, MemberOrKiosk pero motor exige kiosco+demo, 201. | atomic/lock OnlineOrder; PENDING/Payment PENDING/reserva PENDING_PAYMENT sin auth/venta/evento terminal; verifica hashes/contexto y actualiza medio/hashes de los tres. 401 actor, 409 estado/digest/proveedor. No nuevo pago ni reserva. |
| POST /api/v1/online-orders/:id/refund, .refund | .refund, MemberOrKiosk+owns, 201. CAPTURED/REFUNDING, replay REFUNDED; no despacho. | Persiste REFUNDING y eventual intervención/REVIEW antes de provider.refund(refund:orderId); confirmRefund valida evidencia y atomic de compensación. 409 estado/despacho, 503 adapter insuficiente. No confirma por timeout. |
| POST /api/v1/online-orders/:id/notify, .notify | Public+UUID+secreto x-webhook-secret timing-safe, 201; delega status(id) sin actor. | Payload no acredita pago; reconsulta estado original. 401 secreto; conserva errores/efectos de status; sin eventId propio. |
| POST /api/v1/payments/webhook, PaymentWebhookController.receive | Public+DTO PaymentEventDto+secreto timing-safe, 201; .webhook. | Dedup eventId/detail, status o confirmRefund antes de atomic de evento; PAID/FAILED/CANCELLED/REFUNDED exige estado esperado. 400 no confirmado, 409 evento reutilizado, 401 secreto. Registro de evento y consulta externa no son un único atomic. |

### Entradas internas y exclusiones

OnlineOrdersService.status/confirmRefund y llamadas entre sus métodos permanecen
dentro de la misma instancia y algoritmo. No se encamina cada llamada interna por
otro puerto ni por HTTP. status devuelve terminales CAPTURED/REFUNDING/FAILED/
CANCELLED/REFUNDED/CONVERTED; REFUNDING no se concilia automáticamente mediante GET,
su acreditación usa confirmRefund vía refund/webhook. confirmRefund bloquea orden,
valida estado remoto refunded/refunded_at, libera reserva antes de despacho y
welcome, actualiza Payment/Auth/Transaction/puntos o reabre deuda/compensa wallet.

DemoWalletProvider create/get/findByReference/confirm/cancel/refund es la simulación
operativa original (SQL/eventos, locks, pending→paid/cancelled, paid→refunded).
CulqiProvider create/get sigue intacto: faltan findByReference/cancel/refund reales;
eso bloquea acreditar esas capacidades comerciales, no la extracción de frontera.
recordPaymentIssue conserva incidente estable y observaciones audit append-only;
reserveWelcome conserva elegibilidad reservada y transacción llamante.

Fuera de alcance: ControlPaymentsService.detail/act (VIEW/MANAGE y estación),
cancelUnpaidOperation, tickets/claim/atención, wallet/rewards y nuevos motores de
proveedor. Sus llamadas a órdenes siguen usando motor vigente; no migrarlos aquí.
Lotes 1–1C y sus cálculos/escritores quedan intactos. Redis sólo conserva sesiones,
CSRF, límites y bindings; no es parte del atomic PostgreSQL/proveedor. Llave legacy
y owns mantienen limitaciones existentes; no se redefine seguridad comercial.

## Resultados

Ocho entradas consolidadas; siete métodos del puerto (notify conserva status sin
actor). Flujo: controlador original y validación de secreto/guard/DTO →
OrderWorkflowAdapter → OrderWorkflow → OrderWorkflowPort → ExistingOrderWorkflow
→ misma instancia OnlineOrdersService. Se conservan aridad/identidad de argumentos,
respuestas/errores y una llamada al motor por frontera. Las llamadas internas del
motor permanecen internas; no se añade una capa por cada atomic o función privada.
Aplicación/puerto puros, sin NestJS, Prisma, HTTP ni algoritmos financieros copiados.

Los tipos de entrada/actor/respuesta se infieren en el adapter de salida a partir
de firmas originales; la aplicación sólo conoce parámetros genéricos y puertos.
PaymentsModule agrega providers a sus instancias existentes. No otro repositorio,
proveedor operativo, proceso o escritor. Dominio sin reglas artificiales.

### Resultados reales

| Validación | Resultado | Evidencia privada bajo .cache/astra-lot1d-orders/ |
|---|---|---|
| Baseline offline previo | 128 Jest, 24 Gateway, 9 empaquetado | run-a1e939d0d9ec |
| Final offline | 137 Jest en 14 suites, 24 Gateway, 9 empaquetado, cero fallos | run-de554e00005f |
| Compilaciones | Identity, Catalog, Administration, Commerce y legacy: exit 0 | build-* del final offline |
| Órdenes/reconciliación/callbacks | 95 HTTP por brazo, 20 fixtures; comparación coincidente | b25c74134888 / bedcf78c95ac |
| Reembolsos/conciliación parcial | 127 HTTP por brazo; coincidente | 4ebf6d7d076c / aa7ba2f9a25a |
| Autorizaciones | 107 HTTP por brazo; coincidente | 4a0a144f9b08 / 5f5381fec947 |
| Ventas | 38 HTTP por brazo; coincidente | c1f4b3223f63 / d8af20491599 |

Proyectos de integración con prefijo primax-astra-lot1d-orders-. Resumen saneado
versionado en Docs/astra/evidence/lot1d-orders/review-summary.json. Comandos:
node tools/astra/lot1d-orders-validation.cjs --baseline; el mismo sin argumento;
node tools/astra/lot1d-orders-postgres-redis.cjs. El harness offline usa contenedor
sin red/bases ni scripts de inicio. Integración reutiliza sin modificar los scripts
de ventas, autorizaciones y reembolsos. Se construyeron imágenes Docker Commerce
y Backend legacy con Dockerfiles existentes, tags lot1d-orders, usuario node,
entrypoints originales; carga del módulo sin red y sin bootstrap operativo.

### Casos y garantías comprobadas

- Create válido, DTO inválido, sin autenticación, miembro que intenta PREPAGO de
  kiosco, token inválido/vencido, firma/CSRF inválidos, estación ajena y llave legacy
  para nueva operación. Replay retorna el mismo intento sin otro provider.create;
  digest distinto rechaza 409. GET firmado rechaza binding de otra estación.
- Callback sin secreto/incorrecto o DTO inválido no invoca motor. PAID anticipado
  sin evidencia de proveedor rechaza 400; notify PENDING no confirma. Confirmación
  demo → CAPTURED, callback PAID, dedupe, colisión de eventId y FAILED fuera de orden.
  No se verifica firma nativa de Culqi; éste es el ingress normalizado existente.
- Cancelación confirmada/repetida y callback CANCELLED, reserva liberada. Cancelar
  CAPTURED rechaza 409. Refund demo, replay y callback REFUNDED conservan efectos.
- Reselect válido YAPE→PLIN; TARJETA mantiene el fallo histórico descrito abajo.
- Miembro paga deuda propia y replay sin duplicar movimiento; miembro ajeno recibe
  404; kiosco no accede a orden del miembro. Refund de deuda reabre 60.00 y conserva
  saldo 20.00. No se cambia owns ni la política del guard. Legacy GET sobre orden
  extranjera cerrada conserva su limitación histórica fuera del modo académico.
- Concurrencia de create controla la ventana de provider.create: un solo intento
  y una sola llamada de creación; otra solicitud observa CREATING, no se inventa
  promesa de CAPTURED. Capturas concurrentes producen un evento capture. Dos
  callbacks concurrentes producen un evento webhook; replayed puede conservar la
  semántica original false si ambas solicitudes pasaron la primera lectura antes
  del commit, sin segundo efecto financiero. No se uniforma esa respuesta.
- Fallo antes de commit en intent, captura financiera y evento callback revierte
  sus tablas de negocio. Se conserva evidencia del proveedor ya confirmada fuera
  del atomic; retry explícito posterior funciona. No se afirma rollback distribuido.
- Respuesta perdida después de retorno original en create/status/webhook produce
  503 sintético y recuperación explícita sin otra creación/evento/captura. Ningún
  retry se incorpora al producto. No es una prueba de pérdida física del servidor.
- Proveedor comercial simulado: create con respuesta desconocida conserva CREATING
  y reserva REVIEW; retry retorna intent sin nuevo cargo. Recuperación por referencia,
  referencia no observada y adapter ausente 503, importe/moneda incompatibles,
  indisponibilidad, estado desconocido y rechazos rejected/expired. Resultado
  desconocido no se trata como ausencia garantizada de pago.
- Refund simulado con respuesta perdida conserva REFUNDING. GET no lo certifica;
  callback REFUNDED exige confirmación autoritativa y completa el atomic. Callback
  repetido no vuelve a aplicar sus efectos ni invoca otra devolución.

Simulación: proveedor demo SQL original y objeto controlado que implementa sólo el
contrato PaymentProvider para respuestas comerciales, con referencias/importes/PEN/
paid_at/refunded_at válidos o deliberadamente incompatibles. Se bloqueó fetch y
hubo cero intentos HTTP externos. No se instalaron credenciales de procesador.
Los métodos comerciales simulados no acreditan capacidades reales de CulqiProvider.

Respuestas, snapshots de todas las tablas de negocio, secuencias y 74 llamadas al
contrato de proveedor (incluidas preparaciones del harness) coinciden. UUID sembrados
literales, generados correlacionados por tabla/clave natural y UUID de observaciones
audit por operación/ordinal. Timestamps de ciclo de vida (incluido settledAt de
deuda) y metadatos de ejecución de migraciones excluidos; relojes paid_at/refunded_at
del proveedor sintético fijos y comparados literalmente, no eliminados. Sólo
exportación normalizada; datos no se reescriben para comparar. Ventanas concurrentes
del harness se coordinan en el proveedor para repetir la misma intercalación; no
es cobertura de todos los órdenes concurrentes.

El escenario de deuda siembra una venta histórica y su trigger genera un recibo:
se conserva 1 venta/1 recibo, boleta_seq=1 y op01_seq=20, factura sin uso. Los
workflows no emiten otro comprobante. Regresiones: pagos 18/18 ventas/recibos,
boleta_seq=19/op01=20; autorizaciones 2/2, boleta=2/op01=24; ventas 9/9,
boleta=10/op01=11. Se mantienen huecos originales de rollback, no se renumera.

### Observación preexistente y diagnósticos

**Reselect TARJETA no funciona contra el SQL actual**: DTO/servicio la aceptan,
pero OnlineOrder_method_check de migración existente permite otros medios y
rechaza TARJETA (SQLSTATE 23514). Ambas versiones responden 500 y revierten
Payment/InventoryReservation/OnlineOrder; PLIN responde 201. Se consolida la
frontera preservando esta conducta, no se declara corregida esa opción. Resolver
la contradicción requiere aprobación específica de regla/contrato/esquema y
regresiones de consumidores; no modificar migraciones como parte de este lote.

Se preservan intentos no aceptados: run-cfc1dad825a8 (tipado del fixture unitario);
e8239dc93227 y e61e31acb7a7 (descubrimiento/diagnóstico del fallo TARJETA);
f8f0783855d1 (body faltante del callback de prueba), 69c0bebbd54b (expectativa del
harness omitía recibo del trigger al sembrar deuda), par 107fea4dd0c6/e70f1a6aefe5
(95 casos por brazo y snapshots iguales, diferente número de get remotos por
intercalación válida). Se coordinó esa ventana de concurrencia para comparar el
mismo escenario, sin alterar motores. Todos sus contenedores detenidos; logs y
volúmenes conservados. Se distinguen errores de harness de la incidencia SQL real.

### Aislamiento y archivos

Ocho proyectos aceptados con PostgreSQL 17.6 y Redis 7.4, red interna, cero puertos
publicados, credenciales nuevas y dos volúmenes vacíos verificados por proyecto.
Host/base/rol comprobados antes de las 36 migraciones existentes; ningún seed o
base/volumen operativo. Todos los contenedores propios detenidos; no down -v ni
eliminaciones. Volúmenes/evidencias históricos y nueve originales intactos/excluidos.
Los Compose/logs/inspecciones con credenciales sintéticas quedan privados en .cache,
no en el commit. Resumen sólo con metadatos saneados, resultados y hashes.

Existentes modificados: Backend/src/payments/online-orders.ts y webhook.ts (sólo
inyección de controladores/imports), payments.module.ts (providers),
payment-provider.spec.ts (tipos del fixture para nueva dependencia; mismas aserciones),
Docs/astra/primax-stage3j-definitive-hexagonal-closure-plan.md (sección 11 añadida;
plan histórico conservado). Doce nuevos:

- Backend/services/commerce/src/application/ports/order-workflow.ts
- Backend/services/commerce/src/application/use-cases/order-workflow.ts
- Backend/services/commerce/src/adapters/inbound/order-workflow.adapter.ts
- Backend/services/commerce/src/adapters/outbound/existing-order-workflow.ts
- Backend/services/commerce/src/bootstrap/order-workflow.providers.ts
- Backend/src/payments/order-workflow.spec.ts
- Backend/test/order-workflow.fixture.ts
- Backend/test/order-workflow.integration.cjs
- tools/astra/lot1d-orders-validation.cjs
- tools/astra/lot1d-orders-postgres-redis.cjs
- Docs/astra/primax-lot1d-orders-reconciliation-callbacks-results.md
- Docs/astra/evidence/lot1d-orders/review-summary.json

### Cierre acotado y ruta finita

Las ocho fronteras cumplen paridad en los casos indicados, con observación TARJETA;
no equivalencia universal ni certificación de proveedores reales, crash recovery,
frontends completos o portabilidad final. Permanecen motores Prisma/adapters
legacy, plataforma AuthCore/kiosco, limitaciones del proveedor, x-kiosk-key y T01.
No se modifican T01, A.4, otros servicios, Gateway, frontends, esquema o migraciones.

Matriz 3J actualizada: 17/46 rutas con frontera; 29 pendientes en dos paquetes
cerrados (5 wallet/puntos/lecturas de autorización y 24 terminal/asistencia/Control/
recuperación). Motores internos actuales pueden seguir como adapters locales.
Candidatos de plataforma tienen aceptación explícita pendiente, no se cuentan como
terminados. Cerrar Lote 1 exige 46 contratos mapeados a puerto o excepción técnica
aceptada, regresión final agrupada y cero regresiones nuevas; no exige eliminar
todo legacy ni resolver toda deuda productiva. No se inicia ningún paquete siguiente
ni los lotes 2–5. Commerce completo todavía no se declara.

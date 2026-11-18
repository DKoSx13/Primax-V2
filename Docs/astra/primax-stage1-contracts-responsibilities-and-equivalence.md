# Astra — Etapa 1: contratos, responsabilidades y equivalencia funcional

Fecha: 2026-11-18. Estado: análisis estático completado; implementación y ejecución de pruebas no autorizadas en esta etapa.

Base: rama `feat/dezkz-identity-a4-core`, HEAD `bcd0ea8f946793b414429b4a9c8965315ffac286`. El árbol inicial estaba limpio. Este informe y su anexo JSON son documentos nuevos; no sustituyen ni corrigen evidencias históricas. No se inició la Etapa 2.

## 1. Decisión y alcance

La primera modificación recomendable es separar los artefactos de compilación de los cuatro entrypoints existentes, conservando sus módulos, controladores, AuthCore, Prisma y transacciones. No corresponde comenzar trasladando tablas, creando llamadas HTTP entre transacciones o activando el laboratorio Identity como reemplazo operativo.

La meta autorizada para el proyecto es cuatro procesos NestJS y cuatro contenedores de negocio, Gateway, tres frontends, PostgreSQL único y auxiliares existentes. Compartir una base no elimina las fronteras de comandos: cada operación pública debe mantener un único ejecutor y una única unidad de commit. La independencia de despliegue no implica independencia transaccional total, ni exige bases separadas en este proyecto.

Esta etapa concreta contratos y responsabilidades sobre la auditoría anterior. No vuelve a evaluar exhaustivamente el arranque, ni propone cambiar reglas financieras, permisos, suspensión, política de contraseñas o retención. El cierre académico A.4 sigue limitado a las garantías históricas de 4B.2A.

### Evidencia y límites de la línea base

El anexo [primax-stage1-public-contract-inventory.json](primax-stage1-public-contract-inventory.json) contiene:

- 116 declaraciones método/ruta de NestJS, en 29 clases de controlador: 26 Identity, 6 Catalog, 37 Administration, 46 Commerce y una declaración común de health. Son 115 rutas de negocio más health; no son 116 funcionalidades ni 116 respuestas probadas.
- Por ruta: controlador, método, archivo y línea, parámetros, referencias de DTO/Swagger, decoradores de acceso, código de respuesta declarado o valor por defecto, expresiones de retorno, servicio según Gateway y registro en los entrypoints. Health se registra en los cuatro y el Gateway lo agrega.
- Hash del cuerpo del handler y hashes de fuentes de contrato. También hashes de las fuentes de Backend excluyendo specs (incluidos adaptadores opt-in), esquema y archivos de migración revisados, para identificar esta versión sin copiar configuraciones privadas.
- Los 40 modelos Prisma; 166 referencias sintácticas directas de escritura, 30 referencias SQL y 69 referencias a `atomic`/`$transaction`. Estos conteos son referencias de código, incluyen wrappers y no equivalen a operaciones independientes ni a escritores efectivos.

La extracción fue léxica, sin cargar Nest, Prisma Client ni configuración operativa. Se cotejó el número de decoradores HTTP por archivo con el inventario, sin discrepancias. Se cotejaron destino del Gateway y controladores registrados. No se ejecutó un compilador TypeScript ni Swagger en runtime: los DTO, servicios, serializadores, guard y filtro siguen siendo las fuentes normativas. La igualdad de conteos no prueba exhaustividad semántica, autorización efectiva ni equivalencia de respuestas. Las pruebas futuras deben acreditarlas.

Los recibos A.4 del laboratorio no deben confundirse con `Receipt` del esquema operativo: este último es el comprobante de una transacción comercial. No se añadieron recibos de laboratorio al esquema operativo.

## 2. Matriz de responsabilidades y consumidores

| Proceso actual | Casos de uso y contratos que conserva | Módulos del entrypoint | Lecturas y dependencias relevantes | Escritura autorizada por comando actual |
|---|---|---|---|---|
| Identity | Registro/login/reset; sesión y bootstrap/recovery kiosk; membresía/perfil/historial; vehículos/OCR; administración histórica `/admin` | `src/apps/identity/main.ts`: AuthModule, MembershipsModule, VehiclesModule | Users, AuthCore/JWT, permisos Control, Prisma compartido; historial Commerce, deuda, puntos; Redis; OCR y correo | Registro y numeración; perfil; vínculo Vehicle; reset; comandos kiosk de credenciales/estado técnico. No sustituir por los stores A.4 |
| Catalog | Fuels, stations, benefits; inventario público existente; fachada `/control/catalog/*` con alcance del actor | `src/apps/catalog/main.ts`: FuelsModule, StationsModule, BenefitsModule, PrivateCatalogModule | Prisma o adaptador Catalog HTTP opt-in; AuthCore para fachada protegida; FuelInventory es lectura | No se encontró CRUD público de maestros en estos seis contratos. No atribuir a Catalog movimientos de stock por ser lector de inventario |
| Administration | Cuentas y sesión Control; clientes/membresías/vehículos/historial; dashboard; incidencias; abastecimiento y conciliación; estado de terminal | `src/apps/administration/main.ts`: ControlModule, que importa InventoryModule | AuthCore, grants y alcance por estación; proyecciones de Commerce/Identity; inventario y auditoría; correo | Flujos Control de cuentas/permisos propios, desactivación de usuario asociada, incidencias y abastecimiento/conciliación. No trasladar cobros a este proceso por usar `/control` |
| Commerce | Autorización/avance/cierre; ventas y comprobantes; wallet/deuda/puntos/canje; pagos/órdenes/webhooks/reembolsos; terminal y recuperación; asistencia | `src/apps/commerce/main.ts`: TransactionsModule, OperationsModule, AssistanceModule | Payments, Wallet, Rewards, Incidents; elegibilidad User/Membership/Vehicle; Station/Fuel y stock; proveedor externo y contexto kiosk | Todos los comandos financieros y de despacho; sus escrituras asociadas en Membership; configuración operacional `/operational-admin`; acciones Control de pagos/recuperación/asistencia |

Todos incorporan `src/apps/bootstrap.ts`: ConfigModule, PrismaModule, AlertsModule, AuthCoreModule, HealthModule y throttling. Son cuatro procesos con composición compartida, todavía no cuatro paquetes hexagonales autónomos. Que un provider esté disponible no significa que todos sus controladores estén expuestos.

| Consumidor | Contratos que lo conectan con el Backend | Conservación obligatoria |
|---|---|---|
| FuelFlow (`Frontend_1_FuelFlow`) | BFF `server/gateway.js` y política `server/policy.js`; catálogo, placa/OCR, autorizaciones, órdenes, venta, reembolso, terminal y asistencia | Cookies kiosk/técnicas, CSRF, HMAC sobre método/ruta/body, estación y terminal; recuperación y ticket/impresión. No exponer una credencial técnica al navegador como parte de la migración |
| Primax Prime (`Frontend_2_PrimaxPrime`) | Auth, memberships/me, vehicles, beneficios, wallet/recharges, rewards, historial y órdenes | Bearer, almacenamiento/sesión y configuración API web/Android; tipos JSON, paginación y estados de pago |
| Primax Control (`Frontend_3_PrimaxControl`) | Proxy Control; cuentas, panel, catálogo privado, inventario, clientes, pagos, incidencias, asistencia, recuperación y comprobantes | Cookie Control, origen/CSRF del proxy, grants/alcance por estación, ticket y enlace a terminal correcto |

Los consumidores no son autoridades de escritura adicionales. El Gateway enruta; los BFF validan y transportan; el comando de negocio mantiene la escritura. No se añade una segunda ejecución de una mutación para comparar versiones.

## 3. Inventario de contratos públicos congelados

### 3.1 Catálogo exacto por método y ruta

El anexo JSON es el inventario por operación, no una lista aproximada de prefijos. Sus campos `parametersSource`, `requestAndSwaggerSources`, `responseSourceReference`, `returnSourceExpressions` y `responseStatusSource` identifican la entrada y salida existentes. Una referencia a un DTO no implica que todos los parámetros inline estén validados: deben conservarse también las comprobaciones manuales actuales.

El apéndice de este informe enumera las 116 rutas con su destino y acceso declarado. Debe leerse con las reglas de seguridad de 3.3; `public` no significa necesariamente que el handler omita controles.

### 3.2 Contrato transversal que también se congela

| Elemento | Fuente y comportamiento que deben conservarse |
|---|---|
| Prefix/validación | `Backend/src/setup-app.ts`: `/api/v1`, JSON hasta 3 MB, ValidationPipe con whitelist, forbidNonWhitelisted y transform. Conservar pipes de UUID, enums, filtros, fechas y normalizaciones de cada handler |
| Respuesta | Mantener serializers y retornos del servicio, arrays/envelopes, null frente a ausente, Decimal/string/número, fechas, UUID, códigos públicos y `replayed`. No regenerar UUID o números al consultar/reintentar |
| Status | Mantener `@HttpCode`, respuesta manual y default Nest. No convertir indiscriminadamente POST a 200: el default es 201 incluso donde el nombre del comando podría sugerir otra cosa |
| Errores | `common/http-error.filter.ts`: `{statusCode,message,path,timestamp}` y campos permitidos `code,available,amount,amountPending,existingDebt,canRegisterDebt`. Conservar conflicto P2002 y stock insuficiente, mensajes, status y arrays de validación. Timestamp/requestId se correlacionan, no se comparan como constantes |
| Gateway | `gateway/routes.cjs` ordena excepciones antes de prefijos; `server.cjs` conserva query, body, auth/cookies y ruta firmada, retira headers hop-by-hop, timeout upstream 15 s y error 502; no reintenta mutaciones automáticamente |
| Cabeceras/cookies | Preservar CORS por origen, credentials, OPTIONS, `X-Request-Id`, `X-Service-Name`, Set-Cookie y atributos usados por los BFF. No ampliar accesos o normalizar un body firmado durante el traslado |
| Paginación y consulta | Conservar límites/defaults, ordenación con desempate, filtros y alcance por estación; no convertir historial de otro usuario en una lectura pública o global |

### 3.3 Acceso efectivo: matriz de controles

| Acceso del anexo | Controles reales que deben preservarse |
|---|---|
| `default-member` o equivalente sin decorador | AccessGuard usa Bearer; verifica JWT configurado, User.active/authVersion y actor. El servicio verifica propiedad/elegibilidad donde corresponda |
| `admin` | Permisos administrativos actuales; no equivale a un usuario registrado. Conservar grants vigentes y restricciones del caso de uso |
| `control` | Token/cookie Control, aprobación/verificación, grants y estaciones. Los servicios aplican permisos concretos y alcance; preservar también diferencias lectura/escritura |
| `kiosk` / `either` | Rama kiosk firmada o clave legacy permitida por política actual; `either` también admite miembro según guard. Las ventas nuevas requieren contexto técnico y binding; no convertirlo en permiso genérico |
| `terminal` | Firma del gateway, rate limit técnico, credencial/propietario/terminal/operación; límites del ticket de recuperación y expiración/revocación |
| `public` | Auth/login/reset tienen validaciones y rate limits propios. `/kiosk/session/*` valida firma/sesión dentro del servicio. Webhook normalizado exige secreto; notify de proveedor verifica los datos externos. Demo credentials depende de configuración |

Fuente normativa: `Backend/src/auth/access.guard.ts`, `auth/access.ts`, `kiosk/kiosk.service.ts`, `control/*.service.ts`, `payments/webhook.ts` y `payments/online-orders.ts`. El guard procesa ciertas ramas de firma kiosk antes de `@Public`; el decorador aislado no basta para caracterizar seguridad. No retirar AuthCore global en Etapa 2: cambia DI y seguridad aunque un servicio tenga pocas rutas.

No se modifica PasswordReset ni se propone mover la verificación actual a JWT/Gateway como parte del empaquetado. Compartir estos componentes en build no autoriza otra política de revocación ni prioridad de suspensión.

Permisos concretos adicionales a la metadata, que deben incluirse en los casos negativos de equivalencia:

| Familia de operaciones | Permisos/controles actuales adicionales |
|---|---|
| Panel y sesión Control | `ADMIN_CONTROL_ACCESS`, grants y cuenta aprobada/verificada; `ADMIN_DASHBOARD_VIEW` para las vistas que lo requieren; User.active/authVersion. La condición global/SUPER_ADMIN y SYSTEM_ADMIN no se sustituye por un rol enviado por el cliente |
| Crear/aprobar/asignar acceso/rechazar/desactivar cuenta Control | `ControlService.assertGlobal`, y comprobaciones SYSTEM_ADMIN cuando corresponde; motivos, contraseña de confirmación y prohibición de cambiar el propio estado según el comando |
| Clientes/membresías/vehículos/transacciones/comprobantes Control | `ADMIN_CUSTOMER_VIEW`, `ADMIN_MEMBERSHIP_VIEW`, `ADMIN_VEHICLE_VIEW`, `ADMIN_TRANSACTION_VIEW`, `ADMIN_RECEIPT_VIEW` respectivamente; además se omiten campos relacionados si falta el permiso correspondiente y se aplica alcance de estación |
| Operaciones/terminales Control | `ADMIN_OPERATION_VIEW`, `ADMIN_TERMINAL_VIEW`, `ADMIN_TERMINAL_MANAGE` según lectura/acción, más estación y estado/versiones |
| Inventario Control y fachada Catalog | `ADMIN_INVENTORY_VIEW`; movimientos `ADMIN_INVENTORY_MOVEMENT_VIEW`; abastecimiento `ADMIN_INVENTORY_RECEIVE`; conciliación `ADMIN_INVENTORY_RECONCILE`; auditoría `ADMIN_AUDIT_VIEW`. Mantener scopes, no sólo el nombre del permiso |
| Incidencias/asistencia/pagos excepcionales Control | `ADMIN_INCIDENT_VIEW` para consulta y `ADMIN_INCIDENT_MANAGE` para acciones, con alcance del caso de uso y estado verificable |
| Ticket de recuperación excepcional | `KioskService.issueRecoveryTicket`: global/SUPER_ADMIN, `ADMIN_TERMINAL_MANAGE` y `ADMIN_INCIDENT_MANAGE`; revalida SYSTEM_ADMIN/User activo en el tx. Exchange vuelve a comprobar autorización y evidencia, no confía sólo en la existencia del ticket |
| Miembro/kiosk/terminal | Propiedad user/membership/placa; estado activo donde el caso lo exige; firma/owner/estación/operationId y contexto técnico; credential expirada/revocada rechaza. Las condiciones de replay deben permanecer en el mismo orden relativo a las validaciones actuales |

El anexo incorpora `permissionReferences` con archivo/línea y contexto de método para localizar checks y proyecciones condicionadas. No es un evaluador de políticas: algunas condiciones son compuestas o indirectas y sólo sus casos de prueba autorizados demostrarán equivalencia.

### 3.4 Contratos de borde y auxiliares fuera del conteo Nest

| Contrato | Destino/fuente | Requisito de equivalencia |
|---|---|---|
| `/api/v1/health`, `/healthz` en Gateway | `gateway/server.cjs` intercepta la ruta por pathname, agrega estados; 200/503 con status/services | Distinguir del health de cada servicio. No interpretar health PostgreSQL como prueba de Redis/SMTP o de todas las funciones |
| OPTIONS en Gateway | Respuesta 204 | Preservar CORS y headers admitidos |
| Ruta desconocida | 404 del Gateway con message/requestId | No enrutar colisiones de prefijo a otro servicio |
| `/docs/{identity,catalog,commerce,administration}/api/docs` y recursos | Proxy Swagger por servicio; disponibilidad local o SWAGGER_ENABLED en setup | No hacer Swagger público por defecto ni tomarlo como contrato completo de respuestas |
| GET/POST `/api/v1/demo-print/jobs/receipt-<id>` | Ruta Gateway a PrintAgent demo; patrón `receipt-[a-zA-Z0-9-]{1,100}` | Idempotencia del trabajo y consulta; no sustituye impresión física Windows |
| GET `/api/kiosk/session`; POST `/api/kiosk/session/login`, `/api/kiosk/session/logout` | Alias BFF FuelFlow a los métodos equivalentes `/api/v1/kiosk/session...` | Cookies, CSRF, firma y rechazo por origen; no son nuevas rutas Nest |
| POST `/api/kiosk/terminal-bootstrap`, `/api/kiosk/terminal-recovery` | Alias BFF a `/api/v1/kiosk/session/terminal-bootstrap` y `/terminal-recovery` | Preservar terminalCode/owner/ticket y tratamiento de credenciales |
| Proxy de negocio FuelFlow | Allowlist exacta `Frontend_1_FuelFlow/server/policy.js`, en paridad con `Backend/src/kiosk/policy.ts` | GET health/fuels/stations/fuels-inventory, placa con patrón actual y lectura por UUID de autorización/transacción/orden; POST check-plate, reconocimiento, autorización/venta/orden y subcomandos autorizados. Query, `%` y `..` se rechazan por esta política; no ampliar el proxy |
| Proxy de Primax Control | `Frontend_3_PrimaxControl/server/` y `tests/control-proxy.test.js` | Mantener aliases y transporte al `/api/v1/control...` actual, estación, cookies y origen. El destino de la ruta puede ser Commerce o Catalog aunque pase por el proxy Control |
| OCR interno `/health`, POST `/recognize` | PlateRecognition y `vehicles/recognition.service.ts` | Contrato de imagen/kind y credencial técnica existentes; no publicarlo como un quinto dominio de negocio |
| Catalog privado existente | `Backend/src/catalog-reader/catalog-reader.ts` hacia `services/catalog` cuando el adaptador HTTP está habilitado | URL/key, timeout, schema de array y filtrado por actor actuales. No habilitarlo para alterar lecturas de una transacción financiera |

## 4. Propietarios de escritura: comandos, campos y efectos de base

Regla para la transición: la autoridad se asigna al comando actual y sus campos, no al nombre de la tabla. Se conserva un solo ejecutor por ruta. Dos comandos legítimos sobre una tabla compartida no autorizan duplicar un comando en dos servicios. La siguiente matriz cubre los 40 modelos; las lecturas transversales continúan sobre PostgreSQL único en este corte.

| Modelos | Ejecutor actual y escritura | Unidad/consideración para la migración |
|---|---|---|
| User | Identity registra/reset; Administration crea/gestiona cuenta Control y desactiva usuario/authVersion dentro de ese flujo | No copiar desactivación a Identity mediante HTTP. El adaptador `identity-adapters/authcore.ts` tiene una escritura potencial opt-in, **no registrado**: no contarlo como nuevo ejecutor operativo |
| MembershipNumberCounter | Identity, `users/membership-number.ts` con UPDATE RETURNING y registro | El contador se actualiza dentro del tx User+Membership; migración inicializa/reconcilia. No usar MAX+1 |
| Membership | Identity crea/perfil; Commerce saldo, deuda y flags de bienvenida; venta puede guardar datos de comprobante | Contrato por campo y comando. No mover balance/bienvenida/perfil fiscal usado en venta a RPC. `Membership.status` no cambia en este trabajo |
| MembershipCodeAlias | Migraciones históricas de numeración conservan códigos anteriores | Lectura/resolución operacional; no se encontró escritor HTTP nuevo. Mantener alias/UUID/códigos, no reejecutar backfills |
| Vehicle | Identity, `vehicles/vehicles.repository.ts::link` en el Backend | Único camino operativo de vínculo encontrado. No activar escritor paralelo del laboratorio A.4 ni recrear vehículos |
| Station, Fuel, Benefit | Maestros consultados; seeds/migraciones/provisión existentes | No hay CRUD público de estos maestros en los controladores inventariados. Catalog no recibe una autoridad de escritura inventada |
| Transaction | Commerce: cierre de venta, deuda, pagos/reembolso según comando | Con comprobante, autorización y efectos monetarios en el mismo tx donde el código los agrupa |
| Receipt | Función/trigger `issue_transaction_receipt` al INSERT Transaction | Escritor efectivo es PostgreSQL dentro del tx de Commerce. Numeración y protección de inmutabilidad no se sustituyen con código nuevo |
| FuelAuthorization | Commerce, AuthorizationsService y ciclo de pagos/órdenes | Reservas, avance y liquidación con inventario/stock/terminal y replay existentes |
| UserPermissionGrant | Commerce, OperationsService `/operational-admin/permissions/admin*`; provisión existente | Conservar este comando actual y sus controles, aunque sea configuración administrativa. No clonarlo en Administration |
| AdminControlAccount, AdminControlGrant, AdminStationAssignment, AdminEmailVerification | Administration, ControlService | Alta/solicitud/verificación/aprobación/rechazo/desactivación con User y auditoría; permisos Control distintos de UserPermissionGrant |
| SupervisorStationAssignment, SupervisorShift, TerminalEnablement | Estructuras de fundamentos/provisión; no se encontró escritor público directo actual en la revisión | No afirmar que están vacías u obsoletas: sólo no atribuirles un CRUD operativo nuevo. Se preservan datos, restricciones y lectores |
| Pump, TerminalPumpAssignment | Commerce, OperationsService | Asignación, cierre de asignación, exclusión y locks conservados |
| Terminal | Commerce configura/revoca/asigna; Identity kiosk bootstrap/recovery actualiza estado técnico asociado | Mantener comandos distintos, locks/versiones y checks. No crear un segundo bootstrap por mover el modelo |
| TerminalCredential | Identity emite/rota en kiosk; Commerce revoca dentro de sus comandos operacionales | No trasladar emisión/revocación a llamadas nuevas dentro del tx. Seguridad común puede leerla desde varios procesos |
| TerminalOperation | Commerce crea/cierra/recupera y AuthorizationsService registra estado; Identity kiosk bootstrap/recovery tiene transiciones propias | Mantener ambos flujos existentes y su exclusión por terminal. La futura concentración de autoridad requiere decisión, no es parte del build |
| OperationalAuditEvent | Identity kiosk; Administration cuentas/inventario/incidencias; Commerce operaciones/pagos/asistencia | Writer del evento es el ejecutor del comando. Append-only y claves de evento actuales; no emitir un duplicado desde Gateway |
| OperationalIncident | Administration Control; Commerce IncidentsService, pagos y asistencia | Separar declaración/estado del incidente por comando actual, manteniendo autorización y evento asociado |
| WalletMovement, Payment, MembershipDebt | Commerce, Wallet/debt, venta, órdenes, lifecycle/reembolsos | Ledger, saldo y estado con Decimal y replay. No repartir la misma transacción entre servicios |
| RewardMovement, Redemption | Commerce, venta/pagos y canje; parte de los writes son nested Prisma | Mantener puntos positivos/negativos y canje atómico. El escaneo directo de `.rewardMovement.create` no detecta todos los nested writes |
| PasswordReset | Identity, PasswordResetService | Emitir/verificar/consumir token y actualizar credenciales/authVersion con política actual; fuera del refactor autorizado |
| BusinessAlert | AlertsService compartido, disparado por los flujos actuales; resolución en `/admin/alerts` Identity | Provider global no implica nuevo CRUD ni permiso para alertar doble por la misma operación |
| FuelInventory, InventoryActivation, InventoryReservation, InventoryMovement | Administration abastece/activa/concilia; Commerce reserva/avanza/libera/cierra a través de funciones SQL y triggers | Autoridad diferenciada por comando y función SQL; preserve locks, eventKey, secuencia, balance físico/reservado y estados REVIEW. Catalog sólo lee |
| OnlineOrder, PaymentEvent | Commerce, OnlineOrders y proveedores/lifecycle/refund actuales | Claves de evento/proveedor, correlación operationId y estado de resultado externo; no duplicar recepción o ejecución de cobro |
| AssistanceRequest | Commerce, AssistanceService | Transiciones actor/terminal/estación y auditoría actuales |

El anexo enumera referencias archivo/línea de writes directos, SQL y transacciones. No descubre por sí solo nested writes, invocaciones dinámicas, funciones de base o writers de seed. Estos últimos siguen siendo herramientas de provisión, no deben arrancarse desde cada microservicio. Ningún comando de seed o migración fue ejecutado.

### 4.1 Unidades de transacción que no deben convertirse en HTTP

| ID | Entrada/unidad actual y fuentes | Acoplamiento que debe conservarse | Riesgo/aceptación específica |
|---|---|---|---|
| TX01 | Registro: `users/users.repository.ts`, `users/membership-number.ts` | User + Membership anidada + contador en `$transaction`; reintentos de numeración existentes | Registrar concurrentemente sin duplicar código; un fallo revierte cuenta, membresía y contador según comportamiento actual. No afirmar que usa el mismo aislamiento que `atomic` |
| TX02 | Reset: `auth/password-reset.service.ts` | Estado del token, elegibilidad/política, cambio hash y authVersion; consultas de grants/cuenta Control | Token consumido una vez y sesión anterior invalidada como hoy. Sin política nueva |
| TX03 | Vínculo: `vehicles/vehicles.repository.ts` | Usuario/membresía, propiedad de placa, adopción/create/replay dentro de `atomic` | Conservar UUID y vínculo histórico; dueño diferente rechaza; no hacerlo doble ni activar recibo de laboratorio |
| TX04 | Kiosk bootstrap/recovery: `kiosk/kiosk.service.ts` | Locks de Terminal, credencial, estado de operación y auditoría en los bloques SQL actuales; Redis mantiene estado de sesión/binding separado | No prometer atomicidad PostgreSQL+Redis que no existe. Ensayar fallos/reinicio antes de rediseñar coordinación |
| TX05 | Venta: `transactions/transactions.service.ts` y repository/model | Hash/operationId, contexto técnico, autorización, elegibilidad, importes/volúmenes/precio histórico, saldo/ledger, perfil de comprobante opcional, puntos, Transaction y Receipt trigger | Fallo no produce venta parcial; replay conserva resultado y datos distintos confligen. No extraer wallet, membership o stock a RPC |
| TX06 | Reservar/avanzar/liberar: `transactions/authorizations.service.ts`, `inventory/inventory-reservations.ts` | Autorización, reserva financiera/física, actualización de volumen que dispara stock/ledger, contexto técnico | No doble débito/dispensado ni liberación de volumen consumido; misma regla de litros/galones y redondeo |
| TX07 | Recharge/deuda: `wallet/wallet.service.ts`, repository, `wallet/debt.ts` | Locks de Membership, saldo, deuda/pago y movimientos dentro del tx recibido | Saldo y ledger equivalentes; respetar limites/cargos/operaciones sin crear un servicio remoto de wallet |
| TX08 | Órdenes/webhook/refund: `payments/online-orders.ts`, `payment-lifecycle.ts`, `partial-refund.ts`, proveedores | Bloques SQL locales con locks y eventos, importes acumulados y vínculos; los efectos externos ocurren en las fases que ya define el código | No describir todo el ciclo con proveedor como un solo tx SQL. Preservar resultados desconocidos, reconciliación y deduplicación; timeout no autoriza nuevo cobro |
| TX09 | Canje: `rewards/rewards.service.ts`, repository | Elegibilidad y puntos agregados, Redemption y RewardMovement anidado | Misma clave mismo resultado; clave/beneficio distintos conflicto; puntos no negativos por carreras según reglas vigentes |
| TX10 | Control cuentas: `control/control.service.ts` | User/cuenta/grants/estaciones/verificación/auditoría en cada bloque actual; disable incrementa authVersion y revoca grants/asignaciones | Mantener controles/estados y atomización actuales; correo externo no adquiere atomicidad SQL por empaquetar |
| TX11 | Stock: `control/control-operations.service.ts::receiveInventory`, `inventory/inventory-reconciliation.ts` | FOR UPDATE del par, activation, eventKey/sequence, litros físicos/reservados y movimientos; conciliación con sus etapas de inspección/escritura | Abastecimiento replay no duplica litros; ledger y stock iguales; no activar/conciliar automáticamente por el refactor |
| TX12 | Terminal/recuperación/asistencia: `operations/operations.service.ts`, `control-payments.ts`, `assistance/assistance.service.ts` | Locks, estados/versiones, credenciales, permisos y auditoría; los comandos financieros llaman a sus proveedores actuales | Ningún comando nuevo omite contexto técnico/permisos; conservar límites del ticket y los bloqueos actuales |
| TX13 | Triggers y funciones SQL | Numeración de comprobante/operación, inmutabilidad de receipt/audit/ledger, inventario | Misma cadena de migraciones y constraints; comparación sólo de Prisma no basta para acreditar equivalencia |

`PrismaService.atomic` conserva Serializable, maxWait/timeout de 10 s, hasta cinco intentos y clasificación existente de conflictos. `OperationsService` usa `retryUnique:false` donde el código lo pide. Los wrappers que reciben `Prisma.TransactionClient` deben seguir recibiendo el mismo cliente: abrir otra conexión dentro del caso de uso o llamar HTTP rompería la unidad. Ninguna de estas opciones se modifica en Etapa 2.

Funciones/triggers relevantes leídos en las migraciones existentes: `v11_debit_fuel`, `inventory_create_reservation`, `inventory_release_reservation`, `inventory_activate_reservation`, `inventory_mark_reservation_review`, `inventory_close_reservation`, inicialización/validación de pares, `issue_transaction_receipt`, protección del comprobante, `next_operation_number` y protección de auditoría/ledger. El orden de las migraciones y sus redefiniciones forma parte del comportamiento actual; no se copian funciones sueltas a una nueva autoridad.

## 5. Dependencias a desacoplar, sin cambiar reglas

| Dependencia | Situación concreta | Acción segura posterior / límite |
|---|---|---|
| Build/imagen comunes | Cuatro main importan bootstrap común y se compilan con un proyecto amplio | Primero perfiles de build y artefacto por main; preservar imports efectivos. Un lockfile común es compatible con procesos independientes en esta entrega intermedia |
| AuthCore global | Todos requieren guard, JWT, Users, Kiosk/Redis, reset y config por composición actual | No quitarlo por tamaño del grafo. Para reducirlo se necesita mapa DI y autorización específica si cambia AuthCore/PasswordReset/política |
| Config global | `validateEnvironment` requiere capacidades que no todas las rutas usan; bootstrap local busca estación en PG | Documentar mínimos por servicio en etapa de configuración; ahora conservarlos. Un servicio que compila no necesariamente puede arrancar sin Redis/estación |
| Acceso Prisma desde aplicación | Servicios/repositories y helpers reciben Prisma/TransactionClient directamente | Introducir puertos gradualmente sólo conservando la unidad transaccional. El puerto de unidad de trabajo puede encapsular varios modelos; no crear un repositorio HTTP por tabla |
| Lecturas cruzadas Identity | MembershipsRepository importa modelos de transacción y helpers de deuda Commerce | Primero conservar consultas/serializer; luego puertos de lectura con equivalencia. No trasladar lecturas de elegibilidad de una venta fuera de su tx |
| Terminal y stock compartidos | Comandos actuales en Identity/Commerce/Administration, funciones de base comunes | Propiedad por comando de sección 4; no migrar autoridad con un movimiento de carpeta. La concentración futura requiere diseño/autorización si cambia coordinación |
| Catalog hexagonal paralelo | `services/catalog` y fachada `Backend/src/catalog-reader`; selección HTTP opt-in | Reutilizar dominio/puertos con pruebas de paridad; no registrar dos rutas públicas ni cambiar adapter por defecto en el build |
| Identity académico paralelo | `services/identity`, `Backend/src/identity-core`, adapters opt-in y laboratorios A.4 | Mantener historial/cierre; no adoptar el runtime sintético como main operativo. A.2 y autonomía no se dan por terminadas |
| Módulos Commerce concentrados | Transactions importa Wallet/Rewards/Payments/Incidents; Operations importa Payments/Incidents/AuthCore | Mantenerlos como una frontera financiera; hexagonal no significa un proceso por módulo |
| DTO/serializers de transporte | Controladores, DTO inline y modelos compartidos exponen JSON específico | Extraer contratos sólo con igualdad de forma/status/error; evitar importación de Nest/Prisma en el futuro dominio |

La estructura final acordada se alcanza por dependencias reales: `Backend/services/<servicio>/src/{domain,application/{use-cases,ports},adapters/{inbound,outbound},bootstrap}`, `Backend/gateway`, `Backend/contracts`, `Backend/platform` y `Backend/prisma`. Contracts alojará contratos de transporte/tipos explícitos; platform infraestructura técnica reutilizable, no casos de negocio compartidos con autoridad propia. Prisma y migraciones permanecen únicos. En el primer cambio no se crean carpetas vacías domain/application para simular una separación que todavía no existe.

## 6. Pruebas que protegerán la equivalencia

### 6.1 Clasificación de seguridad y recursos — no ejecutadas

| Grupo | Pruebas existentes representativas | Recursos y autorización futura |
|---|---|---|
| A: sin base ni servicios externos | `Backend/gateway/routes.test.cjs`; `Backend/scripts/database-safety.test.cjs`; tests frontend `.test.js` de gateway/política, proxy Control, servicios con fetch simulado, auth/estado de pago/impresión | Node 22; archivos locales y mocks. Safety lanza wrappers para verificar rechazo antes de acceso remoto. Ejecutar sólo listas revisadas, sin cargar `.env` real. No requieren Compose/PG/Redis. Pedir autorización antes de correrlas |
| B: unitarias Nest con mocks | Specs de `auth/{password-policy,auth.service,recovery-delivery,smtp-delivery}`, `config/environment-security`, `vehicles`, `transactions`, `payments`, `wallet`, `rewards`, `control`, `kiosk`, `operations`, `catalog-reader`, `identity-adapters` | Dependencias npm/Jest/ts-jest/Prisma Client generado; revisar setup y mocks de cada selección. No asumir que `npm test` es inocuo por llamarse unitario. Compilación/generación producen archivos y no se hicieron en esta etapa |
| C: núcleo/laboratorios | `Backend/test/identity-core/core.test.cjs`, `services/{identity,catalog}/test`, `services/identity/lab/vehicle-link-success.test.cjs`, `vehicle-recovery.test.cjs`, runners `tools/astra/*lab.cjs` | Algunas selecciones son puras y otras usan PostgreSQL/HTTP/Redis/compilación. Separar por runner; nunca autorizar todo el directorio por glob. Preservar evidencia histórica, salida nueva en recursos nuevos si luego se autoriza |
| D: integración SQL | `Backend/test/*.e2e-spec.ts`: registration, auth-recovery, control, control-customers, control-operations, inventory-foundations/reconciliation, v2-payments/prime, partial-refund, receipts, terminal-refactor, assistance, prepaid-guest, v11-provider/closure | PG nuevo y sintético, Prisma generado, credenciales ficticias, proveedores/correo/OCR simulados y Redis aislado cuando aplique. Varias suites ejecutan migrate/seed/DDL y DROP SCHEMA en teardown: no son pruebas de sólo lectura ni seguras contra una base existente |
| E: navegador/sistema | `tools/integration.spec.cjs`, `tools/v11_4-regression.spec.cjs`, `tools/v11_4-ticket.spec.cjs`, specs Prime de login/register/recovery/mobile; runners Astra de paridad | Playwright/navegadores, tres frontends, Gateway/servicios aislados, DB/Redis sintéticos, OCR fixture, print demo. Algunas herramientas arrancan o modifican recursos: revisar antes de autorizar. Android/impresión física tienen requisitos adicionales |

No se ejecutaron A–E. Los nombres de suites indican cobertura prevista, no prueba suficiente por sí sola: antes de ejecutarlas se debe verificar cada assertion y completar los huecos en los siguientes casos de aceptación. No hay nuevos resultados «passed» en este informe. Los resultados académicos históricos siguen siendo los registrados en sus documentos originales, no una línea base de ejecución de esta migración.

### 6.2 Matriz de equivalencia y criterios de salida

| ID | Función y equivalencia exigida | Prueba existente que aporta cobertura | Evidencia futura exigida para aceptar migración |
|---|---|---|---|
| F01 | Rutas, método, DTO, status, error y destino iguales para 115 rutas de negocio | Gateway routes, API e2e y JSON adjunto | Comparador de contratos y fixtures sintéticos old/new; cada ruta trazable, 404/405/validación y orden de exceptions incluidos. No basta contar rutas |
| F02 | Registro, numeración y alias, login/reset, sesión/revocación actuales | registration/auth-recovery e2e, auth specs, membership-number/code specs | Casos éxito/rechazo/replay/concurrencia; UUID/código/alias y grants equivalentes; sin divulgar cuentas ni tokens |
| F03 | Propietario de vehículo y perfil/membresía/historial | vehicles specs, v2-prime/control-customers e2e | Otro dueño denegado, elegibilidad igual, UUID y referencias financieras conservados. Sin writer A.4 nuevo |
| F04 | Catálogo/stock público y privado con mismo alcance | catalog-reader/private-catalog specs, Catalog tests | Arrays/filtros/Decimal/status iguales; `/fuels/inventory` conserva comportamiento existente. No cambiar su exposición durante migración |
| F05 | Reserva/avance/cierre PREPAGO/POSTPAGO y guest | authorizations/critical-integrity/transactions specs, prepaid-guest, inventory e2e | Mismos importes/galones/litros/precio snapshot/redondeos; replay no duplica; datos distintos conflicto; fallo no deja cierre parcial |
| F06 | Wallet, puntos, bienvenida, deuda y canje | wallet/rewards/points specs, v2-prime/v2-payments e2e | Balances y ledger idénticos antes/después; concurrencia, límite insuficiente, rollback y reintentos incluidos |
| F07 | Orden, pago externo, webhook duplicado, reselect, cancel/refund total/parcial | provider/payments/reselect specs; partial-refund/v11-provider/closure e2e | Deduplicación por claves, montos acumulados/currency iguales; respuesta perdida y proveedor desconocido no causan doble cobro/reembolso |
| F08 | Comprobante y número operacional | receipts e2e, v11_4-ticket/regression | Un Receipt por Transaction; mismo formato y protección; no renumeración histórica; comparación correlacionada de IDs sintéticos |
| F09 | Control cuentas/permisos/scopes, estaciones y panel | control/create-account/customers/operations e2e; control-cookie/scope specs | Matriz de actor activo/inactivo, grant/estación, acceso y rechazo; cookies y CSRF iguales; no acceso entre dueños/estaciones |
| F10 | Bootstrap/recovery terminal, suspensión/revocación según reglas actuales | kiosk bootstrap/recovery/access specs, terminal-refactor e2e | Locks y versiones equivalentes, tickets limitados, carreras/reinicio conservan las garantías actuales; ninguna prioridad nueva asumida |
| F11 | Abastecimiento/conciliación/asistencia/incidencias | inventory-foundations/reconciliation, control-operations, assistance/incidents e2e | eventKey no duplica litros/evento; stock/ledger/activation coinciden; permisos de acción y estado iguales |
| F12 | FuelFlow, Prime y Control completos | Tests frontend, integración Playwright, tickets/mobile | Mismos recorridos y errores visibles, cookies/orígenes, navegación y sesión; OCR fixture y print demo. Ejecutar también denegaciones, no sólo happy path |
| F13 | Build/arranque/reinicio/persistencia | futuros perfiles; scripts de validación limpia existentes a revisar | Cuatro artefactos arrancables con configs explícitas, un proceso por contenedor, rutas esperadas y recursos aislados. `docker compose up -d` y portabilidad corresponden a Etapa 4/5, no quedan aprobados aquí |
| F14 | Preservación A.4 y ausencia de segundo escritor | Tests históricos de contrato/labs y comprobación de imports/registro | Ningún endpoint nuevo del laboratorio, mismos hashes de evidencia histórica; cierre académico intacto, sin afirmar procedencia independiente ni JWT productivo |

Para comparar SQL se usan fixtures deterministas en bases nuevas separadas, con la misma cadena existente de migraciones. Se correlacionan UUID generados de prueba sin modificar UUID históricos; se comparan importes y relaciones exactos, orden y tipos JSON, y timestamps con reglas explícitas. Proveedor, SMTP, OCR y print son fixtures, no servicios de producción. Cada caso registra commit, configuración no secreta, suite/caso, salida nueva y diferencias aprobadas (el objetivo inicial es ninguna diferencia funcional). Esta metodología está propuesta; no ejecutada ni implementada.

## 7. Primer cambio de código propuesto para Etapa 2

### Objetivo verificable

Generar cuatro artefactos separados a partir de `src/apps/{identity,catalog,administration,commerce}/main.ts` y cuatro Dockerfiles seleccionables individualmente. Sin mover casos de uso, sin cambiar controladores, providers, Gateway, Compose, esquema ni dependencias npm. Mantener build y Dockerfile raíz como alternativa de reversión.

Es una entrega de empaquetado intermedia: mantiene fuentes y lockfile comunes, y el bootstrap actual. No se presenta como consolidación hexagonal final ni como reducción ya demostrada del grafo AuthCore. Eliminar dependencias de negocio no utilizadas sólo será aceptable cuando el grafo de imports y pruebas lo acrediten; AuthCore/PasswordReset no se tocan con esta propuesta.

### Lista exacta propuesta — 11 rutas, ninguna modificada todavía

| Acción futura | Ruta | Cambio limitado propuesto |
|---|---|---|
| Modificar | `Backend/package.json` | Añadir scripts explícitos build/start por servicio; conservar scripts/dependencias/versiones actuales |
| Crear | `Backend/scripts/build-domain.cjs` | Selección allowlist de los cuatro servicios, compilación del perfil y copia del soporte runtime requerido, sin iniciar app/Prisma/migraciones/seeds |
| Crear | `Backend/scripts/build-domain.test.cjs` | Tests del empaquetado: selección/rutas de salida, protección de rutas y copia de assets con fixtures/subprocesos simulados; no tests que sólo repitan constantes |
| Crear | `Backend/services/identity/tsconfig.build.json` | Perfil con raíz y salida explícitas y entrada Identity existente |
| Crear | `Backend/services/catalog/tsconfig.build.json` | Perfil con raíz y salida explícitas y entrada Catalog existente |
| Crear | `Backend/services/administration/tsconfig.build.json` | Perfil con raíz y salida explícitas y entrada Administration existente |
| Crear | `Backend/services/commerce/tsconfig.build.json` | Perfil con raíz y salida explícitas y entrada Commerce existente |
| Crear | `Backend/services/identity/Dockerfile` | Artefacto/runtime Identity con mismo Node, dependencias y Prisma; CMD a su main |
| Crear | `Backend/services/catalog/Dockerfile` | Artefacto/runtime Catalog con la misma regla |
| Crear | `Backend/services/administration/Dockerfile` | Artefacto/runtime Administration con la misma regla |
| Crear | `Backend/services/commerce/Dockerfile` | Artefacto/runtime Commerce con la misma regla |

No se propone modificar package-lock: sólo scripts, sin cambio de dependencias. Si el build lo exige, se detiene el lote y se revisa alcance; no se amplía silenciosamente la lista. Tampoco se añade un manifiesto npm artificial por servicio antes de conocer su cierre real de dependencias.

### Diseño del empaquetado

Cada tsconfig hereda las opciones del Backend, pero define su lista de entradas y excluye tests/seed. TypeScript sigue los imports reales: un perfil no convierte las librerías compartidas en servicios remotos. Usar una raíz estable `Backend/` y salidas separadas, por ejemplo `Backend/services/<servicio>/dist/src/apps/<servicio>/main.js`; conservar rutas relativas de los JS compilados. Evitar borrar `Backend/dist` o la salida de otro servicio al compilar en paralelo.

Debe copiarse `scripts/database-safety.cjs` en la ruta relativa esperada por la configuración compilada, como hace `scripts/copy-build-support.cjs` para el build antiguo. No basta emitir TS; revisar assets runtime, Prisma Client, motores nativos, package.json y resolución de node_modules dentro del contenedor.

Contexto Docker propuesto `Backend/`, Dockerfile `services/<servicio>/Dockerfile`; misma imagen base fijada y lock actual. Build genera Prisma Client a partir del mismo schema **sin conectar una base ni aplicar migraciones**. Conservar el cliente generado al podar dependencias, permisos de usuario, certificados/OpenSSL y señales. Cada imagen inicia sólo su main; no inicia el monolito ni migraciones/seeds. El gateway y frontends permanecen iguales. Builds requieren dependencias/red/caché y crearán artefactos: no están ejecutados ni autorizados por este informe.

La futura reducción de dependencias por servicio, nuevos manifests propios o traslado de código necesitará un lote posterior con lista revisada y autorización. Este lote no modifica Compose: inicialmente las imágenes se verificarían con comandos/configuración aislados aprobados; su adopción como default de Compose es Etapa 4.

## 8. Aceptación, reversión y decisiones de la siguiente autorización

### Etapa 1 — criterios satisfechos documentalmente

Inventario por método/ruta con DTO/retorno/guard referenciados; ejecutores actuales; matriz de los 40 modelos y efectos SQL; unidades transaccionales protegidas; matriz F01–F14; pruebas clasificadas con recursos; diseño y whitelist del primer lote. Esto no equivale a demostrar que el sistema arranca o que todas las suites pasan. El inventario debe seguir al mismo commit base hasta la próxima modificación autorizada.

### Primer lote Etapa 2 — condiciones para aceptarlo después de autorización

1. Diff limitado a las once rutas; contratos públicos, schema/migraciones, AuthCore/PasswordReset, Vehicle, Membership.status y evidencia A.4 sin cambios.
2. Compilan los cuatro perfiles y permanece operativo el build antiguo. Las salidas incluyen sólo el cierre efectivo de imports de cada main más soporte; comparar manifiestos de archivos y comprobar que no se arranca otro main. No exigir que desaparezca un módulo que el bootstrap aún necesita.
3. Cuatro imágenes identificables y ejecutables por separado, un proceso Nest por contenedor, sin migrate/seed al iniciar; mismo esquema/cliente Prisma. No hay credenciales en imágenes o logs.
4. Tras autorización específica, selección A y B revisada sin bases pasa; cualquier suite omitida queda explícita. Para aceptar ejecución funcional, usar recursos aislados del grupo D/E y evidencias F01–F14 aplicables; build solo no acredita funcionamiento.
5. Registración de rutas y reglas de Gateway iguales. Comparar respuestas con fixtures, status, errores, headers, auth y rechazos. Operación mutante tiene un solo destino; no usar escrituras sombra en ambos runtimes.
6. Se conserva un PostgreSQL y las transacciones TX01–TX13. No hay RPC nuevo, nueva tabla, backfill, migración ni nuevas políticas de pagos/revocación.

### Reversión

El lote es reversible porque no cambia datos, rutas ni Compose activo. Conservar build raíz, Dockerfile raíz y comandos de arranque actuales. Si falla la compilación/runtime/paridad, no adoptar las imágenes nuevas: volver a los artefactos anteriores y revertir exclusivamente las once rutas del lote mediante un cambio revisable. No borrar volúmenes, no ejecutar down -v, no revertir migraciones, no hacer reset sobre historia y no usar restauración SQL como mecanismo de rollback de empaquetado. Durante validación sólo se usa un ejecutor de mutaciones por entorno.

Disparadores de rechazo: cualquier diferencia de contrato sin aprobación, provider faltante, pérdida de soporte runtime, cambio de grants/sesión, escritura duplicada, diferencia monetaria/stock/UUID, test que usa una base existente, imagen que inicia migraciones o necesidad de tocar AuthCore. Se conserva evidencia del fallo; no se fuerza la adopción para completar una carpeta.

### Decisiones que requieren autorización

- Autorizar o ajustar únicamente el lote de once rutas antes de implementarlo.
- Autorizar una lista concreta de pruebas A/B sin servicios. Si se necesitan PostgreSQL/Redis/navegadores, aprobar por separado recursos nuevos sintéticos y runners después de revisar sus efectos. No se solicita autorización para tests que esta etapa no necesita ejecutar.
- Antes de posteriores traslados, acordar si se mantiene la distribución actual de comandos Terminal/Inventory/User por campo o se concentra. Cambiar coordinación/seguridad no es una consecuencia automática de «microservicio».
- Resolver configuración/arranque y portabilidad en Etapa 4 con la auditoría anterior; no activar ahora Compose para probar un nuevo layout. Migraciones y seed únicos/ordenados requerirán revisión específica del mecanismo de arranque.

## 9. Estado de entrega

Esta etapa sólo añade este informe y el anexo JSON. HEAD y referencias permanecen en la base indicada; no hay staging ni commit nuevo. No se ejecutaron pruebas, build, instalación de dependencias, Docker/Compose, migraciones, seeds ni conexiones a bases. No se modificó código, Dockerfiles, Compose, Prisma, frontends ni documentos/evidencias históricos.

La verificación documental final conservó los 1.109 archivos preexistentes byte a byte: SHA-256 agregado de rutas ordenadas y contenidos `d73eaff373a3e8ae1fd06709f19bac9faf2595ad0b06589306f5d8eed815f82c` (ruta UTF-8, NUL, bytes, NUL por archivo). Coinciden con la captura inicial. Todas las fuentes referenciadas existen y sus hashes coinciden; no se encontraron duplicados método/ruta ni patrones de secretos en los dos documentos. Este control estático no sustituye pruebas funcionales ni certifica ausencia absoluta de información sensible.

La autorización siguiente debe centrarse en empaquetado independiente con paridad, no en reabrir experimentos A.4 ni comenzar simultáneamente otros cambios de negocio. La Etapa 2 queda pendiente de autorización.

## Apéndice A — Índice de contratos

Acceso = metadata del controlador/método; seguridad efectiva en sección 3.3. DTO, parámetros, status, fuentes y retornos exactos: anexo JSON. Rutas con prefijo público `/api/v1`.

| Método | Ruta | Ejecutor Gateway | Acceso declarado | Handler y fuente |
|---|---|---|---|---|
| GET | `/api/v1/admin/alerts` | identity | admin | [AdminController.list](../../Backend/src/auth/admin.controller.ts) (línea 85) |
| POST | `/api/v1/admin/alerts/:id/resolve` | identity | admin | [AdminController.resolve](../../Backend/src/auth/admin.controller.ts) (línea 95) |
| POST | `/api/v1/admin/check-plate` | identity | kiosk | [AdminController.check](../../Backend/src/auth/admin.controller.ts) (línea 105) |
| GET | `/api/v1/admin/dashboard` | identity | admin | [AdminController.dashboard](../../Backend/src/auth/admin.controller.ts) (línea 90) |
| GET | `/api/v1/admin/demo-credentials` | identity | public | [AdminController.demo](../../Backend/src/auth/admin.controller.ts) (línea 50) |
| POST | `/api/v1/admin/login` | identity | public | [AdminController.login](../../Backend/src/auth/admin.controller.ts) (línea 61) |
| POST | `/api/v1/auth/forgot-password` | identity | public | [AuthController.forgot](../../Backend/src/auth/auth.controller.ts) (línea 29) |
| POST | `/api/v1/auth/login` | identity | public | [AuthController.login](../../Backend/src/auth/auth.controller.ts) (línea 58) |
| POST | `/api/v1/auth/register` | identity | public | [AuthController.register](../../Backend/src/auth/auth.controller.ts) (línea 49) |
| POST | `/api/v1/auth/reset-password` | identity | public | [AuthController.reset](../../Backend/src/auth/auth.controller.ts) (línea 43) |
| POST | `/api/v1/auth/verify-reset-code` | identity | public | [AuthController.verify](../../Backend/src/auth/auth.controller.ts) (línea 36) |
| GET | `/api/v1/authorizations` | commerce | kiosk | [AuthorizationsController.pending](../../Backend/src/transactions/authorizations.controller.ts) (línea 80) |
| POST | `/api/v1/authorizations` | commerce | kiosk | [AuthorizationsController.create](../../Backend/src/transactions/authorizations.controller.ts) (línea 40) |
| GET | `/api/v1/authorizations/:id` | commerce | kiosk | [AuthorizationsController.status](../../Backend/src/transactions/authorizations.controller.ts) (línea 70) |
| POST | `/api/v1/authorizations/:id/intervention` | commerce | kiosk | [AuthorizationsController.intervention](../../Backend/src/transactions/authorizations.controller.ts) (línea 46) |
| POST | `/api/v1/authorizations/:id/progress` | commerce | kiosk | [AuthorizationsController.progress](../../Backend/src/transactions/authorizations.controller.ts) (línea 57) |
| POST | `/api/v1/authorizations/:id/release` | commerce | kiosk | [AuthorizationsController.release](../../Backend/src/transactions/authorizations.controller.ts) (línea 94) |
| GET | `/api/v1/benefits` | catalog | public | [BenefitsController.list](../../Backend/src/benefits/benefits.controller.ts) (línea 10) |
| POST | `/api/v1/control/access-requests` | administration | public | [ControlController.requestAccess](../../Backend/src/control/control.controller.ts) (línea 94) |
| GET | `/api/v1/control/accounts` | administration | control | [ControlController.accounts](../../Backend/src/control/control.controller.ts) (línea 152) |
| POST | `/api/v1/control/accounts` | administration | control | [ControlController.createAccount](../../Backend/src/control/control.controller.ts) (línea 158) |
| POST | `/api/v1/control/accounts/:userId/access` | administration | control | [ControlController.updateAccess](../../Backend/src/control/control.controller.ts) (línea 174) |
| POST | `/api/v1/control/accounts/:userId/approve` | administration | control | [ControlController.approve](../../Backend/src/control/control.controller.ts) (línea 161) |
| POST | `/api/v1/control/accounts/:userId/disable` | administration | control | [ControlController.disable](../../Backend/src/control/control.controller.ts) (línea 198) |
| POST | `/api/v1/control/accounts/:userId/reject` | administration | control | [ControlController.reject](../../Backend/src/control/control.controller.ts) (línea 186) |
| GET | `/api/v1/control/assistance` | commerce | control | [ControlAssistanceController.list](../../Backend/src/assistance/assistance.controller.ts) (línea 75) |
| GET | `/api/v1/control/assistance/:id` | commerce | control | [ControlAssistanceController.detail](../../Backend/src/assistance/assistance.controller.ts) (línea 81) |
| POST | `/api/v1/control/assistance/:id/actions` | commerce | control | [ControlAssistanceController.action](../../Backend/src/assistance/assistance.controller.ts) (línea 87) |
| GET | `/api/v1/control/audit` | administration | control | [ControlOperationsController.audit](../../Backend/src/control/control-operations.controller.ts) (línea 158) |
| GET | `/api/v1/control/catalog/inventory` | catalog | control | [PrivateCatalogController.inventory](../../Backend/src/catalog-reader/private-catalog.controller.ts) (línea 25) |
| GET | `/api/v1/control/catalog/stations` | catalog | control | [PrivateCatalogController.list](../../Backend/src/catalog-reader/private-catalog.controller.ts) (línea 30) |
| GET | `/api/v1/control/customers` | administration | control | [ControlCustomersController.customers](../../Backend/src/control/control-customers.controller.ts) (línea 35) |
| GET | `/api/v1/control/customers/:userId` | administration | control | [ControlCustomersController.customer](../../Backend/src/control/control-customers.controller.ts) (línea 38) |
| GET | `/api/v1/control/dashboard` | administration | control | [ControlController.dashboard](../../Backend/src/control/control.controller.ts) (línea 212) |
| GET | `/api/v1/control/incidents` | administration | control | [ControlController.incidents](../../Backend/src/control/control.controller.ts) (línea 221) |
| GET | `/api/v1/control/incidents/:id` | administration | control | [ControlController.incident](../../Backend/src/control/control.controller.ts) (línea 231) |
| POST | `/api/v1/control/incidents/:id/status` | administration | control | [ControlController.updateIncident](../../Backend/src/control/control.controller.ts) (línea 242) |
| GET | `/api/v1/control/inventory` | administration | control | [ControlOperationsController.inventory](../../Backend/src/control/control-operations.controller.ts) (línea 117) |
| POST | `/api/v1/control/inventory/:stationId/:fuelId/reconcile` | administration | control | [ControlOperationsController.reconcile](../../Backend/src/control/control-operations.controller.ts) (línea 150) |
| GET | `/api/v1/control/inventory/:stationId/:fuelId/reconciliation` | administration | control | [ControlOperationsController.reconciliation](../../Backend/src/control/control-operations.controller.ts) (línea 142) |
| GET | `/api/v1/control/inventory/movements` | administration | control | [ControlOperationsController.movements](../../Backend/src/control/control-operations.controller.ts) (línea 124) |
| POST | `/api/v1/control/inventory/receipts` | administration | control | [ControlOperationsController.receiveInventory](../../Backend/src/control/control-operations.controller.ts) (línea 135) |
| POST | `/api/v1/control/login` | administration | public | [ControlController.login](../../Backend/src/control/control.controller.ts) (línea 118) |
| POST | `/api/v1/control/logout` | administration | control | [ControlController.logout](../../Backend/src/control/control.controller.ts) (línea 136) |
| GET | `/api/v1/control/memberships` | administration | control | [ControlCustomersController.memberships](../../Backend/src/control/control-customers.controller.ts) (línea 41) |
| GET | `/api/v1/control/memberships/:membershipId` | administration | control | [ControlCustomersController.membership](../../Backend/src/control/control-customers.controller.ts) (línea 44) |
| GET | `/api/v1/control/operations` | administration | control | [ControlOperationsController.operations](../../Backend/src/control/control-operations.controller.ts) (línea 80) |
| GET | `/api/v1/control/operations/:operationId` | administration | control | [ControlOperationsController.operationDetail](../../Backend/src/control/control-operations.controller.ts) (línea 95) |
| GET | `/api/v1/control/payments/:id` | commerce | control | [ControlPaymentsController.detail](../../Backend/src/operations/control-payments.ts) (línea 169) |
| POST | `/api/v1/control/payments/:id/actions` | commerce | control | [ControlPaymentsController.act](../../Backend/src/operations/control-payments.ts) (línea 175) |
| GET | `/api/v1/control/receipts/:transactionId` | administration | control | [ControlCustomersController.receipt](../../Backend/src/control/control-customers.controller.ts) (línea 56) |
| POST | `/api/v1/control/resend-verification` | administration | public | [ControlController.resendVerification](../../Backend/src/control/control.controller.ts) (línea 110) |
| GET | `/api/v1/control/session` | administration | control | [ControlController.session](../../Backend/src/control/control.controller.ts) (línea 146) |
| POST | `/api/v1/control/terminal-operations/:id/cancel-unpaid` | commerce | control | [ControlTerminalRecoveryController.cancelUnpaid](../../Backend/src/operations/operations.controller.ts) (línea 144) |
| POST | `/api/v1/control/terminal-operations/:id/recovery-ticket` | commerce | control | [ControlTerminalRecoveryController.recoveryTicket](../../Backend/src/operations/operations.controller.ts) (línea 127) |
| POST | `/api/v1/control/terminal-operations/:id/resolve` | commerce | control | [ControlTerminalRecoveryController.resolve](../../Backend/src/operations/operations.controller.ts) (línea 136) |
| GET | `/api/v1/control/terminals` | administration | control | [ControlOperationsController.terminals](../../Backend/src/control/control-operations.controller.ts) (línea 102) |
| POST | `/api/v1/control/terminals/:id/status` | administration | control | [ControlOperationsController.terminalStatus](../../Backend/src/control/control-operations.controller.ts) (línea 109) |
| GET | `/api/v1/control/transactions` | administration | control | [ControlCustomersController.transactions](../../Backend/src/control/control-customers.controller.ts) (línea 50) |
| GET | `/api/v1/control/transactions/:transactionId` | administration | control | [ControlCustomersController.transaction](../../Backend/src/control/control-customers.controller.ts) (línea 53) |
| GET | `/api/v1/control/vehicles` | administration | control | [ControlCustomersController.vehicles](../../Backend/src/control/control-customers.controller.ts) (línea 47) |
| POST | `/api/v1/control/verify-email` | administration | public | [ControlController.verifyEmail](../../Backend/src/control/control.controller.ts) (línea 102) |
| GET | `/api/v1/fuels` | catalog | public | [FuelsController.list](../../Backend/src/fuels/fuels.controller.ts) (línea 16) |
| GET | `/api/v1/fuels/inventory` | catalog | public | [FuelsController.inventory](../../Backend/src/fuels/fuels.controller.ts) (línea 12) |
| GET | `/api/v1/health` | gateway-aggregate | public | [HealthController.check](../../Backend/src/health/health.controller.ts) (línea 14) |
| POST | `/api/v1/inventory/:stationId/:fuelId/activate` | administration | admin | [InventoryReconciliationController.activate](../../Backend/src/inventory/inventory-reconciliation.ts) (línea 248) |
| POST | `/api/v1/inventory/:stationId/:fuelId/reconcile` | administration | admin | [InventoryReconciliationController.reconcile](../../Backend/src/inventory/inventory-reconciliation.ts) (línea 239) |
| GET | `/api/v1/inventory/:stationId/:fuelId/reconciliation` | administration | admin | [InventoryReconciliationController.inspect](../../Backend/src/inventory/inventory-reconciliation.ts) (línea 230) |
| GET | `/api/v1/kiosk/session` | identity | public | [KioskController.status](../../Backend/src/kiosk/kiosk.controller.ts) (línea 37) |
| POST | `/api/v1/kiosk/session/authorize` | identity | public | [KioskController.authorize](../../Backend/src/kiosk/kiosk.controller.ts) (línea 52) |
| POST | `/api/v1/kiosk/session/login` | identity | public | [KioskController.login](../../Backend/src/kiosk/kiosk.controller.ts) (línea 40) |
| POST | `/api/v1/kiosk/session/logout` | identity | public | [KioskController.logout](../../Backend/src/kiosk/kiosk.controller.ts) (línea 49) |
| POST | `/api/v1/kiosk/session/terminal-bootstrap` | identity | public | [KioskController.terminalBootstrap](../../Backend/src/kiosk/kiosk.controller.ts) (línea 43) |
| POST | `/api/v1/kiosk/session/terminal-recovery` | identity | public | [KioskController.terminalRecovery](../../Backend/src/kiosk/kiosk.controller.ts) (línea 46) |
| GET | `/api/v1/memberships/me` | identity | default-member | [MembershipsController.me](../../Backend/src/memberships/memberships.controller.ts) (línea 18) |
| PATCH | `/api/v1/memberships/me/profile` | identity | default-member | [MembershipsController.profile](../../Backend/src/memberships/memberships.controller.ts) (línea 24) |
| POST | `/api/v1/memberships/me/recharges` | commerce | default-member | [WalletController.recharge](../../Backend/src/wallet/wallet.controller.ts) (línea 21) |
| GET | `/api/v1/memberships/me/redemptions` | identity | default-member | [MembershipsController.redemptions](../../Backend/src/memberships/memberships.controller.ts) (línea 43) |
| GET | `/api/v1/memberships/me/rewards` | identity | default-member | [MembershipsController.rewards](../../Backend/src/memberships/memberships.controller.ts) (línea 35) |
| GET | `/api/v1/memberships/me/transactions` | identity | default-member | [MembershipsController.transactions](../../Backend/src/memberships/memberships.controller.ts) (línea 29) |
| GET | `/api/v1/memberships/me/wallet` | commerce | default-member | [WalletController.wallet](../../Backend/src/wallet/wallet.controller.ts) (línea 28) |
| POST | `/api/v1/online-orders` | commerce | either | [OnlineOrdersController.create](../../Backend/src/payments/online-orders.ts) (línea 379) |
| GET | `/api/v1/online-orders/:id` | commerce | either | [OnlineOrdersController.status](../../Backend/src/payments/online-orders.ts) (línea 384) |
| POST | `/api/v1/online-orders/:id/cancel` | commerce | either | [OnlineOrdersController.cancel](../../Backend/src/payments/online-orders.ts) (línea 381) |
| POST | `/api/v1/online-orders/:id/demo-confirm` | commerce | either | [OnlineOrdersController.confirmDemo](../../Backend/src/payments/online-orders.ts) (línea 380) |
| POST | `/api/v1/online-orders/:id/notify` | commerce | public | [OnlineOrdersController.notify](../../Backend/src/payments/online-orders.ts) (línea 385) |
| POST | `/api/v1/online-orders/:id/refund` | commerce | either | [OnlineOrdersController.refund](../../Backend/src/payments/online-orders.ts) (línea 383) |
| POST | `/api/v1/online-orders/:id/reselect` | commerce | either | [OnlineOrdersController.reselect](../../Backend/src/payments/online-orders.ts) (línea 382) |
| POST | `/api/v1/operational-admin/permissions/admin` | commerce | admin | [OperationalAdminController.grant](../../Backend/src/operations/operations.controller.ts) (línea 156) |
| POST | `/api/v1/operational-admin/permissions/admin/:id/revoke` | commerce | admin | [OperationalAdminController.revokeGrant](../../Backend/src/operations/operations.controller.ts) (línea 162) |
| POST | `/api/v1/operational-admin/pumps` | commerce | admin | [OperationalAdminController.pump](../../Backend/src/operations/operations.controller.ts) (línea 168) |
| POST | `/api/v1/operational-admin/terminal-pump-assignments/:id/end` | commerce | admin | [OperationalAdminController.endPump](../../Backend/src/operations/operations.controller.ts) (línea 189) |
| POST | `/api/v1/operational-admin/terminals` | commerce | admin | [OperationalAdminController.terminal](../../Backend/src/operations/operations.controller.ts) (línea 176) |
| POST | `/api/v1/operational-admin/terminals/:id/assign-pump` | commerce | admin | [OperationalAdminController.assignPump](../../Backend/src/operations/operations.controller.ts) (línea 182) |
| POST | `/api/v1/operational-admin/terminals/:id/revoke` | commerce | admin | [OperationalAdminController.revoke](../../Backend/src/operations/operations.controller.ts) (línea 195) |
| GET | `/api/v1/payments/:id/partial-refund` | commerce | admin | [PartialRefundController.get](../../Backend/src/payments/partial-refund.ts) (línea 206) |
| POST | `/api/v1/payments/:id/partial-refund` | commerce | admin | [PartialRefundController.report](../../Backend/src/payments/partial-refund.ts) (línea 212) |
| POST | `/api/v1/payments/:id/refund` | commerce | kiosk | [PaymentLifecycleController.refund](../../Backend/src/payments/payment-lifecycle.ts) (línea 37) |
| POST | `/api/v1/payments/webhook` | commerce | public | [PaymentWebhookController.receive](../../Backend/src/payments/webhook.ts) (línea 19) |
| POST | `/api/v1/plate-recognition` | identity | kiosk | [RecognitionController.recognize](../../Backend/src/vehicles/recognition.controller.ts) (línea 22) |
| POST | `/api/v1/rewards/redeem` | commerce | default-member | [RewardsController.redeem](../../Backend/src/rewards/rewards.controller.ts) (línea 18) |
| GET | `/api/v1/stations` | catalog | public | [StationsController.list](../../Backend/src/stations/stations.controller.ts) (línea 11) |
| POST | `/api/v1/terminal/assistance` | commerce | terminal | [TerminalAssistanceController.create](../../Backend/src/assistance/assistance.controller.ts) (línea 51) |
| GET | `/api/v1/terminal/assistance/:id` | commerce | terminal | [TerminalAssistanceController.status](../../Backend/src/assistance/assistance.controller.ts) (línea 57) |
| POST | `/api/v1/terminal/assistance/:id/cancel` | commerce | terminal | [TerminalAssistanceController.cancel](../../Backend/src/assistance/assistance.controller.ts) (línea 63) |
| POST | `/api/v1/terminal/claim` | commerce | terminal | [TerminalController.claim](../../Backend/src/operations/operations.controller.ts) (línea 70) |
| GET | `/api/v1/terminal/me` | commerce | terminal | [TerminalController.me](../../Backend/src/operations/operations.controller.ts) (línea 73) |
| POST | `/api/v1/terminal/operations` | commerce | terminal | [TerminalController.open](../../Backend/src/operations/operations.controller.ts) (línea 77) |
| GET | `/api/v1/terminal/operations/:id` | commerce | terminal | [TerminalController.operation](../../Backend/src/operations/operations.controller.ts) (línea 87) |
| POST | `/api/v1/terminal/operations/:id/close` | commerce | terminal | [TerminalController.close](../../Backend/src/operations/operations.controller.ts) (línea 107) |
| GET | `/api/v1/terminal/operations/:id/recovery-state` | commerce | terminal | [TerminalController.recoveryState](../../Backend/src/operations/operations.controller.ts) (línea 97) |
| POST | `/api/v1/transactions` | commerce | kiosk | [TransactionsController.create](../../Backend/src/transactions/transactions.controller.ts) (línea 34) |
| GET | `/api/v1/transactions/:id` | commerce | either | [TransactionsController.get](../../Backend/src/transactions/transactions.controller.ts) (línea 44) |
| GET | `/api/v1/vehicles` | identity | default-member | [VehiclesController.list](../../Backend/src/vehicles/vehicles.controller.ts) (línea 23) |
| POST | `/api/v1/vehicles` | identity | default-member | [VehiclesController.create](../../Backend/src/vehicles/vehicles.controller.ts) (línea 20) |
| GET | `/api/v1/vehicles/:plate` | identity | either | [VehiclesController.find](../../Backend/src/vehicles/vehicles.controller.ts) (línea 33) |

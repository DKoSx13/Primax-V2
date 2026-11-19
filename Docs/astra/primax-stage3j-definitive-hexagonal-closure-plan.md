# Primax V2 Astra — 3J: plan definitivo de cierre hexagonal académico

## 1. Decisión, referencia y límites

Plan sobre `b0f9dcf6ce37e77aa2e9b8a892efce55460ef2d2`, rama
`feat/dezkz-identity-a4-core`. Se verificaron HEAD, ausencia de cambios versionados
y staging, cadena de antecesores y hashes del manifiesto 3I: fuentes de esa etapa,
fuentes protegidas, 36 migraciones y nueve evidencias históricas sin seguimiento.
Este es el único archivo nuevo de 3J. No se ejecutaron pruebas, Docker, bases,
migraciones, seeds ni comandos financieros; no se creó commit.

**Ruta propuesta: cinco lotes finitos**, descritos en §6. No más etapas por consulta.
Catalog necesita aceptación final y regresión, no nuevas extracciones. Los motores
legacy pueden permanecer como adaptadores locales explícitos. Se completa la
frontera de aplicación de los servicios, no se reescriben sus reglas para lograr
una distribución visual de carpetas.

Meta: tres frontends actuales, Gateway, cuatro procesos/contenedores NestJS,
PostgreSQL única compartida, Redis/OCR/impresión demo y auxiliares existentes,
Docker Compose como ejecución principal. Windows, Linux y macOS son objetivos
de validación. Kubernetes y autonomía productiva adicional quedan fuera del cierre.

### Fuentes reutilizadas y contraste con HEAD

- [Etapa 1](primax-stage1-contracts-responsibilities-and-equivalence.md) y su
  [inventario](primax-stage1-public-contract-inventory.json): 115 contratos de
  negocio, health común, escritores por comando/campo y unidades TX01–TX13.
- [Etapa 2](primax-stage2-independent-packaging-results.md): cuatro builds y
  artefactos independientes; fuente y plataforma compartidas deliberadamente.
- [2B.2](primax-stage2b2-graceful-shutdown-results.md): cierre 2B aceptado con
  observaciones; impresión corregida, apagado comprobado y T01 pendiente.
- [3A](primax-stage3a-catalog-fuels-read.md), [3B](primax-stage3b-catalog-stations-read.md),
  [3C](primax-stage3c-catalog-read-consolidation.md): seis contratos Catalog,
  cuatro consultas de aplicación y sus dos fachadas Control.
- [3D-B](primax-stage3db-identity-vehicle-list.md), [3E](primax-stage3e-identity-commerce-boundaries-design.md)
  y [3F](primax-stage3f-identity-lot-r-results.md): seis lecturas Identity,
  límites de perfiles/dinero y conservación de escritores existentes.
- [3G](primax-stage3g-administration-read-results.md),
  [3H](primax-stage3h-administration-details-and-closure.md) y
  [3I](primax-stage3i-commerce-transaction-read-results.md): matrices completas
  Administration/Commerce y evidencias de comparación, no sólo compilaciones.

El contraste actual confirma que los entrypoints siguen seleccionando sus módulos
propios; `apps/bootstrap.ts` comparte Config, Prisma, Alerts, AuthCore, health y
throttling. Compose aún usa una imagen de dominio común con cuatro comandos
distintos; los Dockerfiles independientes no son todavía la selección definitiva
de ese archivo. Inicialización/migraciones/seeds continúan como jobs compartidos.
La implementación de venta conserva `repo.atomic`, `settleReservation`, perfil
opcional y triggers. No se descubrió ni añadió una autoridad nueva en este análisis.

Resultados **históricos**, no reejecutados aquí: 3C registró 67 Jest; 3F, 100 Jest
y 93 comparaciones integradas; 3H, 63 Jest y 231 comparaciones/462 solicitudes;
3I, 99 Jest y 42 comparaciones/84 solicitudes. Gateway y empaquetado tienen sus
24 y 9 casos registrados. No se suman suites reutilizadas como cobertura distinta.
Sus manifiestos siguen en `Docs/astra/evidence/stage3*/review-summary.json`.
2B acreditó recorridos integrados sintéticos, no equivalencia universal. Tampoco
acreditó un arranque final limpio en las tres plataformas.

## 2. Qué significa cerrar la arquitectura académica

| Independencia | Estado / requisito académico | Lo que no demuestra |
|---|---|---|
| Proceso | Cuatro entrypoints y contenedores existentes; mantener proceso, health, salida y artefacto propios. | Aislamiento de fallos de PostgreSQL/Redis compartidos. |
| Código | Aplicación y puertos por servicio, sin Nest/Prisma/HTTP en el núcleo; adaptadores y composición explícitos. Puede compartir dependencias, Actor puro y motores legacy. | Cuatro repositorios/npm totalmente separados o ausencia de toda dependencia de fuente común. |
| Datos | Una PostgreSQL y esquema/migraciones actuales; autoridad por comando/campo y transacción, no por nombre de tabla. | Propiedad exclusiva de tablas, restauración independiente por servicio o autonomía productiva. |

### Mínimos verificables, sin una clase por ruta

1. Todo contrato de negocio se asigna a una familia de casos de uso del servicio
   actual o a un adaptador técnico/plataforma justificado. No quedan rutas sin
   clasificación. El inventario sigue contando 26 Identity, 6 Catalog,
   37 Administration y 46 Commerce; health es transversal.
2. Los casos de uso de negocio invocan puertos con métodos y contratos explícitos,
   agrupados por responsabilidad/unidad de consistencia. No vale un despacho
   genérico `execute(any)` que oculte toda la aplicación ni un árbol de carpetas
   vacío. Los puertos no exponen Prisma.TransactionClient, Request/Response,
   decoradores Nest, URLs o secretos.
3. Adaptadores locales pueden invocar servicios/repositories/mappers actuales.
   El motor financiero completo puede permanecer en `Backend/src/` como motor
   de compatibilidad, identificado en la composición de Commerce. No se exige
   moverlo ni duplicarlo en `services/commerce` para cambiar su categoría.
4. Las reglas de dominio nuevas, si llegaran a existir, serían independientes
   del framework. En esta migración no se inventan reglas ni se reescriben
   cálculos monetarios para crear una carpeta domain. Los motores legacy con
   Prisma/Nest se declaran excepciones de compatibilidad, con pruebas y deuda
   explícita; no se describen como dominio puro ya extraído.
5. Controllers, validación HTTP, permisos, firmas, cookies, CSRF y bootstrap son
   adaptadores/plataforma. AuthCore/PasswordReset permanecen intactos. Sus rutas
   técnicas de sesión y transporte pueden continuar allí con una lista cerrada
   y una justificación; eso no permite excluir arbitrariamente venta, perfil,
   registro, vehículo o gestión de cuentas del mapa de negocio.
6. Se verifican imports del núcleo, composición real, pruebas con puertos,
   equivalencia HTTP/datos y un solo ejecutor por comando. No se duplica la
   ejecución de escrituras para comparar implementaciones.

Esta es una arquitectura hexagonal **con compatibilidad legacy declarada**.
Debe contrastarse con la rúbrica del profesor antes de implementar los lotes.
Si la rúbrica exige todo el dominio legacy sin dependencias de framework, esa
extracción es un alcance adicional explícito: no puede certificarse como hecha
ni introducirse silenciosamente bajo la obligación de no cambiar cálculos.

Ubicación objetivo: `Backend/services/{identity,catalog,administration,commerce}/src`
para aplicación/puertos/adaptadores/composición; `Backend/gateway`, `prisma` y
contratos/plataforma compartidos. `Backend/contracts` y `Backend/platform` se
incorporarán sólo donde exista código compartido que convenga ubicar allí.
No mover AuthCore/Prisma/bootstrap sólo para completar nombres. Un mapa preciso
de dependencias y una allowlist técnica acotada sirven mejor que traslados masivos.
Los `services/identity` y `services/catalog` experimentales externos a Backend
no se activan como segundos ejecutores. Identity A.4 permanece cerrado.

## 3. Matriz de cierre de los cuatro servicios

| Servicio | Hexagonal operativo existente | Pendiente / dependencias concretas | Puertos y cierre académico |
|---|---|---|---|
| Catalog | ListFuels, ListStations, ListBenefits, ReadInventory: cuatro consultas para seis HTTP, incluidas estaciones/inventario Control. | Repositories/lector alternativo, Prisma, guard y bootstrap como adaptadores actuales. No existe CRUD público de maestros que deba inventarse. | Conservar puertos ya integrados. Cerrar con regresión de las seis rutas, autorización de las dos fachadas y build/Compose final. No nuevas extracciones de negocio. |
| Identity | ListVehicles; LookupVehicle; resumen y tres historiales de MembershipReads: seis HTTP protegidos. | Otros veinte contratos: perfil/vínculo, auth/registro/reset, sesiones/bootstrap/recovery kiosco, OCR y admin/alerts/dashboard/demo. Algunas consultas disparan reconciliación. Servicios/repositories concretos todavía coordinan esos flujos. | Familias ProfileVehicleCommands, IdentitySecurityOperations y AdminIdentityWorkflows; puertos OCR/lecturas complementarias donde correspondan. AuthCore/PasswordReset y transporte kiosco quedan como plataforma/adaptadores explícitos, sin alterar componentes. Cada una de las 26 rutas queda mapeada, probada o clasificada técnica con motivo. |
| Administration | AdministrativeLists y AdministrativeDetails: siete GET, controladores/guard originales, contexto/mappers únicos. | Doce lecturas legacy, dos inspecciones atomic de inventario y dieciséis comandos; ControlService, ControlOperationsService, InventoryReconciliationService y Prisma. Los dieciséis incluyen logout HTTP y terminal-status rechazado, no dieciséis escritores SQL. | Familias AccountAdministration, AdministrativeSupervision y InventoryAdministration; inspección/conciliación con contrato transaccional completo, sin confundir políticas admin y control. Cobertura de 37 contratos; mismos motores de cuenta/stock y auditoría. |
| Commerce | ReadTransaction para GET transactions/:id, único repositorio/mapper original. | Ocho lecturas B, dieciocho comandos C y diecinueve D: pagos/proveedores, wallet/puntos, inventario, terminal/asistencia/permisos/recuperación. Dependencia directa de servicios y Prisma en motores legacy. | Familias SaleAuthorizationCommands, PaymentWorkflow, WalletLoyaltyCommands, TerminalOperations, OperationalRecovery y lecturas protegidas. Mapear los 46 contratos; adaptar motores completos. GET con efectos se modela como workflow, no puerto readonly ficticio. |

En los cuatro: AuthCore/Users/Kiosk, Config, PrismaModule, Alerts, health,
throttler y setup HTTP siguen compartidos. Se permite esa plataforma; se prohíbe
que un caso de uso puro importe los servicios concretos de otro núcleo. Las
consultas SQL transversales y los adaptadores de compatibilidad conservan sus
consultas y proyecciones distintas; no se crea un snapshot monetario común.

### Unidades transaccionales y escritores que se congelan

| Unidad / dato compartido | Ejecutor actual que permanece | Invariante de migración |
|---|---|---|
| TX01, TX03 | Registro User+Membership+contador y vínculo Vehicle en Identity Backend. | Mismos UUID/alias/números, tx y rechazo de propietario; ningún escritor A.4 paralelo. |
| TX02, TX04 | PasswordReset y seguridad/bootstrap/recovery kiosco actuales. | Misma revocación/credencial, SQL y Redis según cada fase; no prometer commit conjunto SQL+Redis. |
| TX05–TX09 | Commerce: venta, autorización, wallet/deuda, órdenes/pagos/refund y canje. | Cada atomic/lock/hash/replay permanece íntegro. Proveedor externo y SQL no son una única transacción distribuida. |
| TX10 | Administration crea/gestiona cuentas, grants y asignaciones; desactivación actual afecta User/authVersion. | Delegar al flujo actual; no crear un segundo comando equivalente en Identity. |
| TX11 | Administration abastece/activa/concilia; Commerce reserva/avanza/libera/cierra stock. | Autoridad por comando; mismos pares bloqueados, ledger/eventKey/secuencias y funciones SQL. Catalog sólo lee. |
| TX12, TX13 | Terminal/asistencia/recuperación y auditoría en sus ejecutores actuales; triggers SQL de recibos/stock/operación. | No recrear ni renumerar evidencias, no doble auditoría; mismas restricciones y funciones. |
| Perfil de Membership | PATCH Identity y saveReceiptProfile dentro de venta Commerce. | Mantener excepción actual por campo/operación. Mover perfil a HTTP rompe rollback/replay; no hacerlo. |

No se afirma un escritor único por tabla: hay escritores legítimos diferenciados
ya documentados. Lo obligatorio es no duplicar un comando ni dividir una unidad
de commit entre procesos. La única PostgreSQL permite conservar estas unidades,
pero implica coordinación de esquema, locks, permisos de conexión y restauración.

## 4. Commerce: agrupación cerrada de 45 contratos pendientes

La matriz exacta de 46 rutas sigue en 3I, sin cambios en este HEAD. Las siguientes
agrupaciones no cambian su destino ni convierten D en lecturas puras.

| Grupo | Contratos / unidad | Tratamiento y riesgo |
|---|---|---|
| B, miembro/kiosco: 3 | GET memberships/me/wallet; GET authorizations y authorizations/:id. | Repositories actuales, pertenencia y autorización técnica. La lista no está en allowlist firmada; preservar su rechazo/compatibilidad legacy, no habilitarla automáticamente. |
| B, Control/terminal: 5 | GET control/assistance y /:id; control/payments/:id; terminal/assistance/:id; terminal/operations/:id. | Scope de cuenta/estación/terminal/owner, límites técnicos Redis y campos autorizados. No ejecutar acciones de recuperación al consultar. |
| C, venta/autorización: 5 | POST transactions; POST authorizations y /:id/{progress,release,intervention}. | TX05/TX06; precios históricos, despacho, reserva física/financiera, puntos, perfil y recibos. Puerto al motor completo. |
| C, órdenes/proveedor: 9 | POST online-orders y /:id/{cancel,demo-confirm,notify,refund,reselect}; payments/webhook; payments/:id/{refund,partial-refund}. | TX08; conservar fases SQL/externas, claves de proveedor/evento, incertidumbre y conciliación. No declarar un atomic global inexistente. |
| C, wallet/puntos: 2 | POST memberships/me/recharges; rewards/redeem. | TX07/TX09: ledger/deuda/puntos y replay dentro de la transacción actual. |
| C, atención: 2 | POST terminal/operations y /:id/close. | Estado/exclusión por terminal/surtidor, SQL e inventario: no separar validación y commit. |
| D, GET con dependencias especiales: 4 | online-orders/:id; payments/:id/partial-refund; terminal/me; terminal/operations/:id/recovery-state. | Respectivamente reconciliación externa/escrituras; inspección atomic; lastUsedAt/ownership; credencial limitada de recuperación. Adaptar workflow completo sin retirar efectos. |
| D, acciones y seguridad: 15 | Control assistance actions (1), Control payments actions (1), Control terminal-operations cancel-unpaid/recovery-ticket/resolve (3), operational-admin permisos/pumps/terminal/asignaciones/revoke (7), terminal assistance create/cancel (2), terminal claim (1). | Conservar permisos, auditoría, tickets, propiedad e interacción con inventario/pagos. Ningún traslado automático a Administration por su consumidor Control. |

Suma: B=8, C=18, D=19, más una lectura ya consolidada. No hay lecturas A sin
dependencias especiales identificadas. Los diecinueve D no requieren diecinueve
nuevos diseños experimentales: se documentan como métodos explícitos de las
familias existentes y conservan su motor. Sólo un cambio de política o de unidad
transaccional exige una decisión adicional, que queda fuera de la refactorización.

## 5. Primer caso de escritura propuesto: cierre de venta

**POST /api/v1/transactions → CreateTransaction**, primer punto de revisión dentro
del lote 1; no una sexta etapa. Es de alto impacto, pero su motor ya tiene
regresiones y permite una extracción de frontera con diff mínimo y sin tocar SQL.
Se elige por esa posibilidad verificable, no por considerarlo una venta sencilla.

Composición propuesta, todavía no implementada:

```text
TransactionsController.create: guard, DTO y checkAuthorization actuales
  → adaptador inbound de comandos SaleCommands
  → caso de uso CreateTransaction
  → puerto TransactionCreation
  → adaptador local ExistingTransactionCommandEngine
  → TransactionsService.create original, una sola vez
  → repo.atomic original + settleReservation original + triggers originales
```

El adaptador de salida inyecta TransactionsService, que **mantiene** su create.
El controlador pasa a la entrada de aplicación; el servicio no vuelve a delegar
create a ese mismo adaptador. Así se evita un ciclo o doble ejecución. Su get
continúa con la composición 3I. No se copia create/settleReservation al núcleo
ni se instancia otro repositorio/escritor para la misma venta.

Los tipos de entrada/salida del puerto son contratos TypeScript de la operación;
la validación decorada del DTO queda en inbound. No importar DTO Nest ni un
TransactionClient al núcleo, no recalcular dinero al adaptar, no cambiar null,
omisión, orden o identidad de valores; comparar exhaustivamente los campos
relevantes, incluido saveReceiptProfile, dentro del contrato de compatibilidad.

Puntos de congelación comprobados en código actual:

- `TransactionsController.create` conserva KioskOnly, respuesta y la alerta
  `checkAuthorization` previa cuando corresponde. Puede escribir BusinessAlert
  **antes** del atomic. No meterla en éste ni prometer que se revierte con la venta.
- `TransactionsService.create` conserva autorización de pago/preparación, hash,
  comprobación de replay, validaciones, cálculo y el mismo `repo.atomic`.
- `saveReceiptProfile` permanece dentro del mismo tx, con validaciones/condiciones
  originales; no se difiere, ignora o repite al consultar/reintentar.
- `settleReservation`, saldo/deuda/puntos, creación Transaction, inventario y
  numeración por trigger mantienen llamadas, locks y conexiones originales.
- No HTTP nuevo a Identity, Catalog o Administration ni callback de reintento
  añadido en la frontera. El rollback SQL no acredita ausencia de efectos previos
  o externos fuera de esa transacción.

Archivos de revisión propuestos: TransactionsController, TransactionsModule,
nueva familia de comandos bajo services/commerce/src y sus tests/fixtures. El
cuerpo de TransactionsService, repositorio, mapper, política monetaria, Prisma
y migraciones deben permanecer idénticos. Si el piloto requiere alterarlos,
se detiene ese cambio y se presenta la causa; no se amplía a un rediseño financiero.

Aceptación del piloto: una llamada al motor, mismo resultado/error y efectos,
autorización técnica íntegra; replay y conflicto; PREPAGO/POSTPAGO según fixtures
existentes; rechazo de pago pendiente/fallido y otros vehículos; despacho/precio
histórico; parcial/refund en revisión; rollback con perfil/ledger/inventario;
fallo antes/después del commit, respuesta perdida y reintento con misma clave;
dos peticiones concurrentes sin efecto financiero adicional respecto a referencia.
Secuencias pueden consumir valores en fallos según PostgreSQL: comparar con la
referencia, **no exigir continuidad ni cambiar el algoritmo para eliminar huecos**.

## 6. Cinco lotes de implementación y aceptación

Todos requieren autorización futura. Los checkpoints internos revisan riesgo y
diff; no crean etapas adicionales ni autorizaciones por cada ruta. Cada lote
termina o identifica un bloqueo concreto; no inicia nuevos laboratorios A.4.

| Lote | Alcance cerrado y componentes | Dependencia / riesgo | Pruebas y criterio de salida | Reversión |
|---|---|---|---|---|
| 1. Frontera Commerce | Piloto §5 y cierre de familias sobre los 46 contratos: B8/C18/D19 más lectura 3I. Puertos/aplicación/adaptadores/composición, motores existentes intactos. | Aprobar compatibilidad legacy, autoridades y alcance de comandos. Máximo riesgo: doble cobro, rollback/replay o cambios de recuperación. | Regresiones 3I, critical-integrity, transactions, authorizations, wallet, rewards, orders/proveedores simulados, receipts, inventory y terminal/asistencia; comparación HTTP y efectos en SQL/Redis aislados. Cada contrato llega a una familia/puerto o plataforma técnica justificada, sin modificar atomic ni políticas. | Revertir composición/artefacto del lote, sin compensación financiera o reejecución de comandos. |
| 2. Cierre Identity y aceptación Catalog | Seis lecturas Identity conservadas; perfil/vínculo, seguridad/registro, OCR y admin/workflows restantes clasificados. Catalog conserva cuatro consultas/seis HTTP. Plataformas AuthCore/PasswordReset/kiosco intactas. | Decisión de excepciones de plataforma y perfil fiscal; A.2 no resuelto, no se presupone autonomía. Riesgos: exposición de perfil, UUID nuevos, doble vínculo, prioridades nuevas de suspensión. | Regresiones 3A–3F, propio/ajeno/kiosco/Control, códigos/alias, UUID, profile tras escritura y errores, registro/vínculo sintético con rollback/replay, reset en modo permitido/disabled según contrato. 26+6 rutas cubiertas o excepción técnica explícita; A.4 no se activa. | Sólo composición del lote; no restaurar tablas, contadores o evidencias históricas. |
| 3. Cierre Administration | Conserva 7 GET; agrupa 12 lecturas, 2 inspecciones atomic y 16 comandos en familias de cuenta/supervisión/inventario. Motores y dos políticas admin/control originales. | Autorización explícita para envolver escrituras existentes, sin cambiar AuthCore/authVersion/grants. Riesgo: privilegios, auditoría o stock fuera de tx. | Regresiones 3G/3H, roles/cookies/CSRF/estaciones, cuentas globales y redacciones; atomic alta/grants/asignaciones, disable/reautenticación según implementación, abastecimiento/replay/conciliación en fixtures nuevos. 37 contratos con frontera y ningún escritor duplicado. | Composición y artefacto; ninguna modificación compensatoria o borrado de ledger. |
| 4. Composición y Compose final | Selección real de cuatro imágenes independientes; Gateway/auxiliares, bootstrap compartido y ubicación de contratos/plataforma sólo donde aporte. Jobs únicos de init, healthchecks, redes/volúmenes/env y documentación de arranque. | Lotes 1–3 aceptados; no ejecutar migraciones/seeds por cada runtime. Riesgo: arrancar motores duplicados, init sobre datos equivocados o diferencias de plataforma. | Builds de cuatro y legacy, contratos Gateway/packaging, config resuelta sin exponer secretos; arranque desde clone nuevo con proyecto/volúmenes exclusivos, init ordenado, sin cambiar rutas/frontend/upstream backend. Sólo un proceso de negocio por servicio. | Volver a selección anterior de imágenes; conservar datos/volúmenes. No down -v ni reseteo del esquema. |
| 5. Validación y entrega final | Una matriz maestra de 115 contratos y escenarios críticos, tres frontends, Docker Compose y prueba de persistencia/fallos en Windows/Linux/macOS. Cierre documental de excepciones y trazabilidad. | Lotes 1–4 completos; acceso a hosts reales y aceptación de límites académicos. Riesgo: declarar soporte nativo o equivalencia sólo por mocks. | §8 y §10 completos, cero regresiones nuevas, límites y evidencia por plataforma. Entrega finita; pendientes productivos pasan al backlog, no a nuevos cortes experimentales. | Retener artefactos/evidencia y retirar despliegue de prueba propio; no alterar recursos anteriores. |

El orden prioriza Commerce porque ya existe un piloto de lectura y constituye la
mayor frontera de consistencia. Lotes 2 y 3 no dependen de trasladar la propiedad
financiera de Membership ni de resolver A.2; sí de acordar los límites declarados.
Un bloqueo de política se eleva con alternativas específicas, sin ocultarlo tras
otro lote de consultas. Si cambia la rúbrica, se revisa este plan una vez, no se
agregan etapas implícitas después de la aceptación.

## 7. Priorización P0/P1/P2 y decisiones

| Prioridad | Trabajo / riesgo | Evidencia para terminar y autoridad requerida |
|---|---|---|
| P0 | Aprobar alcance académico con motores/adaptadores legacy y lista técnica de plataforma. | Rúbrica/aceptación del responsable; cada familia tiene frontera/imports/tests. No certificar dominio totalmente extraído si no lo está. |
| P0 | Completar fronteras de familias de los lotes 1–3, contratos y matrices de escritores/TX. | Código y composición verificables, misma unidad de commit/autoridad; autorización de cada lote, especialmente comandos. |
| P0 | Evitar regresiones de autorización y consistencia. | Miembro ajeno/estación ajena/revocaciones actuales rechazados, pagos/ledger/stock/UUID/replay equivalentes. Ningún fix de negocio mezclado. |
| P0 | Arranque Compose reproducible con cuatro imágenes, una PostgreSQL y tres frontends. | Init único/seguro, health y flujos §8; no basta docker build o ps healthy. Autorización para configurar y probar en entornos nuevos. |
| P0 | Portabilidad final y evidencia por plataforma objetivo. | Ejecuciones reales Windows/Linux/macOS, arquitectura CPU y Docker/Compose registradas. Sin host disponible queda aceptación multiplataforma pendiente, no aprobada por inferencia. |
| P0 | Conservar A.4 cerrado, T01/evidencias y excepciones históricas sin tergiversarlas. | Mismos hashes/volúmenes originales no usados; incidencia aún abierta y alcance final explícito. |
| P1 | Resolver funcionalmente la forma de recuperación T01 antes de afirmar recuperación completa. | Diseño autorizado, reproducción nueva/copia sintética separada, resultado acreditado sin doble cobro. No finalizar ni compensar la original para hacer pasar el cierre. |
| P1 | Decidir política legacy x-kiosk-key sin filtro de estación y visibilidad pública de inventario Catalog ya documentada en 3C. | Decisión de seguridad/producto y pruebas de consumidores antes de cualquier cambio/exposición fuera del laboratorio. Preservación actual y contención local son P0; endurecer política no viene autorizado por refactorizar. |
| P1 | AuthCore/A.2, propiedad por campo, concurrencia de perfil y mecanismos de revocación más autónomos. | Contratos y decisiones de responsables; no se consideran resueltos por A.4 ni por capas nuevas. Plataforma compartida puede permanecer en la entrega académica aceptada. |
| P1 | Readiness, diagnóstico y recuperación más robustos que los health actuales. | Pruebas adicionales de indisponibilidad SQL/Redis/OCR, proveedor ambiguo y reinicio; sin relajar comandos ni perder evidencia. Lo requerido para el arranque y replay demostrados es P0; garantías más amplias no. |
| P2 | Propiedad física exclusiva de datos, gestión productiva de credenciales, infraestructura de restauración independiente, HA/observabilidad productiva y separación adicional de paquetes. | Proyecto posterior con requisitos, autoridad y recursos propios; una base compartida no los acredita. |
| P2 | Kubernetes, sagas/outbox si se cambiase la consistencia, eliminación de toda compatibilidad legacy o procedencia/cuarentena productiva A.4. | Fuera del alcance; no implementar por completar este plan. Reabrir A.4 exige autorización separada. |

T01 tiene venta PAID, pago CAPTURED, autorización SETTLED, reserva CLOSED,
comprobante consistente y atención ACTIVE. Su aceptación histórica con
observaciones no se revoca: puede seguir como excepción trazada del cierre
arquitectónico académico. Resolver la original no es un prerrequisito artificial
para probar capas. **Una regresión nueva** de cierre normal o recuperación que la
referencia sí permite es P0 y no se encubre con esa excepción. No se declara
recuperación integral/productiva mientras la limitación siga pendiente.

La clave legacy no otorga la garantía de estación del kiosco firmado. Mantener
sus semánticas para paridad no equivale a aprobar su seguridad productiva.
La prueba final se restringe a demo sintética y exposición local; nunca se
activa tráfico público como parte de la aceptación académica.

## 8. Validación integral Compose y portabilidad

No se ejecuta aquí. Secuencia futura única para el lote 5, con manifest de casos,
commit, imágenes, fixtures, versiones, fechas y resultados saneados:

1. Resolver configuración en una copia nueva. Sin .env operativos, credenciales
   reutilizadas, rutas absolutas de host o volúmenes/redes existentes. Proyecto
   exclusivo, puertos de prueba o no publicados, pagos/OCR/print en modo demo.
2. La ruta documentada de ejecución normal debe ser `docker compose up -d`
   desde el clone preparado, sin comandos manuales de migración/seed ni cambios
   de directorio dentro de contenedores. Prerrequisitos finitos: Docker/Compose
   soportados, variables demo documentadas, puertos y recursos disponibles.
   Si hace falta configuración inicial, debe declararse antes y no depender
   de archivos privados del autor.
3. Jobs de migración y provisión: una sola cadena de las migraciones existentes,
   fixtures/demo iniciales ordenados y protegidos por propósito de base. Cada
   servicio espera esas condiciones. Runtime no contiene init financiero propio.
   Verificar idempotencia y rechazo de destino no permitido antes de usarlos;
   no inferir seguridad de scripts por sus nombres. No cambiar el esquema.
4. Seleccionar imágenes independientes de los cuatro servicios; no arrancar
   simultáneamente el Backend monolítico como quinto escritor de negocio ni los
   laboratorios opt-in. Gateway conserva upstreams/DNS/alias `backend` usados
   por BFF si el servicio se renombra. Una imagen compartida para utilidades no
   convierte al Gateway en ejecutor de comandos.
5. PostgreSQL y Redis healthy → init completado → cuatro runtimes → Gateway y
   auxiliares → tres interfaces. Health debe alinearse con rutas/puertos reales;
   validar también consultas y flujos, no sólo liveness. Redis no es reemplazo
   de PostgreSQL ni se promete transacción conjunta entre ambos.
6. Recorrer FuelFlow, Prime y Control: registro/login/sesión y rechazos; código/
   alias/perfil/vehículos; combustibles/precios/beneficios; ventas PREPAGO/POSTPAGO,
   pagos simulados, deuda/puntos/canje, stock/reserva/cierre, comprobantes, OCR,
   impresión demo y comandos administrativos autorizados. Función deshabilitada
   por configuración debe conservar su rechazo esperado, no simular éxito.
7. Matriz de 115 rutas: cada contrato tiene caso normal o rechazo configurado,
   validaciones y negativos aplicables. Añadir escenarios críticos TX01–TX13:
   replay/clave distinta, concurrencia, fallo/rollback, reinicio y respuesta
   perdida. Verificar efectos técnicos legítimos, incluidas claves Redis,
   auditoría y alertas previas, sin confundirlos con escrituras financieras nuevas.
8. Para comparar escrituras, referencia y candidato usan ejecuciones aisladas
   nuevas equivalentes, cada una con su PostgreSQL única y fixtures sintéticos
   deterministas. No ejecutar ambos comandos en la misma base para comparar:
   produciría replay o doble efecto. No duplicar pagos reales ni normalizar
   importes, saldos, recibos o UUID preexistentes para ocultar diferencias.
   Los UUID generados al crear filas en dos ejecuciones independientes pueden
   diferir legítimamente: acreditar correspondencia uno a uno por operationId
   y relaciones, registrar ese mapeo y exigir estabilidad en replay/reinicio
   dentro de cada ejecución. No remapear datos históricos ni ocultar vínculos
   incorrectos. Timestamp/request-id sólo se excluyen con criterio de contrato.
9. Reiniciar servicios y stack de prueba, conservar sus volúmenes nuevos y
   verificar UUID, relaciones, pagos/stock y secuencias. Probar respuesta perdida
   con misma clave. Detener sólo recursos propios con presupuesto graceful;
   ausencia de SIGKILL en parada normal y fallo controlado si el recurso no drena,
   conforme 2B.2. No usar impresora física ni compensaciones automáticas.
10. Repetir el protocolo en Windows con Docker Desktop/Linux containers,
    Linux y macOS. Registrar CPU real, Docker/Compose y límites. Validar ARM64
    nativo si ése es el Mac objetivo; si se usa emulación, registrarla y no
    certificar soporte nativo. Verificar imágenes Prisma/OCR/dependencias nativas,
    mayúsculas en paths, CRLF/ejecutables, montajes/permisos, $$ e interpolación,
    cookies/orígenes/puertos, volúmenes, health y memoria. No usar scripts de
    PowerShell/Bash del host como paso oculto para el arranque común.

El segundo `up -d` debe preservar datos y no ejecutar seeds destructivos.
Los logs/evidencias no contienen secretos ni sesiones. Los datos demo pueden
conservarse para diagnóstico; no se usa down -v, prune o borrado de volúmenes
previos como parte de una receta de corrección.

## 9. Riesgos y decisiones que necesitan autorización

- Aprobar la definición de compatibilidad académica y los cinco lotes; no se
  solicita una autorización por cada ruta. Ningún lote está autorizado por 3J.
- Autorizar primero el lote Commerce y su piloto con el motor íntegro, incluida
  conservación expresa de saveReceiptProfile y alerta previa. No es permiso
  para modificar transacciones, flags, cálculos, grants o autorizaciones.
- Confirmar qué rutas técnicas siguen como plataforma y qué casos de negocio
  necesitan puertos. Aprobar sus excepciones con rúbrica, no esconder negocio
  en una lista genérica legacy.
- Mantener autoridades por comando de la matriz TX y la excepción de perfil/
  inventario compartido. Cualquier traslado de escritor es otro proyecto.
- Autorizar sustitución final de imágenes/ajustes Compose sólo tras las pruebas
  aisladas; nunca sobre volúmenes conservados u operativos.
- Disponer de hosts Windows/Linux/macOS y aceptar únicamente los modos CPU
  realmente probados. La falta de host deja esa parte pendiente de validación.
- Llevar T01 y riesgos legacy/A.2 como excepciones conocidas dentro del alcance
  académico aceptado, sin renombrarlos como funcionalidades terminadas. Su
  corrección y cualquier política de exposición posterior requieren autorización
  funcional/de seguridad específica.

## 10. Criterios exactos para terminar y detener el proyecto académico

Se cierra cuando se cumplen **todos** los puntos siguientes:

1. Cinco lotes aceptados; ninguna tarea P0 pendiente ni regresión nueva abierta.
2. Matriz única de 115 contratos más health completa: servicio, familia/puerto
   o adaptador técnico justificado, autorización, escritor/unidad TX, pruebas y
   evidencia. Cero rutas sin asignación y cero comandos duplicados.
3. Aplicación/puertos independientes de framework y persistencia en los cuatro
   servicios, comprobados por imports/tests/composición; excepciones legacy y
   de plataforma finitas y aprobadas. No es obligatorio trasladar todo Backend/src.
4. Cuatro builds/entrypoints/imagenes propios, Gateway, tres frontends y una
   PostgreSQL compartida arrancan mediante la receta Compose acordada desde
   copia limpia. Sin pasos privados ni monolito de negocio activo en paralelo.
5. Los contratos y escenarios TX críticos pasan con las mismas reglas, importes,
   referencias, límites, errores, seguridad y efectos del baseline. No basta
   compilar o probar mocks; existen pruebas HTTP/SQL/Redis y flujos de interfaz.
6. Arranque, segundo arranque, reinicio, persistencia, replay y parada quedan
   documentados en Windows/Linux/macOS con sus límites reales de CPU/runtime.
7. A.4 cerrado, T01 original intacta, evidencias preservadas. Observaciones
   históricas y P1/P2 tienen responsable/decisión de seguimiento, sin presentarse
   resueltas. Ninguna aceptación equivale a certificación productiva.
8. Entrega de instrucciones, matriz de resultados y manifest de artefactos sin
   secretos. No se añaden nuevos experimentos por defecto después de la entrega.

Queda fuera: Kubernetes, bases separadas, independencia de despliegue de esquema,
AuthCore/A.2 productivo autónomo, nuevas políticas financieras, procedencia/
cuarentena productiva y resolución artificial de T01. Esos objetivos no se usan
para prolongar la arquitectura académica una vez satisfechos los criterios.

Estado de 3J: sólo este plan nuevo, sin staging ni commit; HEAD permanece en
`b0f9dcf6ce37e77aa2e9b8a892efce55460ef2d2`. Las nueve evidencias históricas
permanecen sin seguimiento y excluidas. No se inicia ninguno de los lotes.

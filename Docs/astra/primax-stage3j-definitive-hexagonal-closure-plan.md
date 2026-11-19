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

## 11. Actualización de cierre Commerce tras Lote 1D — 2026-11-19

Esta sección agrega el estado actual autorizado; las secciones anteriores son el
plan histórico de 3J y conservan sus cifras/HEAD de referencia. Base de 1D:
eb0d893cb0534e6cebcca903a884f74e1cd1d421. Evidencia nueva y límites:
primax-lot1d-orders-reconciliation-callbacks-results.md y
evidence/lot1d-orders/review-summary.json. No se ejecutan lotes 2–5.

La unidad de cierre es la familia/puerto con adaptador al motor completo; no
extraer cada consulta ni reescribir cada función Prisma. Conservamos los 46
contratos de la matriz 3I, con numeración de filas usada abajo.

| Familia / contratos 3I | Estado comprobado | Pendiente real / criterio de salida |
|---|---|---|
| Venta y autorizaciones: filas 2,4,5,6,45 (5) | Lotes 1 y 1B: frontera al motor intacto. | Mantener regresiones y excepciones; no más extracción de sus cálculos internos. |
| Lectura de transacción: 46 (1) | 3I, puerto/repo original. | Mantener contrato y aislamiento, no otra migración de lectura. |
| Reembolso local/conciliación parcial: 31–33 (3) | 1C: tres fronteras, atomic/lock originales. | Adaptadores locales existentes son solución académica válida; proveedor real no acreditado. |
| Órdenes/reconciliación/callbacks: 17–23,34 (8) | 1D: ocho entradas, siete métodos de puerto, motor único sin alterar. | Preservar límites de simulación y observación TARJETA; no volver a extraer status/confirmRefund internos por separado. |
| Wallet/puntos y lecturas de autorización: 1,3,15,16,35 (5) | Pendiente de frontera, no autorizado en 1D. | Un bloque agrupado de cinco contratos; WalletService/RewardsService/AuthorizationsService originales como adapters. Balance/deuda/puntos/hash/lock/replay inalterados. |
| Terminal/atención/asistencia/recuperación/seguridad operacional: 7–14,24–30,36–44 (24) | Legacy vigente, no consolidado por estos pagos. | Un bloque operacional, puertos agrupados sobre OperationsService, AssistanceService y ControlPaymentsService. Conservar actor/estación/owner, auditoría, efectos Redis y atomic completo. No mover a Administration por su consumidor. |

Total verificado: 17 contratos con frontera de 46; 29 restantes, agrupados en dos
paquetes finitos (5 financieros/lecturas + 24 operacionales), no 29 etapas.
Commerce completo y Lote 1 completo aún no se declaran. La independencia de
proceso/imagen ya existe; la de código es parcial; la de datos no se exige (una
PostgreSQL aceptada), sin cambiar escritores o transacciones.

### Compatibilidad legacy admisible y decisiones

- Los motores existentes, repositorios Prisma, SQL/triggers, mappers y helpers
  internos pueden permanecer como adaptadores locales detrás de los puertos:
  esto cumple el alcance académico aceptado sin prometer dominio totalmente extraído.
- AuthCore, JWT, PasswordReset, AccessGuard, KioskService/Redis y bootstrap pueden
  seguir como plataforma técnica compartida declarada, sin otro escritor o política.
- Candidatos explícitos a excepción técnica dentro de las 24 rutas: grants/revoke
  globales (24/25), claim/me (39/40), recovery-ticket (13). Son cinco candidatos,
  no cinco rutas automáticamente terminadas. Requieren aceptación expresa del
  responsable y cobertura de sus rechazos/efectos originales. Si no se aceptan,
  se incluyen en el mismo paquete operacional, sin crear una etapa adicional.
- Crear/cerrar atención, asistencia, cancel-unpaid, resolve, asignación de surtidor,
  inventario o wallet son negocio/workflows: no declararlos plataforma para
  ocultar pendientes. Una dependencia de seguridad no impide una frontera que
  conserve el motor; sólo bloquea un cambio de política no autorizado.
- TARJETA en reselect tiene contradicción DTO/constraint SQL histórica: 500 con
  rollback, mientras PLIN funciona. Su corrección necesita decisión de regla/esquema
  independiente; 1D conserva y compara la conducta, no la presenta corregida.
- CulqiProvider carece de findByReference/cancel/refund y no se certifica la firma
  nativa del proveedor. Son bloqueos de integración comercial/producción; la
  simulación no los resuelve. No son nuevas fases para prolongar el cierre académico.
- T01 sigue abierta, legacy key no tiene el scope firmado y A.2/AuthCore autónomo
  siguen pendientes. Cualquier aceptación con observaciones debe nombrarlos;
  no se cambia T01 ni se reabre A.4.

### Criterio finito de finalización del Lote 1

1. Una única matriz de 46 rutas con cada entrada conectada a una familia/puerto
   comprobable o excepción técnica aceptada explícitamente; cero entradas sin dueño.
2. Completar los dos paquetes restantes autorizados de forma agrupada, o registrar
   el bloqueo concreto con decisión del responsable; no inventar nuevas familias.
   Un bloqueo documentado no equivale por sí solo a una funcionalidad terminada.
3. Mantener motores locales y transacciones idénticos, sin nuevos retries/HTTP
   financieros/escritores; aplicación depende sólo de puertos, plataforma declarada.
4. Una regresión final agrupada de Commerce (incluidos wallet, puntos, terminal,
   asistencia, SQL/Redis y contratos), cuatro builds + legacy y empaquetado; comprobar
   autenticación/estación/propietario, replay/concurrencia/rollback y efectos.
5. Cero regresiones nuevas frente a referencia y aceptación explícita de observaciones
   preexistentes/límites de proveedor; código/evidencia saneada y manifiesto de rutas.

Cumplidos estos puntos se cierra Lote 1 académico sin exigir separar bases, eliminar
todos los adapters legacy, corregir toda deuda productiva o abrir experimentos
adicionales. El arranque Compose integral, tres frontends y Windows/Linux/macOS
permanecen en lotes 4–5; terminar las fronteras Commerce no los acredita.

## 12. Actualización Commerce tras Lote 1E — 2026-11-19

Base autorizada `42f9fd051269f1963eccf6485b15fd88be2f49fd`, rama
`feat/dezkz-identity-a4-core`. Esta sección añade el estado de 1E; conserva
íntegras las secciones históricas y sus referencias. Informe y evidencia:
[Lote 1E](primax-lot1e-finance-and-reads-results.md),
[resumen](evidence/lot1e-finance/review-summary.json).

| Familia / filas de matriz 3I | Contratos | Estado y dependencia restante |
|---|---:|---|
| Venta/autorizaciones: 2,4,5,6,45 | 5 | Frontera comprobada en 1/1B; regresión conservada en 1E. |
| Lectura de transacción: 46 | 1 | 3I; motor/repo original vigente. |
| Pagos/reembolso local y parcial: 31–33 | 3 | 1C; atomic, locks y estados sin cambiar; proveedor real no acreditado. |
| Órdenes/reconciliación/callbacks: 17–23,34 | 8 | 1D y regresión 1E; persisten TARJETA y límites comerciales. |
| Wallet/puntos/lecturas de autorización: 1,3,15,16,35 | 5 | 1E: las cinco rutas conectadas a tres familias/puertos sobre los motores originales. Ninguna excluida del paquete. |
| Terminal/atención/asistencia/recuperación/seguridad operacional: 7–14,24–30,36–44 | 24 | Pendiente, fuera de autorización 1E. Candidatos de plataforma siguen sin aceptación explícita; no se cuentan como cerrados. |

Las cinco entradas exactas de 1E son GET `/api/v1/authorizations`, GET
`/api/v1/authorizations/:id`, POST `/api/v1/memberships/me/recharges`, GET
`/api/v1/memberships/me/wallet` y POST `/api/v1/rewards/redeem`.
Se componen mediante `AuthorizationReads`, `WalletOperations` y
`RewardRedemption`, con adaptadores locales a AuthorizationsService,
WalletService y RewardsService. El controlador conserva guards, DTO, pipes,
decoradores y serialización; la frontera no copia algoritmos ni mueve escritores.

**Total: 22/46 con frontera, 24 pendientes en el paquete operacional.**
Las pruebas comparadas y su alcance están en el informe, sin certificar
equivalencia universal, proveedor real ni recuperación ante caída física.
Se mantienen una PostgreSQL, cuatro procesos NestJS, tres frontends, Gateway
y Compose existentes. No hay cambios de esquema, reglas o seguridad.

T01 sigue pendiente de recuperación funcional; `x-kiosk-key` no obtiene scope
firmado de estación; TARJETA conserva 500/rollback por `OnlineOrder_method_check`;
los límites de proveedores externos permanecen abiertos. No se corrigen en 1E,
no se reabre A.4 y no se alteran otros servicios ni plataformas protegidas.

Commerce y Lote 1 completos aún no se declaran. Se mantienen los criterios
finitos de cierre de §11, incluida regresión agrupada y aceptación de excepciones.
Se termina exclusivamente 1E, con un único commit local tras las pruebas.
**1F no iniciado; sin push ni merge, y sin comenzar los lotes 2–5.**

## 13. Cierre académico de la frontera Commerce tras Lote 1F — 2026-11-19

Referencia autorizada `5ba983d3242cf025ead1e1bd1d640d1e22fa4222`, rama
`feat/dezkz-identity-a4-core`. Esta actualización conserva las secciones
históricas y sus estados de referencia. Entrega:
[informe 1F](primax-lot1f-operational-closure-results.md),
[matriz final de 46 contratos](primax-commerce-final-46-contract-matrix.md) y
[evidencia saneada](evidence/lot1f-operations/review-summary.json).

| Familia 1F / filas 3I | Contratos | Resultado de frontera |
|---|---:|---|
| AssistanceWorkflow: 7–9,36–38 | 6 | Puertos/casos de uso y adaptadores al AssistanceService íntegro; validación HTTP/SQL/Redis, permisos, estados, auditoría, rollback y replay. |
| OperationalAdministration: 24–30 | 7 | Autoridad original y motor OperationsService; grants/revoke, surtidores/terminales/asignaciones, atomic y auditoría sin trasladar escritores. |
| TerminalWorkflow: 39–44 | 6 | OperationsService/KioskService locales; propiedad, actividad de credencial, apertura/cierre, replay, concurrencia y límites de recuperación originales. |
| ControlOperationRecovery: 12–14 | 3 | Cancel/resolve/ticket con las reglas y efectos SQL/Redis originales; no equivale a resolver T01. |
| ControlPaymentWorkflow: 10–11 | 2 | Detalle y acciones Control con VIEW/MANAGE/estación, proveedor demo y auditoría originales; sin nuevo intento comercial ni otra transacción distribuida. |

Clasificación previa: A=9 elegibles Commerce, B=15 compartidas con compatibilidad
local, C=0 bloqueadas para la frontera y D=0 excepciones técnicas sin puerto.
Las cinco antiguas candidatas técnicas (13,24,25,39,40) también tienen frontera
y evidencia; no se declaran terminadas mediante una excepción implícita.

**46/46 contratos con frontera comprobada dentro de los casos documentados;
24 nuevos en 1F y 22 anteriores conservados.** Todos conservan un motor/repositorio
local de compatibilidad; H y legacy local no son estados mutuamente excluyentes.
No queda un contrato sin familia ni se crea otro escritor. Los snapshots comparan
tablas, relaciones, importes, estados, secuencias y efectos técnicos legítimos.
La regresión final agrupada incluye las familias previas, lectura protegida,
Gateway/empaquetado, cuatro builds más legacy e imágenes Docker.

Se cumplen los criterios técnicos de cierre de Commerce de §11 dentro de la
evidencia declarada, sin P0 técnico nuevo pendiente ni otra extracción requerida
por defecto. La aceptación de la entrega 1F corresponde al responsable. No se
declara concluido el proyecto 3J completo: los contratos Identity/Catalog y
Administration, Compose integral, tres interfaces y portabilidad de los Lotes
2–5 siguen fuera de esta autorización y no quedan acreditados por Commerce.

Se conservan T01 pendiente de recuperación funcional, `x-kiosk-key` sin scope
firmado de estación, TARJETA/`OnlineOrder_method_check` con 500/rollback y las
limitaciones de proveedor/firma nativa. Permanecen AuthCore/JWT/PasswordReset/
KioskService, Prisma y bootstrap compartidos. No se reabre Identity A.4, no se
cambia esquema, políticas, motores, frontends, Gateway u otros microservicios.
Las pruebas de ticket/claim conservan explícitamente efectos Redis que pueden
sobrevivir un fallo SQL; no se promete atomicidad conjunta ni recuperación universal.

Próximo alcance recomendado, sin iniciarlo: Lote 2 de §6, cierre Identity y
aceptación Catalog, preservando A.4 y plataformas. No hay push ni merge.
**Lote 1F terminado; Lotes 2–5 no iniciados.**

## 14. Lote 2 — incremento Identity y evaluación Catalog, 2026-11-19

Referencia autorizada `868a74f4dd5aad41e5c1e73774979233d881cb59`, rama
`feat/dezkz-identity-a4-core`. Se conservan las secciones históricas y el cierre
Commerce aceptado. Entrega: [informe Lote 2](primax-lot2-identity-catalog-results.md),
[matriz Identity 26 + Catalog 6](primax-lot2-identity26-catalog6-matrix.md) y
[evidencia saneada](evidence/lot2-identity/review-summary.json).

| Bloque | Estado comprobado | Pendiente real |
|---|---|---|
| Seis lecturas Identity | Puertos previos conservados; regresión HTTP de propietario, consultas, alias, UUID y paginación. | Mantener sus límites documentados; no nueva extracción de consultas. |
| PATCH /memberships/me/profile, POST /vehicles, POST /plate-recognition | Tres fronteras nuevas mediante ProfileOperations, VehicleLinking y PlateRecognition; motores/repositorios originales, 15 fuentes de capas de delegación y tres controladores modificados. | Ninguna regla nueva; OCR externo se simula y no se certifica su algoritmo. |
| Cinco auth, seis sesiones kiosco, cuatro workflows admin Identity | Quince C: motores intactos y regresiones verificadas, frontera no implementada. | Decisión P0 sobre composición/empaquetado compartido AuthCore; no se cuentan como consolidados. |
| Login administrativo y demo-credentials | Dos D propuestas: implementación técnica inline y políticas originales conservadas y probadas. | Aceptación expresa de excepción o autorización de tratamiento; no aceptadas automáticamente. |
| Seis lecturas Catalog | Cuatro casos de uso existentes y seis contratos comprobados, sin reimplementación ni cambios de permisos/repositorios. | Se mantiene la exposición pública de inventario y dependencia local/lector alternativo; no acredita despliegue productivo ni Compose final. |

**Identity queda en 9/26 fronteras (seis previas + tres nuevas), 15 C y dos D
propuestas. Catalog cumple el alcance académico de seis lecturas comprobadas.**
No se declara Identity ni Lote 2 cerrados académicamente. Las regresiones exitosas
de auth/kiosco/admin acreditan compatibilidad de la plataforma intacta, no una
frontera que no se haya implementado.

El bloqueo es concreto: AuthCoreModule y AuthModule comparten archivo, que importa
los tres controladores afectados. Los cuatro entrypoints compilan ese cierre
transitivo, pero cada Dockerfile copia sólo las fuentes hexagonales propias.
El diagnóstico aislado, sin red ni bases y sin editar el repositorio, demuestra
Commerce original exit 0 y TS2307 al importar Identity desde el controlador Auth
compartido. No se fuerza una migración alterando AuthCore u otros Dockerfiles.

P0 finito para cerrar Identity: autorizar separar la composición Identity del
archivo AuthCore, o permitir incluir sus nuevas dependencias en los Dockerfiles
de Catalog/Administration/Commerce; después consolidar las quince fronteras y
aceptar/resolver las dos D. No se requieren cambios de políticas de autenticación,
revocación, transacciones o propiedad de datos para la delegación semántica; el
acoplamiento de distribución actual sí exige una decisión fuera de los límites
autorizados. No se crean nuevas etapas por ruta ni se mueve lógica a otro servicio.

Se preservan AuthCore, PasswordReset, authVersion y políticas, Prisma/migraciones,
Commerce/Administration, frontends/Gateway, T01, x-kiosk-key e Identity A.4.
No hay push ni merge. Se recomienda aceptar el incremento elegible y Catalog con
observaciones, mantener abierto el cierre Lote 2 y resolver esa decisión antes de
declararlo terminado. **Trabajo detenido dentro de Lote 2; Lotes 3–5 no iniciados.**

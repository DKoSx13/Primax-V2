# Astra — Lote 1E: operaciones financieras y lecturas Commerce

## Referencia y verificación inicial

Base `42f9fd051269f1963eccf6485b15fd88be2f49fd`, rama
`feat/dezkz-identity-a4-core`. HEAD y rama coinciden con la autorización.
Sin modificaciones versionadas ni staging inicial; nueve archivos históricos
sin seguimiento, conservados y excluidos de este commit. Coinciden sus SHA256 y
los 155 hashes protegidos del manifiesto 1D. Se verificó la cadena de ancestros,
incluidos los lotes 1–1D, y `git fsck --connectivity-only --no-reflogs`: exit 0,
sólo blobs dangling, sin objetos faltantes ni corruptos. No se borraron objetos.
Los tres volúmenes históricos siguen presentes y no se montaron en este lote.
Al cierre siguen idénticos 153 de esos hashes; las otras dos fuentes son
AuthorizationsController y TransactionsModule, cuya inyección/composición cambia
expresamente en 1E. Se registran sus hashes anteriores y nuevos. Ningún motor,
regla, repositorio, plataforma de seguridad ni migración cambia.

Se consultaron la sección 11 de la matriz 3J y el informe 1D. Las filas
1,3,15,16,35 de la matriz 3I son exactamente las cinco entradas autorizadas.

## Cinco operaciones examinadas y consolidadas

| Fila 3I / contrato público | Motor original | Autoridad, consistencia y resultados conservados |
|---|---|---|
| 1 — GET /api/v1/authorizations | AuthorizationsService.pendingBefore | KioskOnly; ParseIntPipe y entero positivo en controlador. Revisa reservas RESERVED/DISPENSING/INTERVENTION_REQUIRED anteriores al umbral, orden ascendente y máximo 100; no libera saldo ni reserva. Lista fuera de allowlist firmada: conserva 403. Llave legacy conserva lectura sin scope de estación. |
| 3 — GET /api/v1/authorizations/:id | AuthorizationsService.status | KioskOnly, UUID, autorización de estación mediante kiosco firmado; 404 ausente, 403 estación ajena. Serialización original de importes/avance/estado. Llave legacy mantiene su limitación de estación. No consulta proveedor ni concilia pagos. |
| 15 — POST /api/v1/memberships/me/recharges | WalletService.recharge | Miembro JWT y userId del actor, DTO original; exclusivamente acreditación demo. Atomic Serializable y lock de Membership originales, límite de saldo, operationId/kind y conflicto de importe/propietario. Acredita saldo y liquida deuda FIFO con débitos de ledger, estados Payment/Transaction/MembershipDebt originales. Replay devuelve movement/replayed, sin inventar los campos de primera respuesta. |
| 16 — GET /api/v1/memberships/me/wallet | WalletService.history | Miembro propietario. Balance disponible, reservas POSTPAGO abiertas, total, deuda e historial con orden/serialización/límite 100 originales. Lectura de Membership en atomic y consultas posteriores separadas: no se promete snapshot global nuevo. |
| 35 — POST /api/v1/rewards/redeem | RewardsService.redeem | Miembro propietario y DTO original. Atomic Serializable original: operationId, elegibilidad/beneficio/puntos, Redemption+RewardMovement anidados. Replay precede el chequeo de actividad de membresía, como antes. No emite saldo, pago ni comprobante. |

Cinco elegibles y consolidadas; **ninguna excluida dentro del paquete**. No fue
necesario cambiar reglas, seguridad, transacciones ni esquema para crear las
fronteras. Se excluyen las 24 entradas operacionales de las filas 7–14,24–30,36–44,
los comandos nuevos, correcciones de incidencias y proveedores comerciales.

## Componentes y archivos

Flujo de las cinco rutas: controlador original → adaptador de entrada → caso de
uso → puerto → adaptador local → misma instancia del motor original.

Tres familias agrupadas: `WalletOperations` (recharge/history), `RewardRedemption`
(redeem) y `AuthorizationReads` (status/pendingBefore). Cada familia aporta cinco
archivos bajo `Backend/services/commerce/src/`:

- `application/ports/{wallet-operations,reward-redemption,authorization-reads}.ts`
- `application/use-cases/{wallet-operations,reward-redemption,authorization-reads}.ts`
- `adapters/inbound/{wallet-operations,reward-redemption,authorization-reads}.adapter.ts`
- `adapters/outbound/existing-{wallet-operations,reward-redemption,authorization-reads}.ts`
- `bootstrap/{wallet-operations,reward-redemption,authorization-reads}.providers.ts`

Puertos/casos de uso independientes de NestJS, Prisma, HTTP y lógica financiera.
Respuestas inferidas del motor en el adaptador local; comandos estructurales
compatibles con los DTO originales. Providers conectados por factory; no nuevas
instancias de repositorios, escritor, proceso, transporte ni reintentos.
Las llamadas internas y exports de los módulos originales permanecen vigentes.

Se modifican únicamente seis fuentes existentes para imports/inyección/providers:
`Backend/src/wallet/wallet.controller.ts`, `wallet.module.ts`,
`Backend/src/rewards/rewards.controller.ts`, `rewards.module.ts`,
`Backend/src/transactions/authorizations.controller.ts`, `transactions.module.ts`.

Pruebas/harness nuevos: `Backend/src/wallet/member-finance.spec.ts`,
`Backend/test/member-finance.integration.cjs`,
`tools/astra/lot1e-finance-validation.cjs`,
`tools/astra/lot1e-finance-postgres-redis.cjs`. Documentación: este informe,
sección 12 añadida a 3J y `evidence/lot1e-finance/review-summary.json`.
El resumen contiene manifiesto de archivos/hashes y evidencia saneada; los logs,
Compose y datos sintéticos completos permanecen privados en `.cache/astra-lot1e-finance/`.

## Protocolo de comparación y límites

La referencia restaura desde el commit indicado los controladores y la composición
previos; el candidato usa los cambios locales elegibles. Ambos ejecutan los mismos
casos y fixtures sobre PostgreSQL/Redis distintos y vacíos. Los motores de negocio
y fuentes que deben permanecer sin cambios coinciden por hash; no se ejecutan dos versiones contra la
misma base para comparar escrituras.

Cada proyecto comprueba ausencia y vaciado inicial de sus dos volúmenes nuevos,
labels/montajes propios, una PostgreSQL 17.6 y Redis 7.4, red interna sin puertos
publicados, hostname/base/rol antes de las 36 migraciones existentes y Redis vacío.
Credenciales sintéticas nuevas por proyecto. No seed operativo ni montaje histórico.
Al terminar se detienen sólo contenedores propios; se conservan volúmenes y logs.
No se ejecuta `down -v`, prune, pagos reales ni correcciones sobre T01.

Los snapshots incluyen todas las tablas de negocio y las secuencias. Los UUID de
fixtures permanecen literales; los generados se correlacionan por tabla/identidad
natural. Se excluyen sólo timestamps de ciclo de vida y metadatos de migraciones;
no importes, saldos, puntos, hashes, estados, claves, referencias ni relaciones.
Las etiquetas de solicitudes simultáneas se comparan sin asignar el replay a un
cliente específico. Los datos originales de cada ejecución no se reescriben.
La respuesta HTTP conserva el orden nativo de movimientos; se verifica además
contra la consulta SQL con createdAt DESC/id DESC. No hay garantía nueva de lectura
consistente entre consultas que el motor ejecuta separadamente.

Se cubren rechazo de actor/token/cookie/key, usuario inactivo/sesión invalidada,
DTO/UUID/query inválidos, miembro sin membresía, membresía suspendida, beneficio
inactivo/ausente, puntos insuficientes y producción sin recarga demo. Propietarios
ajenos no acceden al dinero o canje ajeno; operación compartida con otro dueño
rechaza 409. Kiosco firmado consulta su estación y rechaza otra; su lista sigue
fuera de allowlist. La llave legacy puede consultar otra estación y se documenta
como limitación preservada, nunca como aislamiento acreditado.

En dinero se verifica saldo libre/reservado/total/deuda, recarga con centavos y
límite máximo, FIFO parcial y final, Payment PARTIAL/CAPTURED y Transaction PAID,
rollback de ledger/deuda/cupón antes de commit, replay sin más efectos y respuesta
perdida después del retorno del motor. La pérdida es una excepción 503 sintética,
no caída física ni prueba universal de recuperación. Los retries de aplicación
son explícitos del cliente; el motor conserva sus retries Serializable existentes.

Concurrencia: misma recarga y mismo canje producen un efecto y replay; dos canjes
distintos compiten por los últimos 30 puntos, sólo uno emite cupón, sin saldo
negativo. Lecturas paralelas no escriben tablas de negocio. Se conserva la forma
distinta de respuesta inicial/replay y no se inventa certeza tras resultado
desconocido. No se cubren todas las intercalaciones posibles.

## Resultados y cierre

Los resultados concretos y las rutas privadas de ejecución se registran en el
resumen saneado enlazado. Pruebas repetibles:

| Verificación | Antes / después | Resultado |
|---|---|---|
| Jest, guard/contratos/regresión Commerce | 137 / 147 pruebas, 14 / 15 suites | Cero fallos aceptados. Diez pruebas nuevas de frontera/validación/pureza. |
| Gateway y empaquetado | 24 + 9 por brazo | Contratos sin cambios. |
| Compilaciones | Identity, Catalog, Administration, Commerce y legacy | Cinco exit 0. |
| Wallet/puntos/lecturas | 110 HTTP por brazo | Respuestas, tablas y secuencias coinciden. Pareja final da6fd853a7e3 / dfe9456db4f6. |
| Órdenes/callbacks | 95 HTTP por brazo | Coincidencia; 9ad139b24a83 / 1d4bbfe904b1. |
| Pagos/reembolso/conciliación | 127 HTTP por brazo | Coincidencia; b5b4fd5a1237 / 4c386b0b37ca. |
| Autorizaciones | 107 HTTP por brazo | Coincidencia; 1e8ca67b34d2 / c3705e4b860d. |
| Ventas | 38 HTTP por brazo | Coincidencia; f1ea8f5dba04 / bb139c17c159. |
| Docker Commerce y legacy | Dockerfiles existentes, tags lot1e-finance | Imágenes construidas, usuario node y entrypoints originales; módulos de transacciones cargados sin red/bootstrap/bases. |

Son 477 comprobaciones HTTP por brazo, 954 en las diez ejecuciones de integración
aceptadas. El fixture financiero siembra diez ventas históricas y sus diez recibos;
al terminar siguen diez/diez, boleta_seq=10, op01 y factura sin usar.
No nuevos comprobantes, ventas ni movimientos de inventario físico. Las regresiones
conservan los valores y huecos originales de sus secuencias, sin renumeración.

La ventana del canje competitivo se coordina en el repositorio de prueba y el
retorno del motor: ambas transacciones leen 30 puntos, A confirma y B debe
reintentar Serializable y observar cero. Los UUID sembrados siguen literales,
sin correlacionar ganadores cambiando datos del fixture.

Diagnósticos conservados, no aceptados: run-7de652922385 (inferencia genérica del
fixture unitario); 1bdb85ab522a (fixture EARN sin transacción exigida por constraint);
f48f29bbf20f (firma de prueba omitía querystring); c3ea217b4bd7 y cf262f52e66a
(espera circular del harness HTTP al coordinar la carrera, detenidos de forma
explícita). Se corrigieron pruebas/fixtures, sin cambiar reglas del producto.
El primer par financiero df323606d1f3 / 1942e97f1ef8 también coincidió, pero la
pareja final lo sustituye para exigir UUID sembrados literales e intercalación
repetible. No se ocultan intentos fallidos ni se contabilizan como aprobados.

Pruebas repetibles:

```text
node tools/astra/lot1e-finance-validation.cjs --baseline
node tools/astra/lot1e-finance-validation.cjs
node tools/astra/lot1e-finance-postgres-redis.cjs
node tools/astra/lot1e-finance-postgres-redis.cjs --family finance
```

La regresión reutiliza sin modificar los harness de ventas, autorizaciones, pagos
y órdenes de los lotes anteriores, incluidos sus escenarios de rollback/replay,
proveedor ambiguo, idempotencia y TARJETA. No se certifica integración comercial
real. Builds de los cuatro servicios más legacy, contratos de Gateway y pruebas
de empaquetado no equivalen a arranque Compose integral con tres frontends.

Persisten T01 sin recuperación funcional, limitación `x-kiosk-key`, contradicción
TARJETA/`OnlineOrder_method_check` (500 con rollback) y capacidades ausentes de
proveedor externo (incluidos findByReference/cancel/refund de Culqi y firma nativa).
Se mantienen AuthCore/A.2 como plataforma/deuda declarada y A.4 cerrado.
Ninguno se corrige ni presenta como resuelto por este lote.

Commerce alcanza **22/46 contratos con frontera**. Quedan las 24 entradas del
paquete operacional; ninguna excepción técnica candidata queda aceptada por
inferencia. No se declara Commerce completo ni Lote 1 completo. Integración
Compose integral, tres frontends y Windows/Linux/macOS siguen en sus lotes
autorizables posteriores. No se modificaron Identity, Catalog, Administration,
AuthCore/PasswordReset/authVersion, Prisma/migraciones, frontends ni Gateway.

Se permite un único commit local tras todas las comprobaciones. No push ni merge.
**El trabajo se detiene al cerrar 1E; no se inicia 1F.**

# Astra — Lote 1, primera frontera transaccional Commerce

## Alcance y respaldo

Rama `feat/dezkz-identity-a4-core`. HEAD inicial
`b0f9dcf6ce37e77aa2e9b8a892efce55460ef2d2`, árbol versionado/índice limpios y
diez archivos nuevos: plan 3J y nueve evidencias históricas. Hashes de 3I,
fuentes protegidas, migraciones y evidencias verificados. El plan se revisó y
respaldó solo en `83b22937015b2ad39eff2815a21d9f7b7c49aa42`
(`docs(astra): define finite academic hexagonal closure plan`). Las nueve
evidencias quedaron excluidas e intactas. El plan es evidencia histórica de 3J;
no se actualizan sus declaraciones de estado de aquella entrega.

Se implementa únicamente la frontera de **POST /api/v1/transactions**. No se
completan las otras familias del Lote 1 ni se inician los Lotes 2–5.

## Flujo y preservación

```text
TransactionsController.create original: guard + DTO + alerta previa
  → TransactionCreationAdapter
  → CreateTransaction (aplicación)
  → TransactionCreation (puerto de unidad completa)
  → ExistingTransactionCreation
  → TransactionsService.create original, una sola invocación
  → repo.atomic + settleReservation + repositorios/triggers originales
```

El controlador público conserva clase, ruta, método, decoradores de seguridad,
DTO/Swagger, respuesta y alerta `checkAuthorization` previa. Sólo cambia el
destino final de delegación y su inyección; no se reemplaza el controlador.
GET mantiene su cuerpo anterior. TransactionsService no delega create de vuelta
a la frontera: no hay ciclo, motor duplicado o segundo repositorio.

El motor completo, Atomic serializable y sus reintentos internos, cálculos,
redondeos, locks, hash/operationId, inventario, pago, ledger, puntos, perfil,
comprobante y mapper permanecen **sin cambios de archivo**. El adaptador llama
una vez y devuelve la misma promesa/resultado/error sin capturar, normalizar,
reintentar o compensar. El DTO validado se conserva por identidad, incluidos
defaults/omisión y saveReceiptProfile. El contrato estructural puro refleja los
campos del DTO, pero no sustituye sus validadores. Por eso el tipo permite el
enum legacy EFECTIVO aunque la validación HTTP vigente lo siga rechazando.

No cruza Prisma.TransactionClient, Nest, Request/Response ni HTTP nuevo por la
aplicación. No se introduce una política fiscal, calculadora, repositorio,
dominio artificial ni autoridad de tablas adicional. La alerta previa sigue
fuera de atomic; no se atribuye a la venta un rollback de ese efecto.

## Archivos de implementación

Modificados (dos):

- `Backend/src/transactions/transactions.controller.ts`: inyección/delegación de create, mismos contratos y pre-hook.
- `Backend/src/transactions/transactions.module.ts`: registra providers sobre el TransactionsService existente.

Nuevos (doce):

- `Backend/services/commerce/src/application/ports/transaction-creation.ts`.
- `Backend/services/commerce/src/application/use-cases/create-transaction.ts`.
- `Backend/services/commerce/src/adapters/inbound/transaction-creation.adapter.ts`.
- `Backend/services/commerce/src/adapters/outbound/existing-transaction-creation.ts`.
- `Backend/services/commerce/src/bootstrap/transaction-creation.providers.ts`.
- `Backend/src/transactions/transaction-create.spec.ts`.
- `Backend/test/commerce-sale.fixture.ts`.
- `Backend/test/commerce-sale.integration.cjs`.
- `tools/astra/lot1-sale-validation.cjs`.
- `tools/astra/lot1-sale-postgres-redis.cjs`.
- `Docs/astra/primax-lot1-sale-transaction-boundary-results.md`.
- `Docs/astra/evidence/lot1-sale/review-summary.json`.

Total del respaldo de implementación: catorce rutas, separadas del commit del
plan. Los Dockerfiles ya copian commerce/src desde 3I y no necesitan cambios.

## Pruebas y ejecuciones reales

| Ejecución | Resultado | Evidencia privada bajo .cache/astra-lot1-sale |
|---|---|---|
| Línea base antes del cambio | 99 Jest, 24 Gateway, 9 empaquetado correctos | run-4a2d193508f0 |
| Candidato offline | 104 Jest en nueve suites, 24 Gateway, 9 empaquetado correctos | run-fd3a7176af3b |
| Compilaciones | Identity, Catalog, Administration, Commerce y legacy: exit 0 | Mismo run; manifiestos/logs de cinco builds |
| Intento de fixture 1 | Falló antes de pruebas: faltaba label obligatorio del vehículo | primax-astra-lot1-sale-7ca9b945c817 |
| Intento de fixture 2 | Falló una expectativa de CSRF porque la sesión sintética usaba hex64 y requería formato base64url | primax-astra-lot1-sale-87412aae6630 |
| Primera pareja completa | 38 casos por rama correctos; comparación final detectó sólo startedAt de asignación, generado en momentos diferentes | primax-astra-lot1-sale-c88a1e554cd4 y primax-astra-lot1-sale-cc938de26a5c |
| Pareja final | 38 casos por rama, **76 solicitudes**, comparación HTTP/financiera completa correcta | primax-astra-lot1-sale-6f88c3f99bbb y primax-astra-lot1-sale-7977b4afdfdb |
| Preservación estática | Motor idéntico, parámetros/decoradores HTTP iguales; sólo cambia this.service.create → this.creation.create | source-proof.json |
| Empaquetado | Commerce runtime y legacy build correctos; módulos cargan sin bootstrap/red | image-commerce.log e image-legacy.log |

Las tres correcciones de preparación/comparación se limitaron al laboratorio.
Se añadió label, se generó el formato de sesión correcto y se fijó startedAt
del fixture a una fecha común. No se relajaron validadores ni se descartó esa
fecha de la comparación para ocultar la diferencia. Todos los intentos quedaron
preservados; ninguna diferencia financiera se encontró en la pareja anterior.
El primer verificador AST también requirió normalizar CRLF/LF al comparar texto;
no se modificó el controlador o motor para resolverlo.

La referencia usa controlador y módulo congelados del commit documental, antes
de la extracción; el motor, repositorio, mapper y seguridad son los mismos
archivos originales. El candidato usa la composición nueva. Ambos ejecutan
TransactionsModule, AccessGuard, KioskService, AlertsService, PrismaService,
SQL y triggers reales. El bootstrap operativo no se inicia.

Las cinco pruebas nuevas verifican identidad del DTO, una invocación al motor,
orden/espera de alerta, rechazo del pre-hook, propagación de resultado desconocido
sin retry, ausencia de alerta POSTPAGO en PREPAGO e imports puros de aplicación.
Las 99 previas conservan sus aserciones: venta, autorizaciones, integridad crítica,
pagos demo, kiosco y HTTP con persistencia mock. No se ejecutaron e2e históricos
que usan bases previas. Las pruebas mock no se presentan como pruebas SQL.

### Condiciones sintéticas e independencia de comparación

Cada rama corre en un proyecto Compose nuevo con una PostgreSQL y Redis propios,
red interna, dos volúmenes nuevos verificados vacíos y cero puertos publicados.
Se verifican URL, identidad de base/rol, esquema vacío, etiquetas y montajes antes
de aplicar exclusivamente las 36 migraciones actuales. No hay seeds operativos.

Los once escenarios usan IDs de fixture deterministas, datos fiscales ficticios,
credenciales técnicas/HMAC efímeras y las mismas solicitudes. Preparación de
reservas: datos nuevos y primitivas SQL existentes; progreso mediante el servicio
original sólo para preparar el despacho, sin implementar su frontera. La
referencia nunca escribe en la base del candidato ni viceversa. Nunca se compara
una segunda escritura contra una base ya alterada por la primera implementación.

Comparación final: todas las tablas de negocio (40; metadatos de migraciones se
verifican aparte), cuerpos HTTP, hashes, importes, relaciones y secuencias. Los
UUID de filas nuevas generados independientemente se correlacionan por tabla y
su identidad natural (operationId/eventKey/relación/secuencia); los IDs sembrados
permanecen literales. Se excluyen sólo timestamps de ciclo de vida declarados;
no cantidades monetarias, precio, stock, números de recibo ni resultado. En la
carrera puede cambiar cuál petición gana: se compara el conjunto con un create
y un replay, manteniendo el mismo ID dentro de cada ejecución.

El manifiesto saneado registra resultados y hashes de evidencia; no incorpora
Compose privado, sesiones, hashes de credenciales técnicas, logs sin saneamiento
o snapshots privados. El mapa de UUID sirve a la comparación de entornos nuevos,
no a reconstruir identificadores o datos existentes.

## Comparación financiera y atomicidad

| Caso | Referencia y candidato: resultado comprobado |
|---|---|
| POSTPAGO completo + saveReceiptProfile | Venta 100.00, puntos 10, perfil fiscal guardado; reserva CLOSED y comprobante único. |
| Beneficio de bienvenida | Bruto 100.00, descuento 10.00, neto 90.00, puntos 9; estado/flag y saldo equivalentes. |
| Redondeo vigente | Importe 99.99 con precio histórico 21.30 y volumen 4.694; puntos 9; mismo balance/ledger/JSON. |
| PREPAGO completo invitado | Venta 100.00, puntos 0; utiliza pago previo y no cobra al saldo del miembro del fixture. |
| PREPAGO parcial demo | Venta 60.00 frente a pago 100.00; ajuste/reembolso demo de excedente según motor, reserva física cerrada. |
| PREPAGO parcial externo sintético | Venta 60.00, PAYMENT_PENDING, marcador PARTIAL_REFUND_PENDING y refundedAmount=0; no inventa confirmación ni llama a proveedor real. |
| Pago previo PENDING | Rechazo 400 y datos sin cambios. |
| Fallo dentro de atomic | Se inyecta error sólo en el harness después del insert de Transaction/Receipt; se revierten perfil, pago/ledger, venta/recibo y estados de reserva afectados. Reintento posterior confirma una sola venta. |
| Respuesta perdida tras commit | Harness lanza 503 después de que el motor confirme; misma clave recupera resultado replayed=true sin otro efecto financiero. No es una nueva política de retry. |
| Dos cierres simultáneos | Dos llamadas al motor, un único Transaction/Receipt y respuestas create/replay del mismo ID; reintento interno serializable existente sin cambios. |
| Placa contradictoria | 404 del motor, sin venta; BusinessAlert previo persiste fuera del rollback como antes. |

En las dos ramas: **28 invocaciones al motor para 38 solicitudes**, nueve ventas,
nueve recibos, 42 movimientos de inventario y una alerta previa. Ninguna llamada
a la frontera duplica la invocación. Los retries de atomic dentro del motor
siguen permitidos; no se confunden con un segundo comando de aplicación.

Las seis ventas iniciales se reintentan con la misma clave y con un digest distinto:
replay conserva ID/datos/secuencia y el cambio produce 409. Se comprueba que el
replay no vuelve a guardar perfil ni a escribir ledger, puntos o stock.

Secuencias finales iguales: receipt_boleta_seq=10, receipt_factura_seq sin uso y
terminal_operation_op01_seq=11. Hay nueve recibos: el fallo deliberado consumió
un valor de secuencia no transaccional. Ese hueco legítimo se conserva y se
compara; no se corrige, reinicia o interpreta como recibo financiero adicional.

No existe en este DTO una nueva partida tributaria que deba recalcularse. Un
campo igv no contratado sigue rechazado con 400. Se preservan los campos del
comprobante y el motor vigente; no se certifica un cálculo tributario nuevo.

Las once atenciones son fixtures ajenos a T01. Este POST no implementa el cierre
de atención; no se llama artificialmente a operaciones de cierre para hacer
pasar las pruebas. El motor de recuperación ni otras familias se modifican.

## Seguridad y errores

Se prueban ausencia de autenticación; JWT de miembro propio y ajeno rechazados
como escritores (la ruta sigue siendo KioskOnly); firma inválida; CSRF incorrecto;
credencial técnica inválida; owner de otra pestaña; estación ajena; DTO inválido;
campo tributario extra; combustible o código de membresía incompatibles. Los
rechazos del guard/pipe no invocan el motor. Kiosco válido conserva contexto de
Terminal/Operation, autorización y estación; el adaptador no recibe ni inventa
otra autoridad del cliente. Los mismos 400/401/403/404/409/500/503 se comparan.

No cambian firma, sesión, permisos, authVersion, política legacy x-kiosk-key o
AuthCore. El formato de sesión del fixture se corrigió para cumplir la política
vigente, no a la inversa. Redis mantiene su sesión y efectos técnicos de límite/
ownership existentes; no se exige ficticiamente cero escrituras Redis.

El 500 y el 503 son fallos deliberados del harness, idénticos para ambas ramas.
No se afirma recuperación productiva de proveedores ni se ejecutó un reembolso
externo. Se demuestra propagación sin retries añadidos y replay del resultado
ya confirmado en el escenario de respuesta perdida.

## Recursos, comandos y límites

Comandos principales:

```text
node tools/astra/lot1-sale-validation.cjs --baseline
node tools/astra/lot1-sale-validation.cjs
node tools/astra/lot1-sale-postgres-redis.cjs
docker build -f services/commerce/Dockerfile -t primax-astra-commerce:lot1-sale .
docker build --target build -t primax-astra-legacy:lot1-sale .
```

Los builds Docker se ejecutaron desde Backend. El harness offline usa contenedor
temporal sin red, copia sin .env y ejecuta Jest, Gateway, empaquetado, cuatro
build-domain y tsc legacy. El harness de integración genera Compose privado y
detiene cada proyecto propio aun si falla. No se ejecuta Compose operativo.

Los seis proyectos creados en las distintas rondas quedaron detenidos, PostgreSQL
y Redis con exit 0. Doce volúmenes nuevos y sus redes/evidencias se conservan.
No se montó, inició, borró o modificó ningún volumen histórico u operativo.
Las imágenes nuevas no se adoptan en Compose. Las nueve evidencias originales,
los commits anteriores, el plan 3J y el cierre A.4 permanecen intactos; T01 no se
consultó ni modificó.

No se encontraron regresiones del producto en los casos ejecutados; sí fallos
del fixture/comparación antes descritos, corregidos y preservados. Esto no es
equivalencia universal: no se prueban aquí todos los proveedores, impuestos,
beneficios, estados de recuperación, carga, frontends, Compose completo ni
Windows/Linux/macOS nativos. Los motores financieros y seguridad compartidos
siguen en Backend/src y plataforma; independencia de proceso no implica propiedad
exclusiva de datos ni dominio productivo totalmente extraído.

## Continuación propuesta, sólo con nueva autorización

Dentro del mismo Lote 1, reutilizar el patrón por familias, sin un corte por ruta:

1. Venta/autorización: cuatro comandos restantes de autorizaciones, con su
   reserva/progreso/liberación/intervención y motores actuales completos.
2. Lecturas protegidas agrupadas: ocho B de la matriz 3I, sin habilitar rutas de
   kiosco actualmente rechazadas ni sustituir políticas por un filtro común.
3. Pagos/órdenes/proveedor/webhook y refund: nueve C y los GET D relacionados
   como workflows; conservar incertidumbre, fases SQL/externas y idempotencia.
4. Wallet/puntos y atención: dos C de wallet/canje y dos C de abrir/cerrar atención,
   respetando sus unidades distintas y evitando RPC que divida el commit.
5. Contexto técnico, permisos/asistencia/recuperación D: agrupar por capacidades
   y mantener sus efectos/controles; no trasladar escritores por prefijo Control.

El Lote 1 no está cerrado. No se implementa ninguna de estas familias en esta
entrega. Una reversión eventual retiraría sólo la composición/llamada del lote,
sin compensar ventas, recrear recibos o modificar datos. No se realiza push ni merge.

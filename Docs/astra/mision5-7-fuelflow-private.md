# Misión 5.7 — admisión privada FuelFlow–Identity

Resultado: **15/15 grupos de laboratorio**, sin activar tráfico público. Dos procesos
reales del llamador privado FuelFlow se comunican con el consumidor V2 de Identity
mediante HTTP y recuperan la misma operación desde PostgreSQL compartido entre
instancias. No importan el gateway ni el bootstrap legado. Los entrypoints Backend
comparadores se detuvieron antes de estas pruebas; Identity y su proveedor siguieron
como procesos propios. No se declara integración productiva ni autonomía completa.

## Canal y persistencia

Nuevos archivos `Frontend_1_FuelFlow/lab/identity-caller.cjs`, `caller-journal.sql`
e `identity-caller.test.cjs`. Ningún cliente productivo los importa ni activa.
El entrypoint exige FUELFLOW_IDENTITY_PRIVATE_LAB=enabled, perfil synthetic,
PostgreSQL `/synthetic` loopback, Identity loopback sin redirecciones y bind loopback.
La instalación DDL es explícita por el runner sobre una base nueva, nunca en startup.

| POST privado                            | Entrada cerrada                                             | Resultado                                            |
| --------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------- |
| /private/fuelflow/v1/operations         | callerOperationId, action, stationId, terminalId, expiresAt | callerOperationId, intentId y vencimiento confirmado |
| /private/fuelflow/v1/operations/execute | callerOperationId                                           | Credencial emitida o recuperada del recibo existente |

Se autentica Bearer Control con ConsumerAuthenticator/AccessGuard existentes y se
reenvía ese Bearer a Identity, que vuelve a validarlo. No se inventa un actor, no
se aceptan actor/userId/permisos/commandId en JSON, ni cookies o Control firmado
como kiosk. Se verifica usuario activo/authVersion, ADMIN_TERMINAL_MANAGE, alcance,
estación configurada, terminal, acción fija TERMINAL_CREDENTIAL_ISSUE y vencimiento.
Un adaptador explícito conserva los códigos de ContractFailure del autenticador;
no interpreta errores arbitrarios como autoridad ni modifica AuthCore.

`fuelflow_lab.CallerOperation` conserva usuario, authVersion, callerOperationId,
acción, estación, terminal, expiración y fingerprint. Una inserción SQL completa
confirma todos esos campos **antes del primer RPC Identity**. Unicidad por usuario
estable/nonce, sin generación en la clave. Solo INSERT/SELECT para el rol del llamador;
no guarda JWT, CSRF, respuesta ni credencial técnica. No hay UPDATE de estados que
pueda quedar parcialmente confirmado. Los permisos capturados no sustituyen las
consultas vivas de autorización.

Cada instancia recupera la solicitud original y resuelve la asociación V2 persistida
en Identity. Allí permanecen intentId/commandId; el llamador no necesita leer esas
tablas ni recibos directamente. Expirar o revocar no permite reciclar el nonce;
cambiar destino/acción/vencimiento falla. Dos intenciones explícitas con nonces
diferentes permanecen distintas aunque su contenido sea igual.

El identificador lo elige el iniciador explícitamente antes de admitir: si pierde
la respuesta de admisión, debe presentar el mismo ID y solicitud. No hay búsqueda
por cuerpo ni recuperación de un ID que nunca conservó. Se resuelve persistencia
multiinstancia del llamador **hacia Identity**, no se implementa todavía la UI ni
persistencia del navegador antes de su primera petición al llamador. El cliente
archivo de la etapa anterior permanece disponible; no se reemplaza por una inferencia.

No hay retries automáticos RPC, transacción distribuida ni cache de tokens. Un 503
conserva la operación persistida; otra instancia recupera con el mismo nonce. La
transacción terminal/operación/credencial/auditoría/recibo continúa completa en el
proveedor existente. El resultado SQL no constituye una sesión Redis recuperada.

## Validación real y regresiones limitadas

Laboratorio `primax-m5-1794708314271-7c0b4bcb`: **15/15**, exit 0. Cinco grupos de
arranque/paridad/aislamiento de procesos y diez de integración. PostgreSQL/Redis/SMTP
sintéticos nuevos, tmpfs, credenciales nuevas y puertos loopback. Se reutilizó solo
el código compilado V2 con comparación exacta de hashes de entradas; ningún dato,
clave o volumen previo. Contenedores propios detenidos al finalizar.

```bash
node tools/astra/identity-isolated.cjs --fuelflow-private --consumer-only \
  --runtime-artifact=/home/primax/.cache/primax-identity-lab-artifacts/primax-m5-1794707093499-f80b0141-rQBAhJ
```

Se probaron autenticación válida/ausente/alterada, cookie y firma no permitidas,
actor inyectado, estación falsa, dos instancias, reinicio de ambas, seis ejecuciones
concurrentes y seis admisiones iniciales concurrentes, indisponibilidad de Identity,
pérdida real de respuesta de prepare y execute después de commit, recuperación por
otra instancia, dos intenciones de contenido igual, manipulación de terminal/acción/
expiración, otro propietario, vencimiento, corrupción del registro, revocación de
credencial, permisos y authVersion incluso después de login nuevo. Cada ejecución
repetida válida conserva **un credential, un audit y un receipt**. El proxy comprueba
que el registro del llamador ya existe antes de reenviar a Identity. El rol SQL no
puede modificar el diario ni acceder a intents/recibos, credenciales o dinero.

| Regresión directamente afectada               | Resultado             |
| --------------------------------------------- | --------------------- |
| Identity propio                               | 37/37                 |
| Cliente privado V2 anterior                   | 3/3                   |
| Nuevo llamador privado FuelFlow               | 5/5                   |
| Gateway                                       | 24/24                 |
| Comando combinado anterior                    | **69/69**             |
| FuelFlow identidad y kiosk legados            | **28/28**             |
| AuthCore compatibilidad + AuthService Backend | **14/14**, dos suites |

La paridad de **superficie** de los 27 métodos/rutas se comprueba en laboratorio;
no se atribuye a este ensayo la repetición completa de los 67 grupos de la misión
anterior. fullRegression=false y redisRecoveryResolved=false son deliberados:
esta misión no repite caídas PG/Redis ni toda la regresión Backend/Prime/Catalog.
No cambió el runtime Identity ni código compartido/productivo; por alcance privado
se ejecutan solo las pruebas específicas y de seguridad afectadas. No hubo cambios
transversales que justificaran repetir todas las suites. Sintaxis, formato y
git diff --check aprobados.

Evidencias nuevas: `evidence/identity-mission5-7-private.txt` y
`evidence/identity-mission5-7-regression.txt`.

## Fallos corregidos

1. Primer ensayo: 0 grupos; Prisma rechazó CREATE SCHEMA + CREATE TABLE como una
   sentencia preparada. El runner ahora envía dos DDL separados, solo en la base
   recién creada. Evidencia `identity-mission5-7-partial-ddl.txt`.
2. Segundo ensayo: cinco grupos; readiness esperaba 401 y recibió 503 porque el
   servidor privado no traducía ContractFailure del autenticador. Se mapea solo
   ese tipo conocido, se conserva el rechazo y se añade prueba unitaria. Evidencia
   `identity-mission5-7-partial-auth.txt`. No se amplían tiempos, relajan aserciones
   ni añaden retries para ocultarlo. La ejecución siguiente aprueba los 15 grupos.

## Límites y siguiente misión

**Sí:** FuelFlow e Identity se comunican en laboratorio sin depender del llamador
legado. **No:** esto no es UI/producto desplegado ni autonomía de datos/autoridad.
El adaptador de admisión privado todavía carga el autenticador compilado de Identity
(y su cliente Prisma de compatibilidad) y necesita lecturas directas de User/grants/
Control/Station/Terminal mediante un rol restringido. Es un acoplamiento explícito
de laboratorio; aún no hay contrato remoto de verificación de actor ni delegación
entre servicios. No acredita revocación atómica durante un RPC en curso.

El diario multiinstancia usa el mismo PostgreSQL sintético con esquema y privilegios
propios; no acredita pérdida de host/volumen ni HA/failover del motor. Siguen pendientes
persistencia browser del iniciador, transporte/claves/retención, límites de admisión,
entrega de sesión Redis, esquema operativo compartido y puentes financieros/Alerts.
No se inició trabajo de Administration/Commerce ni separación física operativa.

Siguiente misión recomendada: definir y ensayar un puerto remoto de verificación de
actor Control para quitar las lecturas AuthCore/Prisma del llamador FuelFlow,
conservando actor, generación, alcance y revocación; mantener apagado el tráfico público.

## Preservación y respaldo

Se cotejan **107 archivos previos de evidencia**, incluyendo las 103 evidencias
solicitadas y los cuatro informes de la etapa V2, y los **34 JSON** con SHA-256.
Fuentes Identity/AuthCore/login, clientes productivos, V1, rama y HEAD intactos.
Los únicos archivos previos de código modificados son los dos runners privados
`tools/astra/identity-isolated.cjs` e `identity-consumer-checks.cjs`; el resto de
implementación/pruebas es nuevo. Este documento y la cabecera/continuación de
`mision5-identity-core.md` registran el resultado. No hay commits, push o merge.

Respaldo previo recuperable y verificado antes de editar:
`/home/primax/.local/state/primax-backups/mission5-7-before-20261115T015848Z/pending-work.tar.gz`.
SHA-256 de miembros verificado también en los respaldos históricos. No se copian
archivos env ni dos logs históricos PrintAgent con URLs sensibles; permanecen
intactos y cotejados por hash. El respaldo final se registra en la continuación de
la Misión 5; recuperar siempre en un directorio separado, sin sobreescribir este workspace.

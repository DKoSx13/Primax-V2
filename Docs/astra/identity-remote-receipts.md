# Identity — contrato remoto operativo con recibo durable, laboratorio V1

Esta continuación parte de `OperationalSessionPort.v1` validado (30 grupos). El
puerto, su proveedor original y el cuerpo SQL congelado se conservan. La composición
optativa selecciona un cliente HTTP; un proceso proveedor nuevo, construido desde
`services/identity`, ejecuta esa misma unidad SQL. No se inicia un nuevo dominio
Commerce/Administration ni se separan tablas existentes.

## Comando y consulta

Transporte privado de laboratorio: HTTP loopback, `x-operational-key` con clave de
servicio aleatoria exclusiva. El servidor deriva `callerId=identity-lab` y autoriza
una estación configurada; no acepta caller/actor/SQL del cuerpo. Autentica antes de
leer el JSON. Se rechazan campos extra, versión/UUID inválidos y cuerpos >16 KiB.
No se habilita tráfico público ni se cambia Gateway, JWT, HMAC kiosk o CSRF.

| Método/ruta privada | Entrada | Resultado |
| --- | --- | --- |
| POST /operational/v1/commands | version=1, commandId UUID, command del puerto V1 | Recibo COMMITTED con resultado original, después del commit |
| POST /operational/v1/receipts/query | Mismo identificador y comando completo | Mismo resultado confirmado, tras comprobar fingerprint y vigencia |

El comando contiene contractVersion=1, stationId confiable, terminalId/terminalCode
opcionales y previousCredential opcional. Los selectores conservan validación y
semántica anteriores; null opcional se normaliza como ausencia, como IsOptional.
`commandId` identifica la operación remota y sirve como clave de idempotencia. Es
**distinto** del operationId de TerminalOperation; no altera ese identificador de negocio.

Respuesta: version=1, commandId, state=COMMITTED y result con terminalId,
terminalToken opaco original y expiresAt ISO. No se incluyen sesión Redis ni
promesas de commit distribuido. Respuestas con `Cache-Control: no-store`; no se
registran cuerpos, tokens, claves o mensajes Prisma en logs.

401: clave interna inválida. 403: estación no autorizada. 400/413: comando/cuerpo
inválido. 409 COMMAND_CONFLICT: identificador confirmado con otro fingerprint;
409 CREDENTIAL_UNAVAILABLE: su credencial/terminal ya no es utilizable. Conflictos
de negocio conservan 409 y mensaje existente. 404 RECEIPT_NOT_FOUND: todavía no se
ve un recibo confirmado. 503: dependencia, clave de recibo o resultado indisponibles.
El cliente de Identity mapea fallos internos/de transporte a 503, sin tratar una
clave de servicio inválida como error de credenciales del usuario.

## Una transacción del proveedor

El proveedor toma un bloqueo advisory por callerId+commandId y ejecuta serializable
con la política original limitada a cinco intentos. La clave primaria compuesta
impide dos recibos confirmados. El fingerprint SHA-256 canónico incluye versión,
estación, selectores y hash de la credencial previa; no guarda ese secreto en claro.

Si el recibo existe, otra entrada devuelve conflicto sin reejecución. Si no existe,
el proveedor original recibe un adaptador enlazado a la **misma transacción ya
abierta**: no abre una transacción anidada. Bloqueo de terminal, validación/cierre
de atención, revocación, emisión, auditoría y recibo se confirman o revierten juntos.
No hay llamadas HTTP/Redis, lógica financiera nueva ni commits distribuidos dentro
del callback. Un error de serialización/unique revierte la tentativa entera antes
del siguiente intento. Ningún resultado se devuelve antes de confirmar SQL.

La tabla `IdentityOperationalReceipt` se instala mediante DDL explícito **solo en
la nueva base sintética**. No se añade a migraciones existentes ni se crea durante
el arranque. Permisos del proveedor: SELECT operativo, escrituras operativas
originales y INSERT del recibo; sin UPDATE/DELETE del recibo, modificación de dinero
ni DELETE de auditoría. Identity/puente legado no reciben acceso SQL al recibo.
Las FK nuevas del recibo son locales al laboratorio; las 37 relaciones auditadas
originales no se retiran ni se sustituyen.

No se purgan/reutilizan claves confirmadas. Un recibo revocado o expirado permanece
como registro y rechaza devolver el token. La consulta vuelve a comprobar estado,
revocación y expiración en PostgreSQL; no actúa como caché de autorización. Los
rechazos antes del commit no crean un recibo FAILED: toda esa unidad se revierte.

## Protección de la respuesta recuperable

La credencial existente sigue siendo randomBytes(32)/hex con SHA-256 en su tabla;
no cambian HS256, bcrypt, firmas, CSRF ni TTL originales. Como el recibo necesita
recuperar la respuesta, su payload se cifra aparte con AES-256-GCM, nonce aleatorio
de 12 bytes, tag de 16 bytes y AAD con versión/caller/commandId/fingerprint. Es una
protección nueva del recibo, no un cambio de criptografía de autenticación.

La clave aleatoria de 32 bytes solo se inyecta al proveedor sintético; Identity
recibe únicamente la clave HTTP distinta. El harness conserva la clave en memoria
para reiniciar el proveedor; no se publica, archiva ni agrega a evidencias. Una
clave perdida/incompatible devuelve 503 y **nunca** permite reemitir el comando.
Para producción faltan gestión durable/rotación de claves, transporte autenticado
con TLS, política de retención y autorización multicliente; no se certifican aquí.

## Pérdida de respuesta y límites de reintento

`RemoteOperationalSessions.execute` exige identificador explícito. Ante fallo
ambiguo de POST hace **una consulta**, sin repetir automáticamente el POST. Si la
consulta no resuelve el resultado, devuelve 503. El llamador puede consultar o
reenviar explícitamente el **mismo ID y cuerpo**; el proveedor asegura a lo sumo un
commit. Un 404 no demuestra que una operación en curso no vaya a confirmar después.
Una operación desconocida no debe convertirse en otra con ID nuevo por inferencia.

El método compatible `issueOrResume` genera un ID por invocación. Los 27 handlers
públicos no incorporan una clave obligatoria ni cambian de DTO. El HTTP legado no
expresa identidad durable entre peticiones: dos peticiones nuevas siguen rotando
como antes. Esta etapa no promete deduplicarlas ni implementa un journal durable
del consumidor. Aprobar una correlación autenticada para esos llamadores es un
paso pendiente antes de anunciar idempotencia de extremo a extremo.

## SQL confirmado, Redis fallido

COMMITTED certifica únicamente SQL. El coordinador mantiene la creación de sesión
Redis después del commit. Si SET falla, devuelve 503 y queda un recibo con la
credencial/auditoría completas. Consultar/reintentar el mismo comando remoto
recupera ese token sin más emisión/auditoría; no crea por sí solo una sesión Redis.
Un reintento HTTP legado distinto conserva la rotación anterior. No hay rollback
ficticio, compensación, outbox de tokens ni respaldo local de sesiones.

En el laboratorio se obtiene el ID para este caso mediante el verificador SQL
privilegiado del harness. Eso **no** acredita un flujo productivo de recuperación
del consumidor sin journal/correlación. Las sesiones perdidas de Redis siguen
siendo inválidas, aunque SQL y su recibo sobrevivan.

## Ejecución y alcance

`node tools/astra/identity-isolated.cjs --remote-receipts` crea PostgreSQL/Redis
nuevos, contraseñas aleatorias y tmpfs; instala migraciones existentes únicamente
en esa base nueva y el DDL del recibo. Compila una copia del proyecto fuera del
repositorio. El proveedor y Identity son procesos separados. Los procesos legados
son comparadores de contratos y el puente financiero/Alerts sigue siendo legado.

El supervisor PostgreSQL del laboratorio permite parar abruptamente y recuperar
el motor manteniendo su tmpfs. Esto comprueba WAL/reinicio de proceso; no prueba
persistencia tras perder host, contenedor o tmpfs. No se usan volúmenes existentes.
Los fallos HTTP se inyectan mediante un proxy de prueba; no hay flags/backdoors de
fallo en el proveedor. Triggers de fallo afectan solo UUID sintéticos del laboratorio.

Recuperación técnica autorizada, validación técnica de guards, cliente Prisma de
esquema completo, finanzas/Alerts y autoridad/sincronización de datos siguen siendo
fronteras pendientes. Este contrato no acredita autonomía completa ni despliegue.

## Continuación del consumidor

Se añadió `lookup` al cliente (ausencia contractual distinta de indisponibilidad)
y un diario autenticado de intenciones en un proceso privado de laboratorio. No
cambia el wire V1 ni los métodos anteriores. Diseño y bloqueo del HTTP legado:
`identity-consumer-correlation.md`. El journal no almacena credenciales; requiere
una intención explícita y un actor Control/Bearer validado, no deduce reintentos
desde el cuerpo del bootstrap. Las limitaciones de la etapa original de arriba
continúan aplicándose a los clientes públicos actuales, que permanecen intactos.

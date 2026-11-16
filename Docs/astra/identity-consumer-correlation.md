# Identity — correlación persistente del consumidor, solo laboratorio

Actualización: [preparación V2 con Control](identity-consumer-v2.md) implementada
por autorización expresa. Lo que sigue describe V1 y su bloqueo histórico; V2
resuelve la pérdida de respuesta de prepare mediante callerOperationId explícito.

## Auditoría del origen y bloqueo del legado

`Frontend_1_FuelFlow/src/js/kioskSession.js` envía POST con `{}` a
`/api/kiosk/terminal-bootstrap`. Ante fallos vuelve a comprobar disponibilidad y
reintenta; no conserva una referencia explícita a la intención de emitir credenciales.
La referencia de pestaña se usa en otras peticiones de terminal; no es un usuario
ni una intención y el wrapper habitual de bootstrap ni siquiera la envía.

`Frontend_1_FuelFlow/server/gateway.js` rechaza un cuerpo de bootstrap no vacío,
deriva terminalId/terminalCode de configuración y firma método/ruta/tiempo/cuerpo/
sesión/CSRF/credencial/authorization/owner con el mecanismo existente. Renueva tiempo
y firma en cada llamada. Para bootstrap no deriva ni reenvía una identidad humana.
Las cookies HttpOnly representan sesión/credencial técnica; la sesión kiosk contiene
estación/versión/CSRF/expiración, no userId de un usuario Identity.

En Identity la ruta kiosk es Public y `bootstrapTerminal` verifica firma/límite,
no un actor humano. El consumidor remoto compatible genera un commandId por
invocación. Hash del cuerpo, terminal, cookie, pestaña, firma o timestamp no permite
distinguir una retransmisión de una nueva operación legítima. El timestamp firmado
caduca a 30 s: ampliarlo o convertirlo en identificador durable cambiaría su propósito.
El operationId de TerminalOperation tampoco identifica la intención de emisión.

**Bloqueo explícito:** los clientes actuales no aportan identidad humana ni una
intención repetible suficiente para la correlación pedida. No se les aplica dedupe
automático. No se añadieron campos/headers/rutas a sus contratos públicos, no se
cambió el Gateway ni se activó tráfico. Hace falta acordar ese contrato y la autoridad
humana/técnica antes de integrarlo con FuelFlow.

## Experimento mínimo, separado del HTTP público

Se implementa un consumidor privado, en otro proceso loopback, dentro del proyecto
Identity. No se registra en el runtime de las 27 rutas. Requiere opt-in sintético y
reutiliza **AccessGuard original**, JWT con sus opciones existentes y lecturas vivas
de usuarios/grants/cuentas/estaciones. No tiene un login alternativo.

El actor procede de Control/Bearer validado por AuthCore: usuario activo, authVersion
vigente, ADMIN_TERMINAL_MANAGE y alcance de estación. No se interpreta un rol enviado
por JSON o un nombre de operador como userId. La captura del usuario verificado es
local a cada petición, evitando mezcla de actores concurrentes.

Este prototipo acepta solo Bearer explícito: rechaza cookies, y el guard original
sigue rechazando Control firmado como kiosk. No traslada cookies a un flujo que
omita CSRF ni relaja esa verificación. Los mecanismos cookie/CSRF/HMAC existentes
se mantienen en las 27 rutas y se repiten sus pruebas; el experimento no acredita
un nuevo flujo de autenticación cookie ni sustituye el bootstrap kiosk legado.

| Método privado | Entrada cerrada | Resultado |
| --- | --- | --- |
| POST /consumer/v1/intents | terminalId UUID | intentId opaco y expiresAt; intención ya confirmada localmente, sin RPC |
| POST /consumer/v1/intents/execute | intentId UUID | Resultado técnico recuperado o emitido con su commandId persistido |

Se rechazan userId, commandId, action, selectores adicionales y campos desconocidos.
El comando de este prototipo es emisión técnica por terminalId, estación configurada
y previousCredential vacío. No se finge cubrir selección por código, reanudación
con secretos previos ni recuperación administrativa completa del contrato legado.

Preparar dos veces una terminal produce **dos intenciones diferentes**. Preparar no
es una deduplicación por contenido. Si se pierde su respuesta, puede quedar una
intención huérfana, pero no hubo llamada al proveedor. El llamador debe conservar
la referencia recibida para ejecutar/recuperar esa operación. No se promete recuperar
un handle perdido adivinándolo desde el cuerpo ni se implementa persistencia en el
navegador actual. Esa correlación del llamador sigue pendiente de contrato.

## Diario persistente del consumidor

`IdentityConsumerIntent` almacena intentId, commandId único, userId, authVersion,
action fija, stationId, terminalId, fingerprint, createdAt y expiresAt. No guarda
JWT, passwords, CSRF, credenciales anteriores, respuesta ni token técnico. El hash
vincula identificadores, usuario/generación, acción, vencimiento y fingerprint del
comando original. Protege la integridad de la asociación; no es un MAC frente a un
administrador SQL que pudiera reescribir también el hash.

El consumidor solo puede INSERT/SELECT, no UPDATE/DELETE. No puede leer recibos del
proveedor ni modificar dinero. El proveedor/puente/runtime antiguo no reciben acceso
al diario. Los UUID son referencias estables, sin nuevas FK entre dominios; se
revalidan usuario/versión y alcance contra las lecturas actuales. La tabla se instala
solo por DDL explícito en la nueva base sintética: no se aplican migraciones en startup
ni sobre bases existentes. El esquema/cliente compartido aún es una dependencia.

El handle vence a los 15 minutos y no se elimina/reasigna automáticamente. Otro
usuario recibe 404 incluso si es administrador global. Una nueva sesión del mismo
usuario puede recuperar solo con la misma generación de autorización; authVersion
revocado impide usar el handle incluso con un JWT nuevo. Grants/alcance se consultan
en cada petición, no se restauran desde el diario como privilegios vigentes.

## Orden y recuperación

1. Autenticar/autorizar actor. Preparar y confirmar el diario local; generar commandId
   una vez. No hay RPC dentro de esa transacción.
2. El llamador presenta el mismo intentId. Revalidar actor, propietario, versión,
   alcance, vencimiento y asociación; obtener el comando persistido.
3. Consultar el recibo remoto. Solo un 404 RECEIPT_NOT_FOUND del contrato permite
   intentar el POST **con el mismo commandId y cuerpo**. Un 404 de ruta desconocida,
   un timeout o un 503 no equivalen a ausencia: error controlado, sin emisión.
4. Si el proveedor confirmó, usar su resultado. No hay cache local de credenciales;
   cada recuperación comprueba el recibo y su revocación/expiración.
5. Si se pierde la respuesta o muere el consumidor, otro proceso usa su diario y el
   mismo handle. No busca IDs mediante un verificador SQL privilegiado del proveedor
   ni genera un ID nuevo. Los reintentos concurrentes quedan deduplicados en el proveedor.

Un 404 puede coexistir con un comando todavía en curso; reenviar el mismo ID es
seguro por el contrato transaccional del proveedor. No se añade retry automático
indefinido, worker/outbox, transacción distribuida ni rollback ficticio.

El resultado sigue siendo SQL confirmado. Este prototipo no emite sesiones Redis.
Si Redis falla después de SQL, su recibo puede recuperarse con el comando persistido,
pero eso no reconstituye una sesión kiosk perdida. El coordinador legado conserva
su orden y su 503 posterior al commit; sus pruebas se repiten.

## Ejecución y dependencias pendientes

`node tools/astra/identity-isolated.cjs --consumer-correlations` crea PG/Redis nuevos,
compila una copia fuera del repositorio, repite los 40 grupos previos y prueba el
consumidor con JWT emitidos por el login Identity existente y usuarios sintéticos.
El consumidor y proveedor son procesos separados; los fallos de red se inyectan en
proxies de prueba, no mediante flags del runtime. Los reinicios usan el mismo diario
de esa base de laboratorio, no un mapa en memoria. Tmpfs conserva el estado durante
reinicio de proceso/motor; no se acredita persistencia tras perder host/contendor.

Pendientes para integración real: contrato de intención y actor del llamador legado,
persistencia de su referencia, política para preparar cuando se pierde la respuesta,
retención/limpieza, entrega segura de credenciales/sesión Redis, recuperación técnica,
validación remota de guards, claves/transporte productivos, esquema operativo y
puentes financieros/Alerts. El prototipo Control no resuelve automáticamente la
autoridad de un operador kiosk. No se declara Identity completamente autónomo.


## Propuesta posterior: actor e intención

Véase [identity-actor-intent-proposal.md](identity-actor-intent-proposal.md) para
la matriz de autoridad humana/técnica, el sobre privado y la preparación V2
pendiente. El laboratorio de actor amplía a 55 grupos la validación completa.
No cambia este prepare V1: perder su respuesta sigue dejando una intención
sin referencia recuperable por el llamador; no se deduplica por contenido.

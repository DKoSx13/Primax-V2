# Identity: preparación V2 con responsable humano Control

Implementación autorizada exclusivamente en laboratorio privado. No activa FuelFlow
ni añade rutas al runtime público de Identity. La opción aprobada es emisión inicial
por un usuario humano Control validado por AuthCore; no se sustituye por terminal,
firma Gateway, cookie kiosk o nombre de operador.

## Contrato y activación

El proceso privado mantiene los requisitos `IDENTITY_CONSUMER_LAB=enabled`,
`IDENTITY_RUNTIME_PROFILE=synthetic`, conexión PostgreSQL loopback a `/synthetic`,
JWT de laboratorio y bind loopback. Solo `IDENTITY_CONSUMER_V2_LAB=enabled` habilita
estos métodos adicionales:

| Método privado                    | Entrada cerrada                                                                                          | Resultado                                               |
| --------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| POST /consumer/v2/intents         | callerOperationId UUID, action=TERMINAL_CREDENTIAL_ISSUE, stationId UUID, terminalId UUID, expiresAt UTC | intentId y expiresAt originales                         |
| POST /consumer/v2/intents/execute | intentId UUID                                                                                            | Resultado emitido o recuperado del recibo del proveedor |

V1 conserva su cuerpo y semántica: cada prepare V1 crea una intención nueva. Las
27 rutas originales no se modifican. No se aceptan actor, userId, permisos,
commandId ni intentId elegidos por el cliente durante prepare V2. Acción y destino
son explícitos y se validan; no se usa igualdad de contenido como deduplicación.

Cada solicitud utiliza ConsumerAuthenticator y AccessGuard originales: Bearer
Control, JWT con issuer/audience/algoritmo existentes, usuario activo, authVersion,
permisos y alcance vivos. Se requieren ADMIN_TERMINAL_MANAGE y estación autorizada.
El diario verifica otra vez usuario/generación, estación configurada y terminal.
Cookies se rechazan: no se introduce un flujo cookie sin CSRF ni se acepta Control
firmado como kiosk. No se cambia AuthCore, login o criptografía.

## Transacción y correlación

La tabla sintética IdentityConsumerIntent añade callerOperationId nullable y
snapshot de permisos, con unicidad `(userId, callerOperationId)`. Todos sus actores
son humanos: el tipo no es seleccionable por el cliente. authVersion no participa
en la clave única. Los registros V1 usan nonce/permisos null y mantienen su digest.
Los V2 incluyen nonce, actor humano y permisos capturados en el digest, además de
usuario/generación/acción/destino/expiración/intentId/commandId.

La transacción Serializable existente valida y consulta la asociación. Si no existe,
genera intentId/commandId una sola vez e inserta con ON CONFLICT DO NOTHING; vuelve
a leer y valida el resultado antes de confirmar. Se conserva el límite de cinco
intentos internos de serialización existente; no se añade retry RPC ni POST oculto.
La asociación y el comando son una fila, sin estados parciales entre tablas.

- Mismo usuario + nonce + solicitud: recupera referencia original.
- Mismo nonce con datos o expiración distintos: 409, sin emisión.
- Generación revocada: rechazo incluso después de un login nuevo.
- Vencimiento: 410; permanece registro sin reasignación ni extensión.
- Nonce nuevo con cuerpo idéntico: intención nueva explícita.
- Otro actor no recupera ni ejecuta la intención ajena. El namespace del nonce es
  por usuario: dos usuarios autorizados pueden iniciar operaciones propias con
  el mismo valor, pero no apropiarse de referencias del otro.

La expiración solicitada debe ser UTC canónica, futura y como máximo 15 minutos
al crear. En retry se compara con el valor confirmado, sin recalcularlo. La tabla
es INSERT/SELECT para el consumidor; la instalación DDL ocurre solo en una base
nueva sintética, nunca como migración automática o sobre almacenamiento operativo.
No se separa físicamente TerminalOperation/auditoría ni se cambia el cliente Prisma
operativo completo en esta etapa.

## Cliente privado y recuperación

`tools/astra/identity-control-v2-client.cjs` es una adaptación opcional de laboratorio,
no importada por FuelFlow ni Gateway. `create` crea exclusivamente un archivo 0600,
escribe nonce/actor/generación/destino/acción/expiración y sincroniza archivo y
directorio antes de permitir enviar. Nunca guarda JWT, CSRF, credencial técnica,
commandId ni respuesta. El actor usado en las pruebas procede del autenticador real; el cliente comprueba
la sesión verificada antes de cada envío y rechaza cambio de usuario/generación;
los campos locales no sustituyen la autoridad del servidor.

El archivo es inmutable: cada prepare reenvía exactamente la solicitud guardada.
No necesita confirmar un intentId local antes de recuperarlo: V2 vuelve a resolver
la asociación por nonce autenticado. Un proceso nuevo puede abrir la referencia.
No hay retries automáticos; execute prepara/recupera y luego envía una sola ejecución.
Si preparar no puede confirmarse, no se ejecuta ni se cambia el nonce.

El consumidor consulta el recibo del proveedor con commandId persistido. Después
de un commit seguido de pérdida de respuesta recupera ese recibo; credenciales
revocadas o expiradas permanecen rechazadas. Su transacción local de terminal,
operación, credencial, auditoría y recibo no cambia. El resultado SQL no es una
sesión Redis: recuperar el recibo no restaura datos Redis perdidos.

El archivo prueba persistencia entre procesos y usa fsync; no acredita recuperación
ante pérdida de host/disco ni ofrece coordinación de varias instancias del Gateway.
Su checksum detecta alteraciones accidentales, no protege contra un administrador
que reescriba el disco. El servidor revalida toda autoridad y asociación. La
persistencia multiinstancia/browser y el canal de admisión delegado quedan pendientes.

## Diagnóstico del 503

El puente privado registra únicamente operación, duración, estado y tipo/código
sanitizado del error; nunca inputs, SQL, claves o mensajes Prisma. Un fallo de
laboratorio imprime ese diagnóstico. No se modificó el deadline de 4 segundos del
CompatibilityPort ni se relajaron aserciones.

La prueba específica usa el port real y un proxy privado: el upstream confirma
alerts/check-plate con 200, el proxy demora su respuesta más de 4 segundos y el
port devuelve 503 tras una sola solicitud. Una consulta explícita posterior sin
la demora funciona. Esto reproduce un mecanismo concreto de 503 y verifica
recuperación; no prueba retrospectivamente que fuera la causa del ensayo anterior,
que carecía de esta instrumentación. No se atribuye una causa histórica sin evidencia.

## Pendientes

No se implementó aprovisionamiento técnico ni autorización humana alternativa.
La preparación/ejecución autorizan al inicio de cada solicitud; no existe una
transacción distribuida que bloquee revocaciones humanas durante un RPC en curso.
Acordar garantías de revocación entre servicios sigue pendiente del contrato remoto.
También permanecen esquema operativo y relaciones compartidas, puentes financieros
/Alerts, transporte/claves, retención/tombstones, persistencia cliente desplegable,
entrega segura de sesión técnica y recuperación ante pérdida de infraestructura.

Resultados, archivos, integridad de evidencias y respaldos se registran al cierre
en `mision5-identity-core.md`. Identity no se declara completamente independiente.

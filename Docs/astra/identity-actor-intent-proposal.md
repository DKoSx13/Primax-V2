# Identity / FuelFlow: propuesta de actor e intención (laboratorio)

Actualización: opción humana Control y preparación V2 autorizadas e implementadas
solo en laboratorio; véase [contrato V2](identity-consumer-v2.md). Las decisiones
pendientes descritas abajo reflejan el estado histórico previo a esa autorización.

Estado histórico: propuesta ejecutable en pruebas privadas. No es un nuevo contrato público,
no activa integración FuelFlow ni cambia las 27 rutas de Identity. Complementa
[la correlación del consumidor](identity-consumer-correlation.md). La autoridad del
bootstrap legado sigue pendiente de aprobación; Identity no es completamente autónomo.

## Autoridad real y política propuesta

| Operación                                | Autoridad existente / propuesta                                                                                          | Límite                                                                                                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Emisión técnica privada nueva o rotación | Usuario Control autenticado, activo, authVersion vigente, ADMIN_TERMINAL_MANAGE y alcance actual                         | Probado con el consumidor privado existente. No convierte el bootstrap firmado actual en una ruta humana.                                           |
| Lectura propia y continuidad de terminal | Terminal validada por AccessGuard TerminalOnly: HMAC, credencial vigente en PostgreSQL, revocación, estación y lifecycle | La política propuesta permite solo lectura/continuidad de su terminal. Validación en sombra; no se implementó un nuevo comando técnico.             |
| Aprobación excepcional de recuperación   | Usuario SUPER_ADMIN global, ADMIN_TERMINAL_MANAGE + ADMIN_INCIDENT_MANAGE y grant SYSTEM_ADMIN vigente                   | Preservar además motivo, evidencia y reglas originales; el modelo de prueba no sustituye esas verificaciones del servicio.                          |
| Canje técnico de ticket autorizado       | Ejecutor técnico delegado, separado del humano iniciador/aprobador                                                       | Conservar ticket, estación, terminal, operación, owner y vencimiento de 5 minutos. No reasignar propiedad ni otorgar aprobación humana al ejecutor. |
| Bootstrap sin credencial previa          | Hoy firma de Gateway y configuración de terminal; no acredita humano ni terminal preexistente                            | Requiere decidir autoridad antes de integrar: canal humano Control o identidad técnica provisionada expresamente. Ninguna se asume ni se instala.   |

El `callerId` del proveedor acredita al servicio consumidor con su clave, no al
usuario final. KIOSK_GATEWAY_SECRET autentica transporte; no es un registro de
principales técnicos con permisos propios. El operador configurado, cookies,
referencia de pestaña y sesión kiosk no contienen una identidad humana validada.
Las operaciones existentes de claim/heartbeat/lectura conservan sus vinculaciones
actuales. No se implementan operaciones financieras ni reglas de Commerce.

## ActorIntent.v1-proposal

```text
contract: ActorIntent.v1-proposal
actor: { kind: human | terminal, subjectId, generation, permissions[] }
action: TERMINAL_CREDENTIAL_ISSUE | TERMINAL_STATUS_READ |
        TERMINAL_SESSION_RESUME | TERMINAL_RECOVERY_APPROVE
stationId, terminalId, intentId, commandId: UUID
expiresAt: instante UTC inmutable
```

El actor se obtiene exclusivamente del adaptador de autenticación existente, nunca
del JSON del llamador. `generation` es authVersion humano o credentialId técnico;
los permisos capturados son evidencia, no autorización vigente. Cada reintento
revalida actividad, generación, permisos, alcance y vencimientos. La terminal no
puede ampliar su autoridad ni la duración de su credencial. Cambio de actor,
identificadores, acción, estación, terminal, snapshot o vencimiento invalida la
asociación persistida. Revocar un permiso invalida el reintento aunque el snapshot
lo contenga. Una nueva credencial técnica tampoco puede ejecutar una intención
vinculada a la anterior. No se guardan JWT, CSRF ni secretos técnicos en referencias.

Este sobre se compara en pruebas con el diario real. No se añadió al wire del
proveedor OperationalSessionPort.v1: introducir evidencia/delegación de actor en
ese contrato remoto exige versionado y acordar quién verifica su vigencia. La
transacción terminal/operación/credencial/auditoría/recibo permanece en el proveedor.

## Identidad durable del llamador: propuesta V2 pendiente

1. El llamador crea un `callerOperationId` aleatorio por intención explícita y lo
   persiste **antes** de preparar por red. Reintento conserva ese ID; una nueva
   acción explícita crea otro, aunque el contenido sea idéntico.
2. Preparación V2 autenticaría al actor y registraría atómicamente una asociación
   única `(actorKind, actorStableSubjectId, callerOperationId)` con intentId y
   commandId. La generación NO integra la clave única: una revocación no debe
   permitir reciclar el nonce para crear una intención nueva.
3. El registro vincularía generación, acción, estación, terminal, digest del comando
   completo y expiración inmutable. Repetir el mismo nonce devuelve su asociación
   original; cambiar contenido genera conflicto y cambiar generación se rechaza.
   Un timeout no autoriza generar otro ID ni deducir igualdad desde el cuerpo.
4. El consumidor revalida derechos y consulta el recibo con el commandId original;
   no repite con otro ID después de una respuesta perdida. Expiración/revocación
   conservan su efecto aun cuando PostgreSQL ya confirmó la emisión.

**V2 no está implementada.** El prepare privado V1 no recibe callerOperationId.
Si se pierde su respuesta, un archivo PENDING no basta para recuperar intentId:
se devuelve PREPARE_OUTCOME_UNKNOWN, sin buscar por contenido ni volver a preparar.
Una intención preparada así no ha emitido ninguna credencial. El laboratorio
reproduce esa pérdida real y demuestra el bloqueo, no lo oculta.

El adaptador privado de referencia guarda PENDING/READY en archivo 0600, usa
creación exclusiva y renombrado atómico, verifica propietario/destino/vencimiento
al recuperar y nunca almacena commandId o tokens. Una referencia READY se recupera
en otro proceso después de perder una respuesta de ejecución confirmada. Es una
demostración de reinicio de proceso; no acredita durabilidad ante pérdida de host
ni es almacenamiento apto para el Gateway serverless. Su checksum detecta cambios
accidentales; no es un MAC contra administradores del disco. La autoridad sigue
siendo el servidor. Concurrencia del comando se verifica en consumidor/proveedor;
no se presenta el archivo local como un coordinador multiinstancia.

## Compatibilidad y decisiones que requieren aprobación

| Llamador / componente      | Estado actual                                                                       | Cambio futuro propuesto, no aplicado                                                                                                                                                                 |
| -------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FuelFlow kioskSession.js   | POST bootstrap `{}`, reintentos sin intención persistente ni usuario                | Crear intención explícita y persistir referencia no secreta antes de red; distinguir nueva acción y retry. Decidir almacenamiento/lifecycle por operador y dispositivo.                              |
| FuelFlow server/gateway.js | Rechaza cuerpo bootstrap no vacío; selector configurado y firma con timestamp nuevo | Canal versionado optativo, whitelist de campos e intención cubierta por firma. Persistencia multiinstancia si reside en Gateway.                                                                     |
| Canal humano Control       | Actor real disponible en circuito privado                                           | Acordar cómo autoriza el operador; no reenviar Bearer dentro de Control firmado que el guard actual rechaza. Posible admisión delegada ligada a actor/acción/destino/nonce requiere diseño aprobado. |
| Consumidor Identity        | Prepare V1 crea intención nueva por llamada                                         | Preparación V2 con asociación única de nonce y consulta autenticada del resultado de prepare. Retención/tombstones sin reciclaje.                                                                    |
| Proveedor                  | commandId/fingerprint/recibo durable con autorización del servicio                  | Acordar evidencia de actor/delegación y revalidación remota, transporte/claves y versionado. Mantener una sola transacción local.                                                                    |

Primera decisión: emisión inicial autorizada por humano Control, o principal
técnico provisionado con registro, ciclo de vida y revocación propios. El segundo
no existe por inferencia de una firma y no se implementó. La opción conservadora
es mantener emisión/aprobación humana y continuidad técnica solo con credencial
vigente mientras se acuerda la política de aprovisionamiento. Cambiar el bootstrap
automático actual exige autorización expresa, incluso si se limita a un nuevo
canal optativo. También requieren aprobación la preparación V2 y las adaptaciones
de referencia en los clientes. No se modificó su comportamiento.

## Alcance de validación

`tools/astra/identity-actor-intent-contract.cjs` y sus pruebas son modelo privado;
no los importa ningún servicio ni frontend. El hook de laboratorio obtiene actores
humanos del autenticador original y terminales del guard original contra PG/Redis
nuevos. Valida manipulación, actor ajeno, permisos/versión/alcance, expiración,
revocación y cambio de credencial, pérdida real de respuestas de prepare y execute,
referencia recuperada por otro proceso y ausencia de duplicados.

Los resultados definitivos y comandos se registran en la Misión 5 y en las nuevas
evidencias de actor. No se reemplazan evidencias previas ni los 34 JSON.

# Identity: propiedad de datos y contratos propuestos

Estado: propuesta original más continuaciones autorizadas del puerto operativo y
su contrato remoto con recibo durable de laboratorio (ver últimas secciones). La etapa previa usó una base nueva de 14 tablas
y fixtures; el puerto conserva la unidad SQL en otra base sintética de esquema
completo. No autoriza retirar columnas/FK, mover datos reales, separar físicamente
el almacenamiento ni desplegar servicios de otros dominios.

## Propiedad de datos

| Datos | Propietario lógico | Límite pendiente |
| --- | --- | --- |
| User: identidad, email, nombre, passwordHash, active, authVersion | Identity | Referencias entrantes de operaciones, supervisión, incidentes y asistencia no pueden seguir siendo FK entre bases |
| PasswordReset, código/token hash, intentos, consumo, vencimiento | Identity | Consumo + contraseña + authVersion siguen en una transacción local; entrega SMTP fuera de ella, como hoy |
| MembershipNumberCounter, número/alias y vínculo User-Membership, documentos/perfil | Identity | La tabla Membership actual mezcla estos datos con balance y bienvenida; no se propone mover la tabla completa |
| Vehicle: placa, etiqueta y vínculo exclusivo a membresía | Identity | Commerce referencia vehicleId/membershipId. Mantener unicidad y transacción de enlace; usar IDs estables y snapshot comercial cuando corresponda |
| UserPermissionGrant, AdminControlAccount/Grant/EmailVerification, asignación de alcance | Persistencia de identidad/autorización; autoridad de gestión por acordar con Administration | No inferir autoridad por el prefijo Admin. Preservar grants vigentes, aprobación, correo, estaciones activas y revocación por petición |
| Station | Administration como maestro, Catalog como lectura | En Identity solo una referencia/proyección confiable para alcance; una fila sintética local no demuestra sincronización con el maestro |
| Terminal: identificador/lifecycle/credenciales frente a operationalStatus/atención/asignación | Compartida entre seguridad de identidad y operación | No mover Terminal completo ni asumir que DISPONIBLE es una decisión exclusiva de Identity |
| TerminalCredential | Seguridad de identidad con dependencia operativa atómica actual | No decidir automáticamente dónde reside al separar emisión, rotación, recuperación y auditoría |
| TerminalOperation, Pump, asignaciones, turnos, enablements y evidencia de venta | Operación de Commerce/configuración operativa de Administration | Mantener la unidad de bloqueo/validación; no copiarla dentro de Identity |
| balance, deuda, reservas, pagos, recargas, puntos, canjes, transacciones e inventario mutable | Commerce | Consultas mediante contrato de lectura; cálculos y escrituras permanecen allí |
| welcomeAvailable/reservedOperationId/transactionId y elegibilidad de membresía | Frontera de fidelización/Commerce, todavía compartida | Registro hoy crea welcomeAvailable=true; eliminar ese efecto o cambiar su momento exige una decisión explícita, no un cambio de schema silencioso |
| BusinessAlert y resolución; dashboard financiero | Administration/operación, con lecturas de Commerce | Identity consume una fachada autorizada, no reconcilia deuda ni calcula el dashboard |

Membership.status conserva ACTIVE/SUSPENDED; su autoridad sobre elegibilidad y
autorización debe acordarse antes de separar almacenamiento. User.active y
authVersion sí son autoridad de Identity. No se implementan reglas nuevas de Dezkz.

Auditoría reproducible: `node tools/astra/identity-data-audit.cjs`. La salida
`identity-data-fk-audit.md` enumera 37 relaciones Prisma que cruzan el conjunto de
la proyección. Hay referencias escalares adicionales y constraints SQL compuestos;
no basta con borrar campos @relation para migrar una base real.

## Contrato V1 de laboratorio: conserva el RPC existente

El host `identity-data-contract-lab.cjs` no importa Backend, Prisma, Commerce ni
Alerts reales. Guarda respuestas **aportadas como fixtures**; no calcula dinero,
no sincroniza perfiles, no consulta Identity por SQL y no implementa un dominio.
Usa las rutas que ya consume el adaptador, sin cambiar el runtime ni la API pública.

Transporte: POST JSON a `/identity-compat/{operación}`, clave interna mediante
x-identity-compat-key, loopback, timeout del consumidor 4 s, sin redirects/reintentos.
La versión se identifica en la documentación y en x-identity-contract-version=1
de respuesta; no se agrega un encabezado obligatorio que rompa al consumidor actual.

| Operación | Entrada | Respuesta de fixture | Fallos |
| --- | --- | --- | --- |
| finance/me | userId UUID | Cuerpo legado de me: perfil/vínculo + campos financieros en cadenas decimales, puntos enteros | 401 sin clave; 400 identificador inválido; 404 sin fixture; caída → 503 del consumidor |
| finance/transactions, rewards, redemptions | userId, query.page entero >=1, query.limit 1..100 | Arrays JSON con contratos legados; fixtures vacíos en este experimento | Sin estado externo no se inventa un saldo ni una historia real |
| finance/vehicle | plate normalizada, actor derivado del guard | Vista legada de vehículo; fixture solo para el propietario designado o actor permitido por el protocolo actual | Usuario ajeno → 404; no es prueba de autorización financiera productiva |
| alerts/list | objeto vacío | Array sintético vacío | Clave obligatoria; caída → 503 |
| alerts/dashboard | objeto vacío | Agregado sintético vacío, sin cálculo | No certifica cálculo del dashboard |

No hay fixtures de resolución/escritura de alertas, check-plate con inconsistencias,
pagos, SQL o Prisma remoto: operaciones no implementadas devuelven 404. El host no
puede sustituir silenciosamente el servicio real. Sus respuestas sintéticas se usan
solo para validar transporte y separación de acceso directo a tablas ajenas.

V1 todavía devuelve perfiles junto al dinero y acepta actor para vehículo. Es una
frontera heredada, no el contrato definitivo para dos bases separadas: el servicio
financiero no debe necesitar leer User/Membership/Vehicle de Identity para formarla.

## Contratos V2 candidatos — no implementados

1. **IdentityProfileRead.v1**: consulta interna autenticada por userId/membershipId/
   vehicleId; devuelve identificadores estables, número/alias, propietario y estado
   pertinente. Excluye passwordHash, resetToken y secretos. Identity autoriza
   propietario/alcance antes de componer la respuesta pública. Documentos personales
   solo en operaciones explícitamente autorizadas que los necesiten.
2. **CommerceMembershipRead.v1**: por membershipId devuelve balance, reserved,
   available, total, pendingBalance (strings decimales), points (entero), asOf y
   versión de proyección. Historial paginado por membershipId. Todos los cálculos
   siguen en Commerce. Si la membresía financiera no está provisionada, devuelve
   estado explícito; no asumir cero ni copiar el perfil desde su base. Aprobar el
   mapeo a los errores HTTP actuales antes de activar este contrato.
3. **AlertsGateway.v1**: lectura de alertas/dashboard y comandos resolve/check-plate
   separados. Actor/alcance provienen de Identity; la autoridad y persistencia de
   alertas pertenecen al servicio acordado. Comandos con identificador idempotente
   y auditoría; no repetir automáticamente ante una respuesta perdida.
4. **IdentityMemberCreated.v1 / IdentityProfileChanged.v1**: evento con eventId,
   memberId/userId/vehicleId pertinentes, versión y occurredAt; sin saldos ni
   credenciales. Si se aprueba sincronización, outbox local en la misma transacción
   que registro/perfil, consumidores deduplicados y conciliación. No fragmentar
   User+Membership+contador ni reset+authVersion. El outbox y las proyecciones no
   se crearon en esta etapa.
5. **ActorIntrospection.v1**: actor, permisos/estaciones, expiración y authVersion
   vigentes, transporte autenticado y fallo cerrado. Acordar latencia admisible de
   revocación/ausencia de caché antes de retirar consultas al User/grants compartido.
   No distribuir JWT_SECRET HS256 como solución a la separación de datos.

Las FK externas se sustituirían por IDs estables y verificación contra contratos/
proyecciones acordados, con política de bajas/tombstones, versiones y conservación
del snapshot contable. Antes se requiere inventario de FK/constraints SQL reales
del entorno autorizado, pruebas sintéticas de eliminación/retención y aprobación
del plan. No se cambia ni se borra una sola FK existente en este trabajo.

## Límite que requiere autorización: emisión/recuperación técnica

El KioskService actual bloquea Terminal FOR UPDATE; lee/puede cerrar una atención
vacía; valida estado operativo y actividad; reutiliza o revoca/emite credenciales;
escribe OperationalAuditEvent, todo dentro de una transacción serializable. La
recuperación valida además orden/pago/autorización/reserva/venta/comprobante y owner
Redis. El código sigue bajo esas reglas. Quitar TerminalOperation/Audit del cliente
no produce autonomía: en la base de 14 tablas el bootstrap falla, sin emitir una
credencial parcial. La validación de una credencial ya emitida sí funciona localmente.

Se propone para la siguiente etapa **solo de laboratorio**:

- Definir `OperationalSessionPort.v1` con emisión/reanudación/rotación/recuperación,
  operationId, terminalId, stationId, owner y revisión de estado. El proveedor debe
  ejecutar completa la unidad atómica anterior y devolver un resultado opaco con
  alcance y expiración. No una API SQL ni una secuencia de pequeños RPC de lectura
  y escritura que pierda el bloqueo entre llamadas.
- Decidir explícitamente autoridad y almacenamiento de TerminalCredential durante
  la transición. Opción conservadora: conservarla con la transacción operativa y
  consumirla por puerto temporal. Opción de moverla a Identity: exige protocolo de
  admisión/fencing, idempotencia, confirmación/compensación y outbox; una llamada
  remota dentro de la transacción por sí sola no conserva atomicidad entre bases.
- Probar dos bases nuevas sintéticas y hosts de laboratorio sin desarrollar
  Commerce/Administration, manteniendo las 27 rutas y la política de firma/CSRF.
  No activar ni modificar los contratos existentes hasta aprobar el diseño.

**Punto de detención de la etapa previa:** no se implementaron entonces estos cambios operativos, V2, outbox,
traslado de credenciales, retiro de columnas ni sustitución de FK. La instrucción
del usuario exige presentar esta propuesta antes de cambiar contratos, relaciones
o datos existentes. La base de 14 tablas prueba persistencia propia de operaciones
de identidad; no demuestra que todo Identity sea autónomo todavía.

## Etapa autorizada: puerto operativo de laboratorio

La autorización posterior del usuario permite implementar y validar el puerto
manteniendo **un solo almacenamiento y una sola transacción**, sin mover datos ni
separar TerminalOperation/auditoría. Actualiza el punto de detención anterior solo
para este experimento. Las 37 relaciones siguen vigentes; V2, outbox, retiro de FK
y separación física continúan siendo propuestas sin implementar.

`OperationalSessionPort.v1.issueOrResume` recibe contractVersion=1, stationId
confiable, selector terminalId/terminalCode y credencial anterior opcional. Devuelve
terminalId, token opaco y expiración. No acepta SQL, transacción del consumidor,
flags de pruebas ni estado operativo decidido por Identity. Es un puerto interno
en proceso; no es todavía un protocolo HTTP entre servicios.

El proveedor `PrismaOperationalSessions` ejecuta la unidad original completa:
selección y bloqueo de Terminal, comprobación de lifecycle/actividad/evidencia,
cierre permitido de atención vacía, estado operativo, reanudación o revocación/
emisión y OperationalAuditEvent. Conserva serializable, FOR UPDATE, reintentos
limitados originales, formato/hash/TTL de credenciales y reglas de atención vacía.
La reanudación usa la misma credencial vigente; sin ella las peticiones distintas
rotan credenciales y solo la última queda activa. No se agrega una promesa nueva
de idempotencia por commandId. La recuperación autorizada con evidencia financiera
y owner Redis sigue en KioskService, fuera de este puerto inicial.

La composición optativa `dist/operational/main.js` conserva los otros handlers y
sustituye únicamente terminal-bootstrap por el coordinador. Firma y límite se
verifican antes del proveedor; DTO y respuesta siguen el contrato actual. AuthCore,
login, composición normal y tráfico público no se modifican.

### Dos límites de consistencia distintos

La garantía atómica es **Terminal + TerminalOperation + TerminalCredential +
OperationalAuditEvent en PostgreSQL**. Cualquier fallo de esa transacción debe
revertir todos sus cambios. El proveedor no escribe datos financieros.

El flujo existente crea la sesión kiosk Redis después del commit SQL. Si esa
escritura falla, la petición devuelve 503 pero la credencial y su auditoría ya están
confirmadas juntas. No hay rollback global SQL/Redis; el token no se entrega por
una respuesta exitosa. Una nueva petición explícita puede rotarlo, revocando el
anterior. No se reproduce automáticamente el comando, ni se simula una transacción
distribuida. Cambiar ese comportamiento requeriría otra estrategia y autorización.

### Sustitución futura por comunicación entre servicios

1. Acordar el propietario del comando y mantener toda la unidad SQL en su proveedor;
   Identity invocaría una sola operación autenticada, fuera de cualquier transacción
   local abierta. No repartir cierre, revocación, emisión y auditoría en RPC distintos.
2. Diseñar una clave de comando durable y su recibo dentro de la misma transacción,
   con ámbito terminal/actor, fingerprint de entrada y respuesta recuperable segura.
   Una clave repetida con otro cuerpo debe rechazarse. Definir retención y protección
   del secreto; no almacenar tokens en claro en logs o un outbox público.
3. Ante timeout/resultado desconocido, consultar el recibo autenticado antes de
   reenviar o rotar. Los reintentos serializables locales actuales no resuelven una
   respuesta remota perdida después del commit. Fijar errores, plazos y cancelación.
4. Publicar eventos necesarios mediante outbox local y consumidores deduplicados,
   con versiones/fencing y conciliación. Una caída del consumidor no revierte una
   credencial ya confirmada; acordar estados y revocación explícita.
5. Definir por separado el ciclo de sesión Redis y la recuperación técnica. Si se
   requiere entrega atómica entre SQL y Redis, presentar un protocolo nuevo para
   aprobación; no usar llamadas remotas dentro del callback SQL ni 2PC improvisado.

No se implementaron recibos, RPC remotos, outbox ni compensaciones en esta etapa.
La persistencia completa y las consultas de evidencia operativa siguen siendo
necesarias para el proveedor. La proyección de 14 tablas sola sigue siendo insuficiente.

## Continuación autorizada: contrato remoto y recibo durable

El usuario autorizó avanzar al experimento remoto, sin separación real de tablas.
Contrato implementado y límites: `identity-remote-receipts.md`.

El proceso proveedor conserva la unidad SQL validada e incluye su recibo cifrado
en ella. La clave callerId+commandId, el fingerprint y la consulta autenticada
permiten recuperar un resultado confirmado sin repetir emisión/auditoría. No se
implementan transacciones distribuidas ni outbox de secretos. Los recibos no
permiten reactivar una credencial revocada. Los 37 vínculos auditados, almacenamiento
operativo, AuthCore, login y tráfico actuales permanecen como antes.

Sigue pendiente la correlación durable de los llamadores HTTP legados: no se añadió
un identificador público obligatorio ni se presenta una nueva petición HTTP como
reintento idempotente de otra. También continúan pendientes recuperación técnica,
validación remota del guard, esquema operativo mínimo, finanzas/Alerts, gestión de
claves y retención. Esta continuación no autoriza despliegue ni autonomía completa.

# Misión 5.9 — propuesta de transporte privado

Actualización: opción A autorizada expresamente e implementada solo en laboratorio.
Véase [resultado y contrato efectivo](mision5-9a-transporte-laboratorio.md).
El contenido siguiente conserva la propuesta y la decisión histórica previa.

**No se adoptó todavía una autenticación de servicio.** Hay alternativas con
consecuencias operativas importantes; la instrucción del usuario exige aprobación
previa. Se completaron revisión, propuesta y diagnóstico de timeouts; no se modifica
el canal 5.8, AuthCore, login, rutas, contratos públicos ni datos operativos.

## Mecanismos existentes revisados

| Componente                                    | Implementación real                                                                                                            | Alcance / carencia                                                                                                                                                                                   |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FuelFlow lab RemoteControl y CallerOperations | fetch a HTTP loopback, Bearer humano, sin redirects/cache/retry; verificación remota de permisos                               | Autentica humano; no cifra ni autentica al servicio llamador.                                                                                                                                        |
| Identity operational/remote/http-server.ts    | x-operational-key de 32 bytes aleatorios representados en 64 hex, timingSafeEqual, callerId configurado y estación restringida | Patrón existente de credencial técnica; HTTP sintético, sin registro vivo de expiración/revocación ni nonce de transporte. No reutilizar su clave para FuelFlow.                                     |
| Gateway kiosk y KioskService.verifyGateway    | HMAC-SHA256 de método/ruta/tiempo/cuerpo y contexto, ventana de 30s                                                            | Firma del Gateway, no identidad humana. La función de firma no consume un nonce de un solo uso. Control firmado como kiosk está prohibido por AccessGuard. No reutilizar secreto ni cabeceras kiosk. |
| Laboratorio SMTP                              | node:tls/STARTTLS y CA/certificado sintéticos                                                                                  | Existe infraestructura de certificados de prueba; no acredita TLS del HTTP FuelFlow–Identity.                                                                                                        |
| Correlación/recibos                           | callerOperationId → intentId → commandId y recibo durable                                                                      | Evita doble emisión de la misma intención; no sustituye autenticación de servicio ni protección de transporte.                                                                                       |

No se necesita un mesh, OAuth, un nuevo issuer JWT ni cambios de AuthCore para
ninguna opción propuesta. Se usarían primitivas HTTPS/TLS de Node ya disponibles.
Ninguna opción permite enviar al proveedor el principal técnico como usuario Control.

## Opciones que requieren autorización

| Alternativa                                                                                                      | Ventajas                                                                                                                  | Coste/riesgo operativo                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. TLS de servidor + credencial técnica por servicio + nonce compartido** (recomendada para el próximo ensayo) | Reutiliza el patrón de clave interna existente, separado por llamador; no añade PKI de clientes ni dependencias externas. | Distribuir/rotar secretos de alta entropía; registro vivo de claves y permisos; garantizar TLS siempre, revocación y consistencia del ledger de nonces.                          |
| **B. mTLS + identidad/allowlist de certificados + nonce compartido**                                             | Autentica ambos extremos con certificados; evita enviar una clave técnica en HTTP.                                        | Emitir/rotar certificados de clientes, gestionar CA/identidad y revocación en todas las instancias; mayor complejidad operativa. El certificado tampoco otorga permisos humanos. |

Ambas requieren validar CA, nombre del servidor y vigencia; nunca
rejectUnauthorized=false, NODE_TLS_REJECT_UNAUTHORIZED=0, redirects o fallback HTTP.
En B se valida además el certificado cliente y su principal autorizado. TLS protege
el canal; los nonces y la correlación resuelven repetición de solicitudes de aplicación.
Ni TLS ni mTLS por sí solos convierten cuerpos iguales en una misma intención.

**Decisión solicitada:** autorizar A o B exclusivamente para laboratorio. No se
provisionaron claves/certificados ni se cambió código de transporte antes de elegir.
A es menor cambio respecto al patrón operacional existente, pero sus reglas nuevas
de vida/alcance/anti-replay también necesitan quedar aceptadas explícitamente.

## Contrato mínimo propuesto para el ensayo aprobado

1. Principal técnico fijo `fuelflow-private`, con identificador de credencial,
   vigencia, revocación y permisos de ruta/acción/estación propios, distintos del
   userId/authVersion/alcance humano. Sin defaults que lo promuevan a Control.
2. Protección solo sobre los endpoints privados de verificación, preparación y
   ejecución V2. El modo seguro no expone HTTP equivalente. V1 y las 27 rutas
   quedan intactas y fuera de esta activación opcional.
3. Cada solicitud HTTPS incluye identidad técnica y un requestNonce aleatorio de
   transporte, issuedAt/expiresAt. Para A se envía además la credencial en cabecera
   dedicada, nunca Authorization (reservada al Bearer humano), logs, JSON o URLs.
   Para B se obtiene el principal técnico del certificado verificado.
4. Registro vivo de principal/credencial/alcance en almacenamiento sintético y
   ledger compartido entre instancias Identity, con inserción atómica única por
   credencial/nonce antes de procesar. Permisos o verificación indisponibles: 503,
   sin ejecutar. Credencial inválida, expirada o revocada: rechazo controlado.
5. Propuesta de ventana: 30s y desviación máxima de reloj 5s; son parámetros a
   aprobar para el laboratorio, no una ampliación de los mecanismos actuales.
   Repetir nonce de transporte se rechaza, incluso con contenido alterado. Retener
   su tombstone hasta que ninguna solicitud con esa ventana pueda volver a aceptarse.
6. Tras pérdida de respuesta, un reintento explícito lleva nonce de transporte
   nuevo, pero **el mismo callerOperationId/intentId/commandId**. No hay replay
   automático de emisión. Un nonce consumido no prueba commit de negocio: consultar
   asociación/recibo durable. El ledger no participa en una transacción distribuida.
7. Después de autenticar al servicio, verificar siempre al humano mediante AuthCore
   y el contexto de la operación. Aplicar la intersección de ambos alcances. Para
   execute, resolver el intent persistido para comprobar estación/acción, sin confiar
   en selectores adicionales del cliente. Credencial técnica válida sin humano
   autorizado no verifica ni emite; un humano válido sin servicio autorizado tampoco.
8. Cadena/nombre/vigencia TLS, comprobación técnica y comprobación humana en cada
   petición. Revocación nueva debe impedir peticiones nuevas, también en conexiones
   reutilizadas. No se promete cancelar atómicamente un RPC ya autorizado/en curso.

El estado del ledger y la revocación compartidos evitan una falsa protección basada
solo en memoria local. Su inaccesibilidad deniega; no hay respaldo permisivo.
Este diseño no se presenta como implementado o probado todavía.

## Plan de pruebas tras autorización

- CA/nombre correctos, CA desconocida, hostname incorrecto, certificado expirado,
  conexión interrumpida y HTTP/downgrade rechazados.
- Servicio válido/no autorizado, secreto/certificado incorrecto, expiración,
  revocación y permiso de ruta/estación insuficiente.
- Humano Control válido, sin permisos, sesión/authVersion revocada y manipulación
  de destino; nunca sustituirlo por la identidad del servicio.
- Nonce repetido concurrentemente contra dos instancias, contenido cambiado,
  ventana vencida/futura y ledger caído: cero ejecución indebida.
- Pérdida de respuesta antes/después de commit, reinicio y recuperación con nonce
  de transporte nuevo y correlación durable original: una emisión/auditoría.
- Regresiones privadas afectadas y paridad de las 27 rutas. No repetir suites de
  dominios ajenos salvo fallo o cambio transversal demostrado.

**Pendiente:** todas estas pruebas de transporte nuevo. Los resultados 17/75/28/14
de 5.8 no validan un TLS o una autenticación técnica que todavía no existen.

## Investigación de los cinco timeouts 5.8

La evidencia anterior muestra **cuatro** beforeEach de authcore.spec.ts agotados en
hash de fixture bcrypt costo 12, antes del cuerpo del test, y **uno** de AuthService
para usuario desconocido. Este último espera el dummyHash costo 12 creado en el
constructor y ejecuta compare costo 12. Esas rutas sintéticas no consultan HTTP,
PostgreSQL o Redis: el transporte no es su causa directa.

Nuevo diagnóstico: `tools/astra/identity-timeout-investigation.cjs`, sin modificar
AuthCore, fuente de pruebas, límite de 5000ms o costo bcrypt. Usa hash real y el
AuthService compilado con repositorio falso y usuario inexistente. JWT nunca emitido.
Se miden tiempo de pared/CPU y event-loop delay. Cuatro muestras aprobadas:

| Operación                                    | Sin bloqueo inducido      | Con bloqueo controlado 5300ms |
| -------------------------------------------- | ------------------------- | ----------------------------- |
| Fixture hash costo 12                        | 2493ms pared / 1071ms CPU | 5986ms pared / 483ms CPU      |
| Login desconocido (dummy + compare costo 12) | 4019ms pared / 1759ms CPU | 9097ms pared / 1727ms CPU     |

El bloqueo usa Atomics.wait (no carga CPU extra ni servicios ajenos); event-loop
máximo observado 5423ms. Se reproduce así **el mecanismo** por el cual las mismas
operaciones cruzan 5s sin fallo de autenticación. Es una inyección controlada, no
una reproducción espontánea de compilaciones concurrentes ni prueba retrospectiva.
La muestra tenía dos CPUs y load average inicial 16.6; la carga incluye esperas y
no demuestra por sí sola saturación CPU. cpu.max no disponible; cpu.stat no muestra
throttling durante esta muestra, sin inferencia sobre el ensayo histórico.

**La causa histórica exacta sigue pendiente**: no se capturó perfil de scheduler /
event loop en el ensayo original. El 14/14 secuencial no resuelve los timeouts.
Siguiente reproducción útil: instrumentar esos tiempos durante concurrencia real
controlada, conservando costo y deadline; no bajar bcrypt ni ampliar el timeout
como supuesto arreglo. No se altera la prioridad del trabajo real ni se lanzan
compilaciones adicionales solo para provocar carga.

Evidencia nueva: `evidence/identity-mission5-9-timeout-diagnostic.txt`; éxito de
cuatro muestras, incluidas dos que exceden deliberadamente el deadline histórico.
No se declara que Jest 14/14 se haya repetido o que el problema esté corregido.

## Estado y dependencias

La implementación de transporte se detiene en la decisión exigida por el usuario.
Identity conserva Prisma/esquema operativo compartido, AuthCore de compatibilidad,
puentes financieros/Alerts y entrega de sesión Redis; autonomía completa pendiente.
La próxima acción concreta es implementar y probar **solo la alternativa elegida**,
con credenciales/certificados sintéticos y sin activar tráfico público.

Evidencias previas (115 archivos al inicio, incluidos los 111 solicitados y 34 JSON)
y rama/HEAD se cotejan por hash. Respaldos, resultados de sintaxis/formato e inventario
final se registran en Misión 5 y en la evidencia de revisión 5.9.

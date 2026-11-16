# A.2 — diseño privado de RecoveryPolicyPort.v1

Estado: propuesta, no implementada en servicios. Solo documentación y especificación
sintética ejecutable. Ningún cambio en AuthCore, PasswordReset, esquemas, login,
registro, 27 rutas o datos operativos. No se declara cerrado A.2.

## Regla que debe conservarse

Fuente: `services/identity/src/compatibility/auth/password-reset.service.ts:143`
y `password-reset.dto.ts`, `register.dto.ts` del mismo directorio.

| Existencia de AdminControlAccount | Grant SYSTEM_ADMIN | Política |
| --- | --- | --- |
| No | No | Base DTO + PRIME_PASSWORD_PATTERN |
| Sí | No | Base DTO |
| No | Sí | Base DTO |
| Sí | Sí | Base DTO |

La base exige string, mínimo 8 caracteres y máximo 72 bytes; Prime añade mayúscula,
minúscula, dígito y carácter no alfanumérico. No introducir un nuevo requisito de
estado del ControlAccount: la consulta actual comprueba existencia. AuthCore debe
resolver ambos hechos; Identity recibe la política, no lee esas tablas ni acepta
roles del solicitante. No es autenticación de una sesión humana: la recuperación
se acredita por su código/token. El token no debe enviarse a AuthCore.

Conservar código/HMAC, hashes de token, expiración, intentos/cooldown, respuestas,
bcrypt coste 12 y atomicidad de passwordHash + authVersion incrementada + usedAt y
tokenHash=null. La revocación comprobada por versión no equivale a borrar sesiones
Redis ni revocar TerminalCredential. Solicitud y verificación no congelan roles;
la política se decide al confirmar. Un cambio previo de authVersion exige cancelar
el intento y reevaluar en una nueva ejecución interna, sin reutilizar una decisión
ligada a otra versión. No se añade una nueva vinculación pública de tokens a la
versión existente en el momento de forgot.

## Carrera y garantía real del contrato actual

`IdentityDatabase.atomic` usa Serializable, con reintentos acotados. Lecturas de
roles y escritura de contraseña/consumo ocurren en una transacción. Esto permite
un orden serial de reset y cambio de permisos si todos los escritores implicados
mantienen las garantías correspondientes; **no prueba que una revocación que
finalice antes del commit de reset deba siempre precederlo en ese orden**. No se
ha auditado exhaustivamente cada escritor de permisos ni probado esa carrera con
PostgreSQL en esta misión. No prometer revocación instantánea por reloj.

Una respuesta firmada, TTL corto, consulta doble o comprobar solo authVersion NO
resuelven la ventana entre la última lectura remota y el commit. Tampoco asumir
que toda modificación de permisos incrementa authVersion. Se necesita coordinar
las dos operaciones o aceptar explícitamente otra semántica; no se acepta aquí.

## Contrato recomendado (reservado, sin endpoint implementado)

Transporte privado autenticado del servicio, reutilizando el patrón TLS y
credencial técnica ya validado; identidad técnica no sustituye autoridad humana.
AuthCore fija políticas y revisiones. No se introducen mecanismos criptográficos.

- `reserveRecoveryPolicy(request)`: protocolVersion, requestId/operationId durable,
  accountId tomado de la fila reset validada, resetId, expectedAuthVersion y
  bindingDigest. Este último vincula la operación a su petición inmutable mediante
  un compromiso con clave y dominio separado, nunca hash simple de la contraseña.
  No transportar contraseña, passwordHash, código, token ni grants. Definición
  exacta/custodia de clave y canonización: requisito previo a implementación.
- Respuesta: decisionId, operationId, accountId, resetId, expectedAuthVersion,
  bindingDigest, policy (`PRIME` o `ADMIN_BASE`), policyVersion, authorityRevision,
  issuedAt, notAfter y estado durable `RESERVED`. Los plazos los limita autoridad.
- `confirmRecoveryPolicy(decisionId, bindings)`: antes de escribir, exige misma
  reserva, revisión y datos, servicio autorizado y plazo vigente. No emite una
  nueva decisión por cada retry. Sin autoridad accesible no inicia la escritura.
- `getRecoveryPolicyOutcome(operationId)` y `finishRecoveryPolicy(decisionId,
  outcomeReceipt)`: recuperación idempotente/acuse autenticado. Misma operación
  con datos distintos se rechaza. Consultar resultado no concede otra emisión.
  El recibo contiene IDs/resultado, no material de autenticación.

Son operaciones de un puerto, no rutas públicas nuevas ni promesa de que AuthCore
ya ofrezca estos métodos. Error/timeout/desconocimiento de política: rechazo
controlado, sin fallback Prime/admin ni consumo del token. Tras perder respuesta
al commit, resultado INCIERTO, nunca afirmar rollback ni generar otro operationId.

## Coordinación mínima requerida para cerrar la ventana

1. AuthCore crea reserva durable por cuenta y revisiones bajo exclusión compartida
   con **todos** los escritores que alteren la clasificación relevante. Si el
   cambio de rol precede la reserva, se devuelve la nueva política. Si la reserva
   precede al cambio, este no puede declararse completado hasta resolverla. Orden
   explícito; no un mutex en memoria ni un lock PostgreSQL retenido vía HTTP.
2. Identity conserva operationId y decisión antes del efecto. Confirma con AuthCore
   y hace una transacción local serializable: bloquear cuenta/reset/operación,
   validar active, versión esperada, vigencia, verifiedAt y uso único, aplicar
   política y escribir contraseña+incremento+consumo+recibo COMMITTED atómicamente.
   Comprobar plazos tras adquirir locks; timeout y margen de ejecución acotados.
   Si expira durante el commit, reserva sigue retenida hasta resolver: no aparece
   una ventana en que pueda completarse una revocación contradictoria.
3. Acuse libera la reserva. Pérdida de respuesta: consultar recibo de Identity;
   COMMITTED libera con éxito, ABORTED libera sin efecto. Para abortar, Identity
   debe persistir ABORTED bajo el mismo bloqueo/CAS que usa commit; una ejecución
   atrasada no puede revivirla. Fallo local revierte todos los efectos y recibo.
4. **No liberar por TTL o ausencia de recibo.** Ausencia no demuestra rollback de
   una transacción en vuelo. Ante partición/reinicio, mantener PENDING y recuperar;
   reconciliación consulta fuente durable autenticada. Sin resolución, los cambios
   de rol quedan pendientes, con alerta y procedimiento operativo. Se prefiere
   consistencia a disponibilidad; no ocultar este coste. No es una transacción
   distribuida atómica de dos bases: es coordinación durable con bloqueo lógico y
   protocolo de resolución; sin todos esos requisitos no es seguro.
5. Cambios de contraseña/authVersion locales compiten con CAS/bloqueo de cuenta:
   si ganan primero, la decisión anterior no puede cambiar contraseña; si gana el
   reset, la otra modificación observa la versión nueva. Si hay escritores de
   authVersion en otra base, falta autoridad única/fencing: bloqueo de diseño,
   no sincronización eventual asumida. No se migra esa autoridad en esta misión.

Una caída después de confirmación remota y antes/durante commit no es distinguible
instantáneamente: puede existir una operación ya admitida. No se habilitan nuevas
operaciones sin AuthCore; las admitidas requieren reconciliación, no asumir fracaso.
El recibo ya confirmado puede consultarse sin volver a cambiar contraseña. No
responder éxito del cambio de rol mientras su reserva incompatible siga pendiente.

## Pruebas y límites

`node --test tools/astra/identity-recovery-policy-design.test.cjs`: **8/8**, cero
fallos. Modelo en memoria de una sola operación, sin servidores ni imports de
producción: tabla lógica, contraejemplo TTL, orden rol/reserva en ambos sentidos,
reintentos/recibo único, bindings y versión alterados, indisponibilidad, expiración,
abort terminal y rollback. Son intercalaciones secuenciales modeladas, no concurrencia
real, durabilidad/reinicio probados ni demostración formal. Se conserva la prueba
negativa: un escritor que elude la compuerta rompe la garantía. No suites completas.

Antes de habilitar implementación deben aprobarse:

1. Semántica de orden reserva/cambio de rol y coste de bloquear revocaciones
   pendientes; inventario y participación obligatoria de todos sus escritores.
2. Dueño único de versión/cuenta en el despliegue objetivo; IDs estables y mapeo
   Account↔User sin inferencias por email. No autorizar por campos del cliente.
3. Protocolo durable de reserva/commit/abort/recibo, reconciliación tras particiones,
   retención que cubra operaciones pendientes y fencing de workers atrasados.
4. Bindings/canonización, transporte y autorización de cada método; secretos fuera
   de código/evidencias. No aceptar una decisión de otra cuenta, acción o servicio.
5. Laboratorio con PostgreSQL aislado y pruebas reales de escritores simultáneos,
   reinicios en cada frontera, respuesta perdida, uso único y rollback, expiry,
   cambios de authVersion/rol/active y partición de autoridad. Confirmar la política
   y DTO originales con usuarios normales/Control/SYSTEM_ADMIN y todas sus
   combinaciones. No introducir cambios públicos antes de aprobar compatibilidad.

Si no se acepta la coordinación, una consulta remota informativa puede diseñarse,
pero **no habilita la migración de reset con garantías equivalentes**. Mantener la
transacción actual es la alternativa segura hasta resolver este límite.

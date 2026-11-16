# Misión 5.11 — A.2: revisión de compatibilidad y bloqueo

## Resultado

Se registra la aprobación conceptual de la matriz con las ocho condiciones del usuario: Identity posee cuentas/documentos/perfil/número/alias y vínculo exclusivo Vehicle, no el vehículo completo; no se reinterpreta Membership.status; finanzas y bienvenida permanecen en su proveedor; registro/bienvenida requieren diseño aprobado; Station propuesto Administration; Terminal pendiente; TerminalCredential mantiene su unidad transaccional; AuthCore conserva cuentas/permisos Control. Esta aprobación no autoriza migrar datos.

A.2 se detiene antes de modificar esquemas o código: la recuperación original depende de una decisión de política que el esquema A.1 no puede resolver. No se implementó PasswordReset ni se inició otro componente A, B o C.

## Contrato observado

- `services/identity/src/compatibility/auth/password-reset.service.ts`: forgot normaliza email, exige cuenta activa, código aleatorio de ocho dígitos, HMAC-SHA256 con prefijo vigente y secreto JWT, TTL por configuración (10 minutos por defecto), cooldown de 60 segundos. Error de entrega invalida token. Se preservaría también la respuesta actual para correo inexistente; no cambiarla para ocultar enumeración sin autorización.
- verify limita intentos (5 por defecto), verifica HMAC, consume la verificación una vez, guarda solo hash SHA256 del token aleatorio de 32 bytes y acorta vigencia a un máximo de cinco minutos.
- reset consulta **AdminControlAccount y UserPermissionGrant(SYSTEM_ADMIN)** dentro de la transacción (líneas 143–148). Solo si ambas consultas dan negativo exige PRIME_PASSWORD_PATTERN. Omitirlas, devolver falsos por defecto o aplicar siempre la política Prime cambiaría el contrato para Control/SYSTEM_ADMIN. Aceptar una etiqueta de rol del cliente sería inseguro.
- reset usa bcrypt coste 12; actualiza passwordHash e incrementa authVersion, y marca usedAt/null tokenHash en la misma transacción. No elimina físicamente todas las sesiones ni revoca automáticamente credenciales técnicas operativas; no ampliar esas garantías por inferencia. AccessGuard compara versión con la cuenta actual.
- `src/persistence/identity-db.ts` utiliza aislamiento Serializable; `src/persistence/atomic.ts` contiene reintentos acotados para conflictos. A.2 debe conservar concurrencia/uso único y rollback, no copiar el comportamiento de una transacción débil.
- `prisma/identity.prisma`, PasswordReset: userId único, FK local a User, tokenHash único nullable, hashes, attempts, expiración, verificación/consumo y creación. Propuesta privada futura: equivalente apuntando a Account; sin FK administrativa. No se creó esa tabla.

## Decisión necesaria antes de implementar

Se recomienda autorizar **un puerto privado de decisión de política de recuperación**, cuya autoridad siga siendo AuthCore, no una réplica de grants ni un rol enviado por el cliente. Debe resolver para accountId validado qué política vigente aplicar; fallo de autoridad rechaza sin consumir token ni cambiar contraseña. Hace falta acordar cómo vincular esa decisión a la versión/revocación y al momento de la transacción local para evitar una decisión obsoleta; una consulta remota aislada no equivale por sí sola a las lecturas de la transacción actual. No se ha diseñado ni activado un nuevo protocolo de autenticación.

Alternativa más acotada: autorizar un laboratorio explícitamente limitado a fixtures Prime cuya condición esté acreditada por la autoridad, sin fingir soporte Control ni alterar el contrato general. No se ha elegido esta alternativa automáticamente.

**Solicitud de autorización:** elegir y aprobar el límite de política anterior antes de implementar A.2. No se propone eliminar la excepción vigente de Control/SYSTEM_ADMIN ni modificar registro o recuperación pública.

## Validación realizada y pendiente

Una comprobación sintética en memoria instanció el PasswordResetService compilado sin modificarlo: reset con fila vigente y autoridad inaccesible intentó ambas consultas de política, rechazó y no ejecutó ninguna escritura de contraseña/authVersion/token. Resultado: **1/1 diagnóstico aprobado**. Esto demuestra la dependencia, no consistencia real PostgreSQL ni seguridad integral.

No se ejecutaron pruebas de solicitud/entrega, expiración, uso único, concurrencia, rollback PostgreSQL ni Redis: implementación detenida. No se repitieron suites completas ni se reutilizan los 8/8 de A.1 como resultado A.2. No hubo conexiones a bases ni nuevos servicios.

## Preservación y respaldos

Solo este informe y un TXT nuevo de diagnóstico. Todos los archivos preexistentes se cotejaron con baseline SHA-256, incluidas las 125 evidencias previas y los 34 JSON. Rama/HEAD conservados. AuthCore, login, 27 rutas, tráfico, esquemas/clientes A.1 y datos operativos intactos.

Respaldo anterior A.1 verificado: 314 miembros y SHA-256 del archivo.
Previo A.2: /home/primax/.local/state/primax-backups/mission5-11-a2-before-20261116T010711Z/pending-work.tar.gz (314 miembros).
Final A.2: /home/primax/.local/state/primax-backups/mission5-11-a2-final-20261116T010832Z/pending-work.tar.gz (316 miembros); verificación de archivo, manifiesto y miembros contra workspace. No incluye env, claves ni dos logs históricos sensibles; originales preservados. Restaurar sobre el HEAD del manifiesto en un directorio separado, nunca sobrescribir el workspace.

Próximo paso: resolver exclusivamente el límite de política de PasswordReset y después ejecutar A.2 con PostgreSQL nuevo, conservando algoritmos, respuestas y transacción local. Identity y paquete A siguen incompletos.

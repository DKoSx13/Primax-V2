# Lote 5 — seguridad e integridad

Estado: aprobado con limitaciones en los escenarios ejecutados; no certificación productiva ni pentest exhaustivo. No se cambian AuthCore, PasswordReset, JWT, CSRF, permisos, firmas ni esquema.

| Control | Evidencia real |
|---|---|
| JWT inválido, expirado y authVersion | profile rechaza anonymous/invalid/expired/stale; security restablece password con fixture y comprueba invalidación del token anterior. HTTP Compose rechaza JWT malformado 401. |
| Roles/permisos | Familias access/accounts/supervision/customers/administration y admin-ocr; navegador root/Encargado y login inválido. |
| Clientes | profile: otro dueño no consulta vehículo (404), no toma placa ajena (409), no inyecta userId/historial (400), replay conserva UUID. |
| Estaciones/terminales | Familias de Administration, terminal, recovery y kiosk con estaciones sintéticas A/B, roles y scopes firmados; no se transfieren escrituras. |
| Cookies/sesiones | FuelFlow HttpOnly en cookies de sesión y terminal, SameSite=Strict; CSRF legible para el cliente. Secure=false observado en HTTP loopback, sin afirmar protección HTTPS productiva. Control login/logout y revocaciones en escenarios access/accounts. |
| CSRF/HMAC | Kiosk rechaza firma inválida, CSRF equivocado, scope fuera de whitelist; ticket expirado con TTL Redis real. BFF Compose rechaza Origin ajeno con 403. |
| Demo por entorno | admin-ocr comprueba credenciales deshabilitadas, modo local explícito y rechazos production/staging/test; el admin configurado conserva sus reglas. HTTP Compose devuelve `{enabled:false}` en demo-credentials. |
| Errores/secretos | 15 sondas HTTP: 401, 403, 404 y recursos HTML esperados; `.env` devuelve 404 en cuatro orígenes. Las respuestas son contrastadas con seis claves privadas aleatorias del laboratorio sin coincidencias. No se publican tokens, hashes de contraseña ni configuraciones expandidas. No se escanean exhaustivamente todos los assets ni canales laterales. |

El JWT técnico administrativo mantiene la excepción original de 30 minutos y sub=admin: no se le atribuye revocación por authVersion de cuenta. La clave legacy `x-kiosk-key` conserva sus limitaciones; no se equipara a una autorización moderna por terminal. Los valores demo predeterminados en Compose son públicos y locales, no secretos aptos para despliegue productivo; el laboratorio usa claves propias aleatorias. Los puertos publicados son loopback, sin PostgreSQL/Redis publicados. Estos límites impiden afirmar seguridad productiva.

## PostgreSQL, Redis y finanzas

Una PostgreSQL 17.6 por instalación, 36 migraciones terminadas y 41 tablas. Cero constraints FK sin validar en la instalación principal. Los snapshots de las familias comparan relaciones y datos financieros originales; la validez de FKs activas no sustituye una demostración matemática de todos los invariantes.

Las familias prueban rollback mediante inyección de fallo en el harness, transacciones anidadas de registro/reset, inventario y auditoría; concurrencia con mismo operationId, respuestas perdidas/reintentos, creación de orden y captura/callback, reembolso, membresía, saldo y puntos. Se registran dispatch/engineCalls para detectar ejecución duplicada. Se usan los módulos originales y Prisma/PostgreSQL/Redis reales; correo y proveedores financieros externos son dobles sintéticos. Los 22 pares conservaron estados/efectos en sus snapshots canónicos. Los tests de rollback no provocan caídas deliberadas en instalaciones existentes.

En Compose principal: una venta PAID de 20, un pago DEMO CAPTURED vinculado, una boleta EB01-0001, reserva CLOSED, inventario Regular 4996.445495 L y reservedLiters=0; los otros combustibles siguen en 5000. Secuencia boleta=1, operación=1, factura sin utilizar. Cliente no afiliado: puntos=0. La prueba de puntos/saldos de afiliados corresponde a las familias, y la recarga Prime demo 50 a la primera instalación.

Se reiniciaron los 15 procesos propios y se ejecutó nuevamente `up -d --wait`: snapshot SQL exacto, sonda Redis persistida y trabajo de impresión idéntico. No se reejecutan seeds destructivos. Dump sintético generado y copiado fuera del contenedor: 238936 bytes, SHA-256 `4b4d20a4f57a241410568393be4a9b95b08eeedba14c0c4cced2bced61b79f55`. No se restauró ese dump: el procedimiento de restauración debe hacerse en un proyecto y volúmenes nuevos, no sobre los existentes.

El laboratorio fallido conserva un pago capturado de 20 y cero ventas: es una incidencia funcional real, no evidencia de integridad del recorrido completo. No se duplicó el pago, no se intentó un segundo cobro, no se canceló ni recuperó forzosamente.

Evidencias: `paired-families.json`, `http-security.json`, `persistence-inventory.json`, `t02-recovery-failure.json`, en `evidence/lot5-validation/`. Dumps, secretos, logs completos y metadatos privados permanecen en `.cache`, fuera de Git.

## Auditoría de reanudación

Se volvieron a comparar los 22 snapshots canónicos y sus resultados por brazo; 24 376 archivos de fuentes de los snapshots se contrastaron con los hashes iniciales. Solo se admitieron y registraron diferencias de finales de línea CRLF/LF en copias baseline obtenidas con git show. Los 1508 archivos versionados iniciales se conservan, con la única excepción documental de la actualización 3J; las nueve evidencias históricas mantienen sus hashes y siguen sin seguimiento. No se cambia AuthCore, Prisma, políticas ni algoritmos financieros. Los resultados no se cuentan como nuevas solicitudes HTTP.

`resume-audit.json` distingue las ejecuciones reutilizadas de esta auditoría. Los contenedores protegidos se habían contrastado en la sesión anterior; al reanudar, el motor Docker no estaba disponible y **no se certifica su estado actual**. No se inició Docker ni se intervino en la copia de exposición. Ningún dump/config privado se incorpora al commit. El commit autorizado registra verificaciones/documentos, no aprobación de recuperación T02 ni de portabilidad multiplataforma.

Antes del commit se encontró una contraseña Redis sintética en el comando del contenedor incluido en el inventario público sin seguimiento. Se reemplazó únicamente ese argumento por `<redacted:REDIS_PASSWORD>`; el original sigue privado, con hash registrado y cotejo de todos los demás campos. El análisis contra claves privadas de ambos laboratorios y patrones de JWT completos/bloques de clave privada pasa sobre documentos, JSON/logs públicos y runners Lote 5. Este saneamiento no modifica claves, políticas ni datos del runtime y no se contabiliza como prueba HTTP nueva.

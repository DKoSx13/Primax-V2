# Lote 2C — consolidación de quince contratos Identity

Referencia autorizada: `a72e787deb03facf29989eab64949aec5d339950`.
Rama: `feat/dezkz-identity-a4-core`. HEAD y árbol versionado inicial comprobados;
17 hashes de fuentes de la entrega 2B, sus ancestros y las nueve evidencias históricas
verificados. `git fsck --connectivity-only` termina sin objetos corruptos; conserva
blobs dangling anteriores. Las nueve evidencias permanecen intactas, sin seguimiento,
excluidas del commit y sin utilizarse como recursos de ejecución.

Estado final contractual y evidencia:
[matriz Identity 26 + Catalog 6](primax-lot2-identity26-catalog6-matrix.md),
[resumen saneado](evidence/lot2c-identity/review-summary.json).

## Inventario y decisión previa a la implementación

Las quince operaciones son elegibles mediante compatibilidad local: no requieren
cambiar políticas, mover escritores o dividir transacciones. Las tres familias se
implementan y verifican como incrementos del mismo lote, sin cortes por ruta.

| Familia | Contrato exacto | Motor original |
|---|---|---|
| IdentitySecurityOperations | POST /api/v1/auth/register | AuthService.register |
| IdentitySecurityOperations | POST /api/v1/auth/login | AuthService.login |
| IdentitySecurityOperations | POST /api/v1/auth/forgot-password | PasswordResetService.forgot |
| IdentitySecurityOperations | POST /api/v1/auth/verify-reset-code | PasswordResetService.verify |
| IdentitySecurityOperations | POST /api/v1/auth/reset-password | PasswordResetService.reset |
| KioskSessionOperations | GET /api/v1/kiosk/session | KioskService.status |
| KioskSessionOperations | POST /api/v1/kiosk/session/login | KioskService.login |
| KioskSessionOperations | POST /api/v1/kiosk/session/logout | KioskService.logout |
| KioskSessionOperations | POST /api/v1/kiosk/session/authorize | KioskService.authorize |
| KioskSessionOperations | POST /api/v1/kiosk/session/terminal-bootstrap | KioskService.bootstrapTerminal |
| KioskSessionOperations | POST /api/v1/kiosk/session/terminal-recovery | KioskService.exchangeRecoveryTicket |
| AdminIdentityWorkflows | GET /api/v1/admin/alerts | AlertsService.list |
| AdminIdentityWorkflows | GET /api/v1/admin/dashboard | AlertsService.dashboard |
| AdminIdentityWorkflows | POST /api/v1/admin/alerts/:id/resolve | AlertsService.resolve |
| AdminIdentityWorkflows | POST /api/v1/admin/check-plate | AlertsService.checkPlate |

**Quince consolidadas; ninguna de estas quince excluida ni bloqueada.** Las seis
operaciones admin del controlador no se confunden con contratos Administration:
solo cuatro workflows forman parte de este paquete. Login admin y demo se evalúan
separadamente abajo y conservan sus implementaciones inline.

## Frontera implementada

`Controlador existente → adaptador de entrada → caso de uso → puerto explícito →
adaptador local Existing… → instancia Nest original`.

Cada familia tiene cinco fuentes en `Backend/services/identity/src/`: puerto,
caso de uso, adaptador de entrada, adaptador de salida y composición. El puerto
enumera cinco/seis/cuatro métodos, sin despacho genérico; no importa Nest, Prisma,
Request/Response ni motores. Los tipos concretos de argumentos/resultados se derivan
de los motores originales en el adaptador de compatibilidad. El caso de uso devuelve
directamente la promesa original; no captura errores, valida, reintenta o escribe.

La composición envuelve las instancias ya inyectadas en los controladores. No crea
AuthService, PasswordResetService, KioskService, AlertsService, JwtService ni Prisma
adicionales. AuthCore sigue proporcionando los motores. La proyección de authorize,
la elección del actor administrativo al resolver una alerta, DTOs, pipes, permisos,
decoradores HTTP, Swagger y límites de solicitudes permanecen en sus lugares originales.

La comparación cerrada de fuentes solo permite añadir la composición y sustituir
las llamadas por la frontera correspondiente. Los cuerpos de login admin y demo
son idénticos. AuthCore y su separación 2B, guards, JWT, CSRF, cookies, sesiones,
revocaciones y authVersion permanecen sin cambios. No se introduce un ciclo entre
los controladores y la composición; los otros tres procesos no importan estas capas
Identity ni sus controladores. No aparece TS2307.

## Archivos modificados

| Grupo | Archivos / finalidad |
|---|---|
| Controladores | `Backend/src/auth/auth.controller.ts`, `auth/admin.controller.ts`, `kiosk/kiosk.controller.ts`: conservan inyección y contratos; llaman la composición de su familia. |
| Quince fuentes nuevas | En `Backend/services/identity/src/`, familias `identity-security-operations`, `kiosk-session-operations`, `admin-identity-workflows`: `application/ports/*.ts`, `application/use-cases/*.ts`, `adapters/inbound/*.adapter.ts`, `adapters/outbound/existing-*.ts`, `bootstrap/*.composition.ts`. |
| Prueba de frontera | `Backend/src/identity-adapters/lot2c-boundaries.spec.ts`: argumentos y referencias exactas, misma promesa, resultado/error original, una invocación y ningún retry; independencia de aplicación/puertos. |
| Integración adicional | `Backend/test/lot2c-identity.integration.cjs` y `lot2c-kiosk-scenario.cjs`: reutilizan escenarios como código, con recursos nuevos; añaden recuperación real y normalización validada de credenciales variables. |
| Herramientas nuevas | `tools/astra/lot2c-identity-validation.cjs`, `lot2c-identity-postgres-redis.cjs`, `lot2c-context-builds.cjs`, `lot2c-images.cjs`, `lot2c-image-bootstrap.cjs`, `lot2c-source-integrity.cjs`: validación aislada, comparación de contextos, imágenes y conservación de fuentes. |
| Documentación | Este informe, matriz vigente, actualización añadida al plan 3J y evidencia JSON saneada. |

No se modifican repositorios/mappers/motores, Prisma/migraciones, AuthCore/PasswordReset,
Commerce o Administration, los frontends, Gateway, Dockerfiles ni tsconfigs. La lista
exacta de archivos y SHA-256 se incluye en el resumen JSON, excluido de su propio hash.

## Pruebas y comparaciones

Las pruebas utilizan exclusivamente credenciales aleatorias, PostgreSQL
`17.6-bookworm` y Redis `7.4-alpine`, nuevos y sintéticos por brazo/familia; redes
internas sin puertos publicados, volúmenes exclusivos comprobados vacíos antes de
ejecutar las 36 migraciones originales. Se comprueba base/usuario/montaje/propiedad.
Todos los proyectos propios se detienen; sus volúmenes se conservan. No se reutilizan
bases, credenciales, volúmenes ni artefactos de datos de otros lotes. El código de los
escenarios anteriores se reutiliza como prueba, nunca sus resultados o recursos.

Baseline restaura los tres controladores desde el commit autorizado; candidate
utiliza las fronteras nuevas. No se ejecutan ambos motores sobre una misma escritura.
Los mismos casos usan datos y condiciones equivalentes en laboratorios distintos.

| Validación | Resultado |
|---|---|
| Regresiones AuthCore/Identity/Catalog | 224 pruebas en 21 suites, cero fallos: 206 anteriores y 18 checks nuevos de las tres familias. |
| Gateway | 24/24 contratos, sin cambios en sus fuentes. |
| Empaquetado | 9/9 checks, scripts productivos intactos. |
| Builds | Cuatro microservicios y legacy correctos. Diez builds adicionales baseline/candidate con los contextos de COPY originales. |
| Docker | Cinco imágenes nuevas construidas con Dockerfiles originales; un main por microservicio, usuario node y comandos originales. |
| Smoke sin red | Los cinco entrypoints llegan una vez a listen con NestFactory interceptado; no conecta datos ni sustituye la prueba real siguiente. |
| Arranque real | Cinco imágenes con Nest real y otro PostgreSQL/Redis nuevos: health 200/database up; login vacío 400 solo en Identity/legacy, 404 en los otros tres. |
| Bootstrap e integridad | Volcado completo de datos y secuencias idéntico antes/después de los cinco arranques; servicios detenidos. |
| Conservación | Transformación literal de tres controladores, dos excepciones intactas, motores/políticas y composición 2B sin cambios; evidencias e historia verificadas. |

Las comparaciones principales cubren perfil/vehículos (42 checks por brazo), seguridad
(31), kiosco (19), admin/OCR (30) y Catalog (29): **151 por brazo, 302 en total**.
La comparación adicional de kiosco amplía los casos con SQL/Redis reales y se informa
separadamente en la evidencia: **26 por brazo, 52 ejecuciones** (incluye los 19 casos
anteriores y siete nuevos). Contando cada caso una vez, quedan **158 por brazo,
316 comprobaciones HTTP ?nicas** entre las cinco familias.

Se verifica autenticación válida/inválida, cuenta inactiva/inexistente, identificador
ambiguo, registro duplicado/concurrente, rollback de registro y reset, cooldown y
consumo único de recuperación, revocación original mediante authVersion, autorización,
aislamiento de propietario/estación, JWT expirado o inválido en los escenarios aplicables,
rechazos HMAC/CSRF, sesión técnica revocada/expirada en las pruebas existentes, alertas
sin duplicación, repetición y errores originales. Se conservan UUID, importes Decimal,
estados, registros, secuencias, contratos y efectos técnicos Redis comprobados.

La recuperación adicional usa registros pendientes DEMO sintéticos, sin invocar un
proveedor: valida evidencia financiera original, ticket válido, terminal incorrecta,
privilegio administrativo revocado, aislamiento del propietario de la nueva credencial,
expiración real Redis, replay y rollback SQL. El motor puede consumir el ticket Redis
antes de un fallo SQL; esa limitación preexistente se prueba y conserva, sin añadir
reintentos ni prometer atomicidad conjunta SQL/Redis. No se certifica T01 ni se altera
su recuperación funcional. No se capturan pagos ni se emiten comprobantes reales.

Las respuestas/errores y tablas se comparan con la normalización aprobada, validando
JWT/bcrypt/OTP y credenciales antes de normalizar campos variables; se conservan
estados, nulabilidad de tiempos de ciclo de vida, relaciones y secuencias. Redis TTL
debe ser positivo, sin exigir igualdad de milisegundos. Se excluyen metadatos de
migraciones. Logs, secretos de laboratorio, snapshots y volcados completos permanecen
en `.cache/astra-lot2c-identity`, fuera de Git.

Límites: la prueba SMTP simula el transporte y OCR simula el proveedor; no se valida
entrega externa ni su algoritmo. Los tests de engines con persistencia simulada no
se presentan como PostgreSQL real. Los escenarios concurrentes demuestran sus casos,
no todas las intercalaciones. No se declara equivalencia universal ni autonomía
productiva. Las operaciones read-only no necesitan rollback financiero; se comparan
sus snapshots y ausencia de escrituras. La recuperación financiera SETTLED_SALE conserva
sus pruebas unitarias; el nuevo intercambio SQL/Redis usa PENDING_PAYMENT.

Durante la implementación se corrigió una colisión del campo `reset` con el método
del adaptador nuevo, detectada por TypeScript/pruebas. Una ejecución del laboratorio
de bootstrap coincidió con la asignación de subred del laboratorio HTTP y Docker
rechazó el solapamiento; se repitió secuencialmente con recursos nuevos, sin tocar
redes/volúmenes ajenos. Se conservan los intentos fallidos y sus estados detenidos.
La fixture adicional corrigi? fechas de emisi?n/expiraci?n incompatibles con un
CHECK original, sin modificarlo. El primer cotejo adicional detect? ?nicamente la
entrop?a de una credencial Redis que el error SQL impide devolver al cliente; la
normalizaci?n definitiva verifica su digest, puntero, propietario, estaci?n, operaci?n
y expiraci?n antes de correlacionarla. Estados y efectos permanecen comparados.
La pareja adicional se repiti? completa con recursos nuevos y pas?. No hay regresiones
productivas pendientes por esos intentos.

## Evaluación separada de las dos excepciones

| Aspecto | POST /api/v1/admin/login | GET /api/v1/admin/demo-credentials |
|---|---|---|
| Implementación actual | Bloque inline de AdminController: Config selecciona credenciales demo/local o administrativas; comparación constante/bcrypt; JwtService firma la misma identidad admin durante 30 minutos. Respuesta original 201 y throttle original. | Bloque inline: demoAdminEnabled exige APP_MODE local y switch explícito; devuelve enabled false o las credenciales demo configuradas. Ruta pública original. |
| Dependencias | ConfigService, JwtService de AuthCore, demoAdminEnabled, crypto, bcrypt y DTO/validación HTTP original. | ConfigService y demoAdminEnabled; exposición local actual. |
| Viabilidad | Sí, extracción literal a un motor local inyectado y frontera explícita, sin cambiar seguridad ni formato del JWT. | Sí, extracción literal de lectura técnica de configuración, conservando la misma condición y respuesta. |
| Motivo de exclusión actual | La autorización consolida quince contratos y pide evaluar estas dos por separado. Su lógica inline todavía no es un motor detrás de un puerto. No se la envuelve con una llamada recursiva al controlador ni se crea un autenticador alternativo. | Mismo alcance; no se considera aprobada la divulgación de credenciales por haber pasado una regresión. |
| Riesgos que permanecen | Identidad técnica admin y configuración legacy; no se transforma en una cuenta Control, ni se le inventan garantías nuevas de revocación/authVersion. Extraer debe conservar la misma instancia JWT y todas las opciones. | Credenciales legibles cuando la política original lo permite. Aceptación académica no autoriza exposición productiva; no se cambia la política para ocultar la observación. |
| Pruebas nuevas ejecutadas | Login válido/inválido, autorización resultante sobre alerts/dashboard y lifetime/claims JWT, usando datos nuevos; composición/guard/credenciales y SMTP en regresiones. | Flag deshabilitado y habilitado con credenciales sintéticas; pruebas de configuración por entorno. Cuerpo/decoradores iguales a la referencia. |
| Condición futura finita | Aceptar expresamente la excepción justificada o autorizar su extracción literal con comparación de contratos, rechazos, claims y DI. | Aceptar expresamente la excepción justificada o autorizar su extracción literal y verificar los mismos flags, entornos y respuestas. |

Ambas siguen como **excepciones técnicas propuestas, sin aceptación y sin nueva
frontera implementada**. No están bloqueadas por una política nueva ni por TS2307.
Su viabilidad no se confunde con autorización para ampliar las quince operaciones.

## Evaluación formal y cierre del alcance

Identity queda en **24/26 fronteras comprobadas**: nueve previas y quince de este lote,
con motores legacy declarados, sin operaciones sin inventariar. Dos D propuestas
permanecen fuera de ese conteo. No quedan bloqueos técnicos para las quince familias
autorizadas ni cambios de seguridad/transacciones exigidos por su composición.

Los P0 de implementación, composición, contratos y conservación de consistencia del
paquete de quince quedan satisfechos dentro de las pruebas descritas. El cierre
académico **incondicional de Identity y del Lote 2 sigue pendiente únicamente de la
decisión expresa sobre las dos excepciones**, conforme al P0 de alcance/rúbrica 3J.
Se recomienda aceptar el incremento comprobado y resolver ambas en una única decisión:
aceptar sus justificaciones o autorizar su extracción conservadora. No se propone una
cadena de nuevas etapas por ruta ni se declara una aceptación implícita.

Catalog mantiene seis lecturas aceptadas y sus observaciones de inventario público,
estaciones/combustibles inactivos, permisos Control y lector alternativo. AuthCore,
PasswordReset, Prisma/bootstrap y las escrituras financieras compartidas siguen como
dependencias explícitas. T01, A.2, política x-kiosk-key, TARJETA/OnlineOrder_method_check,
proveedores externos y A.4 permanecen documentados, sin modificaciones.

Los P0 globales de Compose definitivo y portabilidad multiplataforma no se certifican
en este lote. No hay push/merge ni se inician Administration o Lotes 3–5. Se realiza un
único commit local después de verificar las tres familias; su hash se informa en la
entrega, evitando autorreferencia. El árbol versionado queda limpio y solo permanecen
las nueve evidencias históricas sin seguimiento. **Trabajo detenido al concluir 2C.**

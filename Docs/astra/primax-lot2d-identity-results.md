# Lote 2D — cierre académico de Identity y Catalog

Referencia inicial: `efcbdc9bc7f68944f0c72c6bbff125f55793f4e4`.
Rama: `feat/dezkz-identity-a4-core`.

**Identity alcanza 26/26 fronteras; Catalog mantiene sus seis lecturas aceptadas.**
Se cierra el alcance académico finito del Lote 2, con las dependencias legacy y
observaciones declaradas. No se declara autonomía productiva ni cierre de los P0
globales de Compose definitivo y portabilidad del plan 3J.

## Recuperación e integridad

HEAD coincidió exactamente con la referencia: no había commits posteriores ni
cambios versionados desconocidos. `git fsck --connectivity-only` pasó, conservando
los blobs dangling preexistentes. Se verificaron los ancestros 2/2B/2C y los hashes
del manifiesto Backend de 2C, salvo el controlador cuya transformación se comprueba
de forma cerrada. Las nueve evidencias históricas sin seguimiento coinciden por
SHA-256 con el inventario inicial 2C y permanecen excluidas del commit.

Se trabajó exclusivamente en el proyecto original. No se accedió a los archivos
de la copia de exposición, ni se ejecutaron comandos Compose sobre su proyecto,
contenedores o volúmenes. Docker Desktop estaba detenido y se inició para las
pruebas; los laboratorios no publicaron puertos ni compartieron recursos de datos.
El árbol versionado inicial limpio acredita que la copia no trasladó cambios
versionados al original; no se atribuye a esta revisión una comparación histórica
de archivos ignorados o de los datos de la exposición.

## Dos operaciones y frontera

| Operación | Antes | Después | Contrato conservado |
|---|---|---|---|
| POST /api/v1/admin/login | Motor inline en AdminController | AdminAccessOperations.login → AdminAccessEngine.login | DTO, comparación constante/bcrypt, error 401, éxito 201, JWT y throttle |
| GET /api/v1/admin/demo-credentials | Lectura inline en AdminController | AdminAccessOperations.demo → AdminAccessEngine.demo | Ruta pública; enabled false o credenciales configuradas, condición local explícita |

Flujo: controlador existente → adaptador de entrada → caso de uso de aplicación →
puerto explícito → adaptador local → motor original extraído literalmente.
Las cinco capas están en `Backend/services/identity/src/`. El motor local está en
`Backend/src/auth/admin-access.engine.ts`. La composición usa ConfigService y el
JwtService ya inyectados; no registra otro AuthCore, JwtService ni Prisma.

Los cuerpos de ambos métodos y el helper `equal` se comparan literalmente con el
commit inicial. La transformación cerrada del controlador conserva todos los DTOs,
decoradores, permisos y las otras cuatro operaciones administrativas. No se cambia
AuthCore, PasswordReset, AccessGuard, cookies, CSRF, sesiones, authVersion,
repositorios, persistencia, políticas financieras, frontends, Gateway, Prisma ni
migraciones. Commerce y Administration conservan sus fuentes funcionales.

El puerto y aplicación no importan Nest ni motores. Las capas delegan una vez,
conservando DTO, resultado, promesa y error; no capturan, reintentan ni escriben.
La lectura demo conserva su resultado síncrono y login el flujo asíncrono original.

## Seguridad conservada y límites

La condición demo original exige exactamente `APP_MODE=local` y
`SHOW_DEMO_ADMIN_CREDENTIALS=true`. Se rechaza login demo y divulgación en
production/staging/test incluso con el switch activo. No se añade una habilitación
productiva. La condición original depende de APP_MODE, no de una nueva regla de
NODE_ENV: esta migración no cambia la definición legacy del entorno local.

El token técnico administrativo conserva `sub=admin`, `role=admin`, `adminUser`,
30 minutos y las opciones de la misma instancia JWT. El guard valida el usuario
configurado. Este token técnico no tiene la revocación por authVersion propia de
cuentas de usuario; no se le atribuye esa garantía. Se prueba su expiración y el
rechazo al rotar ADMIN_USER. Las cuentas de usuario y sesiones de kiosco conservan
sus mecanismos originales de expiración/revocación y sus regresiones.

## Validaciones ejecutadas

| Validación | Resultado |
|---|---|
| AuthCore, Identity y Catalog | 235 pruebas en 22 suites, cero fallos; incluye las 224 anteriores y 11 nuevas |
| Gateway | 24/24 contratos |
| Empaquetado | 9/9 checks |
| Compilación | Cuatro microservicios y legacy correctos |
| Contextos Dockerfile | Diez builds baseline/candidate; sin TS2307; hashes emitidos de Catalog/Commerce/Administration iguales |
| Imágenes | Cinco tags nuevos construidos con Dockerfiles originales y usuario node; smoke interceptado sin red |
| Arranque real | Cinco imágenes con Nest real, health 200/database up y separación de rutas correcta |
| Integridad del arranque | Tablas y secuencias PostgreSQL idénticas antes/después de los cinco arranques |
| Fuentes y ciclos | Extracción literal, transformación cerrada, manifiesto previo conservado y cero ciclos nuevos de imports de ejecución |

Las comparaciones HTTP usan PostgreSQL `17.6-bookworm` y Redis `7.4-alpine`
nuevos por brazo/familia, datos sintéticos y secretos aleatorios. Se comprueban
propiedad, ausencia previa y vaciedad de volúmenes, base/usuario destino y red
interna sin puertos publicados antes de ejecutar las 36 migraciones originales.
Baseline restaura los controladores de `efcbdc9`; candidate usa la implementación
actual. Nunca se ejecutan ambos sobre la misma escritura o base.

| Familia | Checks por brazo | Comparación |
|---|---:|---|
| Perfil/vehículos | 42 | HTTP, tablas, secuencias y Redis equivalentes |
| Seguridad | 31 | Igualdad canónica y regresiones de login/reset/revocación |
| Kiosco ampliado | 26 | Incluye recuperación, expiración, replay y rollback SQL/Redis |
| Admin/OCR y acceso técnico | 46 | Incluye las dos fronteras nuevas y restricciones por entorno |
| Catalog | 29 | Seis lecturas y permisos/exposición originales |
| Total | **174** | **348 comprobaciones HTTP pareadas** |

La comparación valida firma, claims y lifetime JWT antes de normalizar entropía;
mantiene estados, errores, relaciones, valores financieros y secuencias. La nulabilidad
de tiempos de ciclo de vida se conserva; TTL Redis se valida positivo sin exigir
igualdad de milisegundos. Se excluye metadata de migraciones. Las reglas heredadas
de normalización de bcrypt, OTP y credenciales se conservan.

Login/demo, incluyendo errores, entornos y rechazos de sesión, dejan las tablas y
secuencias idénticas y Redis vacío. La prueba de delegación confirma una sola
invocación, sin retry. Los workflows anteriores conservan sus checks de efectos y
ausencia de duplicados. Los arranques usan otra pareja PostgreSQL/Redis nueva.
Todos los contenedores propios quedan detenidos; volúmenes propios conservados.
No se ejecutó limpieza global Docker ni se usaron datos operativos.

La primera ampliación admin falló en baseline porque el test esperaba 401 para
authVersion obsoleto en una ruta admin: el guard original devuelve 403. Se corrigió
únicamente la expectativa, se añadieron controles de ausencia de escrituras y se
repitieron ambos brazos con recursos nuevos; pasaron. Los logs del intento quedan
en `.cache/astra-lot2d-identity`, sin secretos en la evidencia versionada.

Límites de las pruebas: SMTP y OCR usan transportes simulados, no proveedores
externos. La fixture HTTP preserva los decoradores pero no instala el guard global
de throttling; se acredita su conservación por comparación cerrada del controlador,
sin afirmar una nueva prueba dinámica de rate limiting. Los escenarios no prueban
todas las intercalaciones concurrentes ni equivalencia universal. El smoke
interceptado no sustituye el arranque real, que también pasó.

## Archivos de la entrega

| Grupo | Archivos |
|---|---|
| Entrada y motor | `Backend/src/auth/admin.controller.ts`, `Backend/src/auth/admin-access.engine.ts` |
| Cinco capas Identity | `application/ports/admin-access-operations.ts`, `application/use-cases/admin-access-operations.ts`, `adapters/inbound/admin-access-operations.adapter.ts`, `adapters/outbound/existing-admin-access-operations.ts`, `bootstrap/admin-access-operations.composition.ts`, bajo `Backend/services/identity/src/` |
| Pruebas | `Backend/src/identity-adapters/lot2d-boundaries.spec.ts`, `Backend/test/lot2d-admin-scenario.cjs`, `Backend/test/lot2d-identity.integration.cjs` |
| Herramientas | `tools/astra/lot2d-{identity-validation,identity-postgres-redis,context-builds,images,image-bootstrap,source-integrity}.cjs` |
| Documentación | Este informe, matriz Identity/Catalog, actualización del plan 3J y resumen saneado JSON |

La lista exacta con SHA-256 está en el manifiesto del resumen de evidencia. Las
herramientas reutilizan código de escenarios anteriores, nunca datos, bases o
resultados anteriores. Los logs completos y secretos permanecen en `.cache`.

## Cierre académico y pendientes

La [matriz definitiva](primax-lot2-identity26-catalog6-matrix.md) inventaría las 26
operaciones Identity como H y las seis lecturas Catalog aceptadas. El pendiente
finito de las dos excepciones de 2C queda resuelto mediante implementación y
validación, sin requerir cambiar políticas de seguridad.

Catalog conserva sus observaciones: inventario público con filas de estaciones y
combustibles inactivos; Bearer en ruta pública no activa filtrado Control; lector
HTTP alternativo cubierto por pruebas unitarias, sin certificar su despliegue.

Dependencias compartidas explícitas: AuthCore/JWT/AccessGuard, PasswordReset y
transporte de recuperación, Prisma/bootstrap y PostgreSQL común, Redis/KioskStore,
repositorios legacy de usuarios/membresías/vehículos y Catalog, Alerts/Recognition
y sus colaboradores. Los workflows que tocan estado financiero siguen utilizando
sus escritores/transacciones originales; no se reclama propiedad exclusiva de datos
ni despliegue autónomo por envolverlos en puertos.

Se mantienen T01 y la limitación de consumo Redis previo a un rollback SQL,
TARJETA/OnlineOrder_method_check, política legacy x-kiosk-key y proveedores externos.
A.2 y A.4 permanecen cerrados en su alcance previo y no se reabren. Compose
definitivo, portabilidad y autonomía productiva no quedan certificados aquí.

Conclusión formal: **aceptación y cierre académico del alcance Lote 2
(Identity 26/26 + Catalog 6/6), con dependencias y observaciones declaradas**.
El hash del commit local se informa en la entrega para evitar autorreferencia.
Sin push ni merge. Trabajo detenido en 2D; Administration y Lotes 3, 4 y 5 no iniciados.

Evidencia nueva: [resumen saneado](evidence/lot2d-identity/review-summary.json).

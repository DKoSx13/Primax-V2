# Requisitos técnicos pendientes para calidad y Repo 2

## Base de datos y observación académica

Arquitectura actual: **Backend NestJS → Prisma ORM → PostgreSQL**. El staging actual utiliza PostgreSQL en Neon. Por tanto, PostgreSQL como motor ya está satisfecho; no se requiere cambio de motor. Las migraciones existentes de Prisma siguen siendo el mecanismo de evolución del esquema. Si el docente dijo “migrar a PostgreSQL”, el requisito ya está cumplido, salvo aclaración posterior de una migración específica. No ejecutar migraciones destructivas ni mover datos por esa observación.

## Backend: build y suite completa

### Build completo

El build definido es `npm run build`: `tsc -p tsconfig.build.json` seguido de copia de soporte. Requiere Node 22 (el entorno auditado tiene Node v22.23.4), instalación reproducible desde `Backend/package-lock.json` mediante `npm ci`, dependencias TypeScript/Nest/Jest/Prisma y generación del cliente con `npm run prisma:generate` (`prisma generate`). En la validación posterior se instalaron las dependencias del lockfile, se generó Prisma Client 6.19.3 y el build terminó correctamente.

### Suite Backend

- `npm test` ejecuta Jest sobre `src/**/*.spec.ts`; en general usa mocks/dependencias aisladas.
- `npm run test:e2e` ejecuta `test/**/*.e2e-spec.ts` a través de `scripts/local-db-command.cjs`, que valida destino local antes de arrancar Jest.
- E2E requieren PostgreSQL local aislado, variables de entorno adecuadas y esquema/migraciones de prueba; suites que ejercitan cache/sesiones pueden requerir Redis conforme al setup. No apuntar a Neon/staging ni a una base compartida.
- `npm run test:safety` ejecuta pruebas Node de guardas de base de datos y puede correrse aparte.

Para la validación posterior se crearon `.env` locales con valores aleatorios de fixture, permisos 0600 e ignorados por Git; se prepararon PostgreSQL y Redis aislados. No se usaron credenciales de staging.

## PlateRecognition/OCR

`PlateRecognition/requirements.txt` declara Flask, Gunicorn, `opencv-python-headless`, NumPy y Pillow. El Python host es 3.13.5, carece de `ensurepip` para crear venv y `import cv2` falla con `ModuleNotFoundError`; tampoco hay Tesseract host. Tests `test_ocr.py` y `test_v11.py` requieren OpenCV (`cv2`), NumPy, Pillow y fixtures. El Dockerfile fija Python 3.12.11 e instala Tesseract, idioma inglés, fuentes DejaVu y dependencias Python. La validación se hizo en esa imagen sin instalaciones globales.

Para ejecutar en host en el futuro, usar Python 3.12 con soporte venv, crear `PlateRecognition/.venv`, instalar solo `requirements.txt` y confirmar Tesseract/idioma/DejaVu. El intento con Python host 3.13 falló por falta de `ensurepip`; quedó un directorio `.venv` parcial ignorado por Git. La imagen Docker existente permitió ejecutar las pruebas sin modificar dependencias del proyecto.

## PostgreSQL, Prisma y Neon

El motor ya es PostgreSQL; no hay migración de motor pendiente. Staging utiliza Neon PostgreSQL. Prisma y sus migraciones ordenadas permanecen como mecanismo de evolución de esquema. Para ejecutar E2E se debe usar base local aislada; no reutilizar Neon/staging.

## Pendientes antes de crear Repo 2 oficial

1. Decidir/confirmar alcance inicial V2 y revisar referencias heredadas antes de copiar baseline.
2. Instalar dependencias por lockfiles y registrar versión/runtime por componente, sin incluir dependencias instaladas.
3. Ejecutar build y suites de cada componente en entorno local controlado; preparar PostgreSQL/Redis locales para Backend E2E.
4. Preparar entorno OCR aislado y ejecutar fixtures; documentar disponibilidad de Tesseract.
5. Resolver fallos reales encontrados y registrar evidencia; no inferir éxito a partir de inspección estática.
6. Acordar convenciones y configuración de cobertura por runner.
7. Aprobar plan/versión de SonarQube y realizar análisis inicial cuando corresponda; no exigir cero hallazgos.
8. Confirmar rutas/artefactos que entrarán al Repo 2 y preservar separadas las referencias V12.1.
9. PostgreSQL: requisito ya satisfecho en la arquitectura actual mediante Prisma + PostgreSQL; no se requiere cambio de motor.

No hay en este documento propuesta ni requisito de PostgREST, API directa adicional sobre PostgreSQL o reemplazo de Prisma.

## Resultados reales de validación local — 2026-10-30

| Componente | Comando/entorno | Resultado | Clasificación |
| --- | --- | --- | --- |
| Backend build | `npm ci --no-audit --no-fund`; `npm run prisma:generate`; `npm run build` | 590 paquetes del lockfile, Prisma Client 6.19.3 generado, build correcto | READY |
| Backend Jest `src` | `npm test -- --silent` | 22 suites, 183/183 tests pasaron tras corrección de fixture y configuración local OCR | READY |
| Backend safety | `npm run test:safety` | 5/5 pruebas de protección de destinos locales pasaron | READY |
| Backend E2E | `npm run test:e2e -- --silent` contra PostgreSQL local | 17 suites: 3 pasaron, 9 fallaron, 5 omitidas; 291 casos: 134 pasaron, 124 fallaron, 33 omitidos | BLOCKED para suite completa |
| PostgreSQL local | `docker compose -f compose.yaml -f compose.database-local.yaml -p primax_v2_validation up -d postgres redis` | Base lógica `primax_v2_validation` en loopback `127.0.0.1:26543`, contenedor healthy; 27/27 migraciones aplicadas en esquema E2E comprobado | READY |
| Redis local | Mismo Compose, servicio `redis` | Healthy, red Compose aislada sin puerto publicado al host | READY |
| OCR | `docker build -t primax-v2-ocr-validation ./PlateRecognition`; `docker run --rm --entrypoint python primax-v2-ocr-validation -m unittest discover -v` | Imagen Python 3.12.11, 12/12 tests pasaron | READY WITH DOCUMENTED LIMITATION |
| FuelFlow | `npm run build && npm test` | Build correcto; 136/136 tests pasaron | READY |
| Primax Prime | `npm ci --no-audit --no-fund`; `npm run build && npm test` | Build correcto; 27/27 tests Node pasaron; Playwright no se repitió | READY WITH DOCUMENTED LIMITATION |
| Primax Control | `npm run build && npm test` | Build correcto; 15/15 tests pasaron | READY |
| PrintAgent | `npm test` | 53 pasaron, 1 omitido, 0 fallaron; sin impresión física validada | READY WITH DOCUMENTED LIMITATION |
| Compose | `docker compose -f compose.yaml -f compose.database-local.yaml config --quiet` con `.env` fixture | Configuración válida; servicios PostgreSQL/Redis healthy | READY |

### Fallos E2E y cambios acotados

- Primera ejecución Jest `src`: 15 fallos en 2 suites. `critical-integrity.spec.ts` tenía un repositorio simulado obsoleto sin `onlineOrder.updateMany`; se añadió un mock que devuelve cero filas, coherente con ese escenario legado. La configuración local desactivaba OCR y hacía fallar tests que lo simulan; se activó solo en `.env` local. La repetición completa pasó 183/183.
- `api.e2e-spec.ts`, `v9.e2e-spec.ts` y `prepaid-guest.e2e-spec.ts` esperan que una clave Kiosk directa autorice ventas. La baseline actual exige operación técnica de terminal y devuelve 403; no se debilitó esa protección.
- `registration.e2e-spec.ts` espera `PRIM001`, mientras el generador ejecutable devuelve `PRIM-001`. Es expectativa obsoleta frente a la baseline actual; no se cambió la numeración funcional V2.
- `auth-recovery.e2e-spec.ts` espera 400 para entrega deshabilitada y recibe 503. Discrepancia de contrato/test pendiente de revisión.
- Varias suites E2E exigen nombres/puertos locales distintos (`primax_v11_1`, `primax_control_test` en 26544, `primax_phase1a` en 26555, `primax_v12_1b3_test`). Una URL local no satisface toda la batería. Las cinco suites omitidas y parte de los fallos requieren ejecutar grupos con sus destinos específicos. No se redirigió ninguna prueba a Neon.
- Los E2E crean esquemas aislados; algunos preservan esquemas por diseño (`KEEP_E2E_SCHEMA`). Permanecen en el volumen **local** `primax_v2_validation_postgres_data`. No se ejecutó `down -v` ni reset remoto.
- `.gitignore` recibió `**/.venv/` para evitar incluir el intento parcial de entorno OCR host. `.env`, dependencias y builds ya estaban ignorados.

### E2E adicionales con destinos locales específicos

Después del barrido general se ejecutaron grupos con bases locales dedicadas, sin usar staging:

| Grupo | Base local | Resultado |
| --- | --- | --- |
| Conciliación de inventario | `primax_v12_1b3_test` en loopback | `inventory-reconciliation.e2e-spec.ts`: 1 suite, 10/10 tests pasaron |
| Incidencias, demo V11.2 y reembolso parcial | `primax_v11_1` en loopback | 2 suites pasaron (`incidents`, `v11_2-demo`); 1 falló (`partial-refund`) por autorización Kiosk directa heredada. Total: 13 pasaron, 7 fallaron |
| Control y Phase 1A | `primax_control_test` por loopback 26544 y `primax_phase1a` por loopback 26555 | 4 suites, 31/31 tests pasaron; se usaron redirecciones TCP locales temporales hacia PostgreSQL 26543 |

Se aplicaron y comprobaron **27/27 migraciones** en las bases `primax_control_test` y `primax_phase1a`; la base principal de validación tenía 27/27 en un esquema E2E. Los servicios PostgreSQL y Redis fueron saludables durante las pruebas. Al finalizar se detuvieron servicios y redirecciones TCP temporales, conservando los volúmenes locales. No se hizo `down -v`.

### Decisión de preparación de Repo 2

Este fue el estado del primer barrido. La revalidación posterior y la decisión vigente se registran a continuación. Antes del repositorio oficial se deben revisar exclusiones de `.env`, `.venv`, `node_modules`, `dist`, `www` y volúmenes locales.

## Revalidación y clasificación E2E — 2026-10-30

La clasificación por suite y por cada caso fallido está en [e2e-failure-classification.md](e2e-failure-classification.md). **Antes:** barrido de 17 suites, 3 aprobadas, 9 fallidas, 5 omitidas; 134/291 casos aprobados, 124 fallidos, 33 omitidos. **Después de corregir expectativas y fixtures y ejecutar cada base local exigida:** 14 suites aprobadas (13 juntas y conciliación de inventario por separado), 3 suites históricas aún fallidas; **207/291 casos aprobados, 84 fallidos, 0 omitidos**. Los 84 fallos restantes se concentran en `api.e2e-spec.ts` (47), `v9.e2e-spec.ts` (25) y `prepaid-guest.e2e-spec.ts` (12), cuyo fixture crea ventas con `x-kiosk-key` directa. No se marcaron como omitidos ni se retiró su cobertura.

Correcciones de test/fixture realizadas:

- `registration.e2e-spec.ts`: expectativas de formato actual `PRIM-...`, incluida regex. Repetición: **57/57**.
- `auth-recovery.e2e-spec.ts`: 503 cuando `PASSWORD_RESET_DELIVERY=disabled`, conforme a `PasswordResetService` y referencia V12.1. Repetición: suite aprobada.
- `partial-refund.e2e-spec.ts`: setup con Supervisor, turno, surtidor, terminal, credencial y operación técnica. Gateway simulado solo dentro de esta suite financiera; `AccessGuard` y el vínculo técnico real siguen activos. Repetición: **7/7**, sin inconsistencia financiera detectada.
- `critical-integrity.spec.ts`: el mock de `onlineOrder.updateMany` devuelve cero filas y ahora se comprueba una llamada en el caso de doble clic. No se elimina ningún control.

Validación posterior: `npm run build` correcto; `npm test -- --silent` **22/22 suites y 183/183 tests**; `npm run test:safety` **5/5**. El grupo E2E con URL y variables correctas pasó **13/13 suites y 173/173 tests**; `inventory-reconciliation.e2e-spec.ts` pasó **10/10** en su base dedicada. PostgreSQL/Redis permanecieron locales; las migraciones Prisma se aplicaron solo a bases locales. OCR conserva el resultado anterior **12/12** en Python 3.12 Docker. La seguridad de terminal no se relajó: la venta nueva sigue exigiendo sesión y operación técnica y la clave Kiosk directa recibe 403.

**Estado intermedio anterior: BLOCKED para crear Repo 2.** En ese momento, los 84 fallos históricos dejaban escenarios de API/venta sin validar con el protocolo vigente. El cierre técnico posterior registra su resolución. El futuro formato `PRIME-...` sigue reservado para un incremento SDD posterior.

## Cierre técnico posterior — 2026-10-30

La decisión vigente de esta sección sustituye el estado intermedio anterior.

Se añadió `Backend/test/technical-sale-fixture.ts`, helper exclusivo de tests que prepara Supervisor asignado, turno, surtidor, terminal, habilitación, credencial y operación técnica persistida por `operationId`. Las suites `api`, `v9` y `prepaid-guest` usan ese fixture y `recorded-purchase.ts` puede enviar solicitudes por el límite técnico simulado. El proveedor Kiosk se sustituye solo dentro de estas suites financieras; `AccessGuard` productivo sigue verificando credencial, estación y operación real. HMAC, sesión y CSRF conservan pruebas dedicadas en Kiosk/Phase 1A. Se añadió un E2E explícito de **403** para venta nueva con clave Kiosk directa. Ningún guard ni regla de negocio productiva cambió.

| Validación final | Resultado |
| --- | --- |
| `api.e2e-spec.ts` | 60/60, incluido rechazo de clave directa |
| `v9.e2e-spec.ts` | 37/37; aserciones financieras históricas vigentes alcanzadas |
| `prepaid-guest.e2e-spec.ts` | 12/12; prepago guest, placas, pagos y concurrencia |
| Barrido E2E con destinos locales correctos | 16/16 suites, 282/282 casos, 0 fallos, 0 skips |
| Conciliación de inventario en base local dedicada | 1/1 suite, 10/10 casos |
| **Total E2E** | **17/17 suites, 292/292 casos, 0 fallos, 0 skips** |
| `npm run build` | Correcto |
| `npm test -- --silent` | 22/22 suites, 183/183 casos |
| `npm run test:safety` | 5/5 casos |

El total E2E creció de 291 a 292 por la prueba nueva de rechazo de Kiosk key directa. Antes de esta adaptación el barrido había dado 134 aprobados, 124 fallidos y 33 omitidos; el resultado final usa variables/base local apropiadas para cada grupo. PostgreSQL y Redis fueron locales aislados; no se usó Neon ni Upstash. OCR conserva su validación previa de 12/12 en el runtime Python 3.12 del componente. Los `.env` locales, dependencias, builds y `.venv` están ignorados; no se creó `.git`.

**Clasificación vigente: READY para crear Repo 2**, sujeto a mantener la exclusión de secretos y artefactos locales al preparar el repositorio oficial. No quedan fallos E2E funcionales conocidos ni bugs financieros críticos desconocidos detectados en esta validación. El futuro formato `PRIME-...` y demás decisiones funcionales V2 siguen para incrementos SDD posteriores.

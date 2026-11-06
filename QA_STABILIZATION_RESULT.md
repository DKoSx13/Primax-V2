# QA Stabilization Result — 2026-11-06

Rama comprobada: `qa/stabilization-v2`. Sin commit, push, PR, despliegue, migración, seed ni acceso a datos remotos. El cambio previo de `sonar-project.properties` se conservó. Fuentes: handoff e inventario del 2026-11-06, 53 issues JSON/CSV de Sonar y seis pares JSON/HTML originales de ZAP.

## Matriz priorizada y lotes locales

| Lote | Archivos | Causa, cambio y riesgo | Verificación |
|---|---|---|---|
| P0/P1 terminal | `Backend/src/kiosk/kiosk.service.ts`, `kiosk.spec.ts`, `Frontend_3_PrimaxControl/js/app.js` | Bootstrap creaba una credencial frente al índice único parcial. Ahora bloquea la terminal, revoca la vigente y crea la nueva en una transacción; reutiliza el token válido presentado por el mismo navegador. La segunda VM/PC rota la credencial de la primera; falta validación real simultánea. Recuperación visible para operación residual en terminal en asistencia/fuera de servicio, con confirmación; Backend mantiene comprobaciones financieras y auditoría. | Unitario de rotación 11/11; build Backend correcto; HTTP E2E bloqueado por sandbox. |
| P1 OCR e impresión | `Frontend_1_FuelFlow/src/js/plateCamera.js`, `apiClient.js`, `script.js`, `index.html` | Webcam pasa de tres OCR secuenciales obligatorios a dos capturas reconocidas coincidentes; archivo conserva un OCR. 503 indica inicio o indisponibilidad sin afirmar causa. Consulta de vehículo solo tras placa validada. El botón se llama «Continuar sin imprimir» y ya evita PrintAgent; cierre sigue dependiendo de conciliación Backend. Riesgo: webcam física y 503 Render sin verificar. | FuelFlow 23/24 archivos de test pasan; fallo restante es `spawnSync EPERM`; build FuelFlow correcto. |
| P2 asistencia | `Frontend_1_FuelFlow/src/js/assistance.js`, `script.js`, `index.html`, `styles.css`; `Backend/src/assistance/assistance.service.ts`; `Frontend_3_PrimaxControl/js/assistance.js` | X minimiza con aviso y no cancela; cancelar exige confirmación; reintento solo ante fallo; resuelta conserva mensaje hasta Continuar. Control muestra nombre de estación y motivos/eventos humanos; acciones visibles Tomar, Observación, Resolver. El API mantiene acciones heredadas para compatibilidad. | Control 7/7; FuelFlow asistencia pasa; build Backend correcto. |
| P2 cuentas | `Backend/src/control/control.controller.ts`, `control.service.ts`, `control-create-account.spec.ts`; `Frontend_3_PrimaxControl/js/app.js` | La acción de deshabilitar ya existía pero aceptaba solo motivo; ahora requiere confirmación y contraseña en campo enmascarado del Administrador del sistema, compara el hash antes de mutar, pone `active=false`, incrementa `authVersion` y conserva auditoría. Sigue prohibida la autodeshabilitación. | Unitario de cuenta 10/10, Backend build y Control 7/7; interacción real pendiente. |
| P3 permisos | `Frontend_3_PrimaxControl/js/control-presentation.js`, `app.js` | El diálogo de edición y la tabla mostraban códigos `ADMIN_*`; comparten etiquetas y categorías humanas con el formulario de creación. | Control 7/7 y `node --check` correctos. |
| Sonar acotado | `Backend/src/alerts/alerts.service.ts`, `PrintAgent/contract.mjs`, `Frontend_1_FuelFlow/src/js/script.js` | Ordenación alfabética explícita; conversiones numéricas equivalentes; promesas de tareas autocontenidas marcadas como intencionales. Riesgo: avisos restantes requieren revisión semántica. | PrintAgent unitario 4/4; `git diff --check` correcto. |

## Pruebas ejecutadas y límites

- `Backend npm run build`: correcto tras el cambio de cuentas. `Backend npm test -- --silent`: 25/26 suites y 210/214 pruebas pasan; una suite HTTP con 4 pruebas falla por `listen EPERM` del sandbox, no por assertion funcional. El test focalizado de cuentas pasa 10/10. `Backend npm run lint`: 25 errores previos en scripts/tests y servicios no tocados; no se ocultaron.
- `Frontend_1_FuelFlow npm test`: 23/24 archivos pasan; `build-secrets.test.js` falla por `spawnSync /usr/bin/node EPERM`. El nuevo `plate-guard.test.js` pasa y `npm run build` es correcto.
- `Frontend_3_PrimaxControl npm test`: 7/7. `npm run build`: bloqueado por `spawnSync /usr/bin/node EPERM` al validar JS.
- `PrintAgent npm test`: 4/7 archivos pasan; 3 pruebas HTTP requieren escuchar en 127.0.0.1 y fallan con `listen EPERM`. Selección de cuatro archivos unitarios: 4/4.
- `Frontend_2_PrimaxPrime npm test`: 6/7 archivos pasan; `secrets.test.js` usa un proceso hijo y queda bloqueado por `spawnSync EPERM`. `npm run build`: correcto.
- `PlateRecognition python3 -m unittest discover -p 'test_*.py'`: no llegó a ejecutar casos porque falta `cv2` en el Python del host (`ModuleNotFoundError`). No se instalaron dependencias ni se alteró la imagen Docker.
- `Frontend_3_PrimaxControl node --check js/app.js` y `js/assistance.js`: correctos, aunque su build completo quedó bloqueado.
- Se leyó `database-safety.cjs` y `local-db-command.cjs`. `Backend/.env` declara `APP_MODE=local` y host `127.0.0.1` (sin revelar URL), pero no se validó que la instancia sea aislada. Por ello no se ejecutó `test:e2e`, migraciones, seeds ni pruebas que alteren BD. Tampoco se ejecutaron Sonar nuevo ni ZAP nuevo; no se dispone de una ventana de escaneo local verificada. Sin prueba de cámara física, PrintAgent físico o Render Free.

## SonarQube — 53 hallazgos de la evidencia original

Cada fila conserva regla, severidad, ruta y línea originales. Las 53 entradas JSON y CSV coinciden; dos alertas S3403 apuntan a la misma línea 1863 (52 claves distintas). «Corregido local» significa cambio de código y prueba de módulo indicada arriba; no afirma que Sonar haya reanalizado. El fragmento se leyó del archivo señalado y sirve para revisar desplazamientos de línea tras las ediciones.

| # | Regla | Sev. | Archivo:línea | Fragmento original/actual | Decisión, prueba, estado |
|---:|---|---|---|---|---|
| 1 | `typescript:S2871` | CRITICAL | `Backend/src/alerts/alerts.service.ts:22` | `const expectedPlates = membership.vehicles.map((v) => v.plate).sort((a, b) => a.lo` | Comparador `localeCompare`; test de módulo; corregido local |
| 2 | `typescript:S8786` | MAJOR | `Backend/src/auth/login.dto.ts:35` | `@Matches(/^(?:[^@\s]+@[^@\s]+\.[^@\s]+\|\d{8})$/)` | Regex de identidad/limpieza: rediseño y prueba de carga pendientes |
| 3 | `typescript:S5332` | MINOR | `Backend/src/config/environment.ts:216` | `env.PLATE_RECOGNITION_URL ?? 'http://plate-recognition:8000',` | HTTP restringido a Docker/localhost; justificar con topología y TLS externo; sin cambio |
| 4 | `typescript:S8786` | MAJOR | `Backend/src/memberships/profile.dto.ts:16` | `? [...value.replace(/<[^>]*>/g, '')]` | Regex de identidad/limpieza: rediseño y prueba de carga pendientes |
| 5 | `typescript:S5332` | MINOR | `Backend/src/vehicles/recognition.service.ts:29` | `'http://plate-recognition:8000',` | HTTP restringido a Docker/localhost; justificar con topología y TLS externo; sin cambio |
| 6 | `javascript:S9383` | MAJOR | `Frontend_1_FuelFlow/src/js/plateCamera.js:60` | `dialog.querySelector('[data-fixture]').onchange=async event=>{` | Promesa revisada; `void` en tareas con manejo interno o callback; test FuelFlow; revisión Sonar pendiente |
| 7 | `javascript:S3403` | MAJOR | `Frontend_1_FuelFlow/src/js/printReceipt.js:9` | `if(pageOrigin!==undefined&&!isLocalPrintOrigin(pageOrigin))return Promise.reject(E` | Estado mutable inferido de forma limitada por SAST; revisar semántica por flujo; pendiente |
| 8 | `javascript:S9383` | MAJOR | `Frontend_1_FuelFlow/src/js/script.js:1111` | `void refrescarAdmin(); // tabla, métricas y alertas` | Promesa revisada; `void` en tareas con manejo interno o callback; test FuelFlow; revisión Sonar pendiente |
| 9 | `javascript:S3403` | MAJOR | `Frontend_1_FuelFlow/src/js/script.js:1133` | `$('mini-monto').textContent = state.modalidad === 'PREPAGO'` | Estado mutable inferido de forma limitada por SAST; revisar semántica por flujo; pendiente |
| 10 | `javascript:S3403` | MAJOR | `Frontend_1_FuelFlow/src/js/script.js:1145` | `const esPost = state.modalidad === 'POSTPAGO';` | Estado mutable inferido de forma limitada por SAST; revisar semántica por flujo; pendiente |
| 11 | `javascript:S7773` | MINOR | `Frontend_1_FuelFlow/src/js/script.js:1382` | `state.combustible = { id: fuel.id, nombre, precio: Number.parseFloat(precio) };` | `Number.parseFloat/isNaN` equivalentes; test FuelFlow; corregido local |
| 12 | `javascript:S7773` | MINOR | `Frontend_1_FuelFlow/src/js/script.js:1400` | `const n = Number.parseFloat(state.montoTexto \|\| '0');` | `Number.parseFloat/isNaN` equivalentes; test FuelFlow; corregido local |
| 13 | `javascript:S7773` | MINOR | `Frontend_1_FuelFlow/src/js/script.js:1401` | `$('monto-display').textContent = 'S/ ' + (Number.isNaN(n) ? 0 : n).toFixed(2);` | `Number.parseFloat/isNaN` equivalentes; test FuelFlow; corregido local |
| 14 | `javascript:S7773` | MINOR | `Frontend_1_FuelFlow/src/js/script.js:1417` | `const monto = Number.parseFloat(state.montoTexto \|\| '0');` | `Number.parseFloat/isNaN` equivalentes; test FuelFlow; corregido local |
| 15 | `javascript:S7773` | MINOR | `Frontend_1_FuelFlow/src/js/script.js:1419` | `if (!monto \|\| Number.isNaN(monto) \|\| monto < MONTO_MIN \|\| monto > MONTO_MAX) {` | `Number.parseFloat/isNaN` equivalentes; test FuelFlow; corregido local |
| 16 | `javascript:S3403` | MAJOR | `Frontend_1_FuelFlow/src/js/script.js:1453` | `const esFactura = state.tipoComprobante === 'FACTURA';` | Estado mutable inferido de forma limitada por SAST; revisar semántica por flujo; pendiente |
| 17 | `javascript:S3403` | MAJOR | `Frontend_1_FuelFlow/src/js/script.js:1492` | `const esFactura = state.tipoComprobante === 'FACTURA';` | Estado mutable inferido de forma limitada por SAST; revisar semántica por flujo; pendiente |
| 18 | `javascript:S3403` | MAJOR | `Frontend_1_FuelFlow/src/js/script.js:1493` | `const esPost = state.modalidad === 'POSTPAGO';` | Estado mutable inferido de forma limitada por SAST; revisar semántica por flujo; pendiente |
| 19 | `javascript:S3403` | MAJOR | `Frontend_1_FuelFlow/src/js/script.js:1519` | `$('mini-monto').textContent = state.modalidad === 'PREPAGO' ? 'S/ ' + state.montoP` | Estado mutable inferido de forma limitada por SAST; revisar semántica por flujo; pendiente |
| 20 | `javascript:S9383` | MAJOR | `Frontend_1_FuelFlow/src/js/script.js:1563` | `void procesarPago();` | Promesa revisada; `void` en tareas con manejo interno o callback; test FuelFlow; revisión Sonar pendiente |
| 21 | `javascript:S7737` | MINOR | `Frontend_1_FuelFlow/src/js/script.js:1567` | `function capturarPlaca(ids) {` | Default por `??=`; test FuelFlow; corregido local |
| 22 | `javascript:S3403` | MAJOR | `Frontend_1_FuelFlow/src/js/script.js:1640` | `function topeImporte() {` | Estado mutable inferido de forma limitada por SAST; revisar semántica por flujo; pendiente |
| 23 | `javascript:S3403` | MAJOR | `Frontend_1_FuelFlow/src/js/script.js:1650` | `function pintarInfoDespacho() {` | Estado mutable inferido de forma limitada por SAST; revisar semántica por flujo; pendiente |
| 24 | `javascript:S3403` | MAJOR | `Frontend_1_FuelFlow/src/js/script.js:1660` | `function simularDespacho() {` | Estado mutable inferido de forma limitada por SAST; revisar semántica por flujo; pendiente |
| 25 | `javascript:S3403` | MAJOR | `Frontend_1_FuelFlow/src/js/script.js:1667` | `$('despacho-titulo').textContent = t('despacho_title', { fuel: state.combustible.n` | Estado mutable inferido de forma limitada por SAST; revisar semántica por flujo; pendiente |
| 26 | `javascript:S9383` | MAJOR | `Frontend_1_FuelFlow/src/js/script.js:1694` | `pintarDespacho(esPre);` | Promesa revisada; `void` en tareas con manejo interno o callback; test FuelFlow; revisión Sonar pendiente |
| 27 | `javascript:S9383` | MAJOR | `Frontend_1_FuelFlow/src/js/script.js:1701` | `// llamada por cada tick del simulador.` | Promesa revisada; `void` en tareas con manejo interno o callback; test FuelFlow; revisión Sonar pendiente |
| 28 | `javascript:S3403` | MAJOR | `Frontend_1_FuelFlow/src/js/script.js:1746` | `: Promise.resolve(null);` | Estado mutable inferido de forma limitada por SAST; revisar semántica por flujo; pendiente |
| 29 | `javascript:S3403` | MAJOR | `Frontend_1_FuelFlow/src/js/script.js:1792` | `}` | Estado mutable inferido de forma limitada por SAST; revisar semántica por flujo; pendiente |
| 30 | `javascript:S3403` | MAJOR | `Frontend_1_FuelFlow/src/js/script.js:1821` | `if (state.estadoOperacion === 'INTERVENTION_REQUIRED') return;` | Estado mutable inferido de forma limitada por SAST; revisar semántica por flujo; pendiente |
| 31 | `javascript:S9383` | MAJOR | `Frontend_1_FuelFlow/src/js/script.js:1822` | `if (state.modalidad === 'POSTPAGO') mostrarConsumoPostpago();` | Promesa revisada; `void` en tareas con manejo interno o callback; test FuelFlow; revisión Sonar pendiente |
| 32 | `javascript:S3403` | MAJOR | `Frontend_1_FuelFlow/src/js/script.js:1863` | `const total=calcularTotales().total;` | Estado mutable inferido de forma limitada por SAST; revisar semántica por flujo; pendiente |
| 33 | `javascript:S3403` | MAJOR | `Frontend_1_FuelFlow/src/js/script.js:1863` | `const total=calcularTotales().total;` | Estado mutable inferido de forma limitada por SAST; revisar semántica por flujo; pendiente |
| 34 | `javascript:S3403` | MAJOR | `Frontend_1_FuelFlow/src/js/script.js:1864` | `transactionsService.prepare({plate:state.placa,stationId:catalog.station.id,fuelId` | Estado mutable inferido de forma limitada por SAST; revisar semántica por flujo; pendiente |
| 35 | `javascript:S3403` | MAJOR | `Frontend_1_FuelFlow/src/js/script.js:1938` | `$('t-modalidad').textContent = state.modalidad +` | Estado mutable inferido de forma limitada por SAST; revisar semántica por flujo; pendiente |
| 36 | `javascript:S9383` | MAJOR | `Frontend_1_FuelFlow/src/js/script.js:1949` | `});` | Promesa revisada; `void` en tareas con manejo interno o callback; test FuelFlow; revisión Sonar pendiente |
| 37 | `javascript:S3403` | MAJOR | `Frontend_1_FuelFlow/src/js/script.js:2035` | `function ponerPaso(id, num) {` | Estado mutable inferido de forma limitada por SAST; revisar semántica por flujo; pendiente |
| 38 | `javascript:S7773` | MINOR | `Frontend_1_FuelFlow/src/js/script.js:2128` | `function actualizarMontoPost() {` | `Number.parseFloat/isNaN` equivalentes; test FuelFlow; corregido local |
| 39 | `javascript:S7773` | MINOR | `Frontend_1_FuelFlow/src/js/script.js:2129` | `const n = Number.parseFloat(state.montoPostpagoTexto \|\| '0');` | `Number.parseFloat/isNaN` equivalentes; test FuelFlow; corregido local |
| 40 | `javascript:S7773` | MINOR | `Frontend_1_FuelFlow/src/js/script.js:2161` | `if (state.tanqueLleno) { hablar(t('voz_post_listo')); irAComprobante(); return; }` | `Number.parseFloat/isNaN` equivalentes; test FuelFlow; corregido local |
| 41 | `javascript:S7773` | MINOR | `Frontend_1_FuelFlow/src/js/script.js:2163` | `const err = $('monto-post-error');` | `Number.parseFloat/isNaN` equivalentes; test FuelFlow; corregido local |
| 42 | `javascript:S3403` | MAJOR | `Frontend_1_FuelFlow/src/js/script.js:2193` | `const ok = (id) => $(id).classList.add('hidden');` | Estado mutable inferido de forma limitada por SAST; revisar semántica por flujo; pendiente |
| 43 | `javascript:S3403` | MAJOR | `Frontend_1_FuelFlow/src/js/script.js:2198` | `// En postpago el DNI/placa ya vienen del padrón y el RUC es opcional.` | Estado mutable inferido de forma limitada por SAST; revisar semántica por flujo; pendiente |
| 44 | `javascript:S3403` | MAJOR | `Frontend_1_FuelFlow/src/js/script.js:2362` | `mode: state.modalidad,` | Estado mutable inferido de forma limitada por SAST; revisar semántica por flujo; pendiente |
| 45 | `javascript:S9383` | MAJOR | `Frontend_1_FuelFlow/src/js/script.js:2390` | `// El postpago nunca pasa por aquí: su saldo se reservó antes de abastecer.` | Promesa revisada; `void` en tareas con manejo interno o callback; test FuelFlow; revisión Sonar pendiente |
| 46 | `javascript:S3403` | MAJOR | `Frontend_1_FuelFlow/src/js/script.js:2390` | `// El postpago nunca pasa por aquí: su saldo se reservó antes de abastecer.` | Estado mutable inferido de forma limitada por SAST; revisar semántica por flujo; pendiente |
| 47 | `javascript:S9383` | MAJOR | `Frontend_1_FuelFlow/src/js/script.js:2683` | `$('dni-error').classList.add('hidden');` | Promesa revisada; `void` en tareas con manejo interno o callback; test FuelFlow; revisión Sonar pendiente |
| 48 | `javascript:S9383` | MAJOR | `Frontend_1_FuelFlow/src/js/script.js:2703` | `// 7. Resumen` | Promesa revisada; `void` en tareas con manejo interno o callback; test FuelFlow; revisión Sonar pendiente |
| 49 | `docker:S6470` | CRITICAL | `PlateRecognition/Dockerfile:6` | `COPY . .` | COPY recursivo: empaquetado Docker explícito pendiente (infraestructura) |
| 50 | `python:S4502` | CRITICAL | `PlateRecognition/app.py:16` | `app = Flask(__name__)` | Flask JSON con bearer de servicio, sin cookie de navegador; falso positivo contextual |
| 51 | `javascript:S2871` | CRITICAL | `PrintAgent/contract.mjs:1` | `const keys='schemaVersion,id,documentType,demo,issuedAt,station,pump,plate,dni,ruc` | Comparador `localeCompare`; test de módulo; corregido local |
| 52 | `javascript:S2871` | CRITICAL | `PrintAgent/contract.mjs:5` | `if(!r\|\|typeof r!=='object'\|\|Array.isArray(r)\|\|Object.keys(r).sort((a,b)=>a.localeC` | Comparador `localeCompare`; test de módulo; corregido local |
| 53 | `javascript:S5332` | MINOR | `PrintAgent/transport.mjs:4` | `export const AGENT_URL='http://'+AGENT_AUTHORITY;` | HTTP restringido a Docker/localhost; justificar con topología y TLS externo; sin cambio |

## ZAP — alertas originales y clasificación

Los seis HTML y JSON se abrieron; cinco baseline staging suman 36 WARN/0 FAIL y cubren contenido público, Backend/OCR principalmente health. El JSON local registra caché informativa pese a 0 WARN de consola. Clasificación por regla, no por supuesta explotación:

| Regla | Ámbito observado | Clasificación y tratamiento | Estado/prueba |
|---|---|---|---|
| `10038` | Prime, Control, FuelFlow, OCR | Configuracional: CSP de páginas HTML por Vercel; OCR JSON/404 no requiere la misma CSP. Proponer política tras probar cámara, estilos y scripts. | Pendiente; baseline pasivo |
| `10098` | Prime, Control, FuelFlow | Configuracional en assets públicos con `Access-Control-Allow-Origin: *`; revisar respuestas autenticadas por proxy antes de cambiar Vercel. | Pendiente; evidencia de encabezado en JSON |
| `10020` | Tres frontends | Configuracional: proponer `frame-ancestors`/X-Frame-Options en capa web. | Pendiente, infraestructura |
| `90004` | Tres frontends y OCR | Configuracional/informativa: COEP/COOP/CORP deben probarse con cámara, imágenes y conexiones; no imponer aislamiento a API JSON. | Pendiente |
| `10063` | Tres frontends y OCR | Configuracional: política de permisos con `camera=(self)` para FuelFlow y cámara denegada donde no se use. | Pendiente |
| `10049` | Todos y API local | Informativa de caché; assets públicos pueden cachearse, datos sensibles requieren no-store. | Pendiente de respuesta autenticada |
| `10015` | Cinco servicios | Informativa; revisar directivas concretas por recurso. | Pendiente |
| `10050` | Tres frontends | Informativa, assets recuperados de caché; no explotación. | Justificado |
| `10109` | Control y FuelFlow | Informativa, detección SPA. | Justificado |
| `10027` | FuelFlow | Falso positivo contextual: siete coincidencias son comentarios de sección/código y texto demo; no se observó secreto en evidencias. | Revisado en JSON original |
| `10035` | OCR | Configuracional: HSTS en terminación TLS Render, comprobar sin alterar infraestructura ahora. | Pendiente |
| `10021` | OCR | Configuracional: `nosniff` en respuesta del servicio/proxy. | Pendiente |

## QA funcional — estado por hallazgo

| Hallazgo | Severidad | Código/área | Resultado y prueba | Estado |
|---|---|---|---|---|
| DEF-QA-001 | Alta | Control + Backend operaciones | Acción visible y confirmación; API comprueba alcance, reservas y audita. Falta interacción real. | Parcial |
| DEF-QA-002 | Alta | Backend kiosk | Rotación atómica y reutilización del token actual; unitario 11/11. VM/PC física simultáneas pendiente. | Parcial |
| QA-IMP | Alta | FuelFlow + Backend cierre | Continuar sin imprimir evita PrintAgent y conserva guardas; causa exacta del bloqueo QA no reproducida en sandbox. Hardware pendiente. | Parcial |
| QA-OCR | Alta | FuelFlow cámara + Backend OCR | Dos capturas coincidentes; archivo y formato de placa intactos. Webcam/503 real pendientes. | Parcial |
| QA-PERF | Alta demo | Render Backend/OCR | No hay mediciones primer/segundo request permitidas; cold start es hipótesis basada en handoff. | Pendiente |
| QA-ASSIST-F | Media | FuelFlow asistencia | X minimiza, cancelar confirma, resuelta visible; test asistencia pasa. | Parcial |
| QA-ASSIST-C | Media | Control asistencia + Backend | Nombre de estación, motivos y eventos humanos; acciones UI simplificadas; 7/7. | Parcial |
| QA-ESTADOS | Media | Control terminal | Estados existentes se muestran, pero estado CERRADA requiere modelo/decisión operativa. | Pendiente |
| QA-VEH-EMPTY | Baja/media | FuelFlow `apiClient.js`/`script.js`/`plateCamera.js` | Se encontró un listener de cambio capaz de consultar placa vacía; ahora valida antes de la llamada y el catálogo rechaza cualquier placa inválida sin `fetch`. | Corregido local; test FuelFlow |
| QA-NUM | Media | Backend/Control comprobantes | Secuencia transaccional requeriría diseño de BD y migración; prohibida ahora. | Pendiente |
| QA-ACC-DIS | Media | Control cuentas | Confirmación y contraseña en UI; Backend reautentica, marca `active=false`, incrementa `authVersion`, revoca grants/alcance, audita y prohíbe autodeshabilitación. Unitario 10/10; prueba integrada pendiente. | Parcial |
| QA-GRANTS | Baja | Control permisos | Tabla y diálogo de edición usan etiquetas/categorías humanas compartidas con el alta. Alineación visual en navegador pendiente. | Parcial |
| QA-UX-FUEL | Baja | FuelFlow estilos | X asistencia estilizada; franja responsive pendiente. | Parcial |
| QA-FAVICON | Baja | Frontends | 404 no corregido; requiere asset/design. | Pendiente |
| QA-DOC-AUTH | Seguridad | Backend guards/Swagger | Control usa actor y chequeos de alcance en rutas revisadas; documentación Swagger pendiente. | Parcial |
| QA-LEGACY | Arquitectura | Backend supervisor-* | No se eliminaron rutas sin mapa de consumidores/historial. | Pendiente |
| QA-PRIME-DEUDA | Regresión | Prime/Backend | Sin BD local aislada ni batería de casos, pendiente. | Pendiente |
| QA-VEH-UNIQUE | Regresión | Prime/Backend | Regla a verificar con datos aislados; pendiente. | Pendiente |
| QA-PRINT-FIS | Integración | PrintAgent | Pruebas físicas y HTTP bloqueadas por entorno; pendiente. | Pendiente |

## Regresión y coordinación posterior

1. Preparar PostgreSQL local **aislado** y Redis de prueba; comprobar destino con helper antes de `test:e2e`. Ejecutar casos de prepago/postpago, autorización/reserva, cierre sin impresora, bootstrap entre dos navegadores, recuperación residual, asistencia, deuda Prime y vehículo único. No ejecutar sobre datos compartidos.
2. En hardware, medir OCR webcam con OCR frío y caliente (primer y segundo request) y PrintAgent con/sin impresora; registrar tiempos y HTTP. Repetir carga de archivo `ABC-123`. Separar cold start de latencia persistente.
3. Revisar pendientes de seguridad con propietario de infraestructura: headers Vercel/Render, Docker COPY, TLS local y Swagger; reanalizar Sonar y ZAP **pasivo local**. Confirmar cada alerta con respuesta relevante, no con conteos.
4. Si se aprueba numeración, diseñar contador/secuencia transaccional y rollback, probar migración solo en BD local aislada; antes de Neon solicitar restore point y aprobación específica. Ninguna migración se aplicó aquí.
5. Checklist posterior a aprobación humana: revisar diff y secretos, tests completos en entorno apto, aprobación de merge/push; desplegar coordinadamente Vercel FuelFlow/Prime/Control y Render Backend/OCR; ejecutar QA final y ZAP pasivo en ventana autorizada. Este archivo no autoriza esas acciones.

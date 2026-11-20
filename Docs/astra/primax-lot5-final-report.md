# Lote 5 — validación integral y evaluación académica

Fecha: 20/11/2026. Referencia comprobada: `9d57edea9bf047ac8e5d05833ec752bb82572591`, rama `feat/dezkz-identity-a4-core`.

**Actualización posterior al commit 945abd:** Docker Desktop restablecido; original 15 healthy/dos jobs exit 0. Nueva reproducción T02 confirma `catalog` undefined en frontend, bandera creatingOrder persistida y pago capturado sin autorización/venta/comprobante. Dos reintentos UI y replay de la misma confirmación no duplican registros. No se aplicó corrección funcional. Véase [diagnóstico completo y propuesta pendiente de autorización](primax-lot5-t02-diagnostic.md). Las menciones siguientes a Docker inaccesible describen la sesión anterior, no su estado posterior a esta intervención. Lote 5 sigue abierto.

**Resultado tras reanudar: verificaciones locales disponibles documentadas y auditadas; Lote 5 y cierre integral pendientes.** Hay dos impedimentos diferentes: una incidencia P1 funcional de recuperación en FuelFlow T02 y la ejecución real en hosts Linux/macOS exigida por 3J (§7, §8.10 y §10.6), sin infraestructura disponible. Windows con contenedores Linux amd64 acredita el recorrido normal demo y las regresiones indicadas, con las limitaciones descritas. No se cambia el criterio de aceptación ni se presume aceptación académica de la incidencia. No se declara autonomía productiva ni equivalencia universal.

## Cumplimiento

| Criterio | Dictamen | Evidencia y alcance |
|---|---|---|
| Cuatro microservicios hexagonales | Aprobado | 115 contratos: Identity 26, Catalog 6, Administration 37, Commerce 46. Puertos/adaptadores existentes, fuentes sin cambios, 22 familias de regresión y 115 resoluciones Gateway verificadas. |
| Tres frontends | Aprobado con limitaciones | Prime y Control operados con Chromium real; T02 venta e impresión demo completas. T01 solo carga/identidad. Recuperación T02 pendiente: subcriterio bloqueado. |
| API Gateway | Aprobado | 24 pruebas, rutas 115/115, salud agregada y tráfico real de las aplicaciones. |
| PostgreSQL y Redis | Aprobado | PostgreSQL 17.6 única por instalación, 36 migraciones, 41 tablas, claves foráneas validadas; Redis PONG y persistencia real. |
| Docker Compose | Aprobado en entorno probado | Dos instalaciones limpias aisladas: `up -d`, 15 healthy y 2 jobs código 0; reinicio de la segunda conserva datos. |
| Funcionalidad original | Aprobado con limitaciones | 22 comparaciones canónicas sin diferencias; el fallo UI ya existe en la fuente de referencia sin modificar. No se certifican todos los estados posibles. |
| Seguridad | Aprobado con limitaciones | JWT, versiones, sesiones, CSRF, firmas, permisos y aislamiento en fixtures; 15 sondas HTTP reales. Persisten las excepciones documentadas. No es una auditoría completa. |
| Entorno Windows y contenedores Linux amd64 | Aprobado con limitaciones | Host Windows y runtime Linux amd64 realmente ejecutados; recuperación T02 falla. |
| Portabilidad multiplataforma exigida por 3J | Pendiente | Linux nativo y macOS sin ejecución real; ARM64 tampoco construido/ejecutado. El análisis estático no cumple §8.10/§10.6. |
| Dependencias e incidencias | Aprobado con limitaciones | Motores, AuthCore, Prisma, PostgreSQL y bootstrap compartidos; incidencias en documento separado. |

## Resultados contables

| Grupo ejecutado | Aprobadas | Fallidas |
|---|---:|---:|
| Jest backend, 60 suites | 576 | 0 |
| Inicialización/seed segura | 8 | 0 |
| Gateway | 24 | 0 |
| Empaquetado | 9 | 0 |
| FuelFlow / Prime / Control / PrintAgent | 172 / 31 / 38 / 56 | 0 |
| OCR Python | 12 | 0 |
| HTTP pareado referencia/candidato, 22 familias | 2570 | 0 |
| Seguridad HTTP en Compose real | 15 | 0 |
| Casos agrupados en navegador real | 15 | 1 |
| **Total de comprobaciones** | **3526** | **1** |

No son 3527 endpoints ni pruebas independientes de toda la funcionalidad. Los 2570 checkpoints incluyen ambos brazos (1285 cada uno). Además, sin sumarlos otra vez: 22 comparaciones de snapshots, 115 resoluciones de rutas, cinco compilaciones y comprobaciones de infraestructura. Un fallo esperado HTTP 400/401/403/409/500 dentro de un escenario negativo puede ser una prueba aprobada. El fallo UI T02 es una prueba funcional fallida real.

El primer intento del harness de clientes omitió dependencias compartidas al copiar los tests y produjo tres fallos de infraestructura de pruebas. Se corrigió únicamente el harness: se copian los cuatro proyectos y la política de kiosco antes de ejecutar, con 297/297 en la repetición. La primera aserción del harness de persistencia contó el marcador de volumen como trabajo de impresión; se corrigió el filtro a `receipt-*.json` antes del reinicio. Ninguna de estas correcciones modificó aplicaciones.

## Comparación e integridad

Administration y regresiones Identity/Catalog: access 36, accounts 39, supervision 43, operations 55, inventory 61, customers 90, profile 42, security 31, kiosk 26, admin-ocr 46, catalog 29 checkpoints por brazo: 498. Commerce: 787 por brazo, detallados en `paired-families.json`. Cada brazo usó PostgreSQL 17.6, Redis y volúmenes nuevos con datos sintéticos. Los proveedores financieros externos se simulan; OCR real se comprueba aparte. Los runners reutilizan escenarios del repositorio y vuelven a ejecutarlos: los resultados anteriores no se cuentan como nuevas pruebas.

Baseline y candidato proceden de la referencia aceptada y del árbol actual, respectivamente. Como no se cambian motores ni frontends, esta comparación demuestra reproducibilidad de los casos ejecutados, no una reparación del defecto encontrado ni independencia del motor legacy. Se normalizan UUID generados y tiempos; se conservan estados, importes, relaciones, secuencias y verificación de TTL positivo. Los manifiestos conservan sus reglas.

Git fsck de conectividad pasó; los cuatro commits de referencia anteriores son ancestros. Las nueve evidencias históricas mantienen SHA-256 y no se incorporan al índice. Demo de exposición: 20 contenedores con IDs, imágenes, inicios, reinicios y montajes sin cambios. Instalación original Lote 4: 17 igualmente intactos. No se lee ni escribe una base operativa, no se monta la copia de exposición ni se ejecutan limpiezas globales.

## Hallazgo que impide el cierre sin reservas

En T02 recién inicializado, seleccionar Regular → PREPAGO S/20 → BOLETA → placa ABC-123 reconocida por OCR → YAPE demo. Con orden pendiente, recargar, pulsar INICIAR y confirmar pago. La orden vuelve a mostrarse con total `—`; después aparece `Cannot read properties of undefined (reading 'station')` y «No se pudo autorizar el despacho». PostgreSQL conserva un pago DEMO CAPTURED de 20 y cero transacciones. No se volvió a pagar ni se forzó recuperación.

La instalación `primax-astra-lot5-63bb6fca` se detuvo, conservando volúmenes y evidencia. Se infiere una falta de rehidratación de `catalog` en la recuperación: el inicio normal lo carga y la autorización usa `catalog.station`. Es una hipótesis apoyada por código y error visible, no una corrección verificada. La fuente es idéntica a la referencia; se clasifica como **hallazgo nuevo de un defecto presente en la referencia**, separado de T01 y de regresiones introducidas por este lote.

En una segunda instalación nueva, sin recarga, T02 completó una venta YAPE demo de 20, boleta EB01-0001, reserva CLOSED, inventario descontado una vez y un trabajo de impresión simulado. Reiniciar los contenedores mantuvo exactamente esos registros. Esto no valida el escenario fallido.

## Entrega y continuidad

Consultar [frontends](primax-lot5-frontends.md), [seguridad e integridad](primax-lot5-security-integrity.md), [portabilidad](primax-lot5-portability.md), [inventario](primax-lot5-inventory.md), [manual](primax-lot5-installation.md), [demostración](primax-lot5-demo-guide.md), [incidencias](primax-lot5-known-incidents.md) y [matriz 115](primax-lot5-contracts-115.md).

Las modificaciones se limitan a verificaciones y documentación. No hay cambios de aplicación, Compose, frontends, Gateway, motores, políticas, Prisma ni migraciones. El usuario autorizó al reanudar un **commit local de verificaciones y documentos, con los criterios pendientes expresos**; no es un commit de cierre académico. No hay push ni merge. El Lote 5 permanece pendiente; no se corrige el flujo financiero ni se alteran evidencias para convertir el fallo T02 en aprobado.

## Reanudación: qué estaba completo y qué se terminó ahora

Se ejecutó git status antes de modificar: rama esperada, HEAD de referencia, sin cambios versionados ni staging; estaban sin seguimiento los siete documentos, cinco runners Lote 5, evidencia Lote 5 y las nueve evidencias históricas. Se leyeron los siete documentos y los requisitos originales de Lote 5 en 3J (§6, §8, §10). No se reinició el lote.

| Trabajo | Antes de reanudar | En esta sesión |
|---|---|---|
| Backend y builds | 576 Jest/60 suites, 8 init, 24 Gateway, 9 packaging y cinco compilaciones ejecutados | Contrastados resultados con Jest JSON, TAP, logs y estado de fuentes; no reejecutados |
| Clientes/OCR | 297 tests clientes/PrintAgent y 12 OCR ejecutados | Conteos y exit codes respaldados por logs originales; no reejecutados |
| PostgreSQL/Redis y comparación | 22 pares/2570 checkpoints, aislamiento, rollback/replay/concurrencia ejecutados | Snapshots canónicos vueltos a comparar; 24 376 archivos de los 44 snapshots de fuentes contrastados con la referencia preservada |
| Frontends reales | 16 casos agrupados: 15 aprobados, uno fallido; capturas y SQL | Artefactos públicos iguales a originales; capturas contrastadas con SHA-256; el fallo no se reclasifica como aprobado |
| Compose y persistencia | Dos arranques nuevos; reinicio principal con SQL/Redis/print conservados y dump generado | Inventario documental completado y dump cotejado por tamaño/hash; sin nuevo reinicio ni acceso a datos |
| Seguridad HTTP | 15 sondas aprobadas en el Compose sintético | Resultados originales contrastados; revisión de secretos detectó y retiró una contraseña de laboratorio del comando Redis en la copia pública del inventario, conservando el original privado |
| Matriz maestra/inventario | JSON de 115 existente; documentos Markdown referenciados ausentes | Matriz maestra, trazabilidad ampliada y manifiesto de inventario elaborados y comprobados |
| Integridad y cierre | Informe provisional y hashes anteriores | Auditoría reproducible, límites corregidos, plan 3J actualizado y evaluación académica explícita |

Los 3526 aprobados y un fallo son **ejecuciones anteriores reutilizadas**. La reanudación aporta auditorías y documentos, no 3526 pruebas funcionales adicionales. Las 24 376 comparaciones de fuentes aceptan solo diferencias CRLF/LF registradas de copias baseline hechas con git show; no normalizan código, reglas o importes. Los 22 pares se recomparan con las mismas reglas canónicas de sus runners.

El único saneamiento de evidencia funcional fue reemplazar la contraseña Redis literal por `<redacted:REDIS_PASSWORD>` en `persistence-inventory.json`, campo command del servicio redis. El original `lifecycle-results.json` sigue privado en .cache y se conserva su hash; el auditor verifica igualdad de todos los demás campos. El archivo público aún no estaba versionado. No se rotaron credenciales ni se cambió el contenedor; el hallazgo corresponde a preparación de evidencia, no a una brecha de aplicación comprobada. La entrega se escanea contra las claves aleatorias de ambos laboratorios, bloques de clave privada y JWT completos.

## Límites actuales del entorno y ausencia de regresiones introducidas

Al reanudar, `docker version` no pudo conectar con `dockerDesktopLinuxEngine` (canal inexistente). No se inició el motor, ni se arrancaron o detuvieron contenedores. Por ello, 15 healthy/2 jobs, integridad de los 20 contenedores de exposición y 17 del original, y comportamiento HTTP son resultados de la ejecución anterior conservada, **no mediciones actuales**. El estado actual de esos contenedores queda sin revalidar. No se repiten pruebas costosas válidas para sustituir la falta de motor.

La auditoría contrasta los 1508 archivos versionados iniciales: únicamente se permite la actualización documental 3J; las aplicaciones, fixtures, Compose, AuthCore, Gateway, Prisma y migraciones permanecen byte a byte. Las nueve evidencias históricas conservan hash y estado sin seguimiento. Git fsck pasa. Esta evidencia acredita ausencia de cambios de aplicación introducidos por el lote; no implica que no existan defectos anteriores o que se haya repetido la ejecución con el motor apagado. La recuperación T02 sigue siendo un fallo observado sobre la fuente de referencia, sin reparación ni repetición del pago.

## Criterios académicos aún pendientes

| Criterio | Estado al entregar | Evidencia necesaria para aceptarlo |
|---|---|---|
| Recuperación T02 tras recarga con pago pendiente | Fallido, P1; no aceptado como limitación por el responsable | Corrección autorizada y ensayo nuevo aislado de recuperación, mismo operationId sin duplicar cobro/venta/stock; o decisión académica explícita que no se presume aquí |
| Host Linux nativo | Pendiente por falta de infraestructura | Protocolo completo de portabilidad del documento específico, CPU/engine/Compose, instalación y flujos reales, reinicio/persistencia/parada |
| Host macOS | Pendiente por falta de infraestructura | Mismo protocolo, declarando Intel/Apple Silicon y ejecución nativa o emulación |
| ARM64 nativo | No construido ni ejecutado | Build y ejecución Prisma/bcrypt/OCR y flujos en ARM64, si corresponde al Mac objetivo; no sustituir por emulación amd64 |
| Aceptación de los cinco lotes/excepciones, 3J §10.1/§10.3 | No consta decisión académica final en esta sesión | Revisión del responsable de rúbrica, límites legacy y pendientes; un commit documental no satisface esta aceptación |

T01, TARJETA, proveedores y hardware mantienen sus límites históricos. Restauración completa es alcance no ensayado y no se presenta como requisito satisfecho; no se restaura sobre recursos existentes. No se abre una migración, refactorización o proyecto adicional. La evaluación estática y el protocolo posterior están en [portabilidad](primax-lot5-portability.md); la prueba reproducible de auditoría es `node tools/astra/lot5-resume-audit.cjs` y su resultado está en [resume-audit.json](evidence/lot5-validation/resume-audit.json).

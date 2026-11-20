# Astra — Etapa 2B: integración aislada de las imágenes independientes

Fecha: 2026-11-18. Rama `feat/dezkz-identity-a4-core`. HEAD inicial y final: `f05027ff86f5a03aba12ffeb528f2d001209d747`.

**Resultado: los casos seleccionados de integración funcionaron con las cuatro imágenes nuevas. La entrega queda con observaciones; no se declara un cierre integral sin incidencias ni se autoriza Etapa 3.** El smoke histórico sin adaptar falló en su harness de impresión; además hubo tres cierres forzados de auxiliares al detener el entorno. Se conservó una operación sintética abierta para diagnóstico. Estos resultados no se ocultan dentro de un conteo global de pruebas correctas.

## 1. Preparación e integridad

Se verificaron rama, HEAD, árbol inicial limpio, ausencia de staging y presencia intacta de los commits documentales/de empaquetado. Los once hashes de entradas registrados por Etapa 2 coincidieron. Los identificadores de las cuatro imágenes se comprobaron contra `Docs/astra/evidence/stage2-independent-packaging.json` antes del arranque.

No se modificaron archivos versionados: Compose operativo, Dockerfiles de servicios, Gateway, frontends, AuthCore/PasswordReset, schema/migraciones, lógica financiera y evidencias anteriores permanecen intactos. Sólo se crearon herramientas privadas de validación y evidencias nuevas. No se reabrió A.4, no se inició Etapa 3 y no se hicieron commits, push ni merge.

## 2. Entorno y aislamiento

Proyecto exclusivo: `primax-astra-stage2b-272b482a5f`.

| Recurso | Configuración de la prueba |
|---|---|
| PostgreSQL | `postgres:17.6-bookworm`, base nueva `stage2b_synthetic`, usuario sintético `stage2b`, sin puerto publicado |
| Redis | `redis:7.4-alpine`, instancia y AOF nuevos, sin puerto publicado; namespace exclusivo del proyecto |
| Volúmenes nuevos | `primax-astra-stage2b-272b482a5f_postgres_data`, `_redis_data`, `_print_data` |
| Red de datos | Nueva, interna, `10.253.212.0/26`; dominios/PG/Redis/OCR/print sin salida exterior por esa red |
| Red web entre contenedores | Nueva, interna, `10.253.212.64/27` |
| Red edge | Nueva, `10.253.212.96/27`, sólo Gateway y contenedores de frontends; permite publicar puertos loopback |
| Puertos | Gateway 29100, FuelFlow T01 29181, Prime 29182, Control 29183, FuelFlow T02 29184; todos en `127.0.0.1` |
| Credenciales | Generadas aleatoriamente para esta prueba; no se reutilizaron contraseñas, claves o sesiones operativas |
| Pagos/correo/impresión | PAYMENT_ENV=demo, wallet demo habilitada, PasswordReset delivery disabled; PrintAgent demo, sin impresora ni dispositivo físico |

Las credenciales y cookies sintéticas de diagnóstico sólo están en `.cache/astra-stage2b/`, ignorada por Git. La configuración archivada en [compose-isolated-redacted.json](evidence/stage2b/compose-isolated-redacted.json) oculta esos valores y sustituye las rutas absolutas del repositorio. Es evidencia, no un Compose ejecutable.

El harness usa un entorno CLI limitado y `--env-file` vacío; no carga el `.env` operativo. Rechaza recursos externos, bind mounts en el stack, container_name fijo, puertos ajenos y URLs de base distintas de la sintética. Antes de crear recursos se comprobaron nombres de redes/volúmenes inexistentes y puertos libres. No se borraron redes/volúmenes anteriores.

### Ajustes exclusivos de la configuración de prueba

El primer intento encontró el pool automático de subredes Docker agotado. Se comprobaron rangos libres contra las redes Docker y rutas del host y se asignaron subredes pequeñas explícitas. No se limpió el pool ni se eliminaron recursos existentes.

Con sólo redes internas, Docker no publicó los puertos aunque los contenedores estaban saludables. Se añadió la red edge exclusiva y se recrearon únicamente Gateway/frontends de esta prueba. PostgreSQL, Redis y los cuatro dominios permanecieron en la red de datos interna. Se corrigió asimismo el escape del hash bcrypt al serializar la configuración del harness; no cambió ninguna política de autenticación.

La URL de T02 y los orígenes/CORS se parametrizaron con los puertos propios de esta prueba. Estos ajustes no se aplicaron al Compose operativo.

## 3. Inicialización revisada y ejecutada

Se inspeccionaron los scripts y sus protecciones antes de permitirlos. Se ejecutaron únicamente en la instancia sintética nueva:

1. `migrate`: `npm run prisma:migrate`, con el wrapper local existente y las 36 migraciones existentes.
2. `seed`: `node scripts/seed-local-demo.cjs`, que invoca el seed compilado existente; crea cuenta demo, membresía/códigos, vehículos ficticios, combustibles/precios, estación, beneficios y stock inicial. No se habilitó RESYNC_DEMO_PASSWORD.
3. `seed-control-admin`: bootstrap demo de un usuario global sintético, con comprobaciones local/demo/database-purpose.
4. `seed-operations`: encargado, grants, estación, dos terminales y asignaciones a surtidores 03/04 de demostración.

Los cuatro jobs terminaron con código 0. La base inicial tenía cero Transaction, Payment y Receipt; luego constaban 36 migraciones terminadas. No hubo migraciones ni seeds contra una base existente, ni durante las pruebas de reinicio.

Para Gateway y jobs de inicialización se reutilizó la imagen **de código**, no datos ni credenciales, `primax-astra-stage2-baseline:test`. Los cuatro dominios candidatos ejecutaron su CMD propio de `primax-astra-{servicio}:stage2`. OCR, BFF, frontends y PrintAgent se construyeron desde sus Dockerfiles existentes con tags exclusivos del proyecto.

## 4. Pruebas y resultados reales

| Área solicitada | Comprobación | Resultado |
|---|---|---|
| Arranque | Quince contenedores de ejecución saludables, incluidos cuatro dominios y Gateway; cuatro jobs de inicialización exit 0 | Correcto |
| Enrutamiento | Health agregado, rutas por dominio, cuatro Swagger separados; auth no aparece en dominios ajenos | Correcto en smoke adaptado y paridad |
| PostgreSQL | Arranque Prisma real, migraciones, registro, stock, ventas, comprobantes, consultas SQL READ ONLY | Correcto en base nueva |
| Redis | Sesiones/bindings técnicos reales, CSRF y credenciales; marcador en namespace del proyecto y AOF tras reinicio | Correcto |
| Tres frontends | HTML de FuelFlow/Prime/Control por sus proxies; navegador Chromium con login y reload de Prime/Control | Correcto |
| FuelFlow en navegador | Compra T02, tarjeta demo, comprobante, impresión demo y retorno a inicio | Correcto en ejecución final; cero pageerror |
| Registro/auth | Alta sintética, duplicado 409, login válido, password incorrecto 401; JWT y cookie Control vigentes tras reinicio | Correcto |
| Combustibles/precios | Catálogos y REGULAR/PREMIUM/DIESEL; JSON conserva `21.3`, `23.5`, `26.2`; autorización conserva precio `21.30` | Correcto, sin reformatear producto |
| Administración | Consulta autorizada; abastecimiento de 10 L, replay del mismo movimiento y conflicto con litros distintos; catálogo privado/auditoría | Correcto, candidato y referencia |
| Ventas/pagos | PREPAGO tarjeta demo; techo de avance; cierre y replay de la misma venta sin duplicarla; Payment CAPTURED | Correcto en casos seleccionados |
| Inventario/transacciones | Stock/ledger del flujo LEGACY y abastecimiento; cinco ventas/pagos/comprobantes, cero transacciones duplicadas ni recibos huérfanos | Correcto; no prueba todos los modos de inventario |
| OCR | Fixture local ABC-123, OCR real en contenedor y vínculo del vehículo demo | Correcto |
| Impresión demo | Mismo job al repetir, payload distinto 409, simulation=true y physicalConfirmed=false | Correcto; cuatro jobs JSON persistidos, verificados después de detener |
| Rechazos | Sin JWT 401; miembro sin permiso administrativo 403; propietario ajeno rechazado; webhook sin secreto 401; CSRF inválido 403; credencial sustituida rechazada | Correcto |
| Reinicio | Parar apps, reiniciar PG/Redis, esperar health, arrancar apps sin jobs de init; snapshot financiero idéntico y AOF conservado | Correcto |
| Parada final | Cuatro dominios, PG/Redis, Gateway y frontends exit 0; dos BFF y PrintAgent exit 137, OOMKilled=false | Observación pendiente |

Las herramientas adicionales emitieron 16 solicitudes/assertions correctas en candidato y las mismas 16 en referencia. El navegador final observó 58 respuestas API, validó login/reload en Prime/Control y compra/impresión en FuelFlow; no equivale a 58 casos de prueba independientes. Se ejecutó Chromium `156.0.8078.4` mediante Playwright 1.64.0 instalado sólo en la cache privada. No se usaron servicios de navegador externos.

Capturas sintéticas revisadas: [Prime](evidence/stage2b/prime.png) y [Control](evidence/stage2b/control.png). Las capturas completas de intentos y FuelFlow permanecen en la cache de diagnóstico; la de FuelFlow se tomó durante una transición visual, por lo que no se presenta como evaluación de calidad visual.

### Fallos del harness y evidencia conservada

El smoke histórico `tools/smoke-microservices.cjs` **no pasó sin cambios**: `thermalReceipt(sale.transaction)` omite el `confirmedPumpCode` obligatorio. La primera venta ya había sido confirmada, por lo que no se repitió esa misma operación ni se borraron sus datos para obtener un PASS. Se creó un adaptador privado nuevo que obtiene el pumpCode por `/terminal/me`, como el frontend actual, preservando el script histórico. El adaptador pasó completo contra las imágenes nuevas y contra el build anterior.

La primera operación T01 queda ACTIVE, con venta/pago/comprobante confirmados, cero reservas pendientes y referencias conservadas. Se dejó para diagnóstico; no se reconstruyeron credenciales, no se forzó su cierre ni se modificaron filas SQL. Las ejecuciones posteriores usaron T02 y cerraron sus propias operaciones. Una operación diagnóstica abierta no debe confundirse con una venta duplicada o un recibo perdido.

En el test adicional se corrigieron dos expectativas del propio fixture: faltaba el label obligatorio de Vehicle y se esperaba un formato decimal con ceros que el catálogo no devuelve. El producto no se cambió. El primer intento de navegador completó compra/impresión, pero falló por tres errores del inicializador de test al acceder a storage en documentos sin origen; se limitó el inicializador a localhost. El intento final pasó sin errores de página. Se conservaron también los datos de las ejecuciones fallidas.

### Estado financiero sintético final

Cinco Transaction, cinco Payment y cinco Receipt; cero duplicados de operationId en Transaction, cero Receipt huérfanos y cero InventoryReservation pendientes. Cuatro jobs de impresión demo guardados. El stock Regular final es `5001.534754` litros, con `0.000000` reservados, después de dos abastecimientos de 10 L y los despachos de prueba; los otros dos pares permanecen en 5000 L. Los cinco comprobantes corresponden a operaciones sintéticas distintas, incluidas las de los intentos de harness que se conservaron.

Antes y después del reinicio coincidieron por completo los snapshots seleccionados: membresías/UUID/códigos/saldos, cantidades, inventario, y el digest de Transaction, Payment, Receipt, WalletMovement e InventoryMovement (`6c9ae36c8f183a7e1cbb38c4f0b33ecb`). Ese digest es un control de igualdad durante esta prueba, no una prueba criptográfica de procedencia independiente o restauración productiva.

## 5. Comparación con la implementación anterior

Se detuvieron los cuatro candidatos antes de levantar los mismos cuatro servicios con `primax-astra-stage2-baseline:test` y `node dist/src/apps/<servicio>/main.js`, usuario node. Nunca hubo dos ejecutores simultáneos del mismo dominio. Se mantuvieron la misma base sintética, claves de prueba y auxiliares. Es una comparación secuencial sobre el mismo conjunto de datos, no dos restauraciones ni dos bases idénticas recién creadas.

El smoke adaptado y los 16 checks adicionales pasaron en la referencia. Luego se capturaron 14 respuestas y se restauraron las imágenes candidatas. Se compararon status y cuerpos JSON completos, sin normalizar UUID, números de comprobante o relaciones:

- Health, fuels, stations y benefits.
- Membership actual e historial del miembro demo.
- La transacción previamente creada por el candidato, leída en ambos empaquetados.
- Inventario privado Control, listado de transacciones y comprobante de esa venta.
- Los cuatro documentos Swagger.

Las 14 respuestas coincidieron exactamente; los 16 estados de solicitudes adicionales también. El JWT y la cookie emitidos en la referencia continuaron válidos al volver al candidato y después de reiniciar.

No se detectó una diferencia de negocio en estos casos. La referencia es el build amplio de Etapa 2 con dependencias de desarrollo, no una reproducción certificada de un despliegue productivo antiguo. Las incidencias de red/harness y parada se informan por separado; no se atribuyen sin evidencia a la compilación independiente.

## 6. Contenedores y conservación

Los 19 contenedores del proyecto quedaron detenidos. Se conservaron contenedores, imágenes, tres volúmenes y tres redes exclusivas; no se ejecutó down, prune ni eliminación de volúmenes. Durante ejecución hubo 15 healthy y cuatro jobs completados.

| Servicio Compose | Antes de detener | Estado final / exit |
|---|---|---|
| identity-service | healthy | exited / 0 |
| catalog-service | healthy | exited / 0 |
| administration-service | healthy | exited / 0 |
| commerce-service | healthy | exited / 0 |
| backend (Gateway) | healthy | exited / 0 |
| postgres | healthy | exited / 0 |
| redis | healthy | exited / 0 |
| plate-recognition | healthy | exited / 0 |
| print-service | healthy | exited / 137, sin OOM |
| fuelflow-gateway | healthy | exited / 137, sin OOM |
| fuelflow-gateway-t02 | healthy | exited / 137, sin OOM |
| frontend1 | healthy | exited / 0 |
| fuelflow-t02 | healthy | exited / 0 |
| frontend2 | healthy | exited / 0 |
| frontend3 | healthy | exited / 0 |
| migrate | completed | exited / 0 |
| seed | completed | exited / 0 |
| seed-control-admin | completed | exited / 0 |
| seed-operations | completed | exited / 0 |

Los tres exits 137 ocurrieron al agotarse el plazo de parada; Docker indicó OOMKilled=false y sin State.Error. Los auxiliares afectados no fueron modificados en Etapa 2B. No se declara por ello una parada limpia de todo el stack. Los cuatro trabajos demo se pudieron leer desde el volumen de impresión montado **sólo lectura** en un contenedor temporal sin red, ya eliminado al terminar; ningún trabajo llegó a hardware real.

## 7. Dependencias, pendientes y cambios mínimos antes de Etapa 3

Continúan compartidos fuentes, lock/dependencias, bootstrap y validación global, AuthCore/Kiosk, Prisma y helpers de transacción. Los cuatro procesos abren la misma PostgreSQL y coordinan locks/constraints/funciones existentes. Gateway todavía usa una imagen Backend amplia en este laboratorio. Migración y seeds son jobs únicos separados, no parte del CMD de los cuatro runtimes nuevos.

Pendientes concretos, sin implementarlos:

1. **Acordar el cierre con observaciones de 2B.** Mantener el estado diagnóstico T01 y sus referencias; cualquier prueba de recuperación debe autorizarse específicamente o usar otro entorno sintético nuevo. No reanudar ese caso inventando sesiones/identificadores.
2. **Corregir el harness histórico de impresión en un cambio autorizado:** pasar el surtidor confirmado y conservar sesiones de pruebas fallidas. El adaptador privado demuestra la llamada correcta; no hay que cambiar el contrato de thermalReceipt ni las ventas.
3. **Revisar SIGTERM/cierre de BFF y demo PrintAgent:** reproducir/verificar parada graceful en un lote limitado. No esconder exit 137 aumentando indefinidamente el timeout. No se cambió código de esos auxiliares aquí.
4. **Mantener configuración aislada reproducible:** definir selección de imagen/CMD, orígenes T02 y disponibilidad de subredes para futuros laboratorios. Adoptar imágenes en Compose operativo corresponde a una autorización y validación posteriores; no copiar este Compose con credenciales ocultas.

No se probaron exhaustivamente POSTPAGO, deuda, recargas, canjes, todos los reembolsos, concurrencia de inventario administrado, todos los perfiles responsive/accesibilidad, restauración de backups o pérdida física, ni plataformas/arquitecturas distintas de Docker Linux/amd64 sobre Windows. El OCR y PREPAGO/stock LEGACY sí se ejercitaron realmente. Estas exclusiones no son regresiones demostradas ni funcionalidades certificadas por esta ejecución.

## 8. Comandos, artefactos y Git final

Herramientas nuevas, exclusivamente privadas:

- `tools/astra/stage2b-lab.cjs`: prepara/valida el proyecto, arranca, consulta estado, cambia entre referencia/candidato y detiene sólo su proyecto.
- `tools/astra/stage2b-checks.cjs`: 16 checks API adicionales y snapshot SQL READ ONLY.
- `tools/astra/stage2b-browser.cjs`: prueba de navegador de las tres interfaces con fixtures nuevos.
- `tools/stage2b-smoke.cjs`: copia adaptada privada del smoke; el original permanece intacto.

Se ejecutaron prepare/up/status/smoke/reference/candidate/stop del harness; extra candidate/reference; browser; snapshots READ ONLY; captura y comparación de 14 lecturas; reinicio de PG/Redis y apps sin init; inspecciones Docker y hashes/sintaxis. El Playwright se instaló con `npm.cmd install --prefix .cache/astra-stage2b/browser --no-save --package-lock=false --ignore-scripts --no-audit --no-fund @playwright/test@1.64.0`, sin modificar manifests/locks del proyecto. No ejecutar los helpers como una prueba operativa: deliberadamente escriben sólo fixtures del laboratorio y preservan el estado de esta corrida.

Evidencia pública nueva: [results.json](evidence/stage2b/results.json), [configuración redactada](evidence/stage2b/compose-isolated-redacted.json) y dos capturas. La cache privada conserva configuración ejecutable, valores sintéticos, sesiones, logs, snapshots, fallos y capturas completas. No se publicó esa cache ni sus tokens. No se sobrescribió evidencia histórica.

Estado Git: HEAD sin cambios, sin staging ni cambios versionados; nueve archivos nuevos de herramientas/documentación/evidencia. No se crearon commits. Las referencias de ramas y los commits anteriores no se modificaron. No se inicia Etapa 3.

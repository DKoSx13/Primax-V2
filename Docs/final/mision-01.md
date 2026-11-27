# Primax V2 · Informe de consolidación del 27 de noviembre de 2026

**Base seleccionada** · `846a0636037306e850c6beac48d67a1de2bd32f5`, en un worktree nuevo, `/home/primax/Proyectos/Primax-V2-final-consolidation`, rama `release/final-consolidation`. El [inventario](inventario.md) identifica las 25 puntas obtenidas de GitHub, verificadas contra objetos Git locales, las copias y los recursos Docker. El informe distingue las pruebas de esta misión de los antecedentes del 21 de noviembre.

**Dictamen** · La instalación académica aislada superó arranque y persistencia. Pasaron las 640 pruebas unitarias de Backend y se generó un APK debug con firma válida. La publicación queda pendiente por cuatro suites E2E con fallos, seis casos del navegador Prime y el quality gate ampliado de SonarQube. El respaldo de la exposición se verificó por contenido. La revisión posterior de ese parche no apareció en los archivos accesibles.

## Qué se ejecutó en la feria

El proyecto Compose operativo es `primax-astra-original`. Las etiquetas del contenedor T01 identifican el worktree `Primax-V2-astra-lot5` y el override privado `~/.local/state/primax/fuelflow-t01-print/physical.yaml`. La imagen `primax-fuelflow-t01:physical-20261121T214008Z` usa autenticación de kiosco e impresión física habilitada. T02 conserva su propia imagen. Hay imágenes de reversión y cuatro volúmenes por proyecto en original, lab y accept. Los dos últimos contienen instalaciones anteriores. La imagen operativa y la aceptación documentada en `Docs/feria-estabilizacion-20261121.md` son evidencias distintas. Un SHA por sí solo no reproduce el adaptador físico ni prueba en qué momento se utilizó cada modificación del directorio de trabajo.

Las 13 modificaciones rastreadas y un test nuevo en lot5 afectan registro Prime, política de contraseña, reintentos, errores por duplicado, pruebas, proxy y documentación del túnel. El proxy vincula registros a un nonce y mantiene un registro local de cuentas. La fecha del fichero o su presencia junto al contenedor no prueba que lo contenga una imagen compilada. El JS compilado de AuthService de la imagen Identity operativa contiene el marcador del registro por nonce. El SHA-256 del passwordPolicy servido por Prime coincide con el commit y difiere del fichero modificado localmente. Las listas before/after de los demás servicios al activar T01 tienen el mismo SHA-256. El diff rastreado completo de lot5 tiene huella `cc81c92d4d97e3320eb1d77d514da59adf062f6c5fb7273c212c4cb6166ff115` (git diff HEAD --binary); la prueba nueva tiene huella `8d85934ae9e51c9aeb0b1ea836ffb1a595d28e15d365f46a3cc12780db145d08`. Conservar el registro, las copias SQL y los logs privados fuera del nuevo repo. Reconciliar por separado contrato del registro, implementación efectiva de Identity y comportamiento del APK. La configuración física debe poder reconstruirse con parámetros locales, un ejemplo sin direcciones del recinto y una prueba Windows con operador. El simulador sigue siendo el valor académico por defecto.

También existen `~/Backups/primax-astra`, `~/Backups/primax-feria-check`, `~/primax-backups/feria-estabilizacion-20261121`, `~/primax-backups/prime-visual-20261121-031316`, evidencias QA y una copia del proxy en el directorio personal. Los archivos de evidencia no rastreados en el worktree Astra se preservaron en origen. `Proyecto` y `Proyecto_backup` tienen historiales distintos y versiones anteriores. El backup tiene un commit local exclusivo respecto a su upstream registrado. En los cuatro worktrees de Primax V2 iniciales los HEAD coinciden con su upstream.

## Selección e integración

Feria contiene main, la integración QA, el handoff Identity/Catalog y lot5. Las distancias respectivas son 64, 53, 42 y un commit. La rama de calidad histórica ya es ancestro de main. Tres ramas de revisión conservan un commit exclusivo cada una sobre logos de Control/Prime o disposición de pagos. Solapan archivos de clientes que después cambiaron en feria. En `validation/v2-integration`, seis de ocho commits exclusivos tienen parche equivalente según `git cherry`; los otros dos afectan recuperación de pagos y numeración de membresías. Contrastar sus casos de aceptación contra Commerce e Identity antes de rescatar cualquier hunk. Incorporar sus árboles completos reintroduciría versiones anteriores. Se preserva la ascendencia de feria sin fusiones.

La referencia funcional es `Specs/00-system-overview.md` a `Specs/06-prime-membership-numbering.md`, en particular grants por estación, propiedad de terminal, pagos y emisión de comprobantes. Para límites entre servicios consultar `Docs/architecture/arquitectura.md`, `Docs/astra/mision4-consolidacion.md` y los handoffs de Identity y Commerce. Git no contiene AGENTS.md en el candidato.

## Publicación y requisitos de la siguiente misión

| Requisito | Archivos y trabajo pendiente | Criterio de aceptación |
|---|---|---|
| Tres proyectos Vercel | Revisar `Infrastructure/v2-staging/projects.json` y cada `Frontend_*/vercel.json`. FuelFlow sirve dist y usa `Frontend_1_FuelFlow/api/gateway.js`; revisar también `server/gateway.js` y las rutas de kiosco. Control sirve dist y usa `Frontend_3_PrimaxControl/api/v1/control/[...path].js`. Prime sirve www y fija la API en `Frontend_2_PrimaxPrime/tools/api-url.cjs` al construir. | Tres orígenes HTTPS explícitos. Validar cookies Secure/HttpOnly, SameSite y alcance por terminal, credenciales solo del lado servidor, preflight y reescrituras anidadas. Probar T01 y T02 simultáneamente, con aislamiento equivalente a los dos orígenes locales. |
| Backend público | `Infrastructure/v2-staging/render.yaml` describe un backend Node y OCR. Sustituir el servicio de aplicación único por el gateway de `Backend/gateway/Dockerfile` y cuatro servicios privados construidos desde `Backend/services/{identity,catalog,commerce,administration}/Dockerfile`. Mantener OCR de `PlateRecognition/Dockerfile` con Tesseract e identidad de servicio. Configurar upstreams y salud en `Backend/gateway/server.cjs`. | Solo el gateway debe necesitar entrada pública. Verificar PORT del proveedor, timeout OCR, límites de cuerpo, HTTPS, CORS exacto, comunicación privada y salud de cada dominio. |
| Persistencia gestionada | `compose.database-managed.yaml` conserva nombres migrate/seed y un override centrado en backend; ya no describe bootstrap y los cuatro consumidores. Revisar `Backend/src/config/environment.ts`, `Backend/src/kiosk/redis-store.ts`, `Backend/prisma/schema.prisma` y `Backend/scripts/compose-bootstrap.cjs`. | Neon con TLS, URL pooled para tráfico y directa para migraciones únicas. El adaptador local usa el protocolo Redis y el remoto usa la API REST de Upstash (`KIOSK_REDIS_REST_URL`, `KIOSK_REDIS_REST_TOKEN`). Verificar TTL, comandos atómicos y recuperación ante caída sobre REST. Namespace independiente. Para producción usar APP_MODE=production con sus guardas y sin seeds, claves locales ni simulación de pago. Si se publica una demostración académica, APP_MODE=academic exige PAYMENT_ENV=demo, base dedicada, orígenes HTTPS y credenciales independientes. |
| Impresión | `PrintAgent/server.mjs`, `Frontend_1_FuelFlow/server/gateway.js`, `compose.yaml` y override privado identificado arriba. | Revisar conectividad desde la estación Windows, políticas del navegador y autenticación. Una función en la nube no alcanza el localhost de la impresora. Validar impresión y reintento con el mismo comprobante sin cobro adicional. |
| Bonus y contraseña | `Frontend_2_PrimaxPrime/js/views.js`, `js/components.js`, `styles/app.css` dentro de Prime. Introducir tarjeta Bonus accesible, legible a 360 px, manteniendo cifra y nombre accesible. Revisar `js/passwordPolicy.js`, `js/register.js`, `js/recovery.js`, `Backend/src/auth/register.dto.ts`, `password-reset.dto.ts`, `Backend/src/control/control.service.ts` y copias de compatibilidad en `services/identity/src/compatibility/auth/`. | Mensaje «Tu contraseña es demasiado larga. Prueba con una más corta.» Conservar límite bcrypt de 72 bytes UTF-8 y reglas diferenciadas en Specs. Probar 72/73 bytes con ASCII y caracteres multibyte, alta y recuperación en web y Android. |
| DBeaver | `compose.database-local.yaml` ya enlaza PostgreSQL a 127.0.0.1, puerto 26543 configurable. Activar como override opcional con el mismo nombre de proyecto. | Conectar con usuario local de lectura y comprobar que el puerto carece de enlace LAN. Mantener el arranque normal sin publicar PostgreSQL. |
| Mayoría de edad | Registro en `Backend/src/auth/auth.controller.ts`, `register.dto.ts`, `Backend/src/users/users.repository.ts`, modelo Prisma y dominio Identity. Agregar puerto de consulta y adaptador local con documentos puramente sintéticos. | Calcular 18 años por fecha de calendario; probar víspera, cumpleaños, fecha bisiesta, documento desconocido y fallo del adaptador. Devolver solo veredicto y evitar persistir una copia del padrón. |
| Verificación de correo | `Backend/src/auth/recovery-delivery.ts` ya implementa Nodemailer/SMTP con TLS. Añadir propósito de alta independiente en Identity y estado pendiente en Prisma. Evaluar relay SMTP de Google Workspace si el equipo dispone de dominio y permisos; comparar proveedor transaccional externo por dominio verificado, TLS, cuotas y entrega. | Capturador SMTP local, sin destinatarios reales. Código aleatorio con hash, expiración, consumo atómico único, límites de intentos/reenvíos y respuestas anti-enumeración. Validar que un código de recuperación no activa una cuenta. |
| Kubernetes | El empaquetado Docker y los healthchecks de `compose.yaml` permiten Deployments y Services por dominio, gateway y OCR. Preparar overlay académico independiente, Job único de migración/seed, Secrets, probes, PVC para Postgres, Redis e impresión simulada y NetworkPolicy de aislamiento. | Repetir flujos y persistencia en clúster de prueba. Resolver accesos físicos fuera del clúster y verificar restauración. Mantener Compose como ruta local de un comando. |
| SonarQube | `sonar-project.properties` ahora incluye Backend/services, gateway, scripts, servicios extraídos y proxies web. OCR ya estaba en alcance. `Docs/quality/sonar-final.json` y su log registran Community Build 26.10.0.133078 y Scanner CLI 8.1.0.6389. | Comparar primero con alcance histórico y LCOV regenerado; después medir alcance ampliado, importar cobertura de OCR y JS por componente, registrar SHA, perfil, métricas y quality gate. Corregir por gravedad y repetir con idéntico alcance. No sumar porcentajes de universos distintos. |

**Reservas para el equipo** · `Docs/final/glosario.md`, `Docs/final/guia-visual-bonus.md` y `Docs/final/indice-de-capturas.md` quedan disponibles para incorporación personal por tres integrantes.

**Secuencia de entrega** · Reconciliar el delta local y validar impresión/Android, aplicar mejoras de UI y seguridad, ejecutar análisis inicial y correcciones, validar Compose y Kubernetes, ensayar contratos de publicación con datos sintéticos. Promover el candidato aceptado a main preservando autores. La publicación independiente y los despliegues requieren la validación posterior.

## Línea base ejecutada en Debian

Las pruebas corresponden al árbol rastreado de feria, salvo la prueba del proxy que reside en lot5. Se reutilizaron dependencias Node locales para las suites unitarias y Chromium instalado para Playwright. Los dominios, el gateway y la imagen de pruebas E2E se construyeron desde los Dockerfiles del candidato. La feria operativa siguió en sus puertos originales.

| Prueba | Resultado observado |
|---|---|
| Backend, Jest en serie | 639/640 en el primer pase. Un timeout a los 5 s en stations-hexagonal durante la compilación concurrente. La repetición aislada de la suite con el mismo límite pasó 40/40. Una repetición completa con cobertura V8 pasó 640/640 en las 62 suites y produjo LCOV. |
| Identity core, empaquetado y configuración | 12/12 de Identity Core. Otras 31/31 cubren build de dominios, guardas de base y volúmenes, seed académico y validación de staging con fixtures locales. |
| Rutas del API Gateway | 24/24. Salud HTTP del gateway con Identity, Catalog, Commerce, Administration, Print y OCR arriba. |
| FuelFlow / Prime / Control | 195/195, 31/31 y 38/38 en sus respectivos npm test. |
| Prime, navegador | 42/48. En 360×800, 390×844 y 412×915 fallan la expectativa de «Modo DEMO local» en recuperación y el selector de saldo tras login en la prueba de tarjeta. Revisar fixture, contrato vigente y DOM antes de cambiar expectativas. |
| PrintAgent / OCR | 56 aprobadas y una omitida en PrintAgent (dependencia de plataforma). OCR pasó las 15 pruebas en el contenedor Python, incluyendo placa y membresía. La salida de papel en Windows requiere una prueba física posterior. |
| Proxy posterior a feria | Dos pruebas aprobadas y una omitida. La integración opcional fija el upstream en 27200, ocupado por exposición. Parametrizar ambos destinos y repetir contra una copia aislada de Identity con el nonce. |
| Sesiones por terminal | POST de bootstrap por el BFF T01 y T02 devuelve HTTP 200, tres cookies por cliente y dos IDs diferentes. Sin cabecera de petición de FuelFlow se observó 403. |
| Registro y autenticación | Cuenta sintética nueva por el gateway, login HTTP 200 y membresía HTTP 200 con número presente. La clave de prueba se conserva solo en el entorno temporal local. |
| Compose limpio | Proyecto nuevo primax-final01, cuatro volúmenes propios, redes 10.248.210.0/24 y 10.248.211.0/24. Gateway en 28200 y clientes en 28281–28284, todos en loopback. Sin .env. El comando fue `docker compose up -d` con variables de aislamiento exportadas en el proceso. Bootstrap informó 36 migraciones, 41 tablas y tres seeds; 36 migraciones terminadas verificadas por SQL. Quince servicios saludables y dos jobs terminados. |

La primera invocación del laboratorio y un reintento de aislamiento se solaparon durante el build. Una invocación terminó por conflicto de nombre del guard; la otra completó la instalación con las subredes verificadas mediante docker network inspect. El nombre de proyecto, los puertos y las subredes por defecto de este repositorio ya pertenecen a la exposición en este Debian. El ensayo aquí representa una instalación sin datos con aislamiento de host. Los valores por defecto literales en una segunda máquina vacía no se ensayaron.

**Despliegues** · Los tres comandos de build terminaron correctamente con VERCEL=1, utilizando una URL HTTPS ficticia para Prime. Se verificó la generación de dist/www localmente. El override de DBeaver resuelve loopback:26543 → postgres:5432. El override histórico de base gestionada falla incluso con una URL ficticia: el servicio seed carece de imagen o contexto de build. Estos resultados requieren actualizar staging antes de habilitar despliegues.

**Pruebas E2E con PostgreSQL y Redis** · Se ejecutó `node scripts/test-compose.cjs` dentro de backend-tests en la red privada. El primer grupo arrojó 197 aprobadas, 3 fallidas y 47 omitidas; dos suites adicionales de ese grupo ni siquiera compilan. API, v9, prepago invitado, recuperación y comprobantes pasaron. `Backend/test/v11-closure.e2e-spec.ts` y `Backend/test/v11-provider.e2e-spec.ts` construyen PaymentWebhookController con un tipo anterior al OrderWorkflowAdapter. El registro del ordinal 1999 recibió HTTP 500 y Prisma P2028. En admin-mail la expectativa del nombre del miembro en el endpoint vehicular contradice la minimización de datos de feria. Revisar contrato, fixture y ámbito autorizado antes de corregir. En las fases posteriores PostgreSQL entró en recuperación, se interrumpieron migraciones y hubo timeouts. Los primeros resultados de incidencias, devolución parcial y demo fueron 20 fallidas, y terminal-refactor tuvo 4 fallidas. El segundo pase que figura abajo permite distinguir las interrupciones de infraestructura de los fallos reproducibles.

**Reinicio con datos** · Se detuvo exclusivamente primax-final01 y se volvió a ejecutar `docker compose up -d`. Se comprobó el mismo inventario de cuatro volúmenes, login de la cuenta creada antes del reinicio, lectura de su membresía y recuperación de una clave persistente de Redis. Bootstrap detectó 36 migraciones y 41 tablas existentes y omitió migraciones y seeds. El laboratorio se detuvo después de la comprobación conservando sus volúmenes.

**Android** · Capacitor sincronizó el contenido web con una URL HTTPS de prueba sin credenciales. El host Debian carecía de compilador Java y SDK. Se compiló después en un contenedor de prueba con JDK 21.0.9, Android SDK 36 y Gradle 8.14.3. assembleDebug terminó con 93 tareas ejecutadas. apksigner verificó la firma v2 del APK nuevo, SHA-256 `eb9a250bdc2b8346127b760bcf33b180ced636862ca4142b6a226f7339c2f358`. El artefacto quedó en el volumen local primax-final01-android-build, ruta android/app/build/outputs/apk/debug/app-debug.apk. Esta comprobación valida compilación y firma debug; queda pendiente instalación y recorrido en dispositivo conectado a un backend alcanzable.

**Respaldo de feria** · El SHA-256 de `~/primax-backups/final-20261127/delta-feria.patch` es `a366e18432eb7bb442680e2da0fd561f949689293c39170aeabce72781b4f88d`. Se aplicó a un índice Git temporal sobre 846a063 y se comparó el blob de cada uno de sus 14 archivos con el worktree original. Coinciden los 14. El respaldo incluye el mensaje anterior y una prueba con upstream fijo en 27200. No corresponde al parche revisado descrito por el equipo.

Vercel documenta proyectos independientes por directorio raíz. Render admite servicios accesibles solo por la red privada; presupuestar instancias para los cuatro dominios y OCR antes de elegir plan. Neon distingue conexiones directas y mediante pool. Upstash admite llamadas Redis por HTTPS con token. Google Cloud documenta el envío mediante relay de Workspace o proveedores transaccionales. Para el código de cuenta se puede comparar SMTP con TLS con un adaptador de API transaccional y medir entrega contra un buzón de pruebas antes de contratar. [Vercel](https://vercel.com/docs/monorepos) · [Render](https://render.com/docs/private-services) · [Neon](https://neon.com/docs/connect/connection-pooling) · [Upstash](https://upstash.com/docs/redis/features/restapi) · [Correo en Google Cloud](https://cloud.google.com/compute/docs/tutorials/sending-mail)

**Reproducción del aislamiento** · El entorno exportó COMPOSE_PROJECT_NAME=primax-final01, BACKEND_PORT=28200, FRONTEND1_PORT=28281, FRONTEND2_PORT=28282, FRONTEND3_PORT=28283, FRONTEND1_T02_PORT=28284, ASTRA_WEB_SUBNET=10.248.211.0/24, ASTRA_DATA_SUBNET=10.248.210.0/24 y CORS_ORIGINS con los cuatro orígenes HTTP 127.0.0.1 de esos frontends. En una reproducción local se debe elegir un nombre libre para la prueba de instalación nueva. Los comandos de evidencia fueron `docker compose up -d`, `docker compose run --rm -T backend-tests node scripts/test-compose.cjs`, `docker compose stop` y nuevamente `docker compose up -d`. Este Debian ejecuta Docker 29.9.3 y Compose v5.7.1. Las salidas de pruebas de esta sesión están en /tmp/primax-final01; los resúmenes en este directorio Git son persistentes.

## SonarQube del candidato

Se ejecutaron localmente dos análisis sobre el mismo código con Community Build 26.10.0.133078 y Scanner CLI 8.1.0.6389. Ambos importaron el LCOV recién generado con las 640 pruebas de Backend. Se asignaron 3072 MiB al analizador JS después de un primer intento fallido con 1024 MiB.

| Alcance | Líneas de código | Bugs | Vulnerabilidades | Code smells | Cobertura | Duplicación | Quality gate |
|---|---:|---:|---:|---:|---:|---:|---|
| Configuración de octubre aplicada al código de feria | 18052 | 31 | 6 | 3 | 53.9 % | 5.3 % | OK |
| Configuración ampliada de release | 27224 | 32 | 10 | 8 | 54.6 % | 21.5 % | ERROR |

IDs de las tareas completadas: `642749a1-3889-4430-a676-d6cc0fc4b892` y `1b70aad8-124e-4c05-8b9e-82cb1a23f2b0`. La ampliación incorpora fuentes existentes, entre ellas código de compatibilidad en dos árboles. Los 169 archivos de Backend/services sin correspondencia en el primer análisis entraron en el segundo. Quedaron tres fixtures TypeScript fuera del alcance productivo de cobertura. OCR se analizó estáticamente. El scanner CLI advierte que el C# requiere SonarScanner para .NET. La cobertura de frontend, C# y Python no se midió con LCOV Backend.

El gate ampliado impide recomendar publicación. Antes de corregir o aceptar los hallazgos conviene revisar el alcance efectivo de ejecución, conservar la evidencia de las decisiones y repetir sobre la misma configuración. Las dos vulnerabilidades calificadas críticas por la herramienta afectan al empaquetado y la protección de peticiones del OCR. Revisar qué entra al contexto Docker y cómo se autentican las peticiones máquina a máquina. El bug crítico en la ordenación del journal de Identity requiere comprobar el contrato de orden estable antes de cambiar el comparador.

| Tipo | Regla | Archivo | Línea | Severidad |
|---|---|---|---:|---|
| VULNERABILITY | javascript:S5332 | `Backend/gateway/server.cjs` | 10 | MINOR |
| VULNERABILITY | typescript:S5332 | `services/identity/src/compatibility/config/environment.ts` | 216 | MINOR |
| VULNERABILITY | typescript:S5332 | `services/identity/src/compatibility/vehicles/recognition.service.ts` | 29 | MINOR |
| BUG | typescript:S2871 | `services/identity/src/operational/consumer/journal.ts` | 197 | CRITICAL |
| VULNERABILITY | typescript:S2245 | `services/identity/src/persistence/atomic.ts` | 32 | MAJOR |
| VULNERABILITY | typescript:S5332 | `Backend/src/config/environment.ts` | 216 | MINOR |
| VULNERABILITY | typescript:S2245 | `Backend/src/prisma/prisma.service.ts` | 57 | MAJOR |
| VULNERABILITY | typescript:S5332 | `Backend/src/vehicles/recognition.service.ts` | 29 | MINOR |
| VULNERABILITY | docker:S6470 | `PlateRecognition/Dockerfile` | 6 | CRITICAL |
| VULNERABILITY | python:S4502 | `PlateRecognition/app.py` | 16 | CRITICAL |
| VULNERABILITY | javascript:S5332 | `PrintAgent/transport.mjs` | 4 | MINOR |

## Repetición completa E2E y cierre

Se ejecutó de nuevo el mismo runner y las mismas pruebas sin modificar aserciones. El proyecto primax-final01-retest usó la imagen del candidato, PostgreSQL 17.6 y Redis 7.4 en red interna sin puertos publicados. El directorio de datos PostgreSQL se montó en tmpfs de 1100 MiB para esta repetición funcional. La persistencia se verificó por separado en los volúmenes normales de Compose. No aparecieron errores de recuperación de PostgreSQL en esta repetición.

| Grupo de test-compose.cjs | Aprobadas | Fallidas | Observación |
|---|---:|---:|---|
| General | 198 | 2 | Las dos aserciones de admin-mail siguen fallando. Dos suites de webhook no compilan. Las otras 47 pruebas marcadas omitidas en este grupo dependen de perfiles. Registro y recuperación pasaron. |
| Incidencias, devolución parcial y demo | 20 | 0 | Pasó el grupo completo tras la interrupción del primer intento. |
| Conciliación de inventario | 10 | 0 | PostgreSQL local. |
| Pagos V2, Prime y asistencia | 7 | 8 | Pagos y Prime pasaron. El módulo de pruebas de Assistance no resuelve AssistanceWorkflowAdapter al construir ControlAssistanceController. |
| Control | 26 | 0 | Cuatro suites, incluidas operaciones y creación de cuentas. |
| Sesión y operación de terminal | 4 | 0 | Perfil dedicado de refactorización. |
| Fundamentos de inventario | 2 | 0 | Perfil dedicado de inventario. |

El runner salió con código 1. Sumó 267 pruebas aprobadas y 10 fallidas en siete grupos, más dos suites que no llegaron a ejecutar sus casos. Los 47 skips del grupo general no son un conteo de casos únicos pendientes. Revisar la composición del módulo de asistencia, las dos construcciones del controlador de webhook y el contrato de privacidad del endpoint de vehículos. Mantener los seis casos de navegador fallidos como regresiones abiertas hasta contrastarlos con las Specs.

**Git y entorno al cierre** · Base de aplicación 846a0636037306e850c6beac48d67a1de2bd32f5, primer checkpoint 1c6555852c1545019df274ec1dd57be751a9c12e. El commit de cierre de release/final-consolidation incorpora el informe, con su SHA consultable mediante `git log -1 --format=%H -- Docs/final/mision-01.md`. El worktree original conserva su delta. El respaldo original pasó git apply --check, pero no se aplicó al árbol de release. El archivo con el nombre delta-feria-revisado.patch no se encontró en el directorio personal, los worktrees ni el área temporal accesible. El archivo delta-feria.patchmkdir del directorio de respaldo está vacío. Al cierre se verificaron los 15 servicios operativos de feria saludables y los laboratorios detenidos. main sigue en 58a2206d295d4f20c15495da6c1a8ec36572d4a5.

**Huellas de las salidas de esta ejecución** · SHA-256 de los logs locales conservados en /tmp/primax-final01.

| Archivo | SHA-256 |
|---|---|
| coverage.log | `abc2c68a696445d36b360a2c5a37daea887178442262caa957e15d7c0a083fce` |
| e2e-retest.log | `d42a6ac54851b184d6c743d3b5f14023488419d5619684bb5ef0ba34315e2119` |
| mobile-full.log | `020ccf6671f52710aab8f19bcdffa09c381160cba2d8ca537122240a6c53b1ef` |
| ocr.log | `241f2b03969e857e484a20d439d9f86a8609ae01fcddbb8062d508efe06c0a1f` |
| reinicio.log | `002160003eab66f7fd62ce7d7677e8bf15823fbe86f5f816c4013bfbfcbd6e24` |
| apk.log | `7705bbf3bf3b60479b310f007eed5411654976e17cf6b8dc6e5a973c1abe5dcb` |
| apk-verify.log | `192a02741c893c7c86a5f7066ff0affef496612a486eec12db785a8a2d2dda2b` |
| scan-historico.log | `6206bb71872823aaa7d39c8f6d9d1f2e6251fe7e8533b3cf5b912f982c776d07` |
| scan-ampliado.log | `8a0b01b71b625aaca85ca4baaeca610221a59d293621f7ed5ac5054b9a10a45d` |

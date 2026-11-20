# Lote 4 — integración reproducible del original con Docker Compose

Referencia inicial: `27edae7d68a19e62d0b65682f84cf049928fb64d`.
Rama: `feat/dezkz-identity-a4-core`. **Cierre técnico del alcance del Lote 4**:
el original arranca desde su raíz con `docker compose up -d`, sin `.env`,
Node/npm, PostgreSQL, Redis o dependencias backend instaladas en el anfitrión.
No se ejecuta el monolito como servidor de negocio. Lote 5 no iniciado.

Guía vigente: [instalación y operación](primax-lot4-compose-runbook.md).
Evidencia: [resumen saneado](evidence/lot4-compose/review-summary.json).

## Estado inicial, aislamiento y conservación

HEAD coincidió exactamente con la referencia; árbol versionado e índice limpios.
Se verificaron ancestros, fsck y SHA-256 de 1.498 archivos versionados inicialmente.
Las nueve evidencias históricas sin seguimiento coincidieron con Lote 3 y quedan
intactas y excluidas del commit. No se accedió a archivos de la copia de exposición.

El original tenía puertos 26000/26081/26082/26083 y una inconsistencia 27184/26084
para T02. Los cuatro dominios seleccionaban el runtime legacy común y comandos
distintos, aunque sus fronteras ya estaban consolidadas. Gateway también usaba
esa imagen. Había cuatro jobs separados de migración/seed. Se encontraron volúmenes
antiguos primax-fuelflow-demo: no se montaron, migraron ni eliminaron.

La composición final usa el proyecto **primax-astra-original**, puertos loopback
27200 y 27281–27284, dos redes propias y cuatro volúmenes nuevos propios. Se
verificó su inexistencia antes del intento limpio. Son independientes de los
contenedores, redes y volúmenes de la exposición; las credenciales locales son
distintas. La comparación de los contenedores de exposición conserva IDs, imagen,
hora de inicio, contador de reinicios y montajes. No hubo limpieza global Docker.

## Arquitectura e inventario final

| Servicios Compose | Cantidad | Resultado real |
|---|---:|---|
| identity-service, catalog-service, administration-service, commerce-service | 4 | healthy; cuatro imágenes y entradas independientes |
| backend (API Gateway) | 1 | healthy; imagen ligera con solo gateway y Node |
| frontend1, fuelflow-t02, frontend2, frontend3 | 4 | healthy; tres productos web, FuelFlow en dos terminales |
| fuelflow-gateway, fuelflow-gateway-t02 | 2 | healthy; BFF originales con scopes/códigos de terminal distintos |
| postgres, redis, plate-recognition, print-service | 4 | healthy; PostgreSQL única, Redis, OCR y PrintAgent demo |
| volume-guard, bootstrap | 2 | exited, código 0 |
| Total predeterminado | **17** | **15 healthy + 2 jobs completos** |

El perfil test es opcional y no participa en ese conteo. Su comando predeterminado
pasa a Jest; el runner histórico que crea bases de prueba no se ejecuta ni forma
parte del arranque. El cluster comprobado contiene una sola base de aplicación.

Los cuatro dominios usan sus Dockerfiles originales en Backend/services y los
CMD `services/<dominio>/dist/src/apps/<dominio>/main.js`. Se verificaron dentro
de los cuatro contenedores los hashes de todos los archivos emitidos contra los
artefactos aceptados de Lote 3: coinciden. No hay bind mounts de fuentes/dist.
Gateway ejecuta gateway/server.cjs y su `/app` contiene solo gateway; se preservan
literalmente server.cjs y routes.cjs. Los tres frontends/BFF mantienen sus fuentes;
solo cambian parámetros de construcción/composición para enlaces y puertos propios.

Hay quince definiciones build para aplicaciones/jobs y dos imágenes de
infraestructura (PostgreSQL 17.6-bookworm y Redis 7.4-alpine). Los tags de los
cuatro dominios son primax-astra-original-{identity,catalog,administration,commerce}:lot4;
Gateway usa primax-astra-original-gateway:lot4. Los dos jobs usan tags init y
volume-guard. Las imágenes auxiliares reciben tags del proyecto Compose.
IDs, comandos, arquitectura, estado, redes y montajes figuran en la evidencia.

## Inicialización segura

Volume-guard revisa los cuatro volúmenes antes de iniciar PostgreSQL, Redis e
impresión. Acepta únicamente volúmenes vacíos o con marcador de este proyecto,
tipo y propósito sintético. Si cualquiera es desconocido, no crea marcadores en
ninguno. No monta el socket Docker. PostgreSQL utiliza el subdirectorio pgdata,
dejando el marcador fuera del directorio de initdb.

Bootstrap espera PostgreSQL healthy y valida el entorno original, modo local/demo,
identidad base/usuario, URLs y propiedad. En una base vacía propia registra un
estado initializing, ejecuta migrate deploy y, secuencialmente, los tres scripts
de seed originales. Comprueba las 36 migraciones y 41 tablas sin modificar Prisma,
SQL, seeds o reglas. Persiste estado ready y huellas de migraciones/configuración
en bootstrap_state. Este volumen es metadata de arranque, no otra base de datos.

Un arranque posterior con estado ready verifica y omite migraciones/seeds. Los
datos no se resetean, el stock no se repone y las contraseñas no se resincronizan.
Una base no vacía sin estado propio se rechaza. Drift de configuración de seed o
migraciones se rechaza para revisión. La reanudación de un initializing es solo
para una base inicialmente vacía que este mismo job ya reconoció como propia;
no garantiza un commit global de todos los seeds. Se conserva la idempotencia
y las limitaciones de sus motores originales.

La imagen compose-init reutiliza la compilación legacy para el seed compilado y
las herramientas Prisma. Sus CMD son jobs, nunca main legacy como servidor.
Todos los dominios esperan bootstrap completo y dependencias saludables.

## Arranque y pruebas reales

Se ejecutaron `docker compose config --quiet` y `docker compose up -d` desde la
raíz, sin un archivo .env ni instalación de node_modules en Backend. Compose
construyó las imágenes y realizó la inicialización. El comando exacto up -d
se confirmó con exitCode 0 y se repitió satisfactoriamente después de reiniciar
la infraestructura. No se pidió al usuario ejecutar un script preparatorio.

El primer intento detectó agotamiento del pool automático de subredes Docker,
antes de migrar o sembrar datos. Se añadieron 10.249.240.0/24 y 10.249.241.0/24,
comprobando ausencia de solapamiento. No se eliminó ninguna red. Los CIDR son
configurables en hosts con VPN u otras redes que ocupen esos rangos.

| Validación | Resultado |
|---|---|
| Config y comando raíz | Config válido; up -d exit 0; repetición exit 0 |
| Jobs/esquema | Dos jobs exit 0, 36 migraciones, 40 tablas de aplicación + Prisma metadata |
| Procesos/health | 15 saludables; Gateway agrega dominios, OCR e impresión; Redis PONG |
| Frontends | HTML real 200 de Prime, Control, FuelFlow T01 y T02 |
| Comunicación | Solicitudes vía Nginx/BFF/Gateway a Identity, Catalog, Administration y Commerce; X-Service-Name y datos comprobados |
| Jest | 576 pruebas en 60 suites, cero fallos |
| Inicialización/seed | Ocho pruebas; rechazo de propiedad/volúmenes desconocidos y seeds fuera de modo permitido |
| Rechazo real | Contenedor sin red con tmpfs sintético desconocido: guard rechaza y no escribe marcadores |
| Gateway/empaquetado | 24/24 y 9/9 |
| Compilaciones | Cuatro independientes y legacy correctos, además de builds Docker |
| Artefactos | Los cuatro dominios en ejecución coinciden con Lote 3; sin TS2307 |

También se ejecutó el perfil Compose test con los contratos Gateway, empaquetado,
guard y seed: 41 pruebas, exit 0, sin Node anfitrión ni bases adicionales. Son
una repetición en la imagen test real, no 41 casos nuevos de cobertura. Una
consulta posterior confirma solo primax_astra_original_local como base de aplicación.

Los healthchecks de Nginx y BFF reflejan su servidor HTTP, no una garantía de
negocio por sí solos. Por eso se verificaron por separado rutas reales y el
agregador Gateway; los health de dominio consultan PostgreSQL y Redis usa ping
autenticado. No se añaden reglas de seguridad para hacer pasar estos checks.

### Recorrido extremo a extremo

El recorrido final registra 31 solicitudes: HTML de los cuatro orígenes, login y
membresía Prime, rechazo de cliente en Control, login/dashboard/inventario Control,
claim y lectura de T01/T02, OCR real de ABC-123 y una compra por T02 con YAPE demo
por S/ 21.30. Se crea operación, orden demo, confirmación demo, autorización,
avance de un galón, venta, replay con el mismo ID y cierre normal. Control lee la
transacción/comprobante y PrintAgent lo acepta/repite/consulta como simulación.
No se envió ningún cobro externo ni se usó impresora física.

Durante la preparación del verificador se corrigieron dos expectativas de formato:
autorización y venta vienen en envelopes anidados, no con id en la raíz. La primera
compra sintética se había cerrado normalmente. Un intento posterior de reenviarla
ya cerrada conservó el 403 original; no se forzó recuperación. Se realizó después
otra compra completa con la misma sesión autorizada y un UUID nuevo, que pasó el
replay mientras estaba activa. No cambió código de negocio ni contrato HTTP.

Resultado PostgreSQL: dos ventas sintéticas de UUID distintos, dos pagos DEMO y
dos recibos; cero operationId duplicados, operaciones abiertas, reservas pendientes
o incidencias. El inventario Regular termina en 4992.429176 litros y cero reservado;
los otros dos combustibles conservan 5000 litros. El comprobante final es EB01-0002,
guardado una sola vez en PrintAgent, simulation=true/physicalConfirmed=false.
No se manipuló T01 para recuperar incidencias históricas; la T01 nueva solo se
preparó/consultó en el entorno limpio y no realizó la venta.

### Persistencia

Se reiniciaron PostgreSQL y Redis, se repitió up -d y se reiniciaron los otros 13
procesos. Los 15 volvieron a healthy y los dos jobs terminaron con 0. El volcado
completo de datos y secuencias PostgreSQL es idéntico antes/después (se excluye solo
el token aleatorio \restrict de pg_dump). Se conservaron cinco valores Redis con
TTL positivo, incluida una sonda sintética explícita y valores de sesión de larga
duración. El mismo trabajo de impresión persistió tras reiniciar PrintAgent.
No se exige que las claves cortas de rate limit duren más que su TTL original.
Bootstrap registró la verificación ready y omitió migraciones/seeds en la repetición.

## URLs finales

| Destino | URL |
|---|---|
| FuelFlow T01 | http://127.0.0.1:27281/src/index.html |
| FuelFlow T02 | http://127.0.0.1:27284/src/index.html |
| Prime | http://127.0.0.1:27282/ |
| Control | http://127.0.0.1:27283/ |
| Gateway | http://127.0.0.1:27200/api/v1 |
| Health agregado | http://127.0.0.1:27200/api/v1/health |

## Cambios y comparación

| Aspecto | Antes | Final |
|---|---|---|
| Dominios | Cuatro procesos en runtime legacy común | Cuatro imágenes/artefactos propios |
| Gateway | Imagen común con backend y dependencias | Dockerfile ligero; código/rutas conservados |
| Inicialización | Migrate + tres jobs seed | Guard + bootstrap ordenado, con estado y verificación |
| Volúmenes | Sin prueba de propiedad en Compose | Cuatro volúmenes propios, marcados, con rechazo de desconocidos |
| Recursos | Nombre/puertos compartibles con instalaciones anteriores | Proyecto, redes, volúmenes y puertos propios |
| T02 | Defaults 27184/26084 discordantes | Puerto/cookies/orígenes/enlace Control coherentes en 27284 |
| Perfil test | Runner de integración con creación de bases | Jest por defecto; runner histórico no ejecutado |
| Conteo fuente | 15 procesos y cuatro jobs | 15 procesos y dos jobs |

Archivos funcionales preexistentes modificados: compose.yaml, .env.example y
Backend/Dockerfile (solo target compose-init). Se actualizan README y plan 3J.
Se añaden Backend/gateway/Dockerfile, dos scripts de inicialización y su prueba,
herramientas de verificación, esta evaluación, guía de arranque y evidencia saneada.
La lista exacta y SHA-256 está en el manifiesto. Logs, configuraciones expandidas,
tokens y volcados privados permanecen en .cache, fuera de Git.

## Plataformas, riesgos y cierre

Validado: Windows con Docker Desktop, motor Linux x86_64, Compose 5.6.1 e imágenes
Linux amd64. Los manifiestos consultados de Node fijada por digest, PostgreSQL,
Redis, Python y Nginx contienen amd64 y arm64. Eso no acredita dependencias nativas,
builds o recorridos completos en ARM. No hay rutas Windows, montajes de código,
Node anfitrión o PowerShell obligatorios en el arranque de los contenedores Linux.
Hosts Linux/macOS y arm64 permanecen para Lote 5. Las imágenes de infraestructura
por tag y los paquetes apt aún dependen de disponibilidad de sus repositorios.

Permanecen T01 (recuperación funcional pendiente), TARJETA/OnlineOrder_method_check,
x-kiosk-key, proveedores externos, hardware de cámara/impresora, AuthCore/Prisma/
bootstrap y motores legacy compartidos, PostgreSQL única y alcance académico A.4.
No se certifican fallos exhaustivos, equivalencia universal ni autonomía productiva.
Los overrides históricos LAN/managed no se validan como parte del arranque final.

**Lote 4 cerrado técnicamente en el entorno comprobado.** La instalación original
queda ejecutándose con 15 servicios saludables y dos jobs completos. Se recomienda
Lote 5 solo tras nueva autorización: pruebas reales en hosts Linux/macOS/ARM,
recorridos de navegador y hardware disponibles, fallos/reinicio/persistencia y
matriz maestra final de 115 contratos. No se inicia ese lote ni se altera la copia.
Un commit local de la entrega verificada; hash informado fuera de este archivo.
Sin push ni merge.

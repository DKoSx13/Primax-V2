# Original Astra — instalación y arranque con Docker Compose

El procedimiento vigente es para el proyecto original. La copia de exposición
es otra instalación y no se modifica, monta ni importa. No se necesitan Node,
npm, Python, PostgreSQL o Redis instalados en el anfitrión.

## Requisitos y primer arranque

Docker Engine con Compose moderno o Docker Desktop en modo contenedores Linux.
La prueba se ejecutó en Windows con Docker Desktop, motor Linux x86_64 y Compose
v5.6.1. La primera construcción necesita Internet y espacio para las imágenes.
Una versión anterior de Compose debe soportar build, perfiles y dependencias
`service_healthy`/`service_completed_successfully`; no se certificó aquí una
versión mínima ni otros anfitriones.

Desde la raíz del checkout:

```bash
docker compose up -d
```

No copiar `.env.example`, instalar dependencias, crear una base ni ejecutar un
seed previamente. Compose construye el código actual. `pull_policy: build`
solicita build de las aplicaciones en cada `up`; las capas de Docker pueden
reutilizarse sin reemplazar el código con un montaje del anfitrión.

Comprobar el arranque:

```bash
docker compose ps -a
docker compose logs --tail 60 volume-guard bootstrap
docker compose logs --tail 40 backend
```

Resultado predeterminado: **15 procesos saludables y dos jobs terminados con
código 0**. El perfil opcional `test` no participa en ese conteo ni se inicia con
el comando normal. Los frontends pueden tardar unos segundos más que los jobs
en alcanzar healthy después de que `up -d` regresa.

## URLs y cuentas públicas de esta demo

| Componente | URL |
|---|---|
| FuelFlow T01 | http://127.0.0.1:27281/src/index.html |
| FuelFlow T02 | http://127.0.0.1:27284/src/index.html |
| Primax Prime | http://127.0.0.1:27282/ |
| Primax Control | http://127.0.0.1:27283/ |
| Gateway | http://127.0.0.1:27200/api/v1 |
| Salud agregada | http://127.0.0.1:27200/api/v1/health |
| Swagger por dominio | http://127.0.0.1:27200/docs/identity/api/docs/ |

En Swagger sustituir identity por catalog, administration o commerce. Mantener
el mismo hostname al operar una terminal para conservar sus cookies. localhost
también está contemplado por la configuración existente; la prueba usó 127.0.0.1.

| Cuenta | Usuario | Contraseña pública local |
|---|---|---|
| Prime | demo@primaxprime.pe | OriginalPrimeDemo2026! |
| Administrador Control | control-original@primax.local | OriginalControlDemo2026! |
| Encargado Control | encargado-original@primax.local | OriginalEncargadoDemo2026! |
| Login de operador compatible | operador-original | OriginalOperadorDemo2026! |

Son fixtures sintéticos para loopback, no secretos productivos. La preparación
técnica automática de T01/T02 conserva el flujo original; no requiere activar una
terminal desde Control. Para el recorrido comprobado se usó T02, placa XYZ-999,
Regular, PREPAGO y YAPE demo por S/ 21.30, una autorización/avance/venta y cierre
normal. Control permitió consultar su comprobante y PrintAgent lo guardó como
simulación sin papel. OCR reconoce el fixture impreso ABC-123; la calidad de una
cámara física no se certifica con ese fixture.

## Orden e imágenes de ejecución

1. `volume-guard` revisa cuatro volúmenes nuevos vacíos o marcados como propios.
   Un volumen no vacío sin marcador, o con otro propietario, es rechazado antes
   de arrancar PostgreSQL/Redis/PrintAgent. No hay Docker socket dentro del job.
2. PostgreSQL 17.6 inicia con `PGDATA=/var/lib/postgresql/data/pgdata`; su marcador
   queda al lado del subdirectorio, sin alterar initdb ni el esquema.
3. `bootstrap` valida el entorno local y la identidad de base/usuario. En una
   base vacía propia registra estado de inicialización, ejecuta las 36 migraciones
   originales y, en orden, seed-local-demo, seed-control-admin y seed-local-operations.
   Comprueba 40 tablas de aplicación más `_prisma_migrations`.
4. Los cuatro dominios esperan el job completo, PostgreSQL, Redis y OCR sanos.
   Cada uno usa su Dockerfile/artefacto/entrada independiente. La imagen de init
   reutiliza la compilación legacy para ejecutar el seed existente; no ejecuta
   main legacy como servidor ni sustituye los cuatro procesos.
5. Gateway espera dominios e impresión; FuelFlow utiliza sus dos BFF firmados,
   y Prime/Control usan el proxy `/api/v1` de Nginx hacia Gateway.

| Proceso | Dockerfile / entrada |
|---|---|
| Identity | Backend/services/identity/Dockerfile → services/identity/dist/src/apps/identity/main.js |
| Catalog | Backend/services/catalog/Dockerfile → services/catalog/dist/src/apps/catalog/main.js |
| Administration | Backend/services/administration/Dockerfile → services/administration/dist/src/apps/administration/main.js |
| Commerce | Backend/services/commerce/Dockerfile → services/commerce/dist/src/apps/commerce/main.js |
| API Gateway | Backend/gateway/Dockerfile → gateway/server.cjs |
| Dos jobs | Backend/Dockerfile, target compose-init → scripts/compose-volume-guard.cjs o compose-bootstrap.cjs |

Gateway conserva su contrato de rutas sin modificarlo. Su imagen contiene solo
`/app/gateway` y Node, sin el monolito. Cada dominio expone health que consulta
PostgreSQL; Gateway agrega los cuatro dominios, OCR y PrintAgent. Redis comprueba
PONG autenticado. La salud de Nginx/BFF acredita el proceso HTTP correspondiente;
la comunicación real se comprobó además con solicitudes a las APIs.

## Recursos aislados y persistencia

Proyecto: `primax-astra-original`. Redes `primax-astra-original_web`
(10.249.241.0/24) y `primax-astra-original_data` (10.249.240.0/24, interna).
Solo los cinco puertos de la tabla se publican en 127.0.0.1. No se publican
PostgreSQL, Redis, OCR, PrintAgent ni los dominios. Todos los servicios apuntan
a una sola base `primax_astra_original_local` en el mismo PostgreSQL del proyecto.

Cuatro volúmenes con prefijo `primax-astra-original_`: postgres_data, redis_data,
print_data y bootstrap_state. El último conserva propiedad, huella de migraciones,
huella de configuración de seed y estado de inicialización; no es otra base de datos.
No hay bind mounts que reemplacen fuentes o dist. Los secretos/credenciales por
defecto son propios de esta demo y diferentes de los usados por la exposición.

En un `up` posterior, bootstrap comprueba las 36 migraciones/41 tablas y omite
migraciones y seeds si el estado es ready. Una inicialización propia interrumpida
puede reanudar sus pasos originales. Una base existente sin estado propio es
rechazada. Un cambio de migraciones o credenciales de seed provoca rechazo por
drift; no se sobrescriben contraseñas ni se repone inventario automáticamente.

Parar y volver a arrancar conservando todo:

```bash
docker compose stop
docker compose up -d
```

Para reiniciar infraestructura durante una prueba propia:

```bash
docker compose restart postgres redis
docker compose up -d
```

Los servicios pueden mostrar degraded durante ese reinicio. Se comprobó igualdad
del volcado completo de datos y secuencias antes/después, valores Redis con TTL
positivo y el mismo trabajo de impresión después de reiniciar los 15 procesos.
No borrar volúmenes o marcadores para sortear un rechazo: conservarlos y revisar
la configuración/propiedad. `down` sin `-v` conserva volúmenes, pero `stop` es
suficiente para la operación cotidiana.

## Configuración opcional y diagnóstico

`.env.example` enumera overrides; el archivo `.env` es opcional y privado.
Configurar contraseñas propias antes de la primera inicialización; para la URL
PostgreSQL usar valores hexadecimales sin caracteres reservados. Cambiar únicamente
puertos no altera datos. Las variables son FRONTEND1_PORT, FRONTEND1_T02_PORT,
FRONTEND2_PORT, FRONTEND3_PORT y BACKEND_PORT. Compose también pasa esos puertos
a enlaces, BFF, cookies y orígenes. No reutilizar nombre/volúmenes de la exposición.

Si Docker/VPN ya utiliza estas subredes, elegir dos CIDR privados libres con
ASTRA_WEB_SUBNET y ASTRA_DATA_SUBNET antes de crear el proyecto. Los CIDR explícitos
evitan depender de un pool automático que puede estar agotado; no se necesita
limpieza global Docker. Una red ya creada no cambia de CIDR por reiniciar.

Para revisar problemas sin mostrar secretos:

```bash
docker compose config --quiet
docker compose ps -a
docker compose logs --tail 80 volume-guard bootstrap
docker compose logs --tail 80 identity-service commerce-service backend
```

`docker compose config` sin `--quiet` expande contraseñas; no publicar su salida.
Los overrides históricos LAN/managed-database y scripts de validación antiguos no
forman parte de este procedimiento final ni fueron certificados en Lote 4.

Pruebas opcionales sin Node en el anfitrión, ejecutadas en el contenedor test:

```bash
docker compose --profile test run --build --rm backend-tests npm test -- --silent
docker compose --profile test run --rm backend-tests node --test gateway/routes.test.cjs scripts/build-domain.test.cjs scripts/compose-init.test.cjs scripts/seed-local-demo.test.mjs
```

Ese perfil ejecuta Jest por defecto y no crea bases adicionales. El runner
histórico test-compose.cjs conserva su implementación, pero no es el comando
predeterminado del perfil y no fue ejecutado sobre esta instalación.

## Plataformas, hardware y límites

Se construyeron y ejecutaron imágenes Linux amd64 sobre Docker Desktop de Windows.
Los manifiestos de las bases Node fijada por digest, PostgreSQL 17.6, Redis, Python
y Nginx incluyen variantes amd64 y arm64. Eso no demuestra un build completo arm64:
OpenCV/numpy, Tesseract y todas las dependencias deben comprobarse en ese host.
No se fija `platform: linux/amd64` ni hay rutas Windows o PowerShell obligatorios
en los contenedores. No se certifican hosts Linux/macOS ni ARM por inferencia.

PrintAgent Docker es solo demo; una impresora física requiere el agente Windows,
drivers y una validación propia. Cámara, permisos del navegador y calidad OCR real
son límites de hardware. Se mantienen T01 (recuperación funcional pendiente),
TARJETA, política legacy x-kiosk-key, proveedores comerciales/SMTP deshabilitados,
AuthCore/Prisma/bootstrap y motores legacy compartidos, y alcance académico A.4.
No hay pagos externos reales, emisión SUNAT ni autonomía productiva declarada.

Lote 4 concluye con esta integración. La validación integral de plataformas,
frontends, persistencia/fallos y entrega final pertenece a Lote 5 y requiere
nueva autorización.

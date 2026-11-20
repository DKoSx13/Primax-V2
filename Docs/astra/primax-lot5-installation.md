# Lote 5 — manual reproducible de instalación y operación segura

Requisito de producto: Docker con Compose moderno, contenedores Linux, puertos y espacio disponibles; Internet para primeras descargas. No instalar manualmente Node, PostgreSQL, Redis ni dependencias backend. Ejecutar desde la raíz del **original**, nunca desde la copia de exposición. Consultar también [runbook Lote 4](primax-lot4-compose-runbook.md), que conserva la configuración vigente y cuentas públicas locales; aquí no se publican claves privadas de laboratorio.

## Arranque predeterminado

```sh
docker compose config --quiet
docker compose up -d
docker compose ps -a
docker compose logs --tail 60 volume-guard bootstrap
```

No se requiere copiar `.env.example`, instalar paquetes ni ejecutar seeds a mano. Proyecto por defecto `primax-astra-original`. Puertos loopback: Gateway 27200, T01 27281, Prime 27282, Control 27283, T02 27284. Se esperan 15 saludables más volume-guard/bootstrap terminados código 0. El estado healthy puede tardar después de que up regresa; `docker compose up -d --wait --wait-timeout 180` permite esperar explícitamente.

La validación Lote 5 no lanzó ese proyecto existente: utilizó snapshots de archivos versionados, proyectos nuevos, claves aleatorias, puertos 273xx y 274xx y volúmenes verificados inexistentes. Primera instalación sin `.env`/node_modules locales; segundo proyecto principal `primax-astra-lot5-main-39e19f7d`. No borrar ni reutilizar sus datos para repetir una demostración.

Para una instalación de pruebas adicional, usar un checkout limpio separado, `COMPOSE_PROJECT_NAME` nuevo, puertos libres y ASTRA_DATA_SUBNET/ASTRA_WEB_SUBNET libres; conservar las variables de esa instalación en un archivo privado no versionado. Antes de up: `docker compose -p NOMBRE config --volumes` y `docker volume inspect NOMBRE_postgres_data NOMBRE_redis_data NOMBRE_print_data NOMBRE_bootstrap_state` deben confirmar que ninguno existe. Si alguno existe o es desconocido, elegir otro nombre, sin eliminarlo. No apuntar a bases externas ni volúmenes de la exposición. Registrar las variables propias sin divulgarlas en informes; un config expandido contiene secretos.

Guardia de volúmenes → PostgreSQL/Redis/OCR/PrintAgent → bootstrap (entorno/migraciones/seeds permitidos) → dominios → Gateway/BFF/frontends. Un volumen no vacío desconocido es rechazado; no quitar el marcador ni forzar seeds para eludirlo. Se mantienen las 36 migraciones y 40 tablas de aplicación más la técnica.

## Diagnóstico, reinicio y detención

Todos los comandos siguientes requieren ejecutar en la raíz y con las **mismas variables y nombre del proyecto correcto**. No usarlos sobre la copia de exposición.

```sh
docker compose ps -a
docker compose logs --tail 80 backend identity-service catalog-service administration-service commerce-service
docker compose logs --tail 60 postgres redis plate-recognition print-service
docker compose exec -T postgres sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
docker compose exec -T redis sh -c 'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli ping'
docker compose stop
docker compose up -d
```

stop conserva volúmenes. No utilizar `down -v`, prune ni limpiezas globales. Para reiniciar mientras se valida persistencia, cerrar primero operaciones admitidas; no usar reinicio para intentar recuperar T01 ni el pago pendiente T02. Verificar antes/después SQL, Redis y trabajos; esperar salud de dependencias.

## Respaldo seguro

Crear una carpeta privada `backups` en el anfitrión fuera de la entrega pública. Los nombres son ejemplos; no sobrescribir backups previos. Comprobar primero nombre de proyecto y volumen. Los dumps pueden contener datos personales y hashes: no incorporarlos a Git.

```sh
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f /tmp/astra-backup.dump'
docker compose cp postgres:/tmp/astra-backup.dump ./backups/astra-backup.dump
docker compose exec -T postgres pg_restore --list /tmp/astra-backup.dump
docker compose exec -T redis sh -c 'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli SAVE'
docker compose cp redis:/data/dump.rdb ./backups/astra-redis.rdb
docker compose cp print-service:/data ./backups/print-data
docker compose cp bootstrap:/state ./backups/bootstrap-state
```

La ruta bootstrap `/state` coincide con compose.yaml vigente; contrastar siempre el proyecto/configuración efectiva antes de copiar. No fabricar un respaldo exitoso por omitir el error. Para una copia consistente entre PostgreSQL, Redis y archivos, detener primero escritores de aplicaciones y BFF, mantener las bases disponibles y registrar el instante. Luego respaldar, verificar tamaños/checksums y reanudar con up. La prueba real de este lote generó dump PostgreSQL y comprobó persistencia SQL/Redis/PrintAgent; no ejecutó restauración completa ni los tres últimos respaldos de ejemplo.

Restaurar únicamente en otra instalación nueva, aislada y expresamente preparada para restauración; no ejecutar pg_restore --clean ni cambiar marcadores sobre los volúmenes existentes. La restauración debe conservar versión de esquema, estado bootstrap, credenciales y correspondencia con Redis/PrintAgent; requiere su propia validación antes de usar la copia.

## Repetir pruebas

Herramientas opcionales de desarrollo (Node como orquestador; backend/clientes ejecutados dentro de Docker): `tools/astra/lot5-validation.cjs`, `lot5-client-tests.cjs`, `lot5-administration-postgres-redis.cjs`, `lot5-commerce-postgres-redis.cjs`. Los runners pareados crean recursos sintéticos privados y los detienen al terminar; retienen volúmenes/evidencias y no reutilizan los del producto. Requieren la imagen de validación documentada por los runners existentes. `lot5-http-security.cjs` solo admite metadatos privados de un proyecto cuyo nombre comienza `primax-astra-lot5-`; nunca pasarle los del producto o exposición.

La evidencia revisable queda bajo `Docs/astra/evidence/lot5-validation`; los logs completos y dumps sintéticos permanecen en `.cache`. Los scripts de pruebas no son requisito para `docker compose up -d`.

Para auditar la ejecución guardada sin arrancar aplicaciones: `node tools/astra/lot5-resume-audit.cjs`. Requiere los artefactos privados .cache conservados, pero no motor Docker disponible: si este falta se registra la limitación. No vuelve a ejecutar pruebas financieras ni reutiliza volúmenes. Al reanudar el Lote 5 el canal dockerDesktopLinuxEngine no existía; verificar primero el motor para una instalación nueva. Las instrucciones de arranque no significan que se haya ejecutado otra instalación en esta sesión.

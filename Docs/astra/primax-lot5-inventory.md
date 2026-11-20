# Lote 5 — inventario de artefactos y entorno comprobado

Este inventario describe la ejecución anterior conservada, **no el estado actual del motor Docker**. Al reanudar, Docker Desktop Linux Engine no responde; no se arrancó ni modificó ningún proyecto. Proyecto principal sintético: `primax-astra-lot5-main-39e19f7d`; primera instalación preservada: `primax-astra-lot5-63bb6fca`. Ambos usaron recursos nuevos; el primero conserva el fallo y el principal el recorrido normal.

## Contenedores de la ejecución principal

| Servicio | Estado registrado | Imagen (ID abreviado) | Montajes persistentes |
|---|---|---|---|
| administration-service | healthy | sha256:e7d6c1bd7b6ff823f12 | Sin volumen persistente |
| backend | healthy | sha256:505db95d5c13ff8988b | Sin volumen persistente |
| bootstrap | exited / exit 0 | sha256:e257119e62e7c8e684e | primax-astra-lot5-main-39e19f7d_bootstrap_state → /state |
| catalog-service | healthy | sha256:709005b833b468c0955 | Sin volumen persistente |
| commerce-service | healthy | sha256:7e2b22e6a0a9663c631 | Sin volumen persistente |
| frontend1 | healthy | sha256:3d8d00fa1bf4eca5a13 | Sin volumen persistente |
| frontend2 | healthy | sha256:84e6e4f76fa78cbadd0 | Sin volumen persistente |
| frontend3 | healthy | sha256:993f0fc84bfe93dbb5b | Sin volumen persistente |
| fuelflow-gateway | healthy | sha256:7313ed68b6758abaf97 | Sin volumen persistente |
| fuelflow-gateway-t02 | healthy | sha256:e867fca58fdd8a1d921 | Sin volumen persistente |
| fuelflow-t02 | healthy | sha256:dad352ec6815f0d24d3 | Sin volumen persistente |
| identity-service | healthy | sha256:e747b486c2690caf5d8 | Sin volumen persistente |
| plate-recognition | healthy | sha256:b98c7e16872db124dc4 | Sin volumen persistente |
| postgres | healthy | sha256:f3bd19c606e442c3d7b | primax-astra-lot5-main-39e19f7d_postgres_data → /var/lib/postgresql/data |
| print-service | healthy | sha256:e04e7cfe9071dd06059 | primax-astra-lot5-main-39e19f7d_print_data → /data |
| redis | healthy | sha256:c5d34a98396a4775e22 | primax-astra-lot5-main-39e19f7d_redis_data → /data |
| volume-guard | exited / exit 0 | sha256:1dee6e5c0f3bad5f464 | primax-astra-lot5-main-39e19f7d_bootstrap_state → /volumes/bootstrap; primax-astra-lot5-main-39e19f7d_postgres_data → /volumes/postgres; primax-astra-lot5-main-39e19f7d_print_data → /volumes/print; primax-astra-lot5-main-39e19f7d_redis_data → /volumes/redis |

Se registraron 15 saludables y dos jobs con exit 0. Los cuatro runtimes de negocio son independientes; backend es Gateway. PostgreSQL única compartida, Redis, OCR, PrintAgent, dos BFF FuelFlow y cuatro servidores de interfaz (FuelFlow T01/T02 más Prime/Control) explican los 17 contenedores. No es un quinto backend monolítico.

## Plataforma y persistencia

- Host registrado: Microsoft Windows NT 10.0.26200.0; Docker Compose version v5.6.1; navegador Chromium 158.0.8127.36 Windows Win64 x64.
- Motor registrado: linux x86_64 Docker Desktop; imágenes linux/amd64 en [manifiesto de plataformas](evidence/lot5-validation/platform-images.json). Linux nativo, macOS y ARM64 no ejecutados.
- PostgreSQL 17.6 (Debian 17.6-2.pgdg12+1): 36 migraciones terminadas, 41 tablas y cero FK sin validar. Snapshot SQL y trabajo demo idénticos tras reinicio; sonda Redis conservada.
- Dump sintético: 238936 bytes; SHA-256 `4b4d20a4f57a241410568393be4a9b95b08eeedba14c0c4cced2bced61b79f55`. Permanece privado en .cache; no se probó restauración.
- Redes principales 10.248.242.0/24 y 10.248.243.0/24: contrastar con configuración privada preservada antes de reutilizar cualquier recurso; no son recursos para sobrescribir.

## Entregables y procedencia

| Artefacto | Procedencia / evidencia |
|---|---|
| Siete documentos recuperados | Revisados antes de modificar; se conserva contenido y se corrige el dictamen de cierre |
| Matriz maestra y trazabilidad JSON | Completadas al reanudar; 115 rutas, puertos/adaptadores, autorización, motor/TX y familias |
| 576 Jest, 297 clientes, 12 OCR, 8 init, 24 Gateway, 9 packaging | Resultados y logs anteriores conservados; hashes de archivos privados en resume-audit.json |
| 22 familias, 2570 checkpoints | Snapshots originales vueltos a comparar, 44 brazos con fuentes contrastadas |
| Navegador, seguridad HTTP, persistencia, capturas | Artefactos anteriores iguales a sus originales privados y SHA-256 verificados |
| Auditoría de reanudación | tools/astra/lot5-resume-audit.cjs y evidence/lot5-validation/resume-audit.json |
| Nueve evidencias históricas | Fuera del commit, mismos hashes y sin seguimiento |

No se incorporan .env, configuraciones privadas, dumps ni metadatos con secretos. Los logs completos siguen en .cache. Los manifiestos públicos permiten verificar qué archivos se revisaron; para reejecutar se requieren los runners y Docker, no los secretos anteriores. No se exige un hash fijo para datos de una ejecución nueva con UUID aleatorios.

Al preparar la entrega se saneó el argumento de contraseña Redis en el inventario JSON público (`<redacted:REDIS_PASSWORD>`). El original privado permanece intacto; resume-audit.json registra su hash y verifica que solo cambió ese argumento. No se modificó ninguna de las nueve evidencias históricas.

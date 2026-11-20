# Lote 5 — compatibilidad y portabilidad

| Nivel | Plataforma | Evidencia | Dictamen |
|---|---|---|---|
| A, anfitrión ejecutado | Windows NT 10.0.26200.0 x64; Docker Desktop, Compose 5.6.1; Chromium 158 | Build, instalación limpia, navegador, redes, persistencia y reinicio | Aprobado con las limitaciones funcionales comunes |
| B, contenedor ejecutado | Linux amd64, engine x86_64 Docker Desktop | Todas las imágenes inspeccionadas son linux/amd64; cinco compilaciones y 15 servicios/2 jobs | Aprobado |
| C, análisis estático | Linux nativo amd64 | Compose/Dockerfiles y scripts compatibles en principio; no hay rutas absolutas Windows ni bind mounts de código en runtime | No ejecutado; no certificado |
| C, análisis estático | macOS Intel o Apple Silicon | Docker Desktop y rutas relativas; impresora demo evita driver Windows | No ejecutado; no certificado |
| C, análisis estático | Linux/ARM64 | No hay `platform` impuesto en Compose; dependencias nativas, Prisma, bcrypt, OCR/Tesseract requieren build y prueba real | No se construyó ni ejecutó ARM64 |

`platform-images.json` registra IDs reales y arquitecturas. Un ID del contenedor puede referir al digest del manifiesto, y el image inspect por etiqueta al ID de configuración; no se interpreta esa diferencia como una imagen distinta de código.

El arranque básico depende solo de Docker/Compose e Internet en la primera construcción. Node, npm, PostgreSQL, Redis, Python y Tesseract se encuentran dentro de imágenes. Los scripts de validación con Node son herramientas opcionales de desarrollo, no pasos de arranque del producto. La composición usa contextos relativos, volúmenes nombrados, DNS Docker y scripts Linux/Node; PrintAgent demo no invoca PowerShell ni instala drivers. La impresión física conserva su integración Windows original y queda fuera del arranque básico.

No se afirma reproducibilidad bit a bit de paquetes externos: el build puede depender de repositorios apt/registro e imágenes base y de sus actualizaciones. Las pruebas utilizaron caché de capas de Docker válida; el snapshot limpio no tenía `.env`, node_modules ni artefactos de host. No se vació caché global ni se simuló un anfitrión sin caché.

Para verificar otra plataforma: crear checkout limpio, reservar puertos/subredes y proyecto distintos, generar secretos sintéticos propios fuera de Git, comprobar volúmenes inexistentes y ejecutar config/up desde la raíz. Registrar `docker info`, Compose, image inspect OS/arch, jobs, health, UI en navegador y las mismas familias de datos/integridad. En ARM64 construir sin emulación y verificar Prisma/bcrypt/OCR; registrar por separado cualquier emulación amd64. Reiniciar y comparar SQL/Redis/PrintAgent. No reutilizar volúmenes del anfitrión anterior ni afirmar éxito por solo analizar YAML.

El alcance local Windows con contenedores Linux amd64 tiene evidencia propia. **El cierre multiplataforma de 3J sí queda pendiente**: §7 lo clasifica P0, §8.10 exige repetir en hosts Windows/Linux/macOS y §10.6 exige arranque/reinicio/persistencia/replay/parada documentados en esos sistemas. El usuario confirmó al reanudar que no dispone de hosts Linux/macOS y ordenó conservar ese criterio. ARM64 nativo sigue pendiente si corresponde al Mac objetivo; no se certifica por inferencia. Además existe el bloqueo funcional independiente de recuperación T02.

## Evaluación estática y límites

Compose usa contextos relativos, volúmenes nombrados y redes DNS propias; no exige paths Windows de runtime ni instalación de Node en el host. Los secretos se suministran por variables y el escape `$$` se deja al contenedor; los healthchecks usan herramientas de sus imágenes. Dockerfiles de servicios independientes y scripts Node/Linux evitan un paso oculto PowerShell para arrancar. Son indicios de diseño portable, no pruebas en Linux/macOS. Permisos de ejecutables, CRLF en scripts, sensibilidad a mayúsculas, bind mounts de herramientas de desarrollo, recursos Docker Desktop, bibliotecas nativas Prisma/bcrypt/Tesseract y disponibilidad de imágenes deben verificarse allí. La impresión física conserva su dependencia Windows y no forma parte de la impresión demo portable.

## Protocolo exacto pendiente por host

1. Registrar commit entregado, SO/versión, CPU nativa, `docker version`, `docker info` y `docker compose version`. En Apple Silicon declarar expresamente si se usa emulación; no contar contenedores amd64 emulados como ARM64 nativo.
2. Preparar checkout limpio sin .env/dependencias del autor. Reservar nombre de proyecto, puertos y subredes nuevos, suministrar configuración demo local y secretos propios privados. Verificar ausencia de contenedores/volúmenes de ese nombre; elegir otro nombre si existen, sin eliminarlos.
3. Ejecutar `docker compose config --quiet`, `docker compose up -d` desde la raíz y esperar salud. Registrar build real de las cuatro imágenes, Gateway, OCR y PrintAgent y OS/arch por imagen; comprobar los 15 healthy y dos jobs exit 0, migraciones 36 y tablas 41. No ejecutar migraciones/seeds manuales.
4. Ejecutar las familias HTTP pareadas con PostgreSQL/Redis nuevos, Gateway/packaging y suites de backend/clientes/OCR; registrar referencia, fixtures, checks y snapshots. Comprobar seguridad, pertenencia, estaciones, permisos, CSRF/firma y negativos configurados. Usar siempre demo, sin pagos externos.
5. En navegador del host recorrer Prime y Control (roles y logout), T01 solo dentro de su alcance histórico, T02 venta normal, comprobante/impresión demo y OCR fixture. La recuperación T02 permanece un caso fallido conocido; no ejecutar ni recapturar pagos para ocultarlo. Su futura reparación requiere validación aislada específica.
6. Ejecutar segundo up, reinicio de procesos del proyecto nuevo y comparar SQL/UUID/relaciones/secuencias, Redis y archivos PrintAgent. Registrar replay con misma clave y ausencia de duplicación; detener solo ese proyecto con drenaje, sin SIGKILL en parada normal y sin borrar volúmenes.
7. Guardar manifiesto saneado con comandos/exit codes, fechas, hashes, imágenes, CPU, logs, capturas y resultados por caso. Si ARM64 nativo falla por imagen base o dependencia, registrar fallo/pendiente; no reemplazarlo silenciosamente por amd64. Contrastar todos los criterios 3J y obtener aceptación del responsable sin cambiar la rúbrica.

Al reanudar, el motor Docker del host Windows tampoco respondía. No se volvió a medir runtime: los resultados A/B de la tabla corresponden a la ejecución anterior, auditada mediante artefactos guardados. Esto no convierte un contenedor Linux en un host Linux independiente.

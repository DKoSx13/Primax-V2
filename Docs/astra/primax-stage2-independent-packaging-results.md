# Astra — Etapa 2: empaquetado independiente

Fecha: 2026-11-18. Resultado: cuatro compilaciones e imágenes independientes construidas y verificadas sin bases de datos ni servicios externos. Compose operativo conserva su configuración anterior. La reorganización hexagonal de Etapa 3 no se inició.

## Respaldo y alcance

Verificación inicial: rama `feat/dezkz-identity-a4-core`, HEAD `bcd0ea8f946793b414429b4a9c8965315ffac286`, sin cambios versionados ni staging; únicamente los dos documentos nuevos de Etapa 1. Se revisaron su contenido, referencias/hashes y patrones de secretos/datos personales, sin hallazgos. No se copiaron configuraciones privadas.

Commit documental exclusivo: `05ad4d35c0f4a4f49743d09095e55a2b25f1cb59`, mensaje `docs(astra): document microservice contracts and ownership baseline`. Incluye sólo los dos documentos de Etapa 1. Los commits y documentos anteriores permanecen intactos.

El commit de implementación de esta entrega contiene las once rutas previstas y dos documentos de resultados (este informe y el JSON de evidencia); estos últimos registran la validación y no amplían el alcance operativo.

## Archivos de implementación — once rutas

| Archivo | Cambio y razón |
|---|---|
| `Backend/package.json` | Añade build/start de los cuatro servicios y `test:packaging`. Mantiene scripts antiguos y todas las dependencias/versiones; package-lock no cambia |
| `Backend/scripts/build-domain.cjs` | Compilación por allowlist, salida individual, copia del soporte runtime, manifiesto de hashes y protección de rutas/symlinks/concurrencia de builds |
| `Backend/scripts/build-domain.test.cjs` | Nueve pruebas del empaquetado, con fixtures temporales y compilador simulado; comprueban aislamiento y fallos reales de publicación, no reglas de negocio nuevas |
| `Backend/services/identity/tsconfig.build.json` | Cierre de imports desde `src/apps/identity/main.ts` |
| `Backend/services/catalog/tsconfig.build.json` | Cierre de imports desde `src/apps/catalog/main.ts` |
| `Backend/services/administration/tsconfig.build.json` | Cierre de imports desde `src/apps/administration/main.ts` |
| `Backend/services/commerce/tsconfig.build.json` | Cierre de imports desde `src/apps/commerce/main.ts` |
| `Backend/services/identity/Dockerfile` | Imagen runtime Identity y label `io.primax.service=identity` |
| `Backend/services/catalog/Dockerfile` | Imagen runtime Catalog y label correspondiente |
| `Backend/services/administration/Dockerfile` | Imagen runtime Administration y label correspondiente |
| `Backend/services/commerce/Dockerfile` | Imagen runtime Commerce y label correspondiente |

Documentación nueva adicional: `Docs/astra/primax-stage2-independent-packaging-results.md` y `Docs/astra/evidence/stage2-independent-packaging.json`. No se modificaron documentos históricos ni evidencias A.4.

## Funcionamiento del build

Cada perfil extiende `Backend/tsconfig.json`, usa el main existente como única entrada explícita y sigue sus imports. No se trasladó código de negocio ni se crearon carpetas hexagonales vacías. Los archivos se publican en `Backend/services/<servicio>/dist/`, preservando la organización relativa `src/` y `scripts/`.

El compilador trabaja en un directorio temporal hermano de dist para conservar la profundidad de los source maps. Antes de publicar comprueba el main, rechaza otros mains de servicio y fuentes de seed/test emitidas, copia `scripts/database-safety.cjs` y escribe `build-manifest.json` con hashes de archivos. Un fallo de compilación/validación conserva la salida previa. Un lock por servicio evita dos publicaciones simultáneas; servicios distintos tienen rutas independientes. Las eliminaciones se limitan a salidas generadas verificadas y no siguen symlinks. Una interrupción abrupta puede dejar un lock de build: comprobar que no hay compilador activo antes de retirar ese archivo generado. No es un mecanismo de coordinación de datos o cuarentena A.4.

El build raíz, su Dockerfile y sus comandos permanecen disponibles. El script nuevo no inicia Nest, no genera Prisma Client por sí mismo y no llama migrate/seed. Requiere dependencias instaladas y cliente generado, como el build anterior.

Cada Dockerfile usa el mismo Node `22.21.1` fijado por digest y npm `10.9.4`, ejecuta `npm ci`, genera Prisma Client a partir del esquema existente, compila sólo el perfil y poda dependencias dev. Generar Client no aplicó migraciones ni requirió conexión a PostgreSQL. Runtime copia node_modules, el dist del servicio y package manifests; inicia su main con usuario `node`. No contiene fuentes raíz, directorio raíz de seeds, scripts de migración de arranque ni archivo `.env`.

Las cuatro imágenes mantienen una entrada única y una selección explícita de servicio. No hay nuevo servidor financiero, writer, endpoint o RPC. Los start locales apuntan a `services/<servicio>/dist/src/apps/<servicio>/main.js`; los CMD Docker usan la misma ruta dentro de `/app`.

## Línea base y resultados reales

Host: Windows, Node `v24.22.1`. El proyecto pide Node 22, por lo que builds y suites principales se ejecutaron con Node `v22.21.1` en Docker Linux/amd64. `npm` directo en PowerShell encontró la restricción existente de ejecución de npm.ps1; no se cambió esa política ni se instalaron dependencias en el host. La suite nueva también pasó directamente con Node 24 en Windows.

| Comprobación | Antes del cambio | Después del cambio |
|---|---|---|
| Dockerfile/build antiguo, target test | Correcto | Correcto; 135 JS/CJS emitidos idénticos a la línea base |
| Jest Backend con persistencia/proveedores simulados | 36 suites, 300 pruebas, todas correctas | 36 suites, 300 pruebas, todas correctas |
| Gateway + database-safety | 29 correctas tras corregir el montaje del harness | 29 correctas |
| Selección de frontends sin servicios | 67 correctas | 67 correctas |
| Tests nuevos de empaquetado | No existían | 9 correctos en Windows/Node 24 y 9 en Docker/Node 22; ningún skip |
| ESLint de los dos scripts nuevos | No aplicable | Correcto, sin errores |
| Fuentes de contratos/persistencia/fronteras del anexo Etapa 1 | Hashes coincidentes | Único hash diferente: package.json por scripts añadidos |

No hubo fallos preexistentes del build o de las suites seleccionadas. La primera invocación de database-safety en Docker falló por el montaje incompleto de una dependencia relativa de `tools/local-targets.cjs`; se corrigió sólo la invocación, montando el archivo requerido en lectura, y pasaron 29/29. No se ejecutaron realmente migraciones: esos tests comprueban que los wrappers rechazan un destino ficticio antes de cargar las herramientas.

El primer intento nuevo de Identity rechazó erróneamente el adaptador legítimo `src/prisma` por un filtro de seeds demasiado amplio. Se corrigió el filtro para distinguir `prisma/` raíz de `src/prisma/`, y la prueba de publicación ahora incluye ese adaptador. Los builds finales y su inspección pasaron después de esta corrección. No se modificó Prisma operativo.

Avisos existentes: dependencias fijadas con mensajes de deprecación y configuración `package.json#prisma` obsoleta para una futura versión de Prisma. No se actualizaron dependencias ni se cambió esa configuración en esta etapa.

### Compilaciones e inspección de runtime

| Servicio | Archivos en manifiesto, sin contar el propio manifiesto | JS/CJS verificados | require literales resueltos | Source maps verificados | Rutas de metadata compilada, con health | Diferencias ejecutables frente al build antiguo |
|---|---:|---:|---:|---:|---:|---:|
| Identity | 111 | 56 | 212 | 55 | 27 | 0 |
| Catalog | 105 | 53 | 208 | 52 | 7 | 0 |
| Administration | 95 | 48 | 199 | 47 | 38 | 0 |
| Commerce | 171 | 86 | 361 | 85 | 47 | 0 |

Se verificaron hashes de todos los archivos del manifiesto, sintaxis de JS/CJS sin ejecutarlos y resolución de requires literales, incluido Prisma Client después de prune. Se cotejaron los JS/CJS incluidos contra el build anterior: todos son idénticos en cada servicio. Esto no implica que un artefacto deba contener los 135 ejecutables del build amplio; cada uno tiene su cierre de imports y el soporte runtime requerido.

También se interceptó `bootstrapDomain` exclusivamente en la memoria del proceso de inspección para leer los módulos entregados por cada main compilado, sin crear una aplicación Nest ni conectar infraestructura. Se recorrió metadata de módulos/controladores, agregando los módulos comunes existentes del bootstrap, y se compararon métodos/rutas con el anexo de Etapa 1: coincidencia exacta. Health está repetido en cuatro servicios; las 115 rutas de negocio mantienen su destino. Esta inspección no prueba inyección real de todos los providers, ejecución de guards o comportamiento HTTP integrado.

Los source maps conservan referencias que resuelven al árbol original `/app/src/`; las fuentes TypeScript no se distribuyen en runtime. Todos los contenedores de verificación usaron `--network none`, sin puertos publicados ni servicios de persistencia. Sólo los tests seleccionados de frontends y la utilidad de rechazo de destinos necesitaron bind mounts de lectura. No se pasaron archivos env ni credenciales del host.

### Imágenes obtenidas

| Imagen local | Identificador local Docker |
|---|---|
| `primax-astra-identity:stage2` | `sha256:c27c040c9b461a7839c455ff3a9b93e9fdb2038c31357a5928f392b5457ea737` |
| `primax-astra-catalog:stage2` | `sha256:d608f5f28c52625e62bc13d6e3e6500fe2f09989647fb8f90ced70cb456c843a` |
| `primax-astra-administration:stage2` | `sha256:34d90bd1b8f6f0389e650ed7bc929ae75b934ee6b408b6587437bbd9f3bbd56e` |
| `primax-astra-commerce:stage2` | `sha256:a6c8c15086a18fd01cf1fc67f6e0f96a96c226dba40c4560059e4551fd0b01bd` |

Son imágenes locales Linux/amd64; no fueron publicadas ni seleccionadas por Compose. Se conservaron además las imágenes de baseline y validación `primax-astra-stage2-baseline:test` y `primax-astra-stage2-validation:test`. No se eliminaron imágenes, volúmenes ni datos existentes.

## Comandos ejecutados y reproducción

Desde la raíz del repositorio, builds sin iniciar aplicaciones:

```text
docker build --target test --tag primax-astra-stage2-baseline:test --file Backend/Dockerfile Backend
docker build --target build --tag primax-astra-identity:stage2-build --file Backend/services/identity/Dockerfile Backend
docker build --target test --tag primax-astra-stage2-validation:test --file Backend/Dockerfile Backend
docker build --progress plain --tag primax-astra-identity:stage2 --file Backend/services/identity/Dockerfile Backend
docker build --progress plain --tag primax-astra-catalog:stage2 --file Backend/services/catalog/Dockerfile Backend
docker build --progress plain --tag primax-astra-administration:stage2 --file Backend/services/administration/Dockerfile Backend
docker build --progress plain --tag primax-astra-commerce:stage2 --file Backend/services/commerce/Dockerfile Backend
```

El segundo comando es el intento inicial fallido explicado arriba; no produjo una imagen build con ese tag. Los cuatro comandos runtime finales sí concluyeron correctamente.

Pruebas principales, ejecutadas antes/después con la imagen correspondiente:

```text
docker run --rm --network none primax-astra-stage2-baseline:test npm test -- --ci
docker run --rm --network none primax-astra-stage2-validation:test npm test -- --ci
docker run --rm --network none primax-astra-stage2-validation:test npm run test:packaging
docker run --rm --network none primax-astra-stage2-validation:test node node_modules/eslint/bin/eslint.js scripts/build-domain.cjs scripts/build-domain.test.cjs
node --test --test-reporter=spec Backend/scripts/build-domain.test.cjs
```

Gateway/seguridad: `node --test gateway/routes.test.cjs scripts/database-safety.test.cjs` dentro de ambas imágenes test; en la invocación final se usó reporter spec. Se montó `tools/` en `/tools` y `Backend/scripts/database-safety.cjs` en `/Backend/scripts/database-safety.cjs`, ambos de lectura, para satisfacer las rutas relativas del test sin modificarlo. No se montó un env del Backend.

Selección frontend dentro de cada imagen test, con repositorio en `/repo` de lectura y workdir `/repo`; baseline usó reporter dot y validación reporter spec:

```text
node --test --test-reporter=spec Frontend_1_FuelFlow/tests/kiosk-gateway.test.js Frontend_1_FuelFlow/tests/critical.test.js Frontend_2_PrimaxPrime/tests/services.test.js Frontend_2_PrimaxPrime/tests/auth.test.js Frontend_2_PrimaxPrime/tests/payment-state.test.js Frontend_3_PrimaxControl/tests/control-proxy.test.js Frontend_3_PrimaxControl/tests/recovery-origin.test.js
```

Las inspecciones utilizaron `docker image inspect` y `docker run --rm -i --network none <imagen> node` con programas enviados por stdin: hashes/sintaxis/resolución de dependencias y metadata, sin ejecutar el bootstrap real ni iniciar aplicaciones. Los programas y resultados detallados quedan en [evidence/stage2-independent-packaging.json](evidence/stage2-independent-packaging.json). Comandos adicionales fueron lecturas de archivos, búsqueda de efectos en tests, git status/diff/log/rev-parse y comprobaciones de hashes. Los logs locales de los cuatro builds finales se conservaron en `.cache/astra-stage2/` (ignorados por Git).

Build/start disponibles para uso futuro desde Backend: `npm run build:<servicio>` y `npm run start:<servicio>`. **Los start no se ejecutaron**: sí conectarían las dependencias configuradas. No ejecutar esta receta contra datos existentes para suplir la validación aislada pendiente.

## Qué sigue compartido y qué no se demostró

Siguen compartidos el código fuente Backend/src, package/lock y dependencias, Prisma/schema/migraciones únicos, bootstrap, configuración, AuthCore/JWT/guard/Users/Kiosk, Alerts, helpers y modelos transaccionales. Los controllers definidos en un archivo de módulo importado pueden estar presentes como código sin registrarse en ese servicio: la metadata cotejada distingue presencia de exposición. No se forzó una reducción de imports que alterara DI o políticas.

No se cambió la distribución de comandos de Terminal/User/Membership/stock. Las autoridades y unidades TX01–TX13 del informe anterior permanecen iguales. Los servicios nuevos no escribieron datos durante esta validación. No se reabrió Identity A.4 ni se activó su laboratorio.

Queda pendiente la validación funcional integrada con PostgreSQL/Redis nuevos, fixtures de correo/pagos/OCR/print, arranque/reinicio/persistencia y recorridos completos en los tres frontends. No se ejecutaron tests e2e que migran/seed o modifican SQL. No se demostró todavía equivalencia funcional completa ni autonomía hexagonal del código. No se arrancaron las aplicaciones con sus dependencias reales.

Tampoco se validó multiarch ARM, Docker en macOS/Linux nativos ni un arranque limpio completo mediante Compose. Se construyeron y verificaron contenedores Linux/amd64 desde Docker Desktop Windows. El mecanismo de procesos Windows se probó en la suite de empaquetado, no como soporte certificado de todo el sistema en tres plataformas.

Compose operativo y sus Dockerfiles antiguos quedan intactos. La adopción efectiva de estas imágenes y el arranque controlado necesitan validación aislada posterior; no se preparó un override activo ni se ejecutó Compose. Migraciones y seeds no forman parte del CMD de ninguna imagen nueva. Kubernetes sigue fuera del alcance.

## Aceptación y reversión

Se acepta esta etapa como **empaquetado independiente verificado**, con cuatro imágenes, cuatro cierres de imports, defaults antiguos conservados, suites seguras sin regresión y contratos estáticos iguales. No se acepta como validación de despliegue integrado o certificación productiva.

Reversión propuesta: retirar la selección futura de imágenes nuevas y revertir únicamente el commit de Etapa 2 mediante un cambio revisable; usar los comandos/imagen antiguos, que no se modificaron. No hay cambios de datos que revertir. No borrar volúmenes, restablecer historia, repetir migraciones ni ejecutar seeds. La reversión no se ejecutó porque no se adoptaron las imágenes en el entorno operativo.

Estado al preparar la entrega: únicamente las once rutas de implementación y los dos documentos de resultados; sin cambios de código operativo, frontends, Gateway, Prisma, Compose ni evidencias históricas. La autorización del usuario permite el commit local exclusivo de Etapa 2 tras estas comprobaciones. El hash y el estado Git posterior al commit se informan en la entrega final; este documento no intenta contener su propio hash de commit.

Detención: Etapa 2 finalizada; no comenzar Etapa 3 sin una nueva autorización.

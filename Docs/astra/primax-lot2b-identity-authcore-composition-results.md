# Lote 2B — desbloqueo de composición Identity/AuthCore

Referencia autorizada: `49025813890ad426d64c4a6af6277c852d0ccc66`.
Rama comprobada: `feat/dezkz-identity-a4-core`. Árbol versionado inicialmente limpio;
18 ancestros del informe anterior y la referencia comprobados con `merge-base`.
`git fsck --connectivity-only` termina correctamente, con blobs dangling preexistentes.
Las nueve evidencias históricas conservan sus SHA-256 originales, siguen sin seguimiento
y quedan excluidas del commit. Evidencia revisable: [resumen](evidence/lot2b-composition/review-summary.json).

## Causa exacta y corrección

Había dos aristas que llevaban los controladores Identity al cierre de compilación
de los otros procesos:

1. `src/apps/bootstrap.ts` y `src/operations/operations.module.ts` importaban
   `AuthCoreModule` desde `auth.module.ts`. Ese archivo definía también `AuthModule`
   e importaba `AuthController`, `AdminController` y `KioskController`.
2. `AccessGuard` importaba `demoAdminEnabled` desde `admin.controller.ts`.
   Separar solamente los módulos no eliminaba esta segunda dependencia.

TypeScript resuelve estos imports aunque Nest no registre los controladores en el
proceso. Cada Dockerfile de dominio copia `src` y únicamente `services/<dominio>/src`.
Un import Identity en cualquiera de los tres controladores exige fuentes ausentes
en Catalog, Administration o Commerce y produce **TS2307**. No era un problema de
alias TypeScript, dependencias npm ni falta de un provider de autenticación.

La solución extrae la composición global original a `auth-core.module.ts`, sin
cambiar providers, exports, `UsersModule`, `APP_GUARD`, fábrica/opciones JWT ni
configuración. `auth.module.ts` conserva la fachada HTTP y reexporta la misma clase
AuthCore para compatibilidad. Los dos consumidores core importan directamente el
archivo nuevo. `demoAdminEnabled` pasa intacta a `demo-admin-enabled.ts`, un módulo
hoja; el controlador la importa y reexporta, y el guard cambia únicamente su import.
Ningún cuerpo de método HTTP, decorador de ruta o regla de acceso cambia.

No se modifican Dockerfiles, tsconfigs ni scripts productivos de build. Tampoco se
añaden fuentes Identity a los otros servicios, interfaces alternativas, HTTP interno,
escritores o procesos adicionales. Las nuevas aristas no tienen camino de retorno
en el grafo de imports locales: no se introduce un ciclo de composición.

## Archivos y finalidad

| Archivo | Cambio necesario |
|---|---|
| `Backend/src/auth/auth-core.module.ts` | Composición global original, libre de controladores HTTP. |
| `Backend/src/auth/auth.module.ts` | Fachada HTTP original; import/reexport de la misma clase core. |
| `Backend/src/auth/demo-admin-enabled.ts` | Función existente extraída literalmente, sin política nueva. |
| `Backend/src/auth/admin.controller.ts` | Import/reexport de esa función; métodos y contratos intactos. |
| `Backend/src/auth/access.guard.ts` | Únicamente cambia el origen del import de la función. |
| `Backend/src/apps/bootstrap.ts` | Import del módulo core separado; bootstrap restante idéntico. |
| `Backend/src/operations/operations.module.ts` | Import del mismo core; sin cambio funcional Commerce. |
| `Backend/src/auth/auth-composition.spec.ts` | Clase compartida, metadata de composición y opciones JWT. |
| `tools/astra/lot2b-composition-diagnostic.cjs` | Comparación de cinco contextos y probes de imports futuros. |
| `tools/astra/lot2b-composition-validation.cjs` | Regresiones y compilaciones offline. |
| `tools/astra/lot2b-composition-postgres-redis.cjs` | Comparaciones sintéticas y arranque real de imágenes en laboratorio. |
| `tools/astra/lot2b-image-bootstrap.cjs`, `lot2b-images.cjs` | Construcción de cinco imágenes y smoke interceptado sin red. |
| `tools/astra/lot2b-source-integrity.cjs` | Comparación literal de composición/política, ciclos, historia y evidencias. |
| Este informe, matriz Lote 2, plan 3J y resumen JSON | Actualización del diagnóstico y evidencia, preservando el texto histórico. |

## Validación y comparación antes/después

Todas las ejecuciones usan copias descartables del código. Baseline restaura desde
la referencia los cinco archivos versionados de composición/imports modificados;
candidate usa la solución. Las herramientas anteriores permanecen como evidencia
histórica, incluido el diagnóstico que exige el fallo original.

| Verificación | Resultado |
|---|---|
| Reproducción anterior a la edición | Commerce original compila; import Identity en AuthController produce TS2307. |
| Diagnóstico completo antes/después | 20 compilaciones: 10 normales y 10 con probes, cinco contextos por brazo. Tres fallos TS2307 esperados exclusivamente en baseline Catalog/Administration/Commerce; las otras 17 pasan. |
| Probes | Imports type-only de casos de uso existentes en copias de AuthController, AdminController y KioskController. Ninguna ruta migrada en el repositorio. |
| Regresiones Identity/AuthCore/Catalog | **206 pruebas, 20 suites, cero fallos**; incluye las 197 previas, dos de composición y siete SMTP/credenciales con transporte simulado. |
| Gateway | **24/24**, fuentes intactas. |
| Empaquetado | **9/9**, scripts productivos intactos. |
| Compilaciones finales | Identity, Catalog, Administration, Commerce y legacy: cinco correctas. |
| Imágenes Docker | Cinco Dockerfiles originales, imágenes nuevas, usuario `node`, comandos originales. |
| Smoke sin red | Cinco entrypoints llegan una vez a `listen` con NestFactory interceptado; sin lifecycle real ni bases. |
| Bootstrap real | Cinco imágenes con Nest real, PostgreSQL/Redis sintéticos nuevos: health `200`, base `up`; login vacío `400` en Identity/legacy y `404` en los otros tres procesos. |
| Integridad del bootstrap | Volcado completo de datos y secuencias idéntico antes/después; cinco servicios detenidos al terminar. |
| Fuentes/políticas | Composición original y función extraída iguales literalmente, guard con cambio de import únicamente; 150 hashes protegidos anteriores verificados. |

En cada contexto Docker, los mismos probes que fallaban en los otros tres servicios
ahora compilan sin incluir sus dependencias Identity, porque esos controladores ya
no pertenecen a su grafo de imports. Identity y legacy sí conservan sus fuentes y
fachadas HTTP originales. No se afirma que un import arbitrario en un motor compartido
esté permitido: las futuras fronteras deben permanecer del lado HTTP Identity.

Comparación de manifests originales, incluyendo `.js` y `.map`:

| Proceso | Archivos antes | Después | Diferencia |
|---|---:|---:|---|
| Identity | 173 | 177 | Añade core separado y helper; conserva controladores. |
| Catalog | 159 | 155 | Retira fachada AuthModule y tres controladores; añade core/helper. |
| Administration | 117 | 113 | Misma separación. |
| Commerce | 301 | 297 | Misma separación. |

Los manifests candidate de los tres procesos no Identity no contienen fuentes de
`services/identity`, fachada AuthModule ni esos tres controladores. Cada uno conserva
un único main propio. Legacy sigue compilando y arrancando como compatibilidad.

Comparaciones HTTP sobre los mismos casos/datos sintéticos, una base y Redis nuevos
por brazo/familia:

| Familia | Comprobaciones por brazo | Comparación |
|---|---:|---|
| Perfil y vehículos | 42 | Igualdad canónica de respuestas y estado. |
| Registro, login, recuperación, autorización | 31 | Igualdad canónica; motores reales, entrega simulada. |
| Kiosco, firma, sesión, replay, recuperación | 19 | Igualdad canónica y Redis comprobado. |
| Admin Identity y OCR | 30 | Igualdad canónica; transporte OCR simulado. |
| Catalog y filtros de estación | 29 | Igualdad canónica y permisos originales. |
| Total | **151 por brazo; 302 en total** | Cinco comparaciones correctas. |

Se reutilizan sin editar los escenarios aprobados de Lote 2. La normalización
original compara tablas/registros, secuencias y Redis; valida secretos/tokens antes
de normalizar sus campos variables y conserva estados/errores. No acredita igualdad
universal, todas las intercalaciones concurrentes ni disponibilidad de proveedores.
La fixture HTTP no sustituye la prueba adicional de arranque real de los procesos.

Aislamiento: PG `17.6-bookworm`, Redis `7.4-alpine`, credenciales aleatorias, redes
internas sin puertos publicados, volúmenes nuevos comprobados vacíos y propiedad
verificada antes de migrar. El bootstrap real utiliza otro par nuevo. Se detienen
todos los proyectos propios; se conservan sus volúmenes. No se ejecuta Compose sobre
datos operativos ni se eliminan volúmenes históricos. Logs, credenciales, volcados y
comparaciones detalladas quedan en `.cache/astra-lot2b-composition`, fuera de Git.

Incidencias de verificación resueltas: el primer build Docker sin red no pudo
descargar paquetes Debian; los builds definitivos permiten repositorios de
dependencias. Dos intentos del smoke interceptado requirieron completar su entorno
sintético, sin cambios productivos. El primer probe candidate detectó el import del
guard a AdminController y motivó la extracción literal del helper. Todos los checks
definitivos pasan; los intentos fallidos se conservan privadamente.

## Resultado finito y pendientes

**P0 de composición y empaquetado resuelto. Los 15 contratos están técnicamente
desbloqueados por esta causa, pero ninguno se migra ni se cuenta como completado.**
Identity sigue en **9/26** fronteras validadas: quince operaciones pendientes de
consolidación y dos excepciones técnicas propuestas, todavía sin aceptación.
Catalog conserva el cierre académico de seis lecturas y sus observaciones.

Las dependencias comunes de AuthCore, Prisma, bootstrap y una PostgreSQL siguen
explícitas; no se declara autonomía productiva. Se mantienen T01, la política legacy
`x-kiosk-key`, TARJETA/`OnlineOrder_method_check`, exposición pública de inventario,
limitaciones de proveedores externos y A.4 sin activar. PasswordReset, authVersion,
sesiones, revocaciones, transacciones y permisos no se modifican.

Propuesta para completar Lote 2, sujeta a autorización posterior: consolidar juntos
los quince contratos por tres familias internas —cinco auth, seis kiosco y cuatro
workflows admin Identity— reutilizando motores; verificar cada familia y cerrar una
matriz única. Resolver expresamente las dos excepciones en esa autorización, sin
generar etapas por ruta. No se solicitan cambios de políticas como consecuencia de
esta reparación. Si una futura frontera los exigiera, se debe detener esa familia.

Un solo commit local de Lote 2B; su hash se informa en la entrega y se identifica por
el historial de este informe, evitando un hash autorreferencial. Sin push/merge.
Trabajo detenido después de reparar P0: no se migran los quince contratos ni se
inician Administration, Lotes 3–5 o Docker Compose definitivo.

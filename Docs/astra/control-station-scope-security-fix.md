# Control — corrección puntual de aislamiento por estación

Estado: **corrección local implementada y verificada con mocks sintéticos**.
No desplegada, sin commit/push/merge. No se inicia Identity A.4 3B.

Base y HEAD conservados: b4594ef80bd923a449fc923b01159e2d4aeb3deb.
Rama: feat/dezkz-identity-a4-core. Al inicio había 30 archivos sin seguimiento y
ningún cambio tracked. Se capturaron hashes de los 1031 archivos existentes para
verificar preservación; el único cambio versionado autorizado es el servicio indicado.

Este informe actualiza el estado del hallazgo descrito en
Docs/astra/identity-a4-control-scope-security-review.md. El informe previo y todos
los archivos A.4 se conservan como antecedentes históricos, sin editar.

## 1. Causa y alcance exactos

En Backend/src/control/control-customers.service.ts:

- membershipStationFilter devuelve OR entre actividad Transaction y
  FuelAuthorization en las estaciones autorizadas.
- customers y memberships expandían ese objeto en where y después otro objeto
  OR con búsqueda q. Si q.trim() tenía texto, la segunda propiedad reemplazaba
  el OR de autorización; Prisma recibía solo la búsqueda en ese nivel.
- Los includes de vehículos y actividad conservaban filtros, pero no impedían
  que se devolviera el encabezado de una membresía ajena ya seleccionada.
- Sin q significativo el alcance se conservaba; vehicles usa AND y no tenía
  esa sobrescritura; los detalles individuales conservaban sus propias comprobaciones.

Se reprodujo con clientes sintéticos que solo tenían actividad en B y un actor
limitado a A. Buscar por número, nombre o correo devolvía la identidad de B,
incluyendo UUID, nombre, correo enmascarado y, con el permiso correspondiente,
número/status de membresía. No hacía falta que B tuviera actividad autorizada.

Los permisos/roles seguían siendo comprobados: no se trata de acceso anónimo.
La corrección conserva las reglas actuales de grants, máscaras y campos globales.

## 2. Pruebas creadas antes de corregir

Nuevo archivo Backend/src/control/control-customers-scope.spec.ts: 23 pruebas
ejecutadas mediante Jest/ts-jest sobre el servicio real. El mock evalúa la semántica
AND/OR, some, in, contains, filtros anidados, orden y take de los argumentos Prisma
recibidos; no exige una forma particular de AND en una aserción ni retorna siempre
un array vacío. Opera solo sobre registros sintéticos en memoria y rechaza formas
no soportadas. No sustituye una prueba del motor PostgreSQL.

Resultados del código original, antes de modificar el servicio:
**9 aprobadas, 14 fallidas, 23 ejecutadas**, con cero omitidas.

Evidencia: Docs/astra/evidence/control-station-scope-before-e6d102269887000fa249.json.
SHA-256 del servicio original registrado:
23c42c5185477557ecafe8546a463432cc9b9a94b12b5f6043512b5b3313868f.

Las fallidas muestran tanto filas de otras estaciones en búsquedas como problemas
al combinar stationId/status/q y al aplicar take=100. Se conservaron las evidencias
con los resultados observados; no se regeneró la evidencia histórica A.4.

### Matriz cubierta

| Escenario | Resultado esperado y comprobado después |
| --- | --- |
| Sin q, q vacío o espacios | Solo membresías con actividad permitida |
| q por número/nombre/email, sin importar mayúsculas | No aparecen clientes/membresías de B para actor limitado a A |
| Varias estaciones autorizadas | Unión de actividad autorizada, conservando la intersección con búsqueda |
| Actividad por autorización en vez de transacción | También concede visibilidad dentro de la estación correcta |
| stationId + status + q | Todas las condiciones se conservan, sin sobrescritura |
| Global con grants válidos | Mantiene todas las capacidades actuales, sin filtro de estación si no lo solicita |
| Global que solicita stationId | El filtro solicitado también se respeta con q |
| Permisos insuficientes o estación explícita ajena | Forbidden antes de consultar |
| Cero asignaciones | Forbidden; sin fallback global |
| Alcance ausente/mal formado o global no booleano | Forbidden antes de consultar listas |
| Detalles por usuario/membresía | Recursos ajenos/desconocidos mantienen NotFound; recursos propios accesibles |
| Vehículos y relaciones anidadas | Conservan alcance, enmascaramiento y campos condicionales |
| Error de persistencia | Se propaga; no se reintenta como consulta sin alcance |
| Tope de 100 filas | Alcance/búsqueda se aplican antes del límite; filas ajenas no ocupan los resultados |
| Datos originales | Las consultas no modifican los registros sintéticos |

## 3. Corrección aplicada

Único archivo versionado modificado:
Backend/src/control/control-customers.service.ts.
Diff acotado: 10 líneas añadidas y nueve eliminadas, en tres zonas.

1. customers combina el predicado de alcance y el de búsqueda dentro de AND.
2. memberships hace lo mismo y conserva el filtro status existente.
3. scope rechaza global que no sea booleano, stationIds que no sea array o sus
   elementos que no sean strings no vacíos, antes de usar el contexto.

Los literales mode='insensitive' se fijaron con as const para conservar el tipo
Prisma.QueryMode dentro de los nuevos arrays; no cambia el valor en ejecución.

La validación de scope responde al requisito autorizado de no ampliar permisos
cuando falta o falla el alcance. Antes, stationIds undefined/null podía terminar
como ausencia de filtro, y un global truthy no booleano se interpretaba como global.
Es defensa de la misma frontera de autorización, no una nueva política de roles:
los actores válidos de AuthCore ya contienen boolean y array de estaciones.
No se modificó AuthCore ni se afirma que un cliente HTTP pudiera falsificar ese
contexto; las pruebas de contexto mal formado se hacen en el límite del servicio.

No se alteraron selects/includes, permisos, campos, masking, orden, límites,
transacciones ni cálculo financiero. La igualdad lógica requerida es:

    alcance_por_estación AND búsqueda_si_existe AND estado_si_existe

Una búsqueda ya no puede reemplazar el alcance. Solo un actor global válido sin
stationId explícita obtiene intencionalmente un filtro global.

## 4. Paginación, conteos y detalles

Estas rutas de clientes/membresías no ofrecen page/limit, skip ni un totalCount:
devuelven arrays con take=100 y orden createdAt desc. No se añadió paginación ni
una consulta count para completar el requerimiento de seguridad.

Se probaron 105 miembros autorizados y 105 ajenos más recientes: la lista queda
en 100 autorizados, manteniendo el orden y sin que los ajenos consuman el cupo.
Buscar únicamente ajenos devuelve [] y longitud cero. El mock count no se invoca
y no se añade un campo total. Los DTO reales, mediante ValidationPipe, siguen
rechazando page/limit desconocidos con BadRequest.

Se comprobaron detalles por identificador, usuarios con varias estaciones,
recursos sin actividad y filtros combinados. Los agregados de puntos del detalle
y los conteos de otros dashboards no fueron reescritos; las pruebas previas de
Control, incluidos conteos existentes de EcoDigital, siguen pasando. Esto no es
una auditoría integral de todos los agregados de la plataforma.

## 5. Entorno y resultados reales

Nuevo reproductor: tools/control-station-scope-check.cjs. Modos:

    node tools/control-station-scope-check.cjs before
    node tools/control-station-scope-check.cjs after
    node tools/control-station-scope-check.cjs backend

before selecciona la suite nueva, after las suites unitarias de Control y backend
la batería unitaria de Backend. El modo no cambia/revierte el servicio: si se usa
before después de corregir, ejecutará el código corregido. La reproducción roja
histórica se acredita con su evidencia/hash, sin reset/switch ni edición de Git.

Cada ejecución utilizó un contenedor nuevo de la imagen local
primax-v2-backend-test:latest, digest
sha256:38ceee7d6e80b0ed7b3e7d4065312238874d9d10bdbba0dd1152b21ce16fe6e0,
con red none, filesystem de imagen/fuentes readonly y tmpfs nuevo. Node v22.21.1,
TypeScript 5.9.3. No se instaló ni actualizó ninguna dependencia.

El cliente Prisma almacenado en la imagen era anterior al esquema actual (faltaban
Receipt y TerminalOperation.number). Se generó un cliente con el esquema vigente
solo en tmpfs, reutilizando Prisma/engines locales y bloqueando autoinstalación.
Solo la copia temporal del destino de generación y la resolución de módulos de
prueba se ajustaron; el schema del repositorio no cambió. Generate no ejecutó
migraciones ni creó/conectó ninguna base. DATABASE_URL de pruebas apuntaba a un
destino imposible 127.0.0.1:1 y el contenedor no tenía red.

| Ensayo actual | Resultado | Evidencia bajo Docs/astra/evidence/ |
| --- | --- | --- |
| Preparación inicial con cliente cached anterior | 0 pruebas: error de tipos del cliente, no reproducción válida | control-station-scope-before-63a675dce99a63a5248f.json |
| Reproducción con servicio original y cliente temporal correcto | 23 ejecutadas: 9 pasan, 14 fallan | control-station-scope-before-e6d102269887000fa249.json |
| Primer intento tras AND | 18 pruebas previas pasan; suite nueva no ejecuta por literal ensanchado a string | control-station-scope-after-8621ff797b2aab6ba4d6.json |
| Control, corrección final | **41/41 aprobadas, cinco suites**, cero omitidas | control-station-scope-after-502401468f9503ec8c02.json |
| Backend completo unitario | **300/300 aprobadas, 36 suites**, cero omitidas | control-station-scope-backend-42a141f2cc48a8702b34.json |

Las 41 incluyen las 23 nuevas y 18 existentes; las 300 incluyen esas 41. No sumar
conteos como ejecuciones independientes de todas las pruebas ni afirmar CI global.
Los problemas de tipos intermedios se corrigieron en el arnés nuevo o en el pequeño
diff autorizado, sin arreglar componentes ajenos ni desactivar diagnósticos.

ESLint del servicio y la suite nueva: aprobado con configuración del repositorio,
en otro contenedor sin red y sin instalar dependencias. node --check del runner y
git diff --check también aprobados. No se ejecutaron formatters sobre otros archivos.

SHA-256 del servicio corregido probado por ambas ejecuciones finales:
34b2210d87e233fdedc724f175f8b47d46e5238215c6bfc5c324260f08e688cd.

## 6. Garantías y límites

Para las consultas construidas y los casos ejecutados, el predicado de estación
se mantiene por conjunción con q; no hay fallback a consulta global por un alcance
mal formado o un error del repositorio. Se conservan derechos globales válidos y
restricciones de los detalles/relaciones. La reducción de resultados ajenos es la
corrección autorizada, no un cambio de permisos.

Las pruebas usan mocks semánticos y el servicio real con tipos Prisma generados
del schema actual. No se realizó prueba HTTP con guard completo ni integración
PostgreSQL: no se afirma haber probado el motor SQL, revocación concurrente real
o un despliegue productivo. No se alteró ningún schema, base, volumen, datos o
transacción financiera. No se iniciaron contenedores PostgreSQL ni servicios de
otros dominios; solo contenedores de herramientas nuevos y desechables.

No se detectó otra vulnerabilidad independiente que se corrigiera fuera del
alcance. No es una auditoría completa de Control/Backend ni garantía de ausencia
de otras vulnerabilidades. La política de estado/inactivos y los permisos actuales
se conservan, sin reinterpretarlos.

La corrección está en el árbol local, no desplegada. Las instalaciones existentes
no se consideran reparadas automáticamente por estas pruebas. Merge/publicación/
despliegue siguen requiriendo autorización separada.

## 7. Inventario y continuidad A.4

Modificado: Backend/src/control/control-customers.service.ts.
Nuevos: Backend/src/control/control-customers-scope.spec.ts,
tools/control-station-scope-check.cjs, este informe y cinco evidencias arriba.
Los 30 archivos nuevos anteriores, incluidos todos los laboratorios/evidencias
A.4, deben coincidir exactamente con la línea base inicial; no se eliminan ni
sobrescriben evidencias. HEAD y ambas ramas de referencia conservan su commit.

Cotejo final realizado: los 1030 archivos anteriores distintos del servicio
corregido permanecen idénticos por SHA-256, incluidos los 30 sin seguimiento.
Solo hay un archivo tracked modificado y ocho nuevos de este corte; 38 archivos
sin seguimiento en total. Whitespace sin errores. Rama y HEAD siguen en la base.

Advertencia de continuidad: tools/astra/identity-a4-static-read-checks.cjs conserva
un diagnóstico histórico que **espera la construcción vulnerable**. Tras esta
corrección esa expectativa deja de ser válida; el runner 3A que lo incluye puede
fallar por dicha aserción si se reutiliza sin actualizar. No se modificó ese archivo
protegido ni se atribuye su expectativa obsoleta a una regresión de lectura A.4.
Solicitar autorización para adaptarlo como comprobación de seguridad corregida
antes de reutilizar ese runner, manteniendo las evidencias históricas originales.

Recomendación: revisar y autorizar publicación/despliegue de la corrección por el
flujo acordado; después autorizar por separado la actualización del diagnóstico y
el siguiente corte de lecturas compatibles. No se inicia fase 3B ni se conecta
Identity A.4 al runtime como parte de este trabajo.

## 8. Cierre documental y comprobación de integridad

Esta sección registra una revisión documental posterior; no representa nuevas
ejecuciones de las pruebas descritas arriba ni un despliegue. Se añadió un apartado
de seguimiento al diagnóstico original, conservando todo su texto previo. La
afirmación histórica de la introducción sobre no editar ese informe corresponde
al corte de implementación: este cierre sí autoriza añadir dicho seguimiento.

Estado: **corregido y probado localmente, pendiente de integración y despliegue**.
La causa confirmada fue la sobrescritura del `OR` de estación por `q`. La corrección
aplica `AND` y valida el contexto de alcance antes de consultar. Se revisaron las
evidencias JSON: antes, 14 fallos entre 23 pruebas; después, Control 41/41 y Backend
300/300, incluyendo Control. No se realizaron pruebas HTTP/PostgreSQL ni despliegue.

Verificación inicial de este cierre:

- Rama `feat/dezkz-identity-a4-core`; HEAD y rama original de handoff en
  `b4594ef80bd923a449fc923b01159e2d4aeb3deb`.
- Los 1031 archivos de la línea base anterior a la corrección siguen presentes.
  SHA-256: solo difiere el servicio de Control autorizado; los otros 1030,
  incluidos los 30 archivos sin seguimiento previos, permanecían idénticos.
- Único archivo versionado modificado: `Backend/src/control/control-customers.service.ts`,
  con 10 líneas añadidas y nueve eliminadas. El diff se limita a la validación de
  alcance y la conjunción de filtros de clientes/membresías. No hay cambios staged.
- Hay 38 archivos sin seguimiento, todos preservados. Durante este cierre solo
  se actualizan los dos informes de seguridad; código, laboratorios y evidencias
  de Identity A.4 permanecen intactos.

Se revisaron los nombres y contenido de los 38 archivos nuevos buscando claves
privadas, tokens de servicios/JWT, URLs con credenciales y secretos literales.
No se encontraron credenciales reales ni archivos sensibles que deban excluirse.
Las cinco coincidencias revisadas corresponden a: una URL deliberadamente ficticia
y un `passwordHash` de prueba en `membership-a4-read.test.cjs`; dos plantillas de
URLs que reciben credenciales generadas para laboratorios nuevos; y las URLs
`invalid:invalid` de `tools/control-station-scope-check.cjs`, sin conexión a base.
No hay archivos `.env`, certificados, claves privadas, dumps o respaldos entre los
38. Esta revisión localizada no constituye una auditoría exhaustiva de secretos
del repositorio completo ni de archivos ignorados.

### Clasificación de los 38 archivos nuevos

| Grupo de respaldo propuesto | Implementación/herramientas | Pruebas | Documentación | Evidencias JSON | Total nuevo |
| --- | ---: | ---: | ---: | ---: | ---: |
| Identity A.4 fases 0–2 | 6 | 2 | 4 | 4 | 16 |
| Diseño fase 3 y lecturas 3A | 5 | 2 | 3 | 3 | 13 |
| Seguridad de Control, incluido diagnóstico original | 1 | 1 | 2 | 5 | 9 |
| Total | 12 | 5 | 9 | 12 | **38** |

El servicio operativo de Control ya versionado se añade al tercer grupo: no se
cuenta como archivo nuevo. El diagnóstico original surgió en 3A, pero se agrupa
completo con Control para conservar juntos el hallazgo y su seguimiento, sin
dividir ni reescribir su historia. La evidencia de fase 2 terminada en `75bee...`
pertenece a la regresión ejecutada durante 3A y se agrupa con ese corte.

## 9. Propuesta de tres commits locales — no ejecutada

Rutas relativas a la raíz del repositorio. La lista siguiente es exhaustiva y
asigna cada archivo nuevo exactamente una vez. No se hizo staging ni commit.
Los tres commits formarían una serie desde el HEAD verificado; la documentación
de 3A enlaza el diagnóstico que se incorporaría en el tercero. No se propone
publicar ni integrar un estado intermedio de la serie.

### Commit 1 — Identity A.4 fases 0–2 (16 archivos nuevos)

Título propuesto: `feat(identity): add private A4 numbering and persistence lab`.

```text
Docs/astra/identity-a4-invariants-and-core.md
Docs/astra/identity-a4-phase2-private-persistence-design.md
Docs/astra/identity-a4-phase2-private-persistence-results.md
services/identity/src/membership-codes/README.md
services/identity/src/membership-codes/core.ts
services/identity/test/membership-codes.test.cjs
services/identity/lab/owned-membership-a4-port.ts
services/identity/lab/owned-membership-a4-store.cjs
services/identity/lab/owned-membership-a4-store.test.cjs
services/identity/lab/owned-membership-a4.sql
tools/astra/identity-owned-membership-a4-lab.cjs
tools/astra/identity-owned-membership-a4-worker.cjs
Docs/astra/evidence/identity-a4-phase2-a4-b4f0c1562bb88bce5263eacf.json
Docs/astra/evidence/identity-a4-phase2-a4-7d6f767235d024a0954650c4.json
Docs/astra/evidence/identity-a4-phase2-a4-388190850142658691857203.json
Docs/astra/evidence/identity-a4-phase2-a4-9ba6aa4ea5db19437c335595.json
```

Incluye intentos fallidos y resultados satisfactorios tal como se conservaron;
no se sustituyen por una sola evidencia final. Excluye todos los archivos de los
commits 2 y 3 y cualquier componente operativo.

### Commit 2 — Diseño de fase 3 y lecturas privadas 3A (13 archivos nuevos)

Título propuesto: `feat(identity): add private A4 identity read contracts`.

```text
Docs/astra/identity-a4-phase3-compatible-reads-design.md
Docs/astra/identity-a4-phase3a-ocr-compatibility.md
Docs/astra/identity-a4-phase3a-private-read-results.md
services/identity/lab/membership-a4-read.ts
services/identity/lab/membership-a4-read-store.cjs
services/identity/lab/membership-a4-read.test.cjs
services/identity/lab/membership-a4-read.types.test.ts
tools/astra/identity-a4-read-parity-lab.cjs
tools/astra/identity-a4-read-worker.cjs
tools/astra/identity-a4-static-read-checks.cjs
Docs/astra/evidence/identity-a4-phase2-a4-75bee7ca1373a72d1a11cdce.json
Docs/astra/evidence/identity-a4-phase3a-a4-61b294efb648a180a1f23bfd.json
Docs/astra/evidence/identity-a4-phase3a-a4-978d9141e7ee719bd6899650.json
```

Se conserva el comprobador histórico sin modificar su expectativa vulnerable;
queda expresamente documentada su limitación tras el commit 3. No equivale a
declarar que ese runner completo sigue aprobando sobre el código corregido.
Excluye los archivos de los commits 1 y 3, adaptadores públicos y fase 3B.

### Commit 3 — Corrección y cierre documental de Control (10 archivos)

Título propuesto: `fix(control): preserve station scope when searching customers`.
Incluye un archivo versionado modificado y nueve archivos nuevos:

```text
Backend/src/control/control-customers.service.ts
Backend/src/control/control-customers-scope.spec.ts
tools/control-station-scope-check.cjs
Docs/astra/identity-a4-control-scope-security-review.md
Docs/astra/control-station-scope-security-fix.md
Docs/astra/evidence/control-station-scope-before-63a675dce99a63a5248f.json
Docs/astra/evidence/control-station-scope-before-e6d102269887000fa249.json
Docs/astra/evidence/control-station-scope-after-8621ff797b2aab6ba4d6.json
Docs/astra/evidence/control-station-scope-after-502401468f9503ec8c02.json
Docs/astra/evidence/control-station-scope-backend-42a141f2cc48a8702b34.json
```

Se conservan también los dos intentos con problemas de compilación, identificados
como tales en el informe. Excluye cualquier modificación adicional de A.4 o de
otros componentes; no actualiza todavía el diagnóstico ejecutable histórico.

### Exclusiones comunes y autorización pendiente

No se propone excluir ninguno de los 38 archivos nuevos revisados: todos tienen
un grupo explícito. Queda excluido **cualquier archivo fuera de estas 39 rutas**,
incluidos `.env`, credenciales, certificados, dumps, respaldos privados,
dependencias, clientes Prisma generados y salidas temporales. Las 55 evidencias
históricas no publicadas de DKoS no se regeneran ni se incorporan por inferencia.

Antes de ejecutar los commits autorizados posteriormente, volver a cotejar rama,
HEAD, hashes y rutas exactas para detectar cambios concurrentes. El plan no
autoriza commit, push, merge, despliegue, actualización de A.4 ni fase 3B.
La adaptación del comprobador histórico y las validaciones HTTP/PostgreSQL
aisladas requieren una autorización posterior independiente.

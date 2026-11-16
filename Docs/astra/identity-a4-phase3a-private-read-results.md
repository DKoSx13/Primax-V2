# Identity A.4 — fase 3A: lecturas privadas experimentales

Base: b4594ef80bd923a449fc923b01159e2d4aeb3deb.
Rama conservada: feat/dezkz-identity-a4-core. Sin commit, push o merge.
Se termina en 3A: no hay selección de runtime, endpoints ni integración pública.

## Alcance e inventario

Se verificaron los 17 archivos sin seguimiento iniciales y se capturó una línea
base de 1018 archivos (tracked más untracked) para cotejar al final. Ninguno de
ellos necesita modificarse. Los fuentes nuevos quedan en lab/tools, fuera del
include productivo src/**/*.ts y de los módulos de composición.

Archivos de implementación/pruebas creados:

1. services/identity/lab/membership-a4-read.ts
2. services/identity/lab/membership-a4-read-store.cjs
3. services/identity/lab/membership-a4-read.test.cjs
4. services/identity/lab/membership-a4-read.types.test.ts
5. tools/astra/identity-a4-read-parity-lab.cjs
6. tools/astra/identity-a4-read-worker.cjs
7. tools/astra/identity-a4-static-read-checks.cjs

Documentos nuevos: este informe, identity-a4-control-scope-security-review.md e
identity-a4-phase3a-ocr-compatibility.md, todos bajo Docs/astra. Evidencias nuevas
indicadas abajo; no se sobrescribieron las anteriores.

No se modificaron A.1/A.3, el núcleo previo, provisión fase 2, AuthCore/reset,
Membership.status, Vehicle, finanzas, Gateway, clientes, schemas o workflows.

## Arquitectura y contratos implementados

El módulo TypeScript define contratos y aplicación independiente de Nest/Prisma:
MembershipIdentityRead, IdentityBindingRead y MembershipIdentityRepository. Acepta
solo un actor member ya verificado por su llamador privado; **no verifica JWT ni
reemplaza AuthCore**. No acepta Control ni contexto administrativo.

SyntheticIdentityBindings copia y conserva un manifiesto inmutable con userId,
accountId y membershipId explícitos, incluyendo membershipId=null para usuario
sintético conocido sin membresía. Rechaza asignaciones ambiguas. Los UUID de
usuario, cuenta y membresía de los fixtures son distintos deliberadamente: no se
infiere la relación por igualdad, correo, documento ni número.

La aplicación ofrece:

| Método | Conducta |
| --- | --- |
| forUser(actor, userId opcional) | Propio usuario por defecto; otro target se rechaza antes de persistencia |
| byMembershipId(actor, UUID) | Recurso propio; UUID ajeno y desconocido comparten NOT_FOUND sin lectura ajena |
| resolveCode(actor, code, normalization) | Canónico/alias por núcleo previo; recurso ajeno se oculta como desconocido |
| aliasesForMember(actor, UUID) | Solo aliases de la membresía propia, lista inmutable |
| legacyMembershipCodes(view) | Proyección parcial privada {id,number,legacyNumbers}, sin campos inventados |

El repositorio SQL implementa lectura por UUID/cuenta y resolución canónico/alias.
Reutiliza resolveMembershipCode del núcleo. Sus lecturas relacionadas comparten
snapshot; agrupa aliases con orden determinista **privado**, sin modificar listas
HTTP actuales. No expone provision, recibos, contador ni un puerto transaccional
de escritura. El driver usa un rol separado con SELECT solo sobre MembershipIdentity
y MembershipCode y transacciones REPEATABLE READ + READ ONLY.

Resultado tipado: contractVersion=1, membershipId, accountId, canonicalNumber,
legacyNumbers y provenance {source:A4,sourceDatasetId,schemaVersion,observedAt}.
Resolución agrega matchedBy CANONICAL/ALIAS y matchedCode. No contiene dinero,
perfil, estado, Vehicle, recibos ni secretos; no debe enviarse directamente como
me o Vehicle HTTP. La lista de aliases y los objetos de salida son inmutables.

Errores sin bodies/SQL/URLs/IDs del proveedor:

| Código privado | Significado |
| --- | --- |
| INVALID_INPUT | Selector/UUID/normalización inválidos |
| DENIED | Actor no permitido o intento de consultar otro usuario por target explícito |
| NOT_FOUND | Usuario conocido sin membresía; UUID/código desconocido o ajeno oculto |
| NOT_PROVISIONED | Sin binding acreditado o fixture propio esperado ausente en A.4 |
| BINDING_MISMATCH | Vínculo del dataset incoherente, sin intentar repararlo |
| UNAVAILABLE | Fallo del puerto de bindings o persistencia; no equivale a ausencia |
| INVALID_UPSTREAM_RESPONSE | Forma/tipos de respuesta incompatibles; sin defaults |

No hay mapeo HTTP nuevo ni modificación de errores públicos. La autorización por
propietario está en la aplicación privada; el rol SQL puede leer ambas tablas del
dataset y no implementa RLS por usuario. No se presenta como un servicio público
seguro frente a un llamador que pueda falsificar el actor de confianza. Tampoco
se garantiza indistinguibilidad temporal frente a enumeración: se igualan resultado
y mensaje de recursos ajenos/desconocidos, sin devolver identidades ajenas.

## Pruebas ejecutadas ahora

### Unitarias y regresión A.4 previa

Comando, Node host v24.22.1:

    node --experimental-strip-types --test services/identity/test/membership-codes.test.cjs services/identity/lab/owned-membership-a4-store.test.cjs services/identity/lab/membership-a4-read.test.cjs

**35/35 aprobadas**, cero omitidas/fallos: 15 del núcleo, ocho de provisión y 12
nuevas de lectura. Ejecutadas nuevamente después de corregir los tipos del módulo
nuevo. No se afirman suites HTTP o financieras.

Casos nuevos: paridad de campos/UUID, canónico y alias, normalización explícita,
usuario sin membresía, binding/fila propia ausentes, actor no permitido, UUID/código
ajeno, target de otro usuario, entrada mal formada, manifiesto inmutable, proveedor
caído y recuperación, binding cruzado, respuesta inválida y ausencia de escrituras.

También se ejecutó de nuevo el runner **sin modificar** de fase 2:

    node tools/astra/identity-owned-membership-a4-lab.cjs

**14/14 grupos aprobados** en recursos nuevos, evidencia:
Docs/astra/evidence/identity-a4-phase2-a4-75bee7ca1373a72d1a11cdce.json.
Es una regresión actual distinta de las evidencias históricas; no sumar sus conteos.

### Laboratorio 3A y tipos

    node tools/astra/identity-a4-read-parity-lab.cjs

**9/9 grupos aprobados**, evidencia final:
Docs/astra/evidence/identity-a4-phase3a-a4-978d9141e7ee719bd6899650.json.

1. TypeScript 5.9.3: núcleo con opciones reales del tsconfig + noEmit; módulo y
   contratos 3A con iguales strict/target/module/libs y rootDir temporal ampliado
   para incluir lab, sin cambiar configuración. Assertions @ts-expect-error
   comprueban UUID string, normalización obligatoria, readonly y ausencia de
   provision/finanzas en el puerto. Cero diagnósticos finales; no build completo.
2. Fixtures nuevos creados con el store fase 2 existente, UUID separados y tres
   fronteras PRIME-001, PRIME-A001 y PRIME-AA001.
3. Paridad con métodos **reales** PrismaMembershipProfiles.forUser,
   VehiclesRepository.membership y matchesMembershipCode de Backend, compilados
   en memoria con repositorios de fixtures. Comparador legado en memoria; candidato
   sobre PostgreSQL nuevo. No se carga bootstrap, no se invoca el Backend real ni
   se presenta como comparación HTTP completa.
4. Target de otro usuario DENIED; UUID/canónico/alias ajeno oculto; no se retorna
   información del otro propietario. Los rechazos por UUID/target no consultan DB.
5. Casos sin membresía, UUID inexistente, fixture no provisionado y binding cruzado
   distinguidos, sin crear miembros desde la consulta.
6. Fallo real de permisos SQL: revocar SELECT al rol lector hace fallar la lectura
   como UNAVAILABLE saneado; restaurar el permiso en la base nueva permite la
   siguiente lectura sobre snapshot nuevo. No se cambia AuthCore ni una base previa.
7. Rol solo SELECT, intentos DML/DDL y lecturas de contador/recibos/centinela
   rechazados. 64 transacciones de lectura, 119 sentencias de dominio, todas SELECT;
   snapshots completos de las cinco tablas antes/después idénticos. Sin cambios
   del contador ni provisión durante consultas. Los GRANT/REVOKE del ensayo cambian
   permisos únicamente en la base nueva, fuera del camino de lectura.
8. Construcción de consultas extraída del fuente Control confirma sobrescritura de
   alcance con q, sin Control SQL/HTTP. Informe separado de seguridad.
9. Comparación del filtro Nest OCR real con sintaxis A.4 y revisión estática Python;
   no procesamiento de imágenes. Informe OCR separado.

Primer intento 3A conservado:
Docs/astra/evidence/identity-a4-phase3a-a4-61b294efb648a180a1f23bfd.json.
Falló el typecheck, antes de las pruebas de integración, por análisis de flujo de
un helper never declarado como const. Se cambió a declaración de función únicamente
en el archivo nuevo; el compilador pudo estrechar tipos null/asignación. No se
cambió un archivo anterior para resolverlo.

## Aislamiento demostrado

Cada runner crea nombre/nonce propios y red Docker interna nueva, PostgreSQL con
tmpfs, sin puertos publicados ni volúmenes existentes. Las URLs y credenciales se
generan para ese recurso; no se cargan .env ni URLs de bases del usuario. El worker
comprueba hostname, base y usuario esperados. Sus fuentes están montados readonly,
no hay listener HTTP y las imágenes locales usan --pull never.

TypeScript/Prisma disponibles en la imagen local evitan instalar/actualizar
dependencias. Los digests exactos figuran en la evidencia. El runner coteja todos
sus archivos previos antes de guardar evidencia por creación exclusiva. La
verificación final del turno coteja además la línea base inicial de 1018 archivos.

Se detuvieron solo los PostgreSQL nuevos identificados por etiqueta de esta tarea;
se conservaron sus redes y contenedores detenidos. Los workers propios son
desechables. No se eliminaron archivos, redes, volúmenes o contenedores previos.
Tmpfs es efímero y no constituye respaldo durable.

## Compatibilidad y diferencias

Se conserva formato y UUID; el binding de usuario se hace explícito y los aliases
resuelven al mismo canónico. La paridad probada cubre identificadores/códigos y la
proyección parcial usada por campos de me/Vehicle. **No** demuestra igualdad del
cuerpo completo de me, Vehicle, historial, Control ni OCR HTTP.

La normalización sigue siendo explícita. El registro único de fase 2 no representa
colisiones cruzadas que el legado podría conservar; no se importan ni corrigen
datos históricos. Alias ordenados dentro del contrato privado no autorizan a
reordenar respuestas públicas anteriores.

La lectura agrega autorización de propietario en una API privada nueva y metadatos
internos; no sustituye los permisos ni la forma HTTP existente. Los resultados
no incluyen status, Vehicle ni dinero: se necesitaría una composición posterior
con proveedores actuales, autorizada y probada por separado.

## Seguridad, OCR y riesgos pendientes

Ver los informes separados:

- Docs/astra/identity-a4-control-scope-security-review.md: pérdida de alcance con q
  confirmada en construcción de consultas; prioridad alta/atención inmediata si
  esas rutas están en uso con usuarios limitados. No se corrigió Control.
- Docs/astra/identity-a4-phase3a-ocr-compatibility.md: bloques A/AA del generador no
  cubiertos por OCR; filtros no equivalen a existencia o autorización. Sin cambios.

Limitaciones: sin transporte autenticado nuevo, RLS por usuario, consistencia
distribuida, caché de autorización, migración de bindings productivos ni regresión
frontend/HTTP. No se probaron todos los proveedores de lectura financiera; no se
calcula ningún valor financiero. No se resuelven CI previa ni timeouts históricos.

## Estado y siguiente etapa

Verificación final real: **1018/1018 archivos previos idénticos por SHA-256**,
incluidos los 17 sin seguimiento iniciales; 13 archivos nuevos en este corte y
30 sin seguimiento en total. Scripts CJS sin errores de sintaxis; whitespace
limpio y tracked idénticos a HEAD. No se encontraron referencias nuevas al
laboratorio en los componentes operativos examinados. Los tres PostgreSQL propios
de este turno (regresión, primer intento 3A y ensayo final) constan detenidos.

Todos los cambios son archivos nuevos sin seguimiento; HEAD y rama originales se
conservan. No se realizaron staging, commits, push, merge o conexiones operativas.

Antes de otra etapa, priorizar autorización separada para el defecto de alcance
Control. Para continuar A.4, proponer después paridad privada de las vistas me/
Vehicle completas con proveedores legados, sin tocar sus escritores, estado o
finanzas. Exige nueva autorización y pruebas sintéticas de error/compatibilidad;
la aprobación de este laboratorio no activa selección de runtime ni tráfico.

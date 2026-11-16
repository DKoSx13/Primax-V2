# Identity A.4 — implementación y validación privada de fase 2

Base: `b4594ef80bd923a449fc923b01159e2d4aeb3deb`, rama de trabajo
`feat/dezkz-identity-a4-core`. Alcance autorizado: laboratorio nuevo con datos
sintéticos y registro único experimental de números/alias. No se inicia fase 3.

## Implementación

Se añadieron seis archivos de implementación/pruebas y este informe:

- `services/identity/lab/owned-membership-a4.sql`: DDL exclusivamente para una base
  nueva, fuera de migraciones productivas y de los esquemas A.1/A.3.
- `services/identity/lab/owned-membership-a4-port.ts`: contratos privados de
  provisión, recibos y transacciones SQL; puerto de lectura reutilizado del núcleo.
- `services/identity/lab/owned-membership-a4-store.cjs`: adaptador SQL con opt-in
  sintético, formato del núcleo inyectado, provisión serializable, resolución sobre
  snapshot, recibos y clasificación de errores. No abre conexiones ni conoce URLs.
- `services/identity/lab/owned-membership-a4-store.test.cjs`: ocho pruebas unitarias
  de validación, bindings, límites de reintentos y resultados inciertos.
- `tools/astra/identity-owned-membership-a4-lab.cjs`: crea recursos exclusivos y
  verifica preservación de archivos; nunca usa URLs/volúmenes externos.
- `tools/astra/identity-owned-membership-a4-worker.cjs`: driver privado de ensayo,
  typecheck, integración PostgreSQL y restauración lógica.

No se modificaron los cinco archivos previos, archivos tracked, A.1/A.3, clientes,
AuthCore, PasswordReset, registro, Vehicle, estados ni código financiero. Se
reutiliza `services/identity/src/membership-codes/core.ts` sin editarlo. No hay
imports desde entrypoints operativos hacia el laboratorio ni endpoints nuevos.

El núcleo es puro. El adaptador recibe un puerto de transacciones SQL y el núcleo;
el driver de infraestructura solo existe en el worker privado. Se utiliza la
biblioteca Prisma instalada en una imagen local como ejecutor de SQL parametrizado,
sin métodos de modelos del Backend, sin importar sus servicios y sin generar otro
cliente. El DDL es la definición autoritativa: no se añadió un schema Prisma
redundante, no se ejecutó generate, build del Backend ni una migración.

## Modelo realmente instalado en cada base nueva

Esquema `identity_a4_private`, cinco tablas:

| Tabla | Garantía |
| --- | --- |
| AccountReference | UUID de ancla sintética, sin cuenta/perfil/credenciales |
| MembershipIdentity | UUID estable; accountId único y FK local al ancla |
| MembershipCode | code PK con collation C; kind CANONICAL/ALIAS; FK local a membresía |
| MembershipNumberCounter | Singleton id=1, BIGINT no negativo, incremento transaccional |
| AllocationReceipt | operationId PK, digest/versiones, miembro único, código canónico y ordinal; FK compuesta al código/propietario/tipo |

Índice parcial: como máximo un canónico por miembro. Constraint triggers diferidos:
al commit, cada miembro debe tener exactamente un canónico y un recibo. También
rechazan contador ausente/atrasado respecto de recibos. El recibo comprueba en SQL
que el ordinal corresponde a su código. Una función SQL independiente comprueba
integridad; el adaptador sigue formateando con el núcleo previo.

El rol de ejecución puede leer las tablas privadas, insertar membresía/códigos/
recibos y actualizar solo value del contador. No puede crear anclas, cambiar
identidades/códigos/recibos, borrar filas, hacer DDL ni leer el centinela de otro
dominio sintético. Triggers adicionales impiden modificar/borrar identidades,
códigos y recibos incluso al usar el instalador para ensayos negativos.

No hay FK externa, balance, documentos, permisos, bienvenida, estado o Vehicle.
AccountReference solo acredita un ancla local preparada antes: no demuestra
existencia/actividad de una cuenta real ni sustituye el registro público.

## Semántica privada y límites explícitos

El comando exige UUID explícitos, normalization exact o trim-uppercase y aliases.
Rechaza campos ajenos antes de SQL y alias repetidos tras normalizar. No hay modo
global por defecto ni reparación OCR. Las claves almacenadas cumplen la forma
ASCII actual. No se importaron datos históricos.

El digest SHA-256 vincula una tupla JSON ordenada con versión de contrato, política,
operationId, membershipId, accountId, modo y la lista **original ordenada** de alias.
Cambiar orden, forma original, IDs o modo con el mismo operationId es conflicto,
aunque alguna normalización produzca iguales claves. Es una regla técnica del
comando experimental, no una modificación de huellas financieras existentes.

Provisión: consultar recibo, bloquear contador, reconsultar, crear identidad,
reservar alias, incrementar/formatear y reservar canónico, insertar recibo y commit.
Los candidatos ocupados por cualquiera de los dos tipos se omiten con una inserción
condicional dirigida a la PK code. Hay presupuesto de candidatos y reintentos
acotados. No se reintentan arbitrariamente todos los conflictos únicos ni errores
de red/commit incierto. Un retry usa los mismos IDs y operationId.

Las dos lecturas de resolución se ejecutan en una transacción REPEATABLE READ,
READ ONLY. Esto no convierte la consulta interna en una API autorizada para humanos:
no se afirma aislamiento por actor/tenant ni se trasladan permisos. Se verifica
separación de propiedad por código y ausencia de mezcla de datos entre membresías.

## Ejecuciones reales de este corte

### Unitarias

Desde la raíz, Node v24.22.1:

```bash
node --experimental-strip-types --test services/identity/test/membership-codes.test.cjs services/identity/lab/owned-membership-a4-store.test.cjs
```

Resultado final: **23/23 aprobadas**, cero fallos/omitidas. Incluye 15 del núcleo
ejecutadas nuevamente y ocho nuevas del adaptador. El primer ensayo dio 22/23 por
una aserción de la prueba nueva que confundía SELECT FOR UPDATE con una escritura;
se corrigió esa aserción sin modificar el núcleo. No se presentan las 23 como
pruebas PostgreSQL.

### Laboratorio PostgreSQL y TypeScript

```bash
node tools/astra/identity-owned-membership-a4-lab.cjs
```

El runner exige imágenes ya disponibles y usa --pull never. No instala ni actualiza
dependencias. Utilizó Docker Linux, PostgreSQL 17.6, Node v22.21.1, TypeScript 5.9.3
y Prisma 6.19.3 disponibles en imágenes locales. Los digests exactos están en la
evidencia. La imagen de herramientas solo ejecuta Node/compilador/driver; nunca
arranca el Backend de esa imagen.

TypeScript: se leyó el tsconfig real de Identity y se creó un programa del núcleo
con sus opciones más noEmit. **Cero diagnósticos.** El módulo pasó el typecheck
aislado con CommonJS/ES2022/strict reales, sin cambiar configuración. No se compiló
el proyecto entero ni se verificaron tipos del adaptador CJS con checkJs. El puerto
TS en lab queda fuera del include productivo src/**/*.ts.

Se creó una red Docker interna nueva, sin puertos publicados, PostgreSQL nuevo con
tmpfs y credenciales nuevas. Se comprobó la etiqueta de propiedad y que no hubiera
volúmenes. Worker nuevo de solo lectura, fuentes montados readonly y /tmp propio;
no carga .env ni recibe URLs de base del usuario. La restauración usó otra base
nueva en ese mismo PostgreSQL exclusivo, no un recurso anterior.

Última ejecución: **14/14 grupos aprobados**, incluido un grupo de typecheck y 13
grupos de integración. No sumar estos grupos como pruebas unitarias individuales.

Evidencia final:
`Docs/astra/evidence/identity-a4-phase2-a4-9ba6aa4ea5db19437c335595.json`.

Comprobaciones concretas:

1. Typecheck del núcleo con configuración real.
2. Fronteras 999/A001, A999/B001 y Z999/AA001 contra PostgreSQL.
3. Unicidad conjunta: omitir candidato reservado como alias, rechazar colisiones
   de alias/canónico entre miembros y conservar UUID y número al resolver alias.
4. Agotar presupuesto de candidatos revierte membresía, alias y contador.
5. Ocho altas concurrentes mediante dos clientes Prisma independientes; números
   distintos. Carreras sobre petición idéntica, alias disputado y misma cuenta:
   resultado único conforme a restricciones. Son clientes concurrentes en un
   proceso, no una prueba de múltiples hosts ni de todos los órdenes posibles.
6. Fallos inyectados tras identidad, alias, contador, canónico y recibo: rollback
   completo comparado con snapshot anterior; las anclas precreadas permanecen.
7. Pérdida simulada de respuesta **después de completar realmente el commit**:
   error al llamador, recuperación por operationId y retry sin segunda asignación.
   Petición alterada rechazada.
8. SQL rechaza cuenta inexistente, alias huérfano, canónico inválido/duplicado y
   miembro incompleto al commit. Actualizar recibos falla.
9. Rol limitado rechaza lectura del centinela, DELETE y DDL; el centinela permanece
   idéntico. Cada código resuelve al UUID de su propio fixture.
10. Límite BIGINT firmado: sin wraparound ni filas parciales; función SQL y núcleo
    también coinciden para 9007199254740993 y 9223372036854775807.
11. Checksum corrupto, recibo reconocido ausente y restauración con contador bajo
    se rechazan; los intentos SQL fallidos no dejan filas parciales.
12. Restauración lógica de las cinco tablas en otra base nueva: igualdad completa
    de filas/UUID/contador y replay del recibo de la respuesta perdida, desde otro
    proceso worker.
13. Bajar el contador por debajo de recibos se rechaza sin alterar el snapshot.
14. La base restaurada continúa con el siguiente ordinal correcto, sin reutilizar
    números reconocidos.

La restauración parte de un snapshot consistente tomado antes del fixture de
capacidad máxima; ese fixture posterior no creó una provisión reconocida adicional.
El manifiesto/recibo esperado se comprueba antes de permitir replay de provisión.

## Fallos previos conservados

Todas las evidencias son nuevas; no se sobrescribieron intentos anteriores:

| Evidencia bajo Docs/astra/evidence/ | Resultado |
| --- | --- |
| identity-a4-phase2-a4-b4f0c1562bb88bce5263eacf.json | Preparación fallida: pg_isready observó el servidor temporal de inicialización antes de existir la base solicitada. Se añadió comprobación SQL efectiva de esa base. |
| identity-a4-phase2-a4-7d6f767235d024a0954650c4.json | Nueve grupos primarios aprobados; restore falló porque faltaba -i en docker run y no se transmitía el snapshot por stdin. Se corrigió el lanzador. |
| identity-a4-phase2-a4-388190850142658691857203.json | 12 grupos aprobados, antes de ampliar pruebas negativas de restore y presupuesto. |
| identity-a4-phase2-a4-9ba6aa4ea5db19437c335595.json | 14 grupos aprobados en ejecución final ampliada. |

Son ensayos diferentes; no se suman sus conteos como una sola batería. Los fallos
fueron del nuevo reproductor y no se atribuyen a CI previa, TLS o sistema público.

## Preservación y recursos

El runner final cotejó por SHA-256 sus 1015 archivos previos, incluidas evidencias
de intentos anteriores. El cotejo final del turno comprueba además la línea base
de 1006 archivos capturada antes de implementar: tracked y cinco archivos de fases
anteriores. Ninguno se modifica ni elimina. Cada evidencia usa creación exclusiva.

Cada ejecución detuvo únicamente su PostgreSQL etiquetado; contenedores PostgreSQL
detenidos y redes internas propias se conservaron. No se eliminaron volúmenes ni
se tocaron contenedores de otras tareas. Tmpfs pierde sus datos al detenerse: no
es un respaldo conservado. Los workers son desechables y solo sus contenedores
propios se eliminan automáticamente al salir.

## Diferencias frente al legado y límites

- El legado comprueba ocupación de Membership.number; el laboratorio comprueba el
  espacio conjunto canónico/alias, según autorización experimental. No se cambió
  el generador actual. Un alias con forma del próximo número provoca un salto.
- La estructura actual puede representar colisiones cruzadas; este laboratorio
  las rechaza, sin fusionar, renombrar ni migrar datos. No representa dos filas
  redundantes del mismo código en ambos tipos.
- El registro público incluye User/contador/Membership/bienvenida. La provisión
  privada solo crea identidad de membresía y códigos a partir de anclas sintéticas;
  no demuestra atomicidad de creación de cuenta, perfil o beneficios.
- Recibos/versiones son nuevos exclusivamente para el comando privado. No cambian
  operationId ni huellas de operaciones financieras ni recibos técnicos V2.
- Se demuestra rollback y exclusividad SQL para los escenarios ejecutados, no una
  prueba formal de todas las intercalaciones. Triggers de escaneo global son una
  opción de laboratorio pequeño, no una garantía de escalabilidad productiva.
- Persistencia sobreviviendo a respuesta perdida y restauración lógica sí se
  probaron. No se probaron WAL, backup físico, destrucción de almacenamiento,
  RPO cero, partición entre hosts ni recuperación de commits posteriores al snapshot.
- El dump lógico se transportó en memoria entre workers y no se entrega como
  respaldo durable. Evidencias guardan resultados/checksum, no credenciales ni datos
  de usuarios reales.
- No se ejecutó regresión HTTP/frontend/financiera. El código operativo está intacto;
  no se declara resuelta la CI previa ni autonomía completa de Identity.

## Próximo paso propuesto, sin iniciar

Para fase 3, proponer primero el contrato de lectura privado de número/alias y su
composición compatible detrás de una opción desactivada, con matriz de errores,
normalización y snapshot. No sustituir registro, estado, Vehicle, AuthCore o
finanzas. El diseño de esa integración y cualquier implementación necesitan nueva
autorización; esta entrega termina en fase 2.

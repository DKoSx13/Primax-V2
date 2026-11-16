# Identity A.4 fase 3B — integración privada de lecturas

Estado: implementada y validada exclusivamente en laboratorio sintético. Sin
integración pública, commit, push, merge ni inicio de otra fase. Los resultados
de este documento corresponden a ejecuciones nuevas de este corte; no convierten
resultados de informes anteriores en pruebas actuales.

## Base y preservación

Inicio verificado: rama `feat/dezkz-identity-a4-core`, árbol limpio y HEAD
`4b41af38219b510dc053e07cf9115c859e7f9bca`. Se conservan los tres commits locales:

- `df68f698620fcd8a17a4c06256f96d7c7934e95d`: fases 0–2.
- `b314f408b865d56bed0e765f44e7de3b5226da13`: diseño fase 3 y lecturas 3A.
- `4b41af38219b510dc053e07cf9115c859e7f9bca`: corrección de Control.

Fuentes revisadas: HANDOFF-ASTRA, invariantes/núcleo, diseño y resultados de fase
2, diseño de lecturas fase 3, resultados 3A y ambos informes de seguridad de
Control, junto con sus componentes. Los límites A.1/A.3 y el bloqueo A.2 siguen
vigentes. Administración y Commerce no se implementan.

El cotejo final SHA-256 de los 1039 archivos preexistentes confirma que ninguno
cambió ni desapareció. Solo se añaden los archivos listados al final. Los entrypoints/módulos públicos
no importan estos componentes. No se modifican AuthCore, PasswordReset, registro,
finanzas, Membership.status, Vehicle, OCR, frontends ni esquemas versionados.

## Componentes y límites

`PrivateCompatibleMembershipReads` es una aplicación privada por composición de
dos puertos de lectura: el contrato A.4 de 3A y `LegacyCompatibleReadProvider`.
Resuelve por usuario, UUID o código canónico/alias con normalización explícita.
Antes de consultar el cuerpo legado acredita el binding de 3A y verifica un ancla
legada con los mismos UUID de usuario/membresía y número canónico. No deduce
accountId, no asigna identificadores ni aprovisiona datos durante una lectura.

`LegacyA4ReadProvider` recibe instancias de los repositorios/servicios existentes,
sin importar un bootstrap operativo. Delega ancla a MembershipsRepository,
`me` a MembershipsService y vehículos a VehiclesService. Serializa Date/Decimal
como JSON, igual que la representación de transporte; no calcula dinero ni
duplica escritores. Los métodos concretos del Backend se ejecutan sin editar.

La salida privada es `{ identity, body, provider: 'LEGACY_SYNTHETIC' }`. Esta
envoltura **no es un contrato HTTP público**. `body` conserva íntegramente la
respuesta legada: estado, perfil, bienvenida, vehículos, campos adicionales y
valores financieros pertenecen a sus proveedores actuales. La identidad A.4 y sus
alias permanecen separados; no se añaden `legacyNumbers` a una ruta que no los
devuelve actualmente. Las salidas son copias inmutables; no se muta al proveedor.

Se rechazan UUID/números cruzados, vehículos de otra membresía, IDs duplicados,
páginas inválidas y respuestas sin los campos/tipos requeridos. No hay defaults
financieros, reintentos automáticos, caché, reparación ni fallback de autorización.
Los errores privados distinguen DENIED, NOT_FOUND, NOT_PROVISIONED,
BINDING_MISMATCH, INVALID_INPUT, INVALID_UPSTREAM_RESPONSE y UNAVAILABLE. No se
expone el mensaje SQL/URL del proveedor. El adaptador clasifica 404/403 de los
servicios existentes; otros fallos son indisponibilidad, sin cerrar sesiones.

## Recursos y reproducibilidad

Comandos desde la raíz, con las imágenes ya disponibles y sin instalar paquetes:

```text
node tools/astra/identity-a4-compatible-read-unit-check.cjs
node tools/astra/identity-a4-compatible-read-lab.cjs
node tools/astra/identity-a4-phase2-private-regression.cjs
```

Cada integración crea PostgreSQL nuevo sobre tmpfs, una red interna nueva con
etiqueta y nombres aleatorios, sin publicar puertos ni montar volúmenes existentes.
El checkout se monta de solo lectura; clientes Prisma y herramientas temporales
se generan en tmpfs. Se usan imágenes locales con `--pull never`:

- herramientas: `sha256:38ceee7d6e80b0ed7b3e7d4065312238874d9d10bdbba0dd1152b21ce16fe6e0`;
- PostgreSQL: `sha256:f3bd19c606e442c3d7bdfa8002e03fe260a1023351e0ea4598032022b68dd6e3`.

En 3B, A.4 reside en `a4_read/identity_a4_private`; el proveedor legado usa otra
base nueva, `a4_legacy/public`, del mismo clúster sintético. La preparación aplica
el DDL A.4 existente y genera DDL legado desde el schema Prisma mediante
`migrate diff --from-empty ... --script`, aplicado solo a la base recién creada.
Se conserva literalmente la secuencia/función `next_operation_number` de su
migración histórica para satisfacer el default del schema. **Esto no ejecuta la
cadena de migraciones productivas ni reproduce todos sus triggers/constraints
históricos**. No es validación del despliegue ni de operaciones financieras.

La preparación de fixtures usa credenciales aleatorias efímeras separadas. Las
lecturas A.4 usan su rol SELECT y snapshots READ ONLY/REPEATABLE READ de 3A. Los
servicios legados usan un rol SELECT con default_transaction_read_only=on;
conservan su semántica actual de múltiples consultas. El lector legado no puede
escribir ni leer el esquema A.4 aun conectándose a esa otra base: SQLSTATE 42501.
El código HTTP de laboratorio escucha exclusivamente en loopback del contenedor.

Docker agotó los pools automáticos de direcciones. El helper nuevo inspecciona
IPAM de Docker y rutas IPv4 del host y selecciona una subred /28 no solapada de
10.203.0.0/16. Falla si no puede comprobarlas o no hay rango libre. No borra ni
reutiliza redes. El wrapper de regresión mantiene el runner de fase 2 intacto y
solo añade esa selección a su creación de red interna nueva.

Los PostgreSQL creados por los runners se detienen tras verificar su etiqueta;
se conservan sus contenedores detenidos y redes. No se elimina ningún recurso
previo. Los tmpfs no constituyen un respaldo de datos; las evidencias no incluyen
dumps ni credenciales.

## Resultados actuales y evidencias

| Ejecución | Resultado | Evidencia bajo Docs/astra/evidence/ |
| --- | --- | --- |
| Unitarias finales | **58/58**, cero fallos: 15 núcleo + 8 store fase 2 + 12 lecturas 3A + 23 composición 3B | `identity-a4-phase3b-unit-9b5ac25a994e9985afb61d23.json` |
| Unitarias previas de este corte | 58/58, antes de ampliar la aserción de tamaño de página | `identity-a4-phase3b-unit-2e952df31d13b3acb39f188c.json` |
| Integración final 3B | **13 grupos aprobados**, 22 comparaciones de paridad y 42 comprobaciones HTTP | `identity-a4-phase3b-a4-a2484c562379450d967baa14.json` |
| Integración previa de este corte | 13 grupos, antes de endurecer la prueba de acceso entre bases | `identity-a4-phase3b-a4-595b07679a462a951fd7a615.json` |
| Regresión privada de fase 2 | **14 grupos aprobados**, incluidas concurrencia, idempotencia, rollback y restauración en otra base nueva | `identity-a4-phase2-a4-85c364e550500e4aae7b7b61.json` |

No sumar los grupos de distintas ejecuciones como una sola suite. Las 42
comprobaciones HTTP incluyen 40 de Control y dos comparaciones de cuerpos legados
me/vehicles. No son 42 pruebas de autenticación real.

TypeScript **5.9.3**, Node **22.21.1**, desde la imagen local. Se verifican sin
emitir el núcleo, los contratos 3A y los contratos nuevos 3B, incluidas aserciones
negativas de tipos, con las opciones reales de services/identity/tsconfig.json.
Solo se amplía rootDir en memoria para incluir lab, excluido del runtime por su
tsconfig. No se cambia configuración ni instala dependencias. Esto no es un
typecheck completo de todos los módulos del Backend ni una ejecución nativa
strip-only del TypeScript nuevo: el runner usa un transpiler de proceso privado.

Intentos fallidos preservados:

- `identity-a4-phase3b-a4-073c4fe45f7056a6ea293612.json`: DDL generado requería
  la función histórica next_operation_number; no llegó a la integración.
- `identity-a4-phase3b-a4-bfd6e57e48c906b26a808bba.json`: generate no resolvía
  @prisma/client desde tmpfs; se enlazaron dependencias ya disponibles, sin instalar.
- `identity-a4-phase3b-a4-68d0e1754a2c887fc61f02c1.json`: tmpfs sin exec impedía
  cargar el motor Prisma generado; se corrigió únicamente el montaje nuevo.
- `identity-a4-phase3b-a4-67a04465a9391bda0ae6109c.json`: pool de subredes
  agotado antes de crear recursos; se añadió selección explícita sin borrar redes.
- La primera orden unitaria emitida en consola aprobó 43 pruebas pero falló al
  cargar el test del núcleo porque buscaba dist. Se repitió con su bandera
  --experimental-strip-types ya prevista por ese test: 58/58. No se modificó el
  test original ni se crea retrospectivamente una supuesta evidencia automática
  de aquella consola. La prueba directa separada del núcleo también aprobó 15/15.

## Matriz de paridad y alcance demostrado

| Área | Comparador y resultado | Límite |
| --- | --- | --- |
| Usuario/UUID | Servicio 3A + ancla del repositorio real, mismos UUID | Binding de manifiesto sintético, sin autoridad productiva |
| Canónico/alias | PRIME-001, PRIME-A001, PRIME-AA001 y alias históricos sintéticos conservan UUID/canónico | Sin migrar históricos ni decidir colisiones públicas |
| me completo | Igualdad profunda contra MembershipsService real y JSON de su controlador | En fixtures estables; no existe endpoint HTTP A.4 |
| Estado/perfil/bienvenida | Se conservan los campos legados, incluidos ACTIVE/SUSPENDED y null | No se trasladan ni modifican |
| Vehículos | Mismos UUID/campos y páginas 1, 2 y vacía, orden de proveedor | No prueba findByPlate ni vínculo/escritura de Vehicle |
| Valores financieros | Proveedor real conserva 91.25 saldo, 12.50 pendiente, 8.00 reservado, 99.25 total y 17 puntos | Solo composición de lectura; sin paridad financiera integral, ventas o liquidaciones |
| Ausencia/aislamiento | UUID/alias ajenos o inexistentes, usuario sin membresía y binding faltante no se mezclan | No equivale a prueba de JWT real |
| Autorización | Errores privados distintos, proveedor no invocado para selectores ajenos; grants/estación por servicio Control real | Actores verificados por frontera de fixtures |
| Indisponibilidad | Revocación SELECT real en A.4 y legado, error explícito y recuperación tras restaurar permisos | Sin ensayo de timeout de red ni revocación AuthCore |
| Solo lectura | Igualdad de todas las filas de 40 tablas legadas y cinco tablas A.4; roles rechazan escritura | No snapshot distribuido de fuentes que cambian concurrentemente |
| FuelFlow/Prime/OCR | Ningún archivo o contrato alterado | Sin ejecución frontend ni OCR; no declarar paridad |

Las 22 comparaciones incluyen selectores por usuario, UUID y cada código de las
tres membresías, más nueve páginas de vehículos. Se mantiene orden contractual;
no se normalizan arrays ni importes para ocultar diferencias.

## Control: estado actualizado por este corte

La corrección AND y validación de contexto del commit 4b41af3 permanece intacta.
Ahora se ejecutaron controlador/servicio reales con consultas Prisma/PostgreSQL
real y solicitudes HTTP privadas: q por número/nombre/correo, sin q/espacios,
varias estaciones, global y filtro explícito, status combinado, permisos
insuficientes, contexto vacío/mal formado, estación ajena, detalles propios/ajenos/
inexistentes, rechazo de page no contractual y tope take=100 con 105 filas ajenas
más recientes. Un error SQL produce 500; la siguiente consulta se recupera sin
ampliar alcance. Los resultados no revelan encabezados de otras estaciones.

La aplicación Nest de prueba usa prefix y ValidationPipe; la frontera de
autenticación es **middleware de fixtures con credenciales aleatorias**. No carga
AccessGuard/AuthCore, no comprueba JWT/cookies, authVersion, sesiones, revocación
concurrente ni Gateway. Los 401 sintéticos no validan la autenticación productiva;
tampoco se compara íntegramente el body de errores del filtro HTTP operativo.
Esta cobertura parcial HTTP/SQL mejora la evidencia local, **no habilita una
integración pública ni acredita despliegue**. Las cifras 41/41 y 300/300 de los
informes anteriores siguen siendo históricas; no se ejecutaron aquí otra vez.

`tools/astra/identity-a4-static-read-checks.cjs` sigue intacto: espera una consulta
vulnerable y ya no corresponde al código corregido. El nuevo worker conserva las
pruebas útiles de lecturas 3A sin ejecutar ese diagnóstico ni cambiarlo. No se
presenta el runner histórico completo como aprobado. Se solicita autorización
separada para actualizar solo esa expectativa, preservando todas sus evidencias.

## Inventario creado

Ningún archivo preexistente modificado. Once archivos nuevos de implementación,
pruebas y herramientas:

```text
services/identity/lab/membership-a4-compatible-read.ts
services/identity/lab/membership-a4-legacy-read-provider.cjs
services/identity/lab/membership-a4-compatible-read.test.cjs
services/identity/lab/membership-a4-compatible-read.types.test.ts
tools/astra/identity-a4-compatible-read-lab.cjs
tools/astra/identity-a4-compatible-read-worker.cjs
tools/astra/identity-a4-compatible-read-scenarios.cjs
tools/astra/identity-a4-compatible-read-unit-check.cjs
tools/astra/identity-a4-private-ts-register.cjs
tools/astra/identity-a4-private-network.cjs
tools/astra/identity-a4-phase2-private-regression.cjs
```

Se añaden este informe y las nueve evidencias JSON identificadas arriba: 21
archivos nuevos en total. Ninguno staged ni confirmado. HEAD permanece en
4b41af38219b510dc053e07cf9115c859e7f9bca.

Comprobaciones finales adicionales: sintaxis de todos los CJS nuevos correcta,
JSON de evidencias válido y sin whitespace final. La revisión de contenido nuevo
no detectó credenciales reales ni datos personales reales: solo la plantilla de
URL del laboratorio, hashes de contraseña ficticios no utilizables para login y
correos de fixtures `.invalid`. No se añadieron archivos de configuración sensible.

## Riesgos y siguiente decisión

1. No hay consistencia distribuida: el proveedor legado y A.4 observan snapshots
   independientes. Antes de cualquier integración decidir frescura, revisiones y
   comportamiento ante cambios concurrentes; hoy se rechazan mismatches detectables.
2. No hay transporte HTTP A.4, credenciales de servicio, timeout/caché ni selección
   pública. La espera de cinco segundos solo limita las solicitudes del test HTTP.
3. No se validan frontend, OCR, transacciones financieras ni el esquema histórico
   completo. No se diagnostican por inferencia los fallos de CI o timeouts previos.
4. Antes de considerar integración pública faltan pruebas con el guard y autoridad
   reales sintéticos, sesiones/revocación, Gateway y consumidores. Requieren un
   nuevo corte revisable, sin modificar AuthCore para hacer pasar pruebas.
5. Se recomienda revisar este diff privado y autorizar por separado la adaptación
   del comprobador histórico. Una eventual ampliación de transporte/paridad de
   consumidores y cualquier commit necesitan instrucciones nuevas. No se inicia
   esa ampliación ni otra fase por haber aprobado este laboratorio.

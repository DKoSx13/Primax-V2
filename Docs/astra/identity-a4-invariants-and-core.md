# Identity A.4 — fases 0 y 1: invariantes y núcleo privado

Base: `b4594ef80bd923a449fc923b01159e2d4aeb3deb`, rama de entrega
`handoff/astra-identity-catalog-2026-11`. Trabajo autorizado: documentar contratos y
crear un núcleo puro desconectado. No incluye fase 2, persistencia, migraciones,
activación pública, cambios financieros ni cambios en AuthCore/PasswordReset.

## Fuentes y precedencia

Lecturas de continuidad: `HANDOFF-ASTRA.md`,
`continuidad-primax-v2-identity-5-10.md`, `mision5-11-propiedad-persistencia.md`,
`mision5-11-a2-password-reset.md`, `identity-recovery-policy-port-design.md`,
`mision5-11-a3-perfil.md`, `identity-data-contracts-proposal.md` e
`identity-data-fk-audit.md`, en este directorio.

El handoff/A.2/A.3 delimitan Identity a número, alias y vínculo exclusivo con
Vehicle; no autorizan trasladar la entidad Vehicle completa. Las propuestas
anteriores más amplias no sustituyen ese límite. A.1/A.3 siguen siendo laboratorios
de Account/perfil; A.2 permanece bloqueado. Sus resultados son históricos.

## Invariantes observadas, sin cambio operativo

### Número, contador y registro

Fuentes: `Backend/src/users/membership-number.ts`, `users.repository.ts`,
`users.service.ts`, `Backend/src/auth/auth.service.ts`,
`Backend/prisma/schema.prisma` y sus copias locales en
`services/identity/src/compatibility/users/`.

- El número público no es el UUID de Membership ni de User. Preservar los IDs y
  las relaciones; no reconstruirlas por email, DNI o similitud de códigos.
- Ordinal positivo bigint: bloques de 999. Formato `PRIME-` + prefijo alfabético
  biyectivo + tres dígitos 001..999. No hay sufijo 000.
- Fronteras: 1 → PRIME-001; 999 → PRIME-999; 1000 → PRIME-A001;
  1998 → PRIME-A999; 1999 → PRIME-B001; 26973 → PRIME-Z999;
  26974 → PRIME-AA001; 52947 → PRIME-AZ999; 52948 → PRIME-BA001.
- `MembershipNumberCounter` tiene fila id=1 y value bigint no negativo. Los CHECK
  SQL están en `20261021000000_membership_number_counter/migration.sql`, bajo
  `Backend/prisma/migrations/`; no basta mirar el modelo Prisma.
- El asignador hace UPDATE value=value+1 RETURNING bajo la transacción del
  registro. La fila queda bloqueada hasta su finalización. No usa MAX+1.
- Omite códigos ya presentes en Membership.number. Actualmente no consulta alias.
  La unicidad de number en SQL sigue siendo una defensa independiente.
- Registro crea User+Membership+contador y welcomeAvailable=true en una transacción.
  Membership empieza ACTIVE, balance cero y sin vehículos por sus defaults/alta.
  Si falla la operación se revierte también el contador. Esto no promete ausencia
  global de huecos: se omiten números ocupados y existen escritores históricos.
- El registro usa `$transaction`, con reintentos específicos P2002 del número
  hasta tres intentos; no confundirlo con `atomic`, serializable con otra política
  de reintentos. Email duplicado tiene tratamiento propio.
- No sustituir el contador por una secuencia: cambiaría el rollback de incrementos.
  El núcleo nuevo solo formatea; no genera/reserva ordinales.

### Alias y resolución

Fuentes: `Backend/src/users/membership-code.ts`,
`Backend/src/vehicles/vehicles.repository.ts`,
`Backend/src/alerts/alerts.service.ts` y
`Backend/prisma/migrations/20261030050000_v2_prime_numbering/migration.sql`.

- MembershipCodeAlias.code es PK varchar(30); membershipId referencia el mismo
  UUID Membership con ON DELETE RESTRICT. No es una nueva cuenta ni un permiso.
- La migración histórica conserva códigos anteriores al renumerar. No se repite,
  modifica ni aplica esa migración en A.4.
- La búsqueda general resuelve primero number; si no existe, consulta alias.
- La comparación específica de Commerce acepta igualdad de number o un alias
  cuyo membershipId sea el UUID de la membresía del vehículo. No realiza primero
  una búsqueda global canónica. Son dos operaciones distintas.
- No hay unicidad conjunta SQL entre number y alias.code. Ante una colisión entre
  tablas, búsqueda general y comparación específica pueden discrepar. Se conserva
  esa distinción en el núcleo y su prueba; no se aprueba una nueva política.
- No se encontró un CRUD público de alias ni de renumeración en el código revisado.
  No añadir creación, eliminación, transferencia o reutilización implícitas.

### Vehicle y estado

Fuentes: `Backend/src/vehicles/vehicles.repository.ts`, `vehicles.service.ts`,
`plate.dto.ts`, `services/identity/src/persistence/vehicles.repository.ts` y
`Backend/src/prisma/prisma.service.ts`.

- Una placa única normalizada identifica un Vehicle con UUID estable. La forma
  actual es tres alfanuméricos, guion y tres dígitos; el DTO normaliza mayúsculas,
  espacios y guion. No aplicar estas reglas a códigos de membresía.
- Vehicle.membershipId puede ser null. Una membresía puede tener varios vehículos.
- Link se ejecuta con atomic/Serializable: exige Membership ACTIVE y User.active,
  rechaza otro propietario y vincula una placa sin dueño o crea el vehículo.
- Repetir link para la misma membresía devuelve el vehículo existente, sin cambiar
  su etiqueta. No equivale a un endpoint de edición de etiqueta.
- No se encontró un flujo público de desvinculación/transferencia/borrado de estas
  entidades. Las FK restrictivas y referencias financieras deben conservarse.
- Membership.status tiene ACTIVE/SUSPENDED y lo consumen vínculo, ventas, recargas,
  canjes y bienvenida. No se divide en dos estados ni se decide aquí su autoridad.
- El núcleo de códigos no valida Vehicle, estado, usuario ni permisos. Resolver
  un código nunca autoriza una vinculación, una venta o una lectura de datos privados.

## Contratos HTTP conservados

Prefijo `/api/v1`. Esta fase no añade ni modifica endpoints, DTO, guard, cuerpos,
errores o routing. Fuentes: controladores auth, memberships, vehicles y recognition
en Backend y copias locales Identity; admin.controller y control-customers.controller.

| Ruta | Contrato relevante que debe mantenerse |
| --- | --- |
| POST /auth/register | Registro atómico; sesión Bearer posterior; sin incorporar el núcleo nuevo |
| POST /auth/login | Email/DNI y contrato JWT existentes, intactos |
| GET /memberships/me | number, status, user, vehicles y proyección financiera compatible |
| PATCH /memberships/me/profile | Perfil y respuesta enriquecida posterior; no cambia semántica de commit |
| GET /memberships/me/transactions | Historial paginado compatible |
| GET /memberships/me/rewards | Puntos históricos, sin cálculos nuevos |
| GET /memberships/me/redemptions | Canjes históricos, sin cálculos nuevos |
| POST /vehicles | Actor member; vínculo con su propia membresía |
| GET /vehicles | Listado de vehículos del propietario y paginación actual |
| GET /vehicles/:plate | Acceso member/kiosk existente; miembro ajeno recibe 404; conserva id, plate, label y vista de membresía |
| POST /plate-recognition | Kiosk; kinds plate/membership; umbral y contrato de reconocimiento existentes |
| POST /admin/check-plate | Kiosk; comprobación y posible alerta, no mera lectura |
| GET /control/customers y /control/customers/:userId | Permisos y alcance administrativo existentes |
| GET /control/memberships y /control/memberships/:membershipId | Membresías y relaciones autorizadas |
| GET /control/vehicles | Vehículos con alcance derivado de operaciones por estación |

`Backend/gateway/routes.cjs` mantiene wallet/recargas antes del prefijo memberships
y las dirige a Commerce. No cambiar routing del resto de membresías ni de vehículos.
AuthCore, PasswordReset y las 27 rutas legadas no se sustituyen por este módulo.

FuelFlow depende de `number`, `legacyNumbers`, status y la vista financiera en
`Frontend_1_FuelFlow/src/js/{apiClient,membershipCode,primeBalance,script}.js`.
Prime depende de number/user/vehicles y bienvenida en
`Frontend_2_PrimaxPrime/js/services/{membershipService,index}.js` y `js/app.js`.
El alias de nombre local de Prime es una preferencia distinta de MembershipCodeAlias.

## Límites de propiedad propuestos

| Responsabilidad | Destino lógico | Situación conservada |
| --- | --- | --- |
| Número, contador, alias y vínculo cuenta-membresía | Identity | Escritores y transacción en el proveedor actual |
| Vínculo exclusivo con Vehicle | Identity | Comando transaccional actual; no se mueve Vehicle completo |
| Membership.status | Autoridad pendiente de concretar | Semántica ACTIVE/SUSPENDED vigente |
| Balance, bienvenida, deuda, pagos, reservas, puntos, canjes | Commerce/proveedor legado | SQL, bloqueos y unidad transaccional intactos |
| Permisos, authVersion, login y recuperación | Autoridad vigente | AuthCore y PasswordReset intactos |
| Consultas Control y alertas | Administration/operación con contratos futuros | Alcance por estación y efectos actuales intactos |

Dependencias que bloquean un traslado automático: registro habilita bienvenida;
TransactionsService puede escribir documentos mediante saveReceiptProfile dentro
de la transacción comercial; ventas comparan código/vínculo/estado antes de efectos
financieros. Las FK entrantes desde Transaction, FuelAuthorization, WalletMovement,
RewardMovement, Redemption, MembershipDebt y BusinessAlert no se eliminan. A.4 no
aprueba outbox, sincronización eventual, RPC financiero ni un nuevo maestro duplicado.

## Decisiones abiertas: alternativas, sin selección de negocio

| Decisión | Alternativas y riesgos |
| --- | --- |
| Número frente a alias de otra membresía | Conservar precedencia actual mantiene compatibilidad pero deja ambigüedad entre operaciones; impedir colisiones en un espacio común exige inventario/transición; rechazar toda ambigüedad cambiaría respuestas existentes. No hay política global nueva. |
| Normalización | Comparación exacta evita ampliar coincidencias pero rechaza minúsculas/espacios; trim+uppercase reproduce ciertos llamadores actuales pero no es universal. El núcleo exige elegir explícitamente. OCR tiene otra gramática y no se aplica aquí. |
| Unicidad | Índices por tabla conservan el estado actual; un espacio único podría evitar colisiones futuras pero exige resolver las históricas y coordinar todos los escritores. |
| Reutilización/renumeración/baja | Conservar aliases/IDs evita reinterpretar tarjetas antiguas; permitir reutilización o eliminación requiere política de retención y protección de referencias históricas. No se habilita ninguna operación. |
| Estado y vínculo | Mantener proveedor atómico conserva la garantía actual; moverlo exige definir autoridad y orden frente a suspensión/desactivación. Una consulta remota o TTL no mantiene por sí sola esa garantía. |
| Capacidad del ordinal | El formato puro admite bigint positivo; SQL usa BIGINT firmado y varchar(30). El límite, reserva de capacidad y error del futuro adaptador requieren diseño; no se inventa wraparound ni truncamiento. |

La normalización nueva valida únicamente la forma de transporte actual
`^[A-Z0-9-]{4,30}$`; los helpers legados no realizan todos esa validación por sí
solos. No se usa como reemplazo transparente de cada función interna. La comprobación
de formato canónico es separada: un alias histórico no canónico puede ser válido.
No se reescribe alias→canónico ni se cambia la huella de un reintento financiero.

Hallazgo estático conservado: OCR Python y el filtro Nest no cubren todas las
formas del generador, por ejemplo PRIME-A001. No se corrigen aquí ni se atribuye
por ello una causa a los fallos de CI. Los pasos OCR/public flows y Browser audit
del handoff estaban fallidos; esta suite aislada no los reemplaza ni certifica CI.

## Fase 1 implementada

`services/identity/src/membership-codes/core.ts` contiene dominio y puerto de lectura
sin imports de Nest, Prisma, Backend, red, filesystem o clientes de otros servicios.
No hay adaptador de producción, asignador persistente, estado global ni caché.

- formatMembershipNumber: mapeo bigint positivo compatible con el formato vigente.
- isCanonicalMembershipNumber: reconocimiento de sintaxis generada, no existencia.
- normalizeMembershipCode: modos obligatorios exact / trim-uppercase; no OCR.
- MembershipCodeLookup: byNumber/byAlias, solo lecturas; ausencia devuelve null,
  indisponibilidad/error debe propagarse. Debe devolver el propietario de la clave.
- resolveMembershipCode: canónico primero, alias después; devuelve id/number,
  procedencia y código consultado, sin datos financieros ni documentos.
- matchesMembershipCode: comparación específica por UUID, distinta de resolución
  global; sin autoridad de autorización. El puerto parcial solo necesita byAlias.

Dos lecturas del puerto no garantizan un snapshot consistente. La fase 2 tendría
que definir esa garantía y verificarla; esta implementación no simula locks ni
durabilidad. El formato se valida en memoria sin asignar números ni cambiar IDs.

## Validación real de esta entrega

Entorno utilizado: Node v24.22.1. Desde la raíz:

```bash
node --experimental-strip-types --test services/identity/test/membership-codes.test.cjs
```

Resultado real: **15/15 pruebas aprobadas, cero fallos, cero omitidas**. Las pruebas
usan fixtures en memoria y el núcleo fuente, sin instalar dependencias, compilar
Prisma, cargar .env, ejecutar Docker o conectarse a una base. El modo normal del
archivo de pruebas usa dist, conforme a la convención de las suites del proyecto;
el flag explícito selecciona solo el fuente TypeScript para este ensayo aislado.

Cobertura: fronteras numéricas/alfabéticas, 53000 códigos únicos, entradas inválidas,
precisión bigint superior a Number.MAX_SAFE_INTEGER, separación canónico/alias,
normalización explícita, longitud/alfabeto, resolución y comparación por UUID,
prioridad canónica, colisión sintética que documenta la divergencia existente y
propagación de errores sin fallback ni reintentos.

Comprobación adicional real: igualdad contra la función pura extraída del
formateador legado para los primeros 53000 ordinales y para 9007199254740993 y
9223372036854775807. Se evaluó solo esa función en memoria, eliminando sus tipos;
no se cargó Prisma ni se ejecutó nextMembershipNumber. Los 53002 cotejos aprobaron.

Verificación de alcance: los archivos ya versionados siguen idénticos al handoff;
solo se añadieron este documento, core.ts, su README y su prueba. No hay imports
del nuevo módulo en los entrypoints/adaptadores existentes. La rama de trabajo es
`feat/dezkz-identity-a4-core`; HEAD y la rama original permanecen en el commit base.
Las comprobaciones de whitespace de los cuatro archivos no reportaron errores.

No se ejecutó build completo ni typecheck de TypeScript; Node elimina tipos para
esta ejecución, no los verifica. Tampoco hay pruebas PostgreSQL, HTTP, concurrencia,
despliegue ni regresión integral de FuelFlow/Prime. No reutilizar los resultados
históricos A.1/A.3 como aceptación de A.4.

## Puerta de fase 2

Solicitar autorización específica antes de crear esquema, SQL, cliente generado,
adaptador persistente o runner PostgreSQL A.4. Recomendación: limitar el próximo
laboratorio a número/contador/alias y fixtures, conservar A.1/A.3 íntegros y mantener
link/registro operativos en su proveedor actual.

Antes: acordar colisiones/normalización, escritor único, IDs, restricciones y
semántica transaccional; decidir si los casos ambiguos quedan como fixtures de
compatibilidad o se autoriza otra política. Después, solo con autorización, usar
base/rol/credenciales/recursos nuevos, probar rollback, unicidad, concurrencia y
restauración. No mover datos ni activar tráfico como efecto de aprobar el laboratorio.

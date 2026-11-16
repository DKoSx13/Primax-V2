# Identity — runtime sintético independiente

Proyecto con dependencias, lockfile, configuración, fuentes, compilación TypeScript
y clientes Prisma propios. Build/start no leen ni importan Backend. Los snapshots
de compatibilidad conservan AuthCore, login, DTO, guards, recuperación y Redis
actuales; no sustituyen los procesos activos.

```bash
npm ci --prefix services/identity --ignore-scripts
npm test --prefix services/identity
# Backend compilado se necesita solo para los comparadores y el host legado del laboratorio:
npm run build --prefix Backend
node tools/astra/identity-isolated.cjs --standalone
```

El laboratorio crea PostgreSQL/Redis nuevos en tmpfs, SMTP TLS local, roles y claves
aleatorias. Copia este proyecto fuera del repositorio, vuelve a compilarlo allí y
ejecuta su main con node_modules propios. Compara los 27 pares método/path y los
casos de contrato; también detiene los entrypoints Backend para verificar que no
son requisito de arranque ni de funcionamiento del runtime.

`npm start` requiere configuración explícita: solo se admite
IDENTITY_RUNTIME_PROFILE=synthetic, PostgreSQL loopback/base synthetic, puente
loopback, clave propia y bind 127.0.0.1. No carga .env automáticamente. El
reproductor proporciona esa configuración; no usar credenciales de otros entornos.

## Persistencia delimitada, todavía compartida físicamente

- `prisma/identity.prisma`: proyección de 14 modelos. Identidad de cuentas,
  contraseña/reset, membresía/perfil/alias, vehículos y permisos; Station es una
  referencia externa y Terminal conserva columnas operativas compartidas.
- `prisma/boundaries.json`: relaciones a modelos externos omitidas **solo del
  cliente**, más columnas compartidas. No elimina ninguna FK de PostgreSQL.
- `generated/identity`: cliente propio, generado localmente e ignorado por Git.
  User+Membership+contador, reset+authVersion, perfil y vínculo de vehículos usan
  este cliente. Vehículos/perfil/reset mantienen transacciones serializables con
  reintentos acotados; el contador se bloquea dentro del registro original.
- `prisma/compatibility.prisma`: esquema legado completo, congelado y explícito,
  necesario aún para guards y operaciones kiosk. Su cliente usa otra conexión/rol;
  no representa propiedad de esos modelos por Identity.

No existen scripts de migrate/db push en este proyecto. **No aplicar ninguno de
estos esquemas como DDL a una base existente.** Se consultan las tablas sintéticas
instaladas por las migraciones existentes en el laboratorio. Separar físicamente
Membership/User/Vehicle de las FK financieras exige otro diseño y autorización.

Membership conserva balance y columnas de bienvenida por compatibilidad. Registro
crea la membresía inicial con sus defaults y welcomeAvailable como antes; no hay
comandos financieros nuevos. El rol nativo no puede actualizar balance ni acceder
a las tablas financieras; el rol operativo tampoco puede modificar dinero.

## Puertos de finanzas y Alerts

`FinancialReads` entrega me, historial y enriquecimiento de vehículos sin SQL ni
cálculos financieros locales. `AlertsPort` preserva list/dashboard/resolve/check-plate.
El adaptador HTTP usa clave de servicio, timeout de 4 s, sin redirecciones ni
reintentos; falla con 503 si la dependencia no está disponible.

El host del puerto en esta etapa es **solo** el laboratorio
`tools/astra/identity-compatibility-bridge.cjs`: reutiliza los servicios/repositorios
legados actuales. No se añadió un endpoint al Backend ni a Commerce/Administration.
Las funciones financieras no se copiaron aquí. El host requiere SELECT financiero
y escrituras de BusinessAlert; su API es cerrada, sin SQL ni métodos Prisma remotos.

## Fuentes de compatibilidad y límites

`src/compatibility` es una extracción materializada con imports locales. El
manifiesto registra hashes de las fuentes de origen. AuthCoreModule, AuthService
y KioskStore conservan sus bytes, verificados por prueba. Actualización deliberada:
`npm run refresh:compatibility` requiere el repositorio origen; **build/start/test
no ejecutan esa operación ni necesitan el repositorio**.

Persisten el esquema operativo completo para kiosk, columnas/FK compartidas,
helpers de atención vacía y el host financiero/Alerts legado. No se certifica
independencia de datos ni autorización de despliegue/tráfico. Hace falta definir
contratos remotos definitivos, autoridad de grants y consistencia de revocación,
y eliminar después el cliente operativo completo conservando atomicidad.

Experimento de datos nuevo, sin iniciar Backend ni el puente legado:

```bash
node tools/astra/identity-data-isolated.cjs
```

Crea un PostgreSQL nuevo con solo 14 tablas a partir de vacío y prueba operaciones
locales/caídas con Redis y SMTP sintéticos. Las finanzas/Alerts son fixtures de
contrato, no implementaciones de negocio. Reproduce el bloqueo de emisión técnica
por su transacción operativa y se detiene antes de cambiarla. Auditoría y propuesta:
`Docs/astra/identity-data-contracts-proposal.md` e `identity-data-fk-audit.md`.

Las versiones directas de runtime coinciden con Backend. Solo este proyecto fija
Multer 2.5.0 para corregir el aviso transitivo detectado al instalar; no se cambia
Backend. Informe completo: `Docs/astra/mision5-identity-core.md` en el repositorio.

## Puerto operativo: experimento optativo

`node tools/astra/identity-isolated.cjs --operational` crea PostgreSQL y Redis
nuevos y sintéticos y ejecuta `dist/operational/main.js` fuera del repositorio.
Ese entrypoint exige `IDENTITY_OPERATIONAL_LAB=enabled` además de las barreras
sintéticas habituales. `npm start` y el tráfico público conservan su composición.

`OperationalSessionPort.v1.issueOrResume` contiene la unidad completa de emisión,
reanudación y rotación: bloqueo de terminal, validación/cierre de atención vacía,
revocación, nueva credencial y auditoría. El proveedor Prisma conserva la misma
transacción serializable y política limitada de reintentos. No separa tablas ni
retira relaciones. La recuperación técnica autorizada sigue delegada al servicio
congelado: no se ha extraído a este puerto.

El coordinador verifica firma y límite antes del proveedor. Tras el commit emite
la sesión Redis mediante el algoritmo existente. Un error SQL revierte toda su
unidad; un error Redis posterior no revierte SQL. No hay reproducción automática,
rollback distribuido ni credenciales guardadas como respaldo local.

La extracción es deliberada (`node scripts/prepare-operational-adapter.cjs`) y usa
solo la fuente congelada del proyecto. No forma parte de build/start; se registra
el hash de procedencia. El pequeño adaptador de sesión invoca un método privado
TypeScript del snapshot para conservar su formato; esa dependencia explícita debe
sustituirse por un puerto público antes de retirar el snapshot.

## Contrato remoto operativo con recibo durable (solo laboratorio)

```bash
node tools/astra/identity-isolated.cjs --remote-receipts
```

El entrypoint optativo operativo selecciona `RemoteOperationalSessions` únicamente
con `IDENTITY_RECEIPT_LAB=enabled`. Un proveedor separado ejecuta el puerto validado
y añade un recibo cifrado en su misma transacción PostgreSQL. La tabla se instala
explícitamente solo en el PostgreSQL nuevo del runner; ningún arranque aplica DDL.
No cambia `npm start`, el tráfico público ni AuthCore.

La API interna tiene comando y consulta autenticados por clave exclusiva. Llamadores
durables usan `execute({version:1,commandId,command})` y `query` con el mismo cuerpo:
el cliente consulta una vez ante una respuesta perdida, sin repetir POST. El método
compatible `issueOrResume` conserva un ID nuevo por invocación. Los HTTP legados no
incorporan correlación durable entre peticiones; una petición nueva sigue rotando.

El recibo recupera SQL confirmado; no crea una sesión Redis ni revierte un commit
si Redis falla. Rechaza credenciales revocadas/expiradas y claves de comando con otro
fingerprint. Contrato, garantías, cifrado, límites y pasos pendientes:
`Docs/astra/identity-remote-receipts.md`.

Para repetir únicamente un laboratorio fallido puede pasarse
`--runtime-artifact=/ruta/al/artefacto`. Solo se acepta un artefacto dentro del caché
local de laboratorio cuyos src/prisma, lockfile y configuración coincidan con el
proyecto; se registran SHA-256 de fuentes y dist. Se reutiliza código compilado,
**nunca** bases, credenciales, Redis ni volúmenes. El comando sin esa opción sigue
copiando y compilando el proyecto fuera del repositorio.

## Diario de intenciones del consumidor (experimento privado)

```bash
node tools/astra/identity-isolated.cjs --consumer-correlations
```

Repite el laboratorio remoto y agrega un proceso consumidor privado con AuthCore
Control/Bearer real. Prepare confirma un handle ligado a usuario/authVersion/acción/
estación/terminal; execute conserva su commandId tras fallos y reinicios. No cambia
los 27 métodos/rutas, login, Gateway ni clientes. No deduplica cuerpos iguales.

El bootstrap FuelFlow actual no aporta usuario humano ni intención durable: su
integración permanece bloqueada hasta acordar ese contrato. El prototipo exige una
referencia explícita y no sustituye la autenticación kiosk. No guarda tokens en el
diario ni reconstruye sesiones Redis. Diseño/límites: `Docs/astra/identity-consumer-correlation.md`.

`--consumer-only` ejecuta solo el probe enfocado; no es aceptación de la regresión
completa. Puede reutilizarse un artefacto con `--runtime-artifact` tras verificar
inputs como en el ensayo remoto; PG/Redis/credenciales siguen siendo nuevos.


### Preparación V2 privada con Control

`IDENTITY_CONSUMER_V2_LAB=enabled` habilita únicamente en el proceso privado
`dist/operational/consumer/main.js` la preparación con callerOperationId. Mantiene
los requisitos sintéticos/loopback y AuthCore Control originales; no activa nada
en main.js público, FuelFlow o Gateway. V1 conserva sus contratos.

Laboratorio completo: `node tools/astra/identity-isolated.cjs --consumer-v2` desde
la raíz. Crea servicios/datos nuevos; el cliente opcional de prueba está en
`tools/astra/identity-control-v2-client.cjs`. No es persistencia para despliegues
serverless. Véase `Docs/astra/identity-consumer-v2.md` para contrato y límites.

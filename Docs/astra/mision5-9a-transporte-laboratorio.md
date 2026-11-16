# Misión 5.9 — opción A implementada, solo laboratorio

Autorización expresa: TLS de servidor + credencial técnica exclusiva + nonces
compartidos. **15/15 grupos reales aprobados**, sin activar tráfico público.
No se cambia AuthCore, login, V1, las 27 rutas o almacenamiento operativo.

## Solución

El consumidor privado admite `IDENTITY_SERVICE_TLS_LAB=enabled`: HTTPS nativo de
Node, certificado/clave sintéticos externos y TLS mínimo 1.2. Ese proceso no abre
un listener HTTP equivalente. El perfil anterior permanece disponible para las
regresiones legadas; no es fallback del modo seguro. La protección cubre solo las
tres rutas privadas V2 (verify, prepare, execute), no añade rutas productivas.

FuelFlow opta por FUELFLOW_SERVICE_TLS_LAB=enabled y utiliza service-transport.cjs
en ambas llamadas: verificación Control y preparación/ejecución. Configuración
HTTPS loopback, CA explícita y validación nativa de cadena, nombre y vigencia,
rejectUnauthorized=true; sin redirects, downgrade o retries automáticos. No se
incorporan dependencias: node:https/node:crypto y el pg propio ya existente.
El ingreso humano al llamador de prueba y el salto Identity–proveedor operacional
siguen siendo los canales loopback de etapas anteriores: no se declaran cifrados
por esta misión, que protege FuelFlow → consumidor Identity.

Cada petición lleva cabeceras propias, nunca x-kiosk-\* ni Authorization técnico:

| Cabecera                          | Contenido                                       |
| --------------------------------- | ----------------------------------------------- |
| x-identity-service                | fuelflow-private                                |
| x-identity-key-id                 | UUID de credencial                              |
| x-identity-service-key            | Secreto aleatorio exclusivo de 32 bytes en hex  |
| x-identity-request-nonce          | UUID nuevo por solicitud HTTP                   |
| x-identity-issued-at / expires-at | Epoch milisegundos; ventana máxima 30s, skew 5s |

Authorization sigue siendo el Bearer humano. El servicio técnico no se transforma
en usuario Control ni aporta permisos humanos. Tras autenticar servicio y consumir
nonce, Identity conserva el guard original y comprueba al humano. El alcance técnico
es la lista cerrada de rutas y estación configurada, con acción única de emisión
V2; execute resuelve el intent persistido y contrasta su estación antes de consultar
recibos o emitir. Un humano válido sin servicio autorizado y un servicio válido
sin humano autorizado permanecen rechazados.

## Registro, replay, rotación y revocación

DDL explícito **solo en la base recién creada** del laboratorio:

- IdentityServiceCredential: keyId, serviceId, digest SHA-256 del secreto aleatorio,
  estación, rutas, notBefore, expiresAt y revokedAt. Se conserva el patrón de
  credencial interna/timingSafeEqual existente; no se cambian bcrypt, JWT o HMAC.
- IdentityServiceNonce: clave única (keyId, nonce), issuedAt, expiresAt y consumedAt.
  No guarda secreto, JWT, body, actor humano ni respuesta. No hay limpieza en este
  ensayo; no se reciclan nonces. Una futura retención debe cubrir ventana+skew.

Un único commit Serializable comprueba registro/alcance/vigencia y hace INSERT
ON CONFLICT DO NOTHING del nonce. Los conflictos existentes devuelven 409, incluso
con cuerpo alterado. Las fechas se revalidan también al entrar a la transacción.
Se mantiene la política acotada de serialización ya existente; no se añade replay
RPC. Registry o ledger inaccesibles: 503 antes de autorizar/empezar negocio, sin
respaldo local permisivo ni cache de credenciales.

Cada petición consulta revocación y vigencia, incluso con TLS keep-alive. El rol
consumidor solo SELECT en registro e INSERT/SELECT en nonces: no puede provisionar,
revocar o borrar. El rol FuelFlow no tiene acceso a ninguno. La administración
sintética del fixture es el único provisionador; no se introduce un API de administración.

Rotación reproducible: provisionar una segunda keyId/digest con su propio alcance
y vigencia; sustituir atómicamente el archivo JSON de credencial 0600 del llamador;
revocar la anterior en el registro. El cliente relee el archivo en cada solicitud.
Se prueban tanto el solapamiento de claves como el rechazo inmediato de la revocada.
Los certificados/CA sintéticos se suministran por archivos fuera del repo; su
sustitución exige reiniciar el proceso/agent en este laboratorio, sin hot reload de CA.
No es un gestor de secretos o PKI productiva.

Un nonce consumido no implica commit de negocio. Después de perder respuesta se
reintenta explícitamente con **nonce de transporte nuevo y callerOperationId,
intentId y commandId originales**. Se consulta la asociación/recibo durable existente;
no se revierte ficticiamente SQL ni se cambia de identificador. No hay transacción
distribuida entre ledger, diario y proveedor; cada límite conserva su responsabilidad.
Revocaciones no prometen cancelar atómicamente un RPC ya autorizado/en curso.

## Validación real

Laboratorio `primax-m5-1794784451041-35392d2e`: **15/15**, exit 0,
fullRegression=false. Cinco comprobaciones de arranque/paridad/aislamiento y diez
grupos nuevos. Dos procesos HTTPS Identity + dos llamadores FuelFlow, paquete propio
copiado/compilado fuera del repo, PostgreSQL/Redis/SMTP nuevos sin volúmenes previos.
Certificados/CA/secretos aleatorios efímeros; eliminados al finalizar. Las tablas
sintéticas conservan solo digest/nonces mientras vive el laboratorio, no claves.
Contenedores propios detenidos; ningún dato operativo modificado.

```bash
node tools/astra/identity-isolated.cjs --service-tls --consumer-only
```

Comprobaciones concretas:

- TLS autorizado; CA equivocada, hostname incorrecto, certificado realmente vencido
  y HTTP plano contra el puerto TLS rechazados con validación habilitada.
- Servicio desconocido, keyId inexistente/secreto erróneo, credencial vencida,
  solicitudes caducadas/futuras/ventana excesiva y permisos técnicos insuficientes.
- Seis solicitudes con el mismo nonce contra dos Identity: **una 200 y cinco 409**,
  una fila compartida. Reutilización con body manipulado también 409.
- Registro o ledger sin permiso SQL: 503, restauración explícita y recuperación
  correcta; sin autoridad local almacenada como respaldo.
- Admisión entre instancias y seis ejecuciones concurrentes con nonces nuevos:
  **un credential, un audit y un receipt**; mismo commandId después de reinicios.
  Intenciones diferentes de contenido igual permanecen diferentes.
- Proxy TLS retiene una respuesta real después de commit y corta conexión:
  503 controlado; otra instancia recupera recibo original. Credencial técnica de
  terminal revocada no se renueva ni resucita al recuperar.
- Revocación de servicio durante una conexión TLS reutilizada: misma conexión,
  siguiente request 401. Rotación de archivo a nueva keyId recupera con el mismo
  recibo, sin reemitir. Humano sin permisos o authVersion revocado sigue rechazado
  aunque la credencial técnica nueva sea válida.
- Ningún secreto plano en registro, ledger o evidencias; rol FuelFlow no puede
  leer registro/nonces/User. Ledger sin body, JWT ni token de respuesta.

Regresiones enfocadas: **83/83** (Identity 44, cliente V2 3, caller/transporte 12,
Gateway 24); FuelFlow legado **28/28**. Build propio Identity y FuelFlow aprobado;
formato, sintaxis y git diff --check aprobados. No hubo pruebas fallidas finales ni
ensayos de integración fallidos en esta etapa. No se repite Backend completo,
Prime/Catalog o caídas PG/Redis por cambios limitados al transporte privado.
La superficie de los 27 métodos/rutas se coteja; no se atribuye a estos grupos una
repetición completa de todos los contratos funcionales anteriores.

Evidencias nuevas: `evidence/identity-mission5-9a-service-tls.txt` y
`evidence/identity-mission5-9a-regression.txt`. Las 117 evidencias previas (incluyen
las 115 solicitadas) y los 34 JSON se cotejan por SHA-256 sin modificaciones.
Los timeouts históricos de 5.8 siguen con la conclusión de la propuesta 5.9:
mecanismo reproducido con bloqueo controlado, causa histórica exacta pendiente;
no se consideran resueltos por TLS y no se amplían límites ni se baja bcrypt.

## Archivos y pendientes

Nuevos: Identity consumer/service-transport.ts y test/service-transport.test.cjs,
prisma/lab-service-transport.sql y lab-service-nonces.sql; FuelFlow/lab
service-transport.cjs/test.cjs; tools/astra/identity-service-tls-fixture.cjs y
identity-service-tls-checks.cjs. Adaptados: consumidor server/main/intent,
caller/remote-control/build de FuelFlow, runners privados e informes Astra.
Todo permanece optativo/sintético; sin commits ni cambios de rama.

Identity conserva Prisma/esquema operativo compartido, AuthCore/compatibilidad,
puentes financieros/Alerts, entrega de sesión Redis, retención y recuperación ante
pérdida de infraestructura. También faltan distribución de secretos/CA, persistencia
cliente browser, observabilidad y políticas de despliegue para producción. El nonce
no sustituye idempotencia ni cancelación de operaciones en curso. No se declara
integración productiva ni autonomía completa.

Siguiente misión recomendada: especificar retención, rotación y recuperación del
registro/ledger y un ensayo de despliegue privado con secretos administrados,
sin activar tráfico público ni ampliar las separaciones de negocio ahora.
Respaldo previo/final y hashes se registran en la continuación de Misión 5.

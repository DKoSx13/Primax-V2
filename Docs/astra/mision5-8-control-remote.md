# Misión 5.8 — verificación remota Control, solo laboratorio

Estado: **17/17 grupos** privados aprobados; sin autonomía completa. Resultados
y respaldo final también en la continuación de Misión 5.
No activa tráfico, login, clientes productivos ni rutas públicas adicionales.

## Acoplamiento eliminado

El llamador 5.7 cargaba desde IDENTITY_LAB_RUNTIME: ConsumerAuthenticator,
ConfigService, PrismaService y ContractFailure. Transitivamente dependía de Nest,
JwtService, AccessGuard, UsersService/Repository, KioskService/Store y el cliente
Prisma de esquema completo. Necesitaba JWT_SECRET y SELECT sobre User,
UserPermissionGrant, AdminControlAccount, AdminControlGrant, AdminStationAssignment,
Station y Terminal. Además ejecutaba localmente reglas de permisos y destino.

Ahora `Frontend_1_FuelFlow/lab` es un paquete propio (pg 8.16.3 y lock). Se ejecuta
con FUELFLOW_CALLER_DATABASE_URL y FUELFLOW_IDENTITY_ORIGIN privados, sin JWT_SECRET,
sin IDENTITY_LAB_RUNTIME, sin Nest/Prisma ni imports de Identity o Backend. Solo
consulta/inserta `fuelflow_lab.CallerOperation`; el rol pierde SELECT en todas las
tablas de autorización, estación y terminal. Las consultas de permisos y terminal
se realizan en Identity. Las reglas locales restantes son integridad/propiedad del
diario, formato del protocolo y vencimiento; no interpretan permisos o roles.

## Puerto y autoridad

`RemoteControl` implementa `authenticate` y `authorize` mediante un único endpoint:
`POST /consumer/v2/control/verify`, en el **consumidor privado**, no en las 27 rutas.
Requiere IDENTITY_CONSUMER_V2_LAB=enabled e IDENTITY_CONTROL_VERIFY_LAB=enabled,
además de los requisitos sintéticos/loopback del proceso existente. Apagado por defecto.

- Cuerpo `{}`: identifica al humano con el Bearer original verificado.
- Cuerpo cerrado `{action, stationId, terminalId, expiresAt}`: comprueba también
  autorización y vigencia de esa operación; no acepta actor, userId ni permisos.
- Respuesta cerrada `{version:1, actor:{userId,authVersion}, target:null|solicitud}`.
  No entrega JWT, rol genérico, delegación ni autorización reutilizable.

Identity usa ConsumerAuthenticator/AccessGuard existentes, sin cambiar AuthCore.
El destino reutiliza la política de autorización del diario (ADMIN_TERMINAL_MANAGE,
alcance y usuario/generación vigentes), verifica la terminal de esa estación,
revocación/lifecycle y expiración. La consulta es solo lectura: no crea intenciones,
credenciales ni recibos. La preparación/ejecución V2 posterior vuelve a autenticar.

FuelFlow no decodifica JWT ni supone autoridad por un campo del cliente. Cada
petición consulta al verificador; la validación de destino debe devolver el mismo
usuario/generación y los cuatro campos exactos solicitados. Un cambio de actor o
versión entre consultas se rechaza. Cookies y cabeceras de firma se trasladan en
la consulta inicial para conservar los rechazos originales de Control; nunca se
convierten en autoridad técnica. No hay cache, fallback local ni retry RPC automático.

Conexión fallida, timeout, redirección, respuesta malformada/contexto distinto o
endpoint inexistente producen 503 controlado. Los rechazos conocidos se conservan;
un 404 de ruta no se interpreta como terminal ausente. Un 404 TERMINAL_NOT_FOUND
sí conserva su significado de recurso. El origin lo fija configuración privada,
no JSON del usuario. Se usa el Bearer y el transporte loopback ya autorizados;
no se introducen mecanismos nuevos de autenticación o firmas.

## Correlación y límites

El diario mantiene usuario/authVersion/callerOperationId/solicitud/hash y confirma
su inserción antes del RPC de **preparación o emisión**. La consulta de verificación
ocurre antes de esa escritura: si no se puede autorizar, no se admite operación.
intentId/commandId siguen persistidos en Identity V2, sin acceso SQL del llamador.
Reintentos conservan nonce y contexto, y nunca agrupan cuerpos iguales por sí solos.
La transacción del proveedor y los recibos durables no cambian.

Esto elimina el acoplamiento del llamador, no el de Identity. Identity conserva
AuthCore compilado/compatibilidad, Prisma operativo/tablas y relaciones compartidas,
puentes financieros/Alerts, entrega de sesión Redis, transporte/claves/retención y
recuperación ante pérdida de host. La respuesta de verificación no es un capability
ni garantiza revocación atómica durante un RPC ya autorizado. No se acredita TLS,
HA, navegador integrado o autonomía completa.

## Pruebas y archivos

Nuevos: remote-control.cjs/test.cjs y package.json/lock en FuelFlow/lab;
services/identity/test/control-verify.test.cjs. Cambiados: llamador/test de laboratorio,
consumer intent/journal/server/main, dos herramientas de laboratorio e informes Astra.
AuthCore, login, snapshots de compatibilidad y runtime público permanecen intactos.

El laboratorio copia el paquete FuelFlow fuera del repositorio y hace build/arranque
con sus dependencias propias y sin configuración JWT/Identity compilado. Comprueba
además los permisos SQL negativos para las siete tablas antes compartidas. Repite
recuperación entre instancias, reinicios, concurrencia, respuestas perdidas y ausencia
de duplicados; añade caída del verificador sin admisión ni autoridad en caché.
Las regresiones enfocadas cubren Identity/Gateway, FuelFlow y AuthCore/AuthService.
No se repite toda la batería financiera, Prime/Catalog o caídas PG/Redis por este
cambio privado; la paridad de superficie de las 27 rutas sí se coteja.

Un primer ensayo unitario dio 9/11: una aserción de endpoint desconocido detectó
que se conservaba 404 genérico en lugar de 503 y se corrigió esa clasificación;
la otra prueba se lanzó antes de que terminara el build y cargó dist anterior.
Se conserva `evidence/identity-mission5-8-unit-partial.txt`. No se amplían timeouts
ni se añaden reintentos para ocultar errores; la aceptación requiere build terminado.

## Siguiente paso

Acordar transporte/autenticación de servicio y límites de disponibilidad del puerto
para un despliegue posterior, conservando la revalidación del Bearer Control.
Mantener esta integración privada; no ampliar ahora a otras dependencias de Identity.

## Resultado real del laboratorio

`primax-m5-1794781114883-bd60d33a`: 17/17, exit 0, fullRegression=false.
Cinco comprobaciones de preparación/paridad y doce de la integración remota.
El llamador construye y arranca su copia en `/tmp/primax-control-remote-caller-GJwO9L`
sin JWT ni código compilado de Identity. Dos procesos reales y rol SQL sin SELECT
de autorización superaron recuperación, reinicios, seis ejecuciones/admisiones
concurrentes, manipulación, expiración, revocación de permisos/authVersion/credencial,
respuestas perdidas y caída del verificador. Un credential/audit/receipt por operación.

```bash
node tools/astra/identity-isolated.cjs --control-remote --consumer-only
```

Identity se compiló de nuevo con sus clientes propios fuera del repositorio:
fuente `750c161420bfd207089a91f5e3b199d697b01be5a498a21874dabf0c46965c2e`,
dist `3a8cb88f47211f71396c38f0a7641fab4981576e8d1f4954f2c0f3ec7da0d2fb`.
No se reutilizaron bases, claves o volúmenes; contenedores propios detenidos.

Regresión combinada: **75/75** (Identity 39, cliente V2 3, caller/puerto remoto 9,
Gateway 24). FuelFlow legado **28/28**. Build del paquete propio y formato/sintaxis
aprobados. La primera orden AuthCore/AuthService dio 9/14: cinco timeouts de 5s
en hooks bcrypt/login bajo carga concurrente, sin fallos de aserción de esos casos;
se conserva `identity-mission5-8-authcore-partial.txt`. La repetición usa exactamente
la misma orden, sin modificar timeout, costes criptográficos ni tests: **14/14**,
dos suites aprobadas en 87.984 s. Salidas en `identity-mission5-8-regression.txt`.

Evidencia nueva principal: `evidence/identity-mission5-8-remote.txt`. Se protegen
111 archivos de evidencia anteriores y los 34 JSON por SHA-256, sin modificaciones.
Respaldo anterior de 5.7 verificado por hash del archivo y los 276 miembros; respaldo
previo 5.8: `/home/primax/.local/state/primax-backups/mission5-8-before-20261115T221311Z/pending-work.tar.gz`.
Rama/HEAD, trabajo previo, datos operativos y clientes productivos conservados.

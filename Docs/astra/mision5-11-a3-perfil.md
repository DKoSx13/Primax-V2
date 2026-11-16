# Misión 5.11 — A.3: perfil propio de laboratorio

Resultado: **11/11 grupos reales PostgreSQL y 4/4 pruebas unitarias**, cero fallos.
Solo campos declarados `ruc` y `businessName` añadidos a IdentityProfile. Se mantienen
Account y su UUID, accountId, DNI/pasaporte y una única FK interna. No nuevos IDs
para actualizar perfil; no migración ni sustitución del esquema A.1.

## Propiedad y compatibilidad

Fuentes: prisma/identity.prisma Membership; compatibility/memberships/profile.dto.ts;
persistence/memberships.repository.ts; adapters/memberships.service.ts, todos bajo
services/identity. RUC y nombre empresarial ya forman parte del DTO de perfil: son
datos declarados de identidad, no verificación tributaria, saldos, beneficios ni
copia de comprobantes. No se trasladó ReceiptProfile ni se alteraron snapshots de
recibos/consultas financieras. No se introducen requisitos de emparejar ambos campos:
el contrato actual permite null y valores independientes.

- RUC: nullable, once dígitos, unique como Membership.ruc. Varias cuentas sin RUC
  siguen siendo válidas. No se inventó checksum ni validación fiscal externa.
- businessName: nullable, saneamiento original cleanText, 1–160 caracteres después
  del saneamiento; no unique. Reutilización de ProfileDto compilado existente por
  el runner, sin modificarlo. La DB limita tamaño y RUC; el saneamiento vive en
  el adaptador/DTO, no se afirma que SQL sanee HTML.
- Patch privado: solo dni/passport/ruc/businessName; omitir conserva, null borra.
  Invariante DNI/pasaporte se comprueba contra perfil actual dentro de transacción
  Serializable, con máximo cinco intentos solo para P2034. No reintenta duplicados.
- profileFor conserva forma/IDs previos y añade ruc/businessName sin passwordHash.
  Perfil no cambia authVersion ni cuenta/email. No cambia esquema de respuesta HTTP
  pública: el nuevo adaptador no está conectado a controllers ni runtime.

La provisión sigue siendo **fixture sintético privado**, no registro. Usa las
validaciones de RegisterDto en el runner y ProfileDto en el adaptador. No se
implementó alta financiera ni contraseña/recuperación nueva.

## Dependencias que no se modifican

- Número: users/membership-number.ts incrementa MembershipNumberCounter en la misma
  transacción de User+Membership; salta códigos ocupados. users.repository.ts crea
  welcomeAvailable=true en esa operación. No extraer contador ni reordenar alta.
- Alias: MembershipCodeAlias referencia Membership; VehiclesRepository.membership
  resuelve número directo y luego alias con status y vehicles. Separarlo requiere
  definir compatibilidad y referencias estables, no duplicar maestros.
- Vínculo Vehicle: VehiclesRepository.link consulta Membership.status ACTIVE y
  user.active y comprueba propietario de placa en la misma transacción. No tocar
  status ni crear otro propietario completo de Vehicle.
- Actualización pública del perfil termina consultando finanzas (`me`) en el
  servicio actual. El patch privado prueba solo persistencia propia; no sustituye
  ese contrato ni afirma autonomía de memberships/me.

**Límite de detención:** no ampliar ahora hacia número, alias o Vehicle. Requieren
un diseño compatible y autorización específica antes de alterar transacciones
compartidas. A.2 permanece bloqueado expresamente: no reservas, escritores de
autorización, PasswordReset ni cambios en autoridad authVersion. Paquetes B/C no
iniciados. Paquete A e independencia de Identity siguen incompletos.

## Archivos nuevos y reproducción

- services/identity/prisma/lab-owned-profile-a3.prisma
- services/identity/lab/owned-profile-a3.sql
- services/identity/lab/owned-profile-a3-store.cjs y .test.cjs
- tools/astra/identity-owned-profile-a3-lab.cjs
- Este informe y dos evidencias nuevas.

Cliente experimental generado en generated/owned-profile-a3-lab, ignorado y
reconstruible. Los clientes 14/40 y el A.1 de dos modelos quedan intactos. A.3
continúa con dos modelos: amplía el perfil sin relaciones externas. No imports
nuevos en código productivo ni cambios en dependencias/build/runtime.

```bash
node --test services/identity/lab/owned-account-store.test.cjs services/identity/lab/owned-profile-a3-store.test.cjs
node tools/astra/identity-owned-profile-a3-lab.cjs --evidence=identity-mission5-11-owned-profile-a3-repro1.txt
```

El nombre de evidencia debe ser nuevo. Runner crea red/credenciales/base/tmpfs
nuevos; solo bind 127.0.0.1, rol limitado a sus dos tablas; no DELETE/DDL ni acceso
a esquema centinela sintético ajeno. Instala DDL explícito, sin db push ni migración
sobre bases existentes. Detiene solo su contenedor al terminar; sin reusar
volúmenes, secretos ni datos. No hay listener público.

## Pruebas realizadas

Evidencia: evidence/identity-mission5-11-owned-profile-a3.txt. **11/11**, no fallos:
8 grupos heredados de A.1 ejecutados realmente contra recursos nuevos más 3 grupos
A.3: creación/saneamiento/patch/validación, unicidad RUC concurrente y rollback de
cuenta+perfil y de patch combinado, actualizaciones parciales concurrentes, null y
restricción SQL. También se ejecutaron consultas email/DNI, login AuthCore y guard
member/JWT/versiones con las clases vigentes sin modificar, integridad FK, rol
restringido y centinela ajeno intacto. No nueva prueba HTTP de las 27 rutas: sus
archivos permanecen idénticos por hash. No pruebas Redis ni suites completas; no
hay cambios en esos módulos.

Unitarias **4/4**: dos A.1 intactas y dos A.3 (campos/IDs no permitidos antes de SQL,
exclusividad documental contra fila existente). node --check, Prettier sobre CJS
nuevos y git diff --check aprobados. Solo formato tras ensayo PostgreSQL, sin
cambios semánticos al adaptador/runner. No se afirman pruebas multiinstancia o
recuperación ante caídas por este ensayo de concurrencia de conexiones.

## Integridad, respaldo y próximo paso

Todos los archivos anteriores idénticos por SHA-256: 127 evidencias
previas (incluidas las 126 exigidas) y 34 JSON. Sin AuthCore/login/registro/27 rutas,
PasswordReset, ramas, commits, push, merge ni bases operativas modificados.

Respaldo previo verificado: /home/primax/.local/state/primax-backups/mission5-11-a3-before-20261116T011645Z/pending-work.tar.gz (319 miembros).
Respaldo final y cotejo completo registrados en evidence/identity-mission5-11-a3-summary.txt
y manifiesto externo; excluye env, claves y logs históricos sensibles, cuyos
originales permanecen intactos. Restaurar en directorio separado sobre HEAD del
manifiesto, no sobre el workspace actual. Cambios reversibles dejando de invocar
este laboratorio; no migración inversa ni limpieza de evidencias.

Siguiente paso seguro: revisar diseño de número/alias/referencias Vehicle antes de
autorizar otro corte. No hay más campos escalares inequívocos en el DTO actual
pendientes después de RUC/businessName; no inventar nuevos atributos.

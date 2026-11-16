# HANDOFF Primax V2 Astra

Documento de continuidad para Dezkz. Basado en `mision4-consolidacion.md`, `continuidad-primax-v2-identity-5-10.md` y los informes A.1–A.3 de Misión 5. No se ejecutaron pruebas ni se cambió código para elaborar este handoff.

## Arquitectura y estado

El Backend conserva cuatro procesos NestJS y Gateway enruta las solicitudes entre ellos; compartir la imagen, Prisma y bootstrap no equivale a independencia de datos. La propiedad documentada es lógica/propuesta; las tablas operativas siguen compartidas.

- **Catalog:** servicio de lectura con núcleo TypeScript y adaptador PostgreSQL `pg`, paquete/Dockerfile/CI propios. Misión 4 informa aceptación 22/22 y regresión final histórica 5/5. Tráfico independiente apagado; inventario público y su migración siguen pendientes. No activar Gateway hacia Catalog sin fachada que aplique el alcance de estación del actor.
- **Identity:** proyecto con build/runtime/clientes Prisma delimitados y núcleo hexagonal, adaptadores y rutas legadas compatibles. Hay composición HTTP privada FuelFlow–Identity, verificación Control remota y transporte TLS con credencial técnica/nonce en laboratorio. AuthCore, login y tráfico productivo no se reemplazaron. No es autónomo todavía: runtime legado y cliente Prisma de compatibilidad conservan dependencias compartidas.
- **Administration y Commerce:** no iniciados como microservicios independientes. Los módulos de Control mezclan administración, configuración e inventario; las transacciones financieras, saldos, reservas/pagos y efectos de bienvenida permanecen en Backend/Commerce compartido.

## Avances Identity validados

- **A.1:** esquema privado sintético con `Account` e `IdentityProfile`, una FK interna y sin FK externas. Creación de fixtures, lectura email/DNI, validaciones existentes, login/guard/JWT y aislamiento fueron probados en laboratorio. No se conectó al registro público.
- **A.2 PasswordReset:** bloqueado. La implementación actual consulta `AdminControlAccount` y `SYSTEM_ADMIN` para elegir política. Una consulta remota seguida de escritura deja carrera con revocaciones; TTL corto no la elimina. Se diseñó `RecoveryPolicyPort.v1` y se aprobaron 8 pruebas de modelo sintético, pero no hay protocolo implementado ni pruebas reales de concurrencia/durabilidad. La recuperación vigente debe permanecer intacta hasta aprobar autoridad única de `authVersion`, participación de todos los escritores, orden de recuperación/revocación y reconciliación de fallos.
- **A.3:** esquema privado experimental añadió `ruc` y `businessName` a perfil. Informe registra 11 grupos PostgreSQL sintético y 4 unitarias aprobados: creación/consulta/actualización, duplicados y concurrencia, rollback, constraints y aislamiento. No prueba las 27 rutas por HTTP ni cambia su contrato.
- La propiedad conceptual aprobada deja a Identity cuentas/documentos/perfil/número/alias y vínculo exclusivo con Vehicle, sin asumir propiedad completa del vehículo; Membership.status conserva semántica; balances, movimientos y beneficios financieros permanecen con sus proveedores; registro/bienvenida no se cambian; Station se propone para Administration; autoridad final de Terminal queda pendiente; TerminalCredential mantiene la transacción/auditoría del proveedor; AuthCore conserva autoridad Control hasta una migración aprobada.

## Pendientes por orden recomendado

1. **A.2 decisión y pruebas:** cerrar las cuatro decisiones de autoridad y diseñar coordinación durable/reconciliación con AuthCore. Después, y con autorización específica, ensayar PostgreSQL aislado ante concurrencia, revocación, reinicios y respuesta perdida antes de migrar PasswordReset.
2. **A.4 propuesta (recomendación, no trabajo aprobado):** analizar número/contador, alias y referencia/vínculo Vehicle. Mapear lectores/escritores y transacción User+Membership+contador, `welcomeAvailable`, Membership.status y unicidad de placa. Diseñar IDs estables y contratos antes de tocar esquema o datos. Detenerse si exige cambiar esas reglas.
3. Completar propiedad/migraciones propias A sin arrastrar balance, bienvenida o maestros ajenos. Los 37 vínculos auditados son relaciones declaradas desde el esquema compartido, no permiso para eliminar FK ni trasladar datos.
4. Completar B: sustituir accesos SQL compartidos mediante contratos/puertos, conservando unidad de consistencia operacional y compatibilidad.
5. Completar C: instalación, secretos/certificados, retención, recuperación y despliegue reproducibles sin importar el Backend.
6. Administración puede comenzar solo según las puertas descritas en continuidad 5.10: límites Identity/grants, contratos estables Station/Terminal/auditoría y sin SQL directo entre servicios. Commerce requiere además propiedad financiera y relaciones acordadas, transacciones idempotentes propias y contratos maestros estables. No se declara que esas puertas ya estén satisfechas.

## Pruebas documentadas y límites

Resultados históricos que deben leerse en sus archivos: Catalog Misión 4 22/22 y 5/5; Identity V2 67/67; Control remoto 17/17; TLS A 15/15; regresiones enfocadas Identity/Gateway 83/83 y FuelFlow 28/28; A.1 8 grupos y A.3 11 grupos PostgreSQL sintético, con 2 y 4 unitarias respectivamente. Son suites y etapas distintas; no sumarlas como una sola ejecución ni presentarlas como regresión actual completa. A.2 cuenta 8 verificaciones de un modelo en memoria, no prueba transaccional real.

Limitaciones conocidas: no se repitieron suites en este handoff; no hay activación pública; no se migraron datos; no se probaron aquí todos los contratos HTTP ni el reinicio/despliegue autónomo completo. La continuidad 5.10 registra timeouts históricos y fallos parciales con sus diagnósticos; conservar esas evidencias junto a resultados exitosos. No borrar archivos “partial” ni sustituirlos por resúmenes.

## Archivos y reproducción

Lectura principal: `Docs/astra/continuidad-primax-v2-identity-5-10.md`, `mision4-consolidacion.md`, `mision5-11-propiedad-persistencia.md`, `mision5-11-a2-password-reset.md`, `identity-recovery-policy-port-design.md` y `mision5-11-a3-perfil.md`. Las evidencias están en `Docs/astra/evidence/`.

Reproducción A.3 (requiere dependencias existentes y Docker; solo laboratorio nuevo; usar nombre de evidencia no existente):

```bash
node --test services/identity/lab/owned-account-store.test.cjs services/identity/lab/owned-profile-a3-store.test.cjs
node tools/astra/identity-owned-profile-a3-lab.cjs --evidence=identity-mission5-11-owned-profile-a3-repro1.txt
```

El runner crea PostgreSQL desechable con tmpfs y enlace loopback, genera solo el cliente experimental y aplica DDL privado; no pasar URLs existentes, no usar `db push` ni volúmenes previos. Para A.2, `node --test tools/astra/identity-recovery-policy-design.test.cjs` reproduce solo el modelo sintético, no una integración.

## Respaldo y continuación Git

Los informes A.3 registran el respaldo previo y final bajo `/home/primax/.local/state/primax-backups/mission5-11-a3-*`, con `MANIFEST.json` y `SHA256SUMS`. Antes de restaurar, verificar manifiesto y checksum; extraer a otro directorio sobre el HEAD allí registrado, nunca encima del checkout. El tar no es evidencia apta para GitHub ni copia de una base. Se recomienda guardar una segunda copia cifrada fuera de la VM por un canal privado aprobado.

Para continuar, primero inspeccionar `git status --short`, `git diff --check`, diferencias tracked y archivos no seguidos. Preservar todo; no usar `git add -A`. Revisar secretos y cada evidencia antes de cualquier publicación. Este documento no autoriza crear ramas, commits o push. No alterar `main`; solicitar aprobación con lista exacta de rutas.

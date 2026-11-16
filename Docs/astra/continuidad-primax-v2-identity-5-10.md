# Primax V2 Astra — continuidad y auditoría de autonomía, Misión 5.10

Corte: 15 noviembre 2026, rama `feat/astra-hexagonal-microservices`,
HEAD `b99b995fa9f0527a0e2094d4f1c9c3e638548c83`. Auditoría estática de código,
configuración y evidencias locales; no se conectó a bases ni se ejecutaron suites.
Este documento distingue resultados demostrados de trabajo recomendado, no implementado.

## Conclusión y alcance de «cerrar Identity»

**Identity ya es compilable y ejecutable como proyecto propio en laboratorio.
Todavía no tiene autonomía completa de datos y operaciones.** El mínimo pendiente
es: (1) definir y materializar su propiedad de datos, (2) eliminar sus accesos SQL
operativos ajenos completando los puertos, y (3) demostrar instalación y restauración
con artefactos/configuración propios. Se proponen **tres paquetes de cierre**, con
salidas verificables abajo, no una serie indefinida de nuevas misiones.

No hace falta reescribir AuthCore, cambiar login, eliminar Nest/Prisma, retirar
Redis, desplegar una instancia PostgreSQL física por dominio, implementar todo
Commerce/Administration o automatizar una PKI para cerrar esta etapa. Un servicio
externo, incluso legado, es una dependencia normal si tiene propietario y contrato
estable y no obliga a Identity a acceder a sus tablas o a compilar su código.

«Cierre» aquí significa autonomía demostrada del proyecto y sus datos **en un
laboratorio desplegable y reproducible**, conservando contratos. No significa
migración de datos operativos ni activación productiva; esas acciones requieren
plan y autorización posteriores. No borrar FK reales ni mover tablas por deducción.

## Estado demostrado y límites

| Área                  | Estado y fuente                                                                                                                                                                                                                                                                                                                               |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Catalog               | Servicio de lectura con pg, paquete/Dockerfile/CI propios; aceptación técnica 22/22 en Misión 4 y última regresión histórica 5/5. Tráfico independiente apagado. Inventario público legado sigue por excepción autorizada; migración de FuelFlow/proxy/consumidores pendiente. Ver mision4-consolidacion.md y catalog-inventory-migration.md. |
| Identity dominio      | Núcleo puro y puertos; bcrypt/JWT, sesiones, permisos y adaptadores propios. No reemplaza AuthCore productivo.                                                                                                                                                                                                                                |
| Identity proyecto     | package/lock/tsconfig propios; generación de dos clientes Prisma. 72 archivos TS de src inspeccionados: cero imports Backend o relativos fuera del proyecto. Snapshots de compatibilidad locales, no imports vivos.                                                                                                                           |
| Datos                 | Cliente nativo proyecta 14 modelos; **no equivalen a 14 entidades exclusivas**. Cliente de compatibilidad conserva 40 modelos. 37 relaciones externas declaradas auditadas, más referencias escalares/constraints no cubiertos por ese recuento.                                                                                              |
| Operación             | OperationalSessionPort.v1 y proveedor remoto mantienen Terminal + TerminalOperation + TerminalCredential + OperationalAuditEvent + recibo en una transacción SQL. El puerto materializado inicial cubre bootstrap; no toda la recuperación/operación heredada.                                                                                |
| Correlación           | callerOperationId → intentId → commandId durable; propietario/generación/contexto inmutables. Recibos cifrados y recuperación tras pérdida de respuesta sin otra emisión.                                                                                                                                                                     |
| FuelFlow privado      | Paquete pg propio y dos instancias; verificación Control remota, sin autenticador compilado de Identity ni lecturas SQL de autorización. No es integración del navegador/producto actual.                                                                                                                                                     |
| Transporte A          | HTTPS nativo, CA/nombre/vigencia, clave técnica exclusiva con alcance/expiración/revocación y nonce único compartido. Servicio técnico separado del humano Control. Solo FuelFlow → consumidor V2; ingreso humano loopback, puente y proveedor conservan enlaces anteriores.                                                                  |
| Evidencias históricas | V2 completo 67/67; Control remoto 17/17; TLS A 15/15 y regresiones enfocadas 83/83 + FuelFlow 28/28. Son baterías distintas: no sumarlas ni tratar el ensayo TLS como repetición completa de las 27 rutas.                                                                                                                                    |

Referencias de entrada: mision5-identity-core.md, identity-data-contracts-proposal.md,
identity-data-fk-audit.md, identity-consumer-v2.md, mision5-8-control-remote.md y
mision5-9a-transporte-laboratorio.md. Las evidencias conservan también intentos fallidos.

Tres composiciones distintas: `src/main.ts` aloja contratos legados con adaptadores;
`src/operational/main.ts` cambia bootstrap por coordinador/puerto optativo;
`src/operational/consumer/main.ts` aloja el HTTP privado V2/TLS. Tener el consumidor
privado independiente no demuestra que todas las rutas del runtime legado lo sean.

## Propiedad mínima que debe quedar acordada

| Datos                                                                                         | Límite recomendado para cerrar; confirmar antes de cambiar persistencia                                                                                                                                                              |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| User, password/reset, authVersion; número/alias, documentos/perfil, vínculo exclusivo Vehicle | Identity. Mantener atómicos User+Membership+contador y reset+contraseña+authVersion; no partirlos en RPC.                                                                                                                            |
| Grants/cuentas Control/asignación de alcance                                                  | Almacenamiento/autorización de Identity; Administration los gestiona mediante comandos autorizados. Acordar autoridad de modificación y revocación, no deducirla del prefijo Admin ni habilitar escrituras SQL desde Administration. |
| Membership.balance, bienvenida/reserva/transacción de bienvenida y elegibilidad financiera    | Commerce. Decidir explícitamente Membership.status y el efecto welcomeAvailable=true del registro: no suprimir o volver asíncrono ese efecto silenciosamente.                                                                        |
| Station y estado/atención/asignaciones de Terminal                                            | Maestro operacional/Administration, con referencia/proyección o lectura contractual para Identity. Definir frescura y fallo cerrado al revocar/desactivar; no convertir una copia local en autoridad.                                |
| TerminalCredential junto con operación/auditoría                                              | Mantener temporalmente en el proveedor de la unidad atómica. Acordar propietario final; no mover credencial y dividir transacción para aparentar independencia.                                                                      |
| Intenciones/registro técnico/nonces                                                           | Identity consumidor; CallerOperation pertenece al llamador FuelFlow; recibo pertenece al proveedor de operación. Propiedad separada aunque compartan servidor PostgreSQL de laboratorio.                                             |
| BusinessAlert/dashboard/resolución                                                            | Servicio operacional/Administration con lecturas de Commerce; Identity solo fachada/cliente del contrato.                                                                                                                            |

## Catálogo obligatorio de dependencias

Convención de rutas: persistence/, compatibility/, adapters/ y operational/ parten
de `services/identity/src`; consumer/ y remote/ parten de su subcarpeta operational.
`FuelFlow/lab` significa `Frontend_1_FuelFlow/lab`. prisma/ y scripts/ pertenecen
a `services/identity` salvo que se indique otro prefijo.

Las prioridades se refieren al cierre: **crítica** bloquea alguna garantía de
propiedad/funcionalidad/recuperación; **importante** exige contrato o operación mínima,
sin forzar un nuevo dominio; **aplazable** no debe alargar el cierre. «Bloquea» no
significa que deba sustituirse la tecnología, sino resolver el motivo indicado.

### D1 — datos mezclados, FK y migraciones propias — crítica

- **Archivo/componente:** services/identity/prisma/{identity.prisma,compatibility.prisma,boundaries.json}; compatibility/users/users.repository.ts y persistence/{memberships,vehicles}.repository.ts.
- **Motivo:** proyección 14 conserva balance/bienvenida y Station/Terminal; 37 vínculos externos permanecen en esquema original. Registro escribe welcomeAvailable=true; vínculo exige Membership.status. No hay prisma/migrations propio.
- **Tipo/impedimento:** acoplamiento real de propiedad y ciclo de vida, **sí bloquea autonomía de datos**. PostgreSQL/Prisma en sí son infraestructura válida; compartir servidor con roles/esquemas aislados también puede ser válido.
- **Riesgo:** alto: saldo/bienvenida/estado, unicidad de placa/documentos, contador, bajas y referencias financieras. Auditoría de 37 relaciones es estática; no inspecciona constraints SQL operativos reales.
- **Solución mínima:** aprobar matriz anterior y esquema/migraciones Identity sin columnas financieras ni FK a dueños ajenos, conservando IDs y atomicidad local. Probar primero en base nueva; preparar propuesta separada de transición de datos/FK reales, no ejecutarla.
- **Pruebas necesarias:** instalar de cero solo esquema propio; rol sin acceso ajeno; registro/reset/perfil/vehículos concurrentes, rollback completo y proyecciones/estado no disponible; paridad de contratos y referencias estables.

### D2 — cliente completo y autorización/health sobre compatibilidad — crítica

- **Archivo/componente:** persistence/compatibility-db.ts; compatibility/auth/access.guard.ts; compatibility/health/health.service.ts; operational/consumer/{auth,journal,service-transport}.ts; persistence/{atomic,errors}.ts.
- **Motivo:** runtime registra/conecta PrismaService completo además del nativo. Guard lee grants/cuentas, Station/Terminal/TerminalCredential; consumidor y ledger propios usan ese mismo adaptador. atomic/errors importan tipos del cliente completo aun en flujos nativos.
- **Tipo/impedimento:** **sí** por esquema/lecturas ajenas que exige, no por usar Prisma o consultar tablas de autorización que sean propiedad de Identity. Health solo SELECT 1 en cliente compat no prueba disponibilidad del cliente nativo/Redis/puertos.
- **Riesgo:** alto en alcance, authVersion, estación activa y revocación; medio al adaptar errores/reintentos.
- **Solución mínima:** cliente/repositorios de esquema realmente propio; directorio Station/Terminal/credenciales mediante contrato/proyección autorizada y política explícita de vigencia. Mantener reglas AuthCore, no repartir JWT_SECRET a clientes. Mover health a dependencias efectivas y separar ready/degradado donde corresponda.
- **Pruebas necesarias:** ejecutar sin generar/usar cliente de 40 modelos en Identity; permiso/grant/estación/credencial revocados, fuente inaccesible y error SQL; mismos JWT/CSRF/errores de conflicto/serialización y falsos health verdes rechazados.

### D3 — operación/recovery todavía SQL ajeno — crítica

- **Archivo/componente:** compatibility/kiosk/kiosk.service.ts (recoveryEvidence, issueRecoveryTicket, exchangeRecoveryTicket, claimTerminal, authorize/binding/authorization); operational/{prisma-sessions,controller,coordinator}.ts; operational/remote/{receipt-provider,provider-main}.ts.
- **Motivo:** además del bootstrap extraído, siguen lecturas/escrituras de TerminalOperation/auditoría y lecturas de OnlineOrder, Payment/PaymentEvent, FuelAuthorization, InventoryReservation y Transaction. El puerto privado V2 inicial no cubre todas las variantes legadas de recuperación/owner.
- **Tipo/impedimento:** **sí**, acceso desde Identity a responsabilidad operacional/financiera. Que un proveedor externo conserve su propio esquema completo y transacción es normal; no exige trasladarlo a Identity ni desarrollar todo Commerce.
- **Riesgo:** muy alto: takeover, orden/pago existente, firma/CSRF, owner, revocación y evidencia consistente. Hay GETDEL/SET Redis dentro de callbacks SQL de recuperación: por lectura del código, rollback SQL no revierte esos efectos Redis. No se afirma haber reproducido un fallo nuevo.
- **Solución mínima:** completar puerto para las rutas realmente usadas y aislar unidad operacional/proveedor en su artefacto/propietario; Identity solo coordina seguridad/sesión. No dividir bloqueo, credencial y auditoría en RPC. Si recovery exige cambiar garantías, presentar decisión específica antes de implementar. Proveedor de compatibilidad externo puede ser transitorio y mantener el contrato legado.
- **Pruebas necesarias:** matriz de las 27 rutas con recuperación/claim y selectores legados; fallos en cada frontera SQL/Redis, evidencia financiera cambiada, ticket usado/reemplazado, owner distinto, concurrencia y resultado desconocido. Demostrar ausencia de SQL ajeno en proceso Identity.

### D4 — membresías financieras y vista de vehículos — importante; propiedad en D1 es crítica

- **Archivo/componente:** adapters/{financial-reads,memberships.service,vehicles.service,compatibility-port}.ts; ports.ts; tools/astra/identity-compatibility-bridge.cjs y identity-data-contract-lab.cjs.
- **Motivo:** me/historial/vista enriquecida se delegan por HTTP. El bridge de laboratorio carga Backend/dist; finance/me mezcla perfil y dinero. Fixtures alternativos no prueban cálculos reales. updateProfile y link confirman escritura local antes de pedir vista remota: posible 503 con cambio local ya confirmado.
- **Tipo/impedimento:** RPC financiero es dependencia normal, **no bloquea por sí mismo**. Bloquean la propiedad ambigua D1 y afirmar cobertura/instalación completa sin un proveedor contractual real. Import de Backend está en host externo de pruebas, no en src Identity.
- **Riesgo:** alto si se reescriben cálculos o se asume cero ante ausencia; medio de respuesta/errores y composición.
- **Solución mínima:** Identity compone su perfil; contrato de lectura financiera por IDs con decimales/estado/errores acordados. Puede seguir un proveedor legado externo versionado; no implementar Commerce completo para cerrar Identity. No copiar finanzas ni presentar fixtures como fuente real.
- **Pruebas necesarias:** me no-cero y SELECT-only, historial/Decimal/reservas/deuda/puntos, caída con error compatible, aislamiento; commit local seguido de fallo de enriquecimiento sin rollback ficticio o duplicación.

### D5 — Alerts y fachadas admin legadas — importante

- **Archivo/componente:** adapters/alerts.service.ts; ports.ts; compatibility/auth/admin.controller.ts; tools/astra/identity-compatibility-bridge.cjs; Backend/src/alerts/alerts.service.ts como proveedor legado.
- **Motivo:** list/dashboard/resolve/check-plate salen por HTTP; host real carga Backend/dist. Alerts.list reconcilia deudas y escribe BusinessAlert: **no todo el bridge es de solo lectura**. Fixture no implementa toda resolución/check-plate.
- **Tipo/impedimento:** servicio de alertas externo es normal. No impide independencia si tiene contrato/propietario y despliegue externo; sí impide declarar todos los métodos cubiertos con solo fixtures. No obligar a Identity a poseer esos datos para conservar fachadas.
- **Riesgo:** medio/alto por comandos, duplicación de alertas, auditoría y dashboard financiero.
- **Solución mínima:** fijar contrato de lectura y comandos idempotentes/actor/alcance; mantener proveedor legado externo o adaptador de compatibilidad empaquetado, sin importar su código en Identity. Dejar titularidad futura a Administration/operación y cálculos a Commerce.
- **Pruebas necesarias:** list/dashboard reales no-cero, resolve/check-plate autorizados y negativos, repetición/pérdida de respuesta, upstream caído y paridad de fachadas admin actuales.

### D6 — fuentes congeladas y mantenimiento desde Backend — aplazable

- **Archivo/componente:** src/compatibility/\* y compatibility-manifest.json; scripts/prepare-compatibility.cjs, prepare-operational-adapter.cjs; package.json/tsconfig.json.
- **Motivo:** refresh:compatibility lee Backend/src y Backend/prisma explícitamente. Build/start no ejecutan refresh; importan copias locales ya materializadas. LegacyKioskSessionIssuer invoca create privado mediante cast, frágil al actualizar esa copia.
- **Tipo/impedimento:** **no bloquea compilación/ejecución independiente** ni obliga a reescribir AuthCore. Es riesgo de mantenimiento/procedencia; el cast es acoplamiento interno, no import vivo de Backend.
- **Riesgo:** alto de sobrescribir trabajo validado al regenerar automáticamente, bajo si se conserva congelado con revisión.
- **Solución mínima:** conservar snapshots/manifest y no usar refresh como build; documentar propiedad/versionado. Más adelante exponer puerto explícito de emisión de sesión sin cambiar login. Reescritura total hexagonal no es puerta de cierre.
- **Pruebas necesarias:** build desde artefacto que no contenga Backend, hashes de fuentes congeladas y ninguna referencia externa; revisar diff/contratos cuando se autorice actualizar snapshots.

### D7 — Redis, SMTP y OCR — importante operación; no bloqueo arquitectónico por ser externos

- **Archivo/componente:** compatibility/kiosk/redis-store.ts y kiosk.service.ts; compatibility/auth/recovery-delivery.ts; compatibility/vehicles/recognition.service.ts.
- **Motivo:** estado de sesión/CSRF/owner/tickets/rate limits, correo de recuperación y reconocimiento externo. KioskStore reconecta con promesa compartida, cooldown y sin fallback en memoria; namespace propio configurado.
- **Tipo/impedimento:** infraestructura/contratos externos normales; **no impiden independencia** si Identity controla su estado, alcance y credenciales. D3 recoge la mezcla operacional del owner/recovery. APP_MODE local usa cliente Redis; otro modo usa REST: configuración de despliegue debe ser explícita.
- **Riesgo:** alto si se restauran sesiones revocadas o se reintenta un comando ambiguo; medio de disponibilidad de SMTP/OCR.
- **Solución mínima:** conservar comportamiento probado y namespace/ACL; declarar sesión perdida → 401/nueva autenticación, sin prometer recuperar datos por reconectar. Contratos/secretos SMTP y OCR externos con fallos conocidos, sin incorporarlos a Identity.
- **Pruebas necesarias:** caídas y ciclos Redis 503→recuperación, preservada/perdida/revocada, INCR sin duplicar, CSRF/firma; reset de uso único/authVersion y SMTP fallido; OCR apagado/error sin inventar placa. Ya hay evidencia histórica; no repetir en esta auditoría.

### D8 — frontera commit SQL / sesión Redis — importante; recovery completo bloqueado en D3

- **Archivo/componente:** operational/coordinator.ts, LegacyKioskSessionIssuer; compatibility/kiosk/kiosk.service.ts.
- **Motivo:** emisión SQL confirma y después crea sesión Redis; 503 posterior puede dejar credencial/audit/recibo confirmados. El consumidor V2 recupera resultado SQL, no entrega por sí solo sesión kiosk completa.
- **Tipo/impedimento:** dos almacenes son normales; **no exigir transacción distribuida**. Impide afirmar integración funcional browser/kiosk completa si solo se probó recibo; no impide ejecutar núcleo independiente.
- **Riesgo:** alto de duplicados/takeover al «arreglar» con replay o compensación sin protocolo.
- **Solución mínima:** documentar y conservar orden/errores; coordinar recuperación de sesión explícita con recibo y autoridad vigentes sin cambiar identificadores. Mantener cliente productivo legado hasta migración autorizada.
- **Pruebas necesarias:** SQL commit + Redis falla, recibo válido/inválido, sesión perdida, retry con mismo intent y nonce transporte nuevo; cero acceso indebido o auditoría parcial.

### D9 — secretos, certificados y clave de recibos — importante; recuperar la clave es crítico

- **Archivo/componente:** consumer/{main,service-transport}.ts; remote/{provider-main,receipt-provider,http-client}.ts; FuelFlow/lab/service-transport.cjs; tools/astra/identity-service-tls-fixture.cjs.
- **Motivo:** CA/clave TLS y clave técnica son efímeras en fixture. Recibo AES-GCM usa OPERATIONAL_RECEIPT_KEY y un keyId activo (default lab-v1); no hay keyring. Cambiar/perder esa clave deja recibos irrecuperables con 503, aunque la emisión exista. TLS A no cubre el salto operacional HTTP ni el bridge.
- **Tipo/impedimento:** almacenamiento seguro/trust son infraestructura normal; **falta operación reproducible para despliegue/recuperación**, no una nueva autoridad humana. Rotación de clave de servicio probada no equivale a rotación de clave de cifrado de recibos.
- **Riesgo:** alto de pérdida de recuperabilidad, confianza incorrecta o exposición de material.
- **Solución mínima:** inyectar archivos/secretos fuera del artefacto, roles, vigencia/revocación y respaldo de clave de recibos con keyId; conservarla mientras haya recibos que la necesitan. Manual de rotación/reinicio CA y recuperación verificado; keyring, HSM o PKI automatizada pueden aplazarse si no se rota esa clave todavía. Definir aislamiento/seguridad de cada enlace desplegado, sin heredar por inferencia TLS A.
- **Pruebas necesarias:** CA/nombre/fecha/revocación, key rotation de servicio y restore con clave original; clave ausente/equivocada → fallo cerrado sin reemisión. No desactivar validación ni distribuir JWT_SECRET al llamador.

### D10 — retención/restauración de diarios, recibos y nonces — crítica para la garantía durable

- **Archivo/componente:** prisma/lab-{consumer-intents,operational-receipts,service-transport,service-nonces}.sql; consumer/journal.ts; remote/receipt-provider.ts; FuelFlow/lab/caller-journal.sql.
- **Motivo:** DDL de laboratorio y tmpfs; sin GC ni procedimiento de restauración. Intent vence a 15min pero conserva tombstone; recibo pertenece al proveedor; nonce al servicio; CallerOperation a FuelFlow. No son una única base conceptual aunque hoy usen mismo servidor sintético.
- **Tipo/impedimento:** infraestructura/propiedad válidas; **sí falta probar durabilidad tras pérdida de proceso/almacén más allá de los reinicios ensayados**. No requiere HA avanzada para cerrar; sí una restauración mínima que mantenga correlación.
- **Riesgo:** alto: restaurar el diario a un punto anterior al proveedor puede perder el commandId y crear otro para un callerOperationId antiguo. Borrar recibos/tombstones no autoriza emitir otra vez.
- **Solución mínima:** por ahora no borrar/reasignar IDs; RPO/RTO y backup/restore por propietario con barrera consistente o conciliación bloqueante. Ante asociación/resultado desconocidos, no adivinar por body ni emitir con ID nuevo. Retención nonce cubre ventana+skew; retención comercial de recibos/tombstones se decide separadamente.
- **Pruebas necesarias:** restaurar registro/intents/recibos/clave desde punto acordado; pérdida de respuesta y replay entre instancias; restore desalineado deniega hasta conciliación; nonce usado no aceptado dentro de ventana. El backup de código no es backup de estas bases.

### D11 — instalación y despliegue propios — importante, puerta final de aceptación

- **Archivo/componente:** package.json/lock/tsconfig; src/main.ts y operational/main.ts; herramientas identity-isolated.cjs/identity-data-isolated.cjs; compose.yaml; .github/workflows/catalog.yml como contraste.
- **Motivo:** build propio probado, pero runner instala esquema Backend completo y host de compatibilidad; no hay migraciones propias, Dockerfile o workflow de Identity. Compose actual construye Backend y arranca su entrypoint Identity. Main exige perfil synthetic, URLs loopback y bridge configurado, aunque este pueda estar caído.
- **Tipo/impedimento:** no hay bloqueo de imports/runtime Backend; **queda una aceptación de despliegue independiente reproducible**. Ausencia de Dockerfile sola no es bloqueo: sirve artefacto Node o imagen propia. Restricciones sintéticas son protección vigente, no deben quitarse a ciegas para desplegar.
- **Riesgo:** medio/alto de arrancar el entrypoint equivocado, aplicar migraciones globales o declarar healthy solo por SELECT 1 compat.
- **Solución mínima:** receta/artefacto que use solo services/identity y contratos externos declarados, instalación de esquema propio y perfiles seguros de laboratorio; roles/secrets/health documentados. CI mínima y reproducibilidad, sin cambiar tráfico o autorizar producción. No exige Kubernetes ni mover carpetas.
- **Pruebas necesarias:** desde directorio limpio sin Backend, instalar dependencias/generar/build/arrancar, esquema vacío propio y roles negativos, reset/restart/restore, proveedores ausentes con fallos correctos, puertos y 27 contratos/seguridad. Imagen o proceso independiente verificado, no Compose Backend reciclado.

## Trabajo mínimo en orden: tres paquetes cerrables

### A — propiedad y persistencia (D1, D2; decisiones de D3/D4)

Entregar una sola matriz aprobada de columnas/autoridades y contratos Station,
Terminal/credencial, Membership.status y bienvenida; esquema/migraciones propios,
roles y plan de transición separado. Mantener operaciones financieras en su dueño
y la transacción operacional en el proveedor. Materializar cliente mínimo y
repositorios sin SQL ajeno. **Salida:** base nueva solo Identity suficiente para
registro/reset/perfil/vínculo y validación de autoridad; ninguna FK ni privilegio
cross-domain. No migrar datos reales como parte de esta prueba.

### B — completar frontera compatible (D3, D4, D5, D8)

Cubrir recovery/owner/authorize y todas las rutas hoy dependientes del esquema
operativo, sin repartir transacción. Componer perfil propio + lectura financiera;
formalizar proveedor Alerts real/externo y errores. Un proveedor legado versionado
puede mantenerse fuera de Identity; no exige implementar Commerce o Administration
completos. Fixture sirve para aislamiento, proveedor real para paridad.
**Salida:** las 27 rutas conservadas con matriz de dueño/proveedor/efectos y pruebas;
Identity no consulta operación, finanzas ni alertas por SQL y no carga Backend/dist.
Si un efecto de bienvenida/recovery cambia semántica, detener ese cambio y aprobarlo.

### C — aceptación y continuidad operativa mínima (D9, D10, D11)

Instalación reproducible desde artefactos propios, perfil seguro y roles; persistir
estado/clave de recibos, no limpiar IDs en este cierre; ejecutar una restauración
consistente y el caso desalineado con fallo cerrado. Runbook de claves/CA y salud.
**Salida:** otro desarrollador reproduce build/run/recovery sin árbol Backend ni
procedimientos ocultos, con hashes/evidencia y responsables de contratos externos.
No agregar HA multirregión, broker/outbox genérico, HSM o consola PKI como requisitos.

**Cierre mínimo de Identity:** A+B+C aprobados en laboratorio; cero SQL ajeno en el
proceso, propiedad de datos clara, proveedor atómico conservado y restauración sin
reemitir. Producción, migración real, traslado de carpetas y cambio de tráfico son
otra autorización; no se requieren para comenzar el siguiente dominio.

## Condiciones para comenzar Administration

1. Cierre A+B+C o aceptación explícita de una excepción acotada, sin etiquetarla
   autonomía completa. Hoy no están satisfechos los bloqueos críticos.
2. Identity dueño de credenciales/grants; Administration gestiona por comandos/puerto,
   nunca escribe User/grants por SQL ni comparte JWT_SECRET para eludir introspección.
3. Contratos versionados para Station/Terminal, auditoría/Alerts y alcance; ubicación
   transitoria del proveedor operacional documentada, con transacción intacta.
4. Catalog sigue sin activación; inventario exacto debe usar el contrato privado
   aprobado. No basar la nueva administración en el endpoint público transitorio.

Se puede revisar/documentar estas fronteras durante A; este informe no autoriza
implementar Administration ni obliga a esperar una migración productiva de Catalog.

## Condiciones para comenzar Commerce

Identity cerrado; contratos maestros de estación/terminal/autoridad/auditoría de
Administration estables (no requiere toda su UI terminada). Propiedad de balance,
bienvenida/estado comercial y enlaces membershipId/vehicleId acordada. Lectura de
inventario privado/control de reserva definidos con Catalog/operación. Operaciones
financieras conservan su unidad de consistencia e idempotencia dentro de Commerce;
no acceden por SQL a tablas Identity/Administration. Primero pruebas sintéticas de
concurrencia, reservas, pago/reversión y snapshots contables. No se autoriza comenzar
ese dominio, copiar dinero a Identity o retirar la excepción de inventario hoy.

## Pruebas esenciales para el próximo desarrollador

**No ejecutadas en esta auditoría.** Ejecutar tras el cambio correspondiente; no
volver a correr todo por documentación. Desde raíz:

```bash
npm ci --prefix services/identity
npm run build --prefix services/identity
node --test services/identity/test/*.test.cjs
npm ci --prefix Frontend_1_FuelFlow/lab
npm test --prefix Frontend_1_FuelFlow/lab
```

- A: roles negativos/esquema vacío y transacciones de creación/reset/vehículo,
  actor/grants/estación revocados; inspección sin SQL/cliente completo ajeno.
- B: HTTP legados completos, recovery y evidencias cambiantes, paridad me/vehículos
  financieros y Alerts; SQL commit→fallo Redis y reintentos con referencias originales.
- C: pruebas anteriores que cambian + restore consistente/desalineado y claves.
  Añadir aceptación nueva de instalación **sin** usar Backend/prisma como migración.
- Reproductores existentes (Docker, **solo bases nuevas**):
  `node tools/astra/identity-isolated.cjs --consumer-v2` (67 históricos);
  `node tools/astra/identity-isolated.cjs --service-tls --consumer-only` (15 TLS).
  Son herramientas de regresión que todavía usan Backend como fixture/comparador;
  no certifican por sí solas la nueva autonomía de datos. No ejecutar db push/migrate
  de esas proyecciones contra bases existentes ni refresh:compatibility a ciegas.
- Gateway/FuelFlow/Prime/Catalog y Backend afectados: ampliar tras tocar sus contratos,
  no como reacción automática a un timeout de fixture o a esta auditoría estática.

## Riesgos conocidos que no deben desaparecer del relevo

- Timeouts 5.8: cuatro hooks bcrypt costo12 y un login desconocido excedieron 5s.
  Repetición secuencial 14/14 no demuestra causa resuelta. Diagnóstico 5.9 indujo
  bloqueo de event loop y reprodujo >5s con costo intacto; causa histórica exacta
  sin perfil del scheduler sigue pendiente. No bajar costo/ampliar límites para ocultar.
- 503 histórico admin/check-plate: deadline del bridge 4s se reprodujo con demora
  controlada y recuperación; no prueba que fuera la causa exacta original.
- Cambiar clave de recibo sin conservar la anterior rompe recuperación; no tratar
  key rotation técnica del ensayo TLS como solución de ese problema.
- Revocar impide peticiones nuevas; no hay cancelación atómica de un RPC en curso.
  Restaurar Redis o un backup atrasado puede perder estado; sesión inexistente → 401,
  resultado desconocido no equivale a operación inexistente.
- Catalog conserva exposición pública temporal autorizada del inventario. No está
  cerrada esa migración ni se activa por haber terminado pruebas de Identity.
- Requisitos pendientes de Dezkz no están implementados por estas misiones; preservar
  sus cambios. Fuente de verdad es este workspace con archivos sin seguimiento,
  no solo el commit de la rama.

## Git, evidencias, respaldo y compartir de forma segura

Al inicio: **23 archivos rastreados modificados y 207 sin seguimiento**, HEAD anterior
a gran parte del trabajo. services/identity, FuelFlow/lab, documentos y herramientas
incluyen código sin seguimiento. Un patch de git diff solo no conserva todo.
No se cambió rama, creó commit, push, merge o PR ni se envió información a terceros.

Se verificó el respaldo `mission5-9a-final-20261115T232643Z/pending-work.tar.gz`
en `/home/primax/.local/state/primax-backups/`: SHA-256 del archivo y de **301 miembros**,
además de igualdad con los archivos actuales al comenzar. Es respaldo de **código y
evidencia**, no de PostgreSQL/Redis. Excluye env y dos logs PrintAgent con URLs sensibles;
los originales se conservan y se cotejan por hash. Los 34 JSON no se modifican.
El inventario de esta auditoría protege **119 evidencias previas**.

Procedimiento propuesto, **no ejecutado ni autorización para publicar**:

1. Entregar este documento y el snapshot local verificado a un destinatario autorizado,
   por canal privado; manifiesto de miembros/HEAD/hashes. Restaurar en carpeta aparte
   sobre ese HEAD, nunca sobrescribir este workspace ni descartar/stash/clean/reset.
2. Revisar diferencias rastreadas **y archivos sin seguimiento** con su propietario;
   conservar Catalog/Dezkz/evidencias. Separar cambios por responsabilidad para revisión,
   manteniendo un snapshot integral que permita reconstruir la validación.
3. Revisar secretos localmente con salida sanitizada; no copiar .env, material TLS,
   URLs con credenciales, node_modules/dist/generated ni logs sensibles. Conservar
   originales restringidos, sin reescribir evidencia para que «pase» una revisión.
4. Seleccionar rutas explícitas; no git add -A ciego ni subir tar al repositorio.
   Verificar locks, manifiestos, 34 JSON y disponibilidad de los TXT de fallos/éxitos.
5. Solo con autorización posterior de publicación, preparar commits/PR revisables,
   ejecutar pruebas justificadas por sus cambios y publicar por el flujo aprobado.
   Hasta entonces compartir el respaldo local no equivale a hacer push.

El cierre documental y hash del nuevo respaldo que incluye esta auditoría constan
en `evidence/identity-mission5-10-audit.txt`. No se anexan secretos ni datos de negocio.

# Misión 5.11 — paquete A, primera separación privada

**Resultado:** dos modelos propios (`Account`, `IdentityProfile`), una FK interna,
cero FK entre dominios y **8/8 grupos reales** aprobados. No se conecta este esquema
al registro público. Paquete A **todavía incompleto**; se detiene la ampliación a
membresías/operación en las decisiones de propiedad descritas abajo.

Se revisó `continuidad-primax-v2-identity-5-10.md`. Solo laboratorio nuevo, datos
sintéticos y cambios nuevos/reversibles. Ningún archivo previo de aplicación se
modificó: AuthCore, login productivo, los dos clientes existentes y sus esquemas,
las 27 rutas, tráfico, Catalog y Dezkz permanecen intactos. No hay commits ni ramas.

## A.1 implementado: propiedad inequívoca

| Modelo privado  | Datos y autoridad demostrados                                                                                                                                                    |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account         | UUID, email, nombre, passwordHash, active, authVersion y timestamps. Identity es autoridad de autenticación y cuenta. active no es Membership.status ni elegibilidad financiera. |
| IdentityProfile | accountId, DNI o pasaporte, unicidad y timestamps. Documentos de identidad para búsqueda/login, sin saldo/beneficios.                                                            |
| Relación        | Profile.accountId → Account.id, solo dentro de identity_private; no FK hacia otro servicio.                                                                                      |

BD PostgreSQL nueva `identity_a511`, esquema `identity_private`, cliente Prisma
**independiente de dos modelos**. El DDL explícito coincide en tipos/precisión con
el schema: timestamps timestamptz(3), documentos varchar/unique y regla DNI/pasaporte
excluyentes, reutilizando además `assertIdentity` y DTO originales en las pruebas.
No hay Membership, contador, alias, Vehicle, Station, Terminal, credenciales de
terminal, permisos Control, tablas financieras o administrativas en este esquema.

`OwnedAccountStore.provisionSyntheticIdentity` es **provisión de fixtures privados**,
no reemplazo de AuthService.register. Crea Account+Profile en una transacción local;
DNI duplicado revierte también la cuenta. El adaptador expone findById/findByEmail/
findByDni compatibles con las lecturas de UsersService; DNI ya no consulta Membership.
Consulta de perfil usa select sin passwordHash. Incremento de authVersion es atómico.
No se exponen endpoints nuevos ni se configura AuthModule/HTTP con este adaptador.

No se copiaron datos de las bases existentes ni se duplicaron maestros reales. Los
UUID son nuevos para fixtures; una migración posterior tendría que conservar los
IDs estables de User y sus referencias, mediante plan autorizado, no regenerarlos.
Los hooks/cálculos/contratos financieros permanecen en el proveedor actual.

También son de Identity por responsabilidad, pero **no implementados en esta
primera separación**: PasswordReset y sus hashes/consumo; perfil/número/alias y
vínculo exclusivo Vehicle (con la salvedad de status); IdentityConsumerIntent,
IdentityServiceCredential y IdentityServiceNonce. CallerOperation pertenece a
FuelFlow y el recibo operacional al proveedor de la transacción. La carpeta donde
hoy están los SQL no sustituye esa autoridad. No se mueven por esta enumeración.

## Lo que se separa y lo que no

- Se demuestra creación/consulta/autenticación de cuentas y documentos sin depender
  de Membership, balance, bienvenida, estado comercial o tablas operativas.
- La única FK nueva es interna a Identity. Las 37 FK del esquema compartido **no se
  borraron ni alteraron**. Quedaron fuera de este nuevo esquema, no «migradas».
- El cliente nativo de 14 modelos y el de compatibilidad de 40 siguen igual en los
  runtimes actuales; el nuevo cliente no sustituye ninguno. Importar clases locales
  compiladas de AuthCore para la prueba no demuestra eliminar todo el grafo de
  compatibilidad/Prisma de la aplicación completa. Sus consultas de cuenta sí pasan
  solo por el cliente nuevo; un proxy que falla ante cualquier acceso al cliente
  compat verifica el caso member del guard.
- El login probado es email/DNI y JWT member. No se declara autonomía de Control,
  grants, sesiones kiosk, recuperación por correo, vehículos o membresías por esta
  prueba. No se ejecutaron paquetes B/C ni se cambiaron contratos de esos casos.

## Propiedad propuesta para lo que sigue: necesita aprobación

| Límite                              | Observación actual                                                                                           | Propuesta de autoridad, no implementada                                                                                                                                                                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Perfil/número/alias/vínculo Vehicle | Datos de identidad en Membership mezclada                                                                    | Identity para perfil y vínculo exclusivo, con IDs estables. Mantener transacciones de identidad coherentes. No separar contador/alta pública sin preservar sus garantías.                                                                                    |
| Membership.status                   | Se usa tanto para vincular vehículos como para admitir wallet/transacciones; semántica única aún no acordada | Distinguir **estado de afiliación** (Identity) de **elegibilidad financiera** (proveedor). Requiere aprobación: no reinterpretar el campo existente ni copiarlo como estado maestro nuevo.                                                                   |
| balance y movimientos               | Cálculos/escrituras del proveedor financiero                                                                 | Mantener proveedor financiero como única autoridad, sin columnas/operaciones financieras en Identity.                                                                                                                                                        |
| bienvenida                          | Registro vigente crea User+Membership+contador y welcomeAvailable=true dentro de su operación de registro    | Beneficio, reserva y transacción de bienvenida bajo proveedor financiero. Antes de cambiar registro, aprobar cómo conservar momento/resultado y garantías del efecto actual. No se implementa eliminación del flag, async, outbox o transacción distribuida. |
| Station                             | Maestro externo consumido para alcance/estación activa                                                       | Administration como maestro propuesto; Identity solo consulta contractual o referencia/proyección con estrategia aprobada. No crear copia sin frescura/revocación definidas.                                                                                 |
| Terminal                            | Identidad del equipo mezclada con lifecycle/estado/asignación/atención                                       | Mantener maestro y validación transaccional en proveedor operacional; acordar propiedad final por responsabilidad. No asumir que la tabla pertenece a Identity.                                                                                              |
| TerminalCredential                  | Emisión/revocación unida a operación y auditoría en la transacción validada                                  | Permanecer temporalmente con ese proveedor/unidad atómica. Identity consume seguridad por contrato; no mover almacenamiento o fragmentar la transacción.                                                                                                     |
| Cuentas/grants Control              | Autoridad AuthCore existente, gestión administrativa pendiente de delimitar                                  | Conservar autoridad vigente. Acordar almacenamiento y comandos de modificación antes de cambiar tablas; no inferir propietario por nombre Admin.                                                                                                             |

**Punto de detención:** estas propuestas no autorizan cambios de semántica,
provisión financiera, maestros ni transacciones. Solicitar aprobación de la matriz
(estado de afiliación vs elegibilidad, bienvenida y autoridad operacional) antes de
ampliar hacia esos límites. Incluso aprobando propiedad, modificar el registro
público requerirá un diseño compatible explícito; no se implementó aquí.

## Las 37 relaciones: dirección y prioridad

Recontadas estáticamente desde compatibility.prisma, sin ejecutar el generador de
snapshots ni modificar `identity-data-fk-audit.md`. Son relaciones **entrantes desde
modelos externos al conjunto proyectado de 14**, no 37 permisos para que Identity
consulte o posea esos modelos. No es un inventario SQL real ni una lista exhaustiva
de todos los cruces de dominio.

- **P1: 20** hacia Station (12) y Terminal (8). Priorizar decisiones de autoridad y
  unidad operacional, porque el runtime completo hoy usa sus datos. No incluirlas
  como maestros en A.1; su implementación remota corresponde a límites posteriores.
- **P2: 9** hacia Membership (7) y Vehicle (2). Perfil/finanzas y vínculos por IDs;
  requieren preservar contrato y propiedad, no arrastrar deudas/ventas a Identity.
- **P3: 8** hacia User. No bloquean esta base sintética nueva sin datos migrados;
  serán obligatorias en el plan de transición real, preservando IDs/tombstones y
  eliminando FK entre bases solo con autorización. Nunca borrar referencias para
  hacer «pasar» independencia.

También existen referencias cruzadas **dentro** de los 14 que no aparecen en las
37: p.ej. Terminal.statusChangedByUserId → User y AdminStationAssignment.stationId →
Station, más escalares sin FK. La matriz de titularidad, no el número 37, determina
qué se permite en un esquema propio.

| #   | Origen / columnas                           | Destino    | Prioridad de análisis / motivo                                                                                       |
| --- | ------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------- |
| 1   | Transaction.vehicleId                       | Vehicle    | P2 — IDs y vínculo exclusivo; Vínculo/venta: preservar propietario e ID; sin FK entre servicios                      |
| 2   | Transaction.membershipId                    | Membership | P2 — contrato y propiedad mixta; Perfil/finanzas: separar propiedad antes de migrar                                  |
| 3   | Transaction.stationId                       | Station    | P1 — autoridad y acceso operativo; Maestro externo: contrato/frescura; no copiar como autoridad                      |
| 4   | Transaction.terminalId                      | Terminal   | P1 — no dividir atomicidad; Unidad operacional: conservar proveedor y transacción                                    |
| 5   | FuelAuthorization.membershipId              | Membership | P2 — contrato y propiedad mixta; Perfil/finanzas: separar propiedad antes de migrar                                  |
| 6   | FuelAuthorization.vehicleId                 | Vehicle    | P2 — IDs y vínculo exclusivo; Vínculo/venta: preservar propietario e ID; sin FK entre servicios                      |
| 7   | FuelAuthorization.stationId                 | Station    | P1 — autoridad y acceso operativo; Maestro externo: contrato/frescura; no copiar como autoridad                      |
| 8   | FuelAuthorization.terminalId                | Terminal   | P1 — no dividir atomicidad; Unidad operacional: conservar proveedor y transacción                                    |
| 9   | SupervisorStationAssignment.userId          | User       | P3 — migración posterior, no bloquea A.1; Identidad: referencia entrante a actor; ID estable, sin FK entre servicios |
| 10  | SupervisorStationAssignment.stationId       | Station    | P1 — autoridad y acceso operativo; Maestro externo: contrato/frescura; no copiar como autoridad                      |
| 11  | SupervisorStationAssignment.grantedByUserId | User       | P3 — migración posterior, no bloquea A.1; Identidad: referencia entrante a actor; ID estable, sin FK entre servicios |
| 12  | Pump.stationId                              | Station    | P1 — autoridad y acceso operativo; Maestro externo: contrato/frescura; no copiar como autoridad                      |
| 13  | TerminalPumpAssignment.stationId            | Station    | P1 — autoridad y acceso operativo; Maestro externo: contrato/frescura; no copiar como autoridad                      |
| 14  | TerminalPumpAssignment.terminalId           | Terminal   | P1 — no dividir atomicidad; Unidad operacional: conservar proveedor y transacción                                    |
| 15  | TerminalPumpAssignment.assignedByUserId     | User       | P3 — migración posterior, no bloquea A.1; Identidad: referencia entrante a actor; ID estable, sin FK entre servicios |
| 16  | SupervisorShift.supervisorUserId            | User       | P3 — migración posterior, no bloquea A.1; Identidad: referencia entrante a actor; ID estable, sin FK entre servicios |
| 17  | SupervisorShift.stationId                   | Station    | P1 — autoridad y acceso operativo; Maestro externo: contrato/frescura; no copiar como autoridad                      |
| 18  | TerminalEnablement.stationId                | Station    | P1 — autoridad y acceso operativo; Maestro externo: contrato/frescura; no copiar como autoridad                      |
| 19  | TerminalEnablement.terminalId               | Terminal   | P1 — no dividir atomicidad; Unidad operacional: conservar proveedor y transacción                                    |
| 20  | TerminalEnablement.enabledByUserId          | User       | P3 — migración posterior, no bloquea A.1; Identidad: referencia entrante a actor; ID estable, sin FK entre servicios |
| 21  | TerminalOperation.stationId                 | Station    | P1 — autoridad y acceso operativo; Maestro externo: contrato/frescura; no copiar como autoridad                      |
| 22  | TerminalOperation.terminalId                | Terminal   | P1 — no dividir atomicidad; Unidad operacional: conservar proveedor y transacción                                    |
| 23  | OperationalAuditEvent.actorUserId           | User       | P3 — migración posterior, no bloquea A.1; Identidad: referencia entrante a actor; ID estable, sin FK entre servicios |
| 24  | OperationalAuditEvent.stationId             | Station    | P1 — autoridad y acceso operativo; Maestro externo: contrato/frescura; no copiar como autoridad                      |
| 25  | OperationalAuditEvent.terminalId            | Terminal   | P1 — no dividir atomicidad; Unidad operacional: conservar proveedor y transacción                                    |
| 26  | OperationalIncident.stationId               | Station    | P1 — autoridad y acceso operativo; Maestro externo: contrato/frescura; no copiar como autoridad                      |
| 27  | OperationalIncident.terminalId              | Terminal   | P1 — no dividir atomicidad; Unidad operacional: conservar proveedor y transacción                                    |
| 28  | OperationalIncident.resolvedByUserId        | User       | P3 — migración posterior, no bloquea A.1; Identidad: referencia entrante a actor; ID estable, sin FK entre servicios |
| 29  | WalletMovement.membershipId                 | Membership | P2 — contrato y propiedad mixta; Perfil/finanzas: separar propiedad antes de migrar                                  |
| 30  | RewardMovement.membershipId                 | Membership | P2 — contrato y propiedad mixta; Perfil/finanzas: separar propiedad antes de migrar                                  |
| 31  | Redemption.membershipId                     | Membership | P2 — contrato y propiedad mixta; Perfil/finanzas: separar propiedad antes de migrar                                  |
| 32  | MembershipDebt.membershipId                 | Membership | P2 — contrato y propiedad mixta; Perfil/finanzas: separar propiedad antes de migrar                                  |
| 33  | BusinessAlert.membershipId                  | Membership | P2 — contrato y propiedad mixta; Perfil/finanzas: separar propiedad antes de migrar                                  |
| 34  | FuelInventory.stationId                     | Station    | P1 — autoridad y acceso operativo; Maestro externo: contrato/frescura; no copiar como autoridad                      |
| 35  | AssistanceRequest.stationId                 | Station    | P1 — autoridad y acceso operativo; Maestro externo: contrato/frescura; no copiar como autoridad                      |
| 36  | AssistanceRequest.terminalId                | Terminal   | P1 — no dividir atomicidad; Unidad operacional: conservar proveedor y transacción                                    |
| 37  | AssistanceRequest.assignedStaffId           | User       | P3 — migración posterior, no bloquea A.1; Identidad: referencia entrante a actor; ID estable, sin FK entre servicios |

## Pruebas, fallos y reproducción

**2/2 pruebas unitarias** nuevas: opt-in privado, campos financieros/operativos
rechazados antes de SQL, regla documental delegada antes de transacción.

Aceptación final `primax-m511-1794789423673-4b8719b2`: **8/8 grupos**, exit 0.
Evidencia: `evidence/identity-mission5-11-owned-account-run4.txt`:

1. PostgreSQL/tmpfs, red/rol/credenciales nuevos, publicación solo 127.0.0.1, DDL y
   cliente de dos modelos; nombres de tablas y precisión de timestamps verificados.
2. Cuenta/perfil atómicos, consulta por email normalizado/DNI y lectura del pasaporte en perfil, sin hashes
   en vista de perfil y sin estados/tablas ajenos.
3. Duplicados de email/DNI y dos altas concurrentes con mismo DNI: uno confirma;
   el perdedor no deja cuenta ni perfil parcial.
4. Huérfano rechazado por FK; una sola FK local y ninguna externa; escritor sin DELETE.
5. AuthService y AccessGuard **originales de la copia local**: email/DNI, forma de
   respuesta Bearer/3600, HS256, issuer/audience y versión compatibles; password malo
   y JWT manipulado rechazados. No se consulta esquema compat en el caso member.
6. Dos incrementos concurrentes de authVersion dan +2, invalidan JWT anterior;
   token nuevo válido y cuenta inactiva rechazada por login/guard sin modificarlo.
7. Rol escritor no puede leer/escribir centinela de dominio ajeno ni crear tablas;
   snapshot centinela sintético sin cambios. Campos balance/welcome/status/Station/
   Terminal rechazados por el adaptador.
8. Archivos anteriores/clientes/rutas/registro público sin cambios por hash.
   Esto no es una repetición de los 27 contratos HTTP: ninguno se reconectó al esquema.

Primeros dos ensayos: **0 grupos**, fallo de preparación Docker: red --internal no
publicó puerto para el cliente host (run2 registra la causa exacta). No se alcanzó
DDL/cliente; los campos model/FK del primer reporte eran objetivo declarado, no
resultado probado. Se conservan `identity-mission5-11-owned-account.txt` y
`...-run2.txt`, ambos success=false. Se usó el patrón ya validado de red dedicada
nueva y bind loopback explícito; no se reutilizó contenedor/base/volumen/credencial.

Run3 aprobó **8/8**. Se precisó DDL a timestamptz(3) para coincidir con schema y se
hizo el runner autocontenido (sin baseline /tmp de la conversación). Run4 volvió a
aprobar 8/8 con comprobación de precisión. No sumar ambos ensayos como 16 pruebas.
La instrumentación de etapa es diagnóstico, no señal de cierre del paquete.

Reproducir desde la raíz, con Docker/Node y dependencias existentes de Identity:

```bash
node --test services/identity/lab/owned-account-store.test.cjs
node tools/astra/identity-owned-account-lab.cjs --evidence=identity-mission5-11-owned-account-repro1.txt
```

El nombre de evidencia debe ser nuevo; no se sobrescribe ninguna. El runner crea
siempre recursos nuevos, genera solo el cliente experimental y aplica DDL fijo en
esa base. No lee URLs externas ni ejecuta migraciones Backend/db push. Necesita las
clases locales ya compiladas de Identity para compatibilidad; no ejecuta Backend.
No correr el SQL/schema experimental contra bases existentes ni editar los clientes
vigentes. Los contenedores propios quedan detenidos y sus datos estaban en tmpfs.

## Cambios, integridad y reversibilidad

Solo archivos nuevos:

- services/identity/prisma/lab-owned-account.prisma.
- services/identity/lab/owned-account.sql y owned-account-store.cjs/test.cjs.
- tools/astra/identity-owned-account-lab.cjs.
- Este informe y cinco TXT nuevos de evidencia/resultado.

Cliente generado en services/identity/generated/owned-account-lab (ignorado,
reconstruible). Ninguna modificación a package/build/start, modelos o runtime
anteriores. Para revertir, dejar de invocar el laboratorio y retirar solo estos
archivos nuevos en revisión autorizada; no hay una migración inversa sobre bases
operativas. No se eliminan evidencias ni se ejecuta limpieza Git.

Las 120 evidencias previas (incluyen las 119 solicitadas) y los 34 JSON se cotejan
por SHA-256. El runner comprueba también que todos los archivos existentes al
comenzar cada ensayo sigan intactos. El cierre vuelve a comparar contra el inicio
de esta misión. No se tocaron datos reales, credenciales reales, AuthCore, login,
tráfico, ramas o commits. Centinela ajeno de prueba no es una tabla operativa real.
Resultados/cotejos y respaldo final: `evidence/identity-mission5-11-regression.txt`.

## Qué falta del paquete A

A.1 solo demuestra cuentas/documentos independientes. Pendientes dentro de A:
PasswordReset local y sus garantías con contraseña/authVersion; número/alias/perfil
restante/vínculos Vehicle; decisión Membership.status/bienvenida; autoridad de
Control/Station/Terminal y diseño de referencias propias sin FK cross-domain.
Sigue pendiente ubicar también diarios/registro de servicio/nonces propios de
Identity en su persistencia delimitada, sustituir el cliente de 40 modelos y completar esquema/migraciones
propios del runtime entero. La implementación de puertos operativos/financieros
completos (B), despliegue/restauración general (C), Administration y Commerce no
se iniciaron. No se declara Identity autónomo ni paquete A terminado.

Próximo paso acotado: aprobar la matriz anterior antes de ampliar hacia membresías
y maestros; conservar el registro legado hasta acordar su provisión financiera.
Si esa decisión no está lista, PasswordReset es otro dato inequívoco que puede
planificarse en A sin alterar dichos límites; no se implementa en esta ejecución.

## Respaldos

Respaldo anterior de Misión 5.10 verificado por SHA-256 de archivo y sus 303 miembros.
Previo a cambios: `/home/primax/.local/state/primax-backups/mission5-11-before-20261116T002513Z/pending-work.tar.gz`.
Final recuperable, con archivo/miembros cotejados contra workspace:
`/home/primax/.local/state/primax-backups/mission5-11-final-20261116T004623Z/pending-work.tar.gz`. Manifiesto y SHA256SUMS externos.
Sin env ni dos logs históricos sensibles; originales intactos y cotejados por hash.
Son respaldos de código/evidencias, no copias de bases de datos. Restaurar en otro
directorio sobre el HEAD del manifiesto; no sobrescribir este workspace.

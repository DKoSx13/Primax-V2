# Identity A.4 fase 4B.2A — diagnóstico y cuarentena privados

Estado: **implementado y probado exclusivamente en laboratorio nuevo y sintético**.
Sin integración operativa, JWT/Gateway, tráfico público ni siguientes cortes 4B.2.
No se modifican archivos anteriores ni evidencias históricas. Fecha: 2026-11-18.

## 1. Respaldo documental e integridad

Inicio verificado: rama `feat/dezkz-identity-a4-core`, HEAD
`747d3cd1ed4376fa6acf18fc15913b6e133a8326`, único archivo sin seguimiento
`Docs/astra/identity-a4-phase4b2-advanced-recovery-design.md`, cero cambios
versionados y cero staging. Los siete commits previos conservan sus hashes y cadena.
Se revisó el documento completo, referencias y contenido sensible; no contiene
credenciales reales, secretos ni datos personales reales. Los identificadores y
hashes son referencias técnicas; no se copió la identidad personal del autor Git.

Con staging explícito solo de ese documento y revisión del diff se creó:

```text
a8ca8e739cd3fbd8e699f73b298193e35d355fb4
docs(identity): design A4 advanced recovery and consistency
```

Una alta, 557 líneas, padre exactamente `747d3cd1ed4376fa6acf18fc15913b6e133a8326`.
Árbol limpio después del commit. No se crean commits de implementación, push o merge.
Se preserva una línea base SHA-256 por archivo de los **1095 archivos** existentes,
incluido el diseño documental; el cotejo posterior no encontró cambios ni pérdidas.
Los ocho commits quedan intactos, incluidos los siete antecesores autorizados.

Referencias usadas: [diseño 4B.2](identity-a4-phase4b2-advanced-recovery-design.md),
[resultados 4B.1](identity-a4-phase4b1-success-receipt-results.md), contrato durable,
autoridad/lector 4B.1 y herramientas existentes. Las instrucciones actuales
autorizan este laboratorio específico; no se implementa automáticamente la
secuencia completa del diseño ni se resuelven sus decisiones pendientes.

## 2. Arquitectura experimental

Tres capas nuevas bajo `services/identity/lab`, sin registro en módulos:

1. **VehicleRecoveryInspector:** recibe un puerto de snapshot de solo lectura y
   un manifiesto sintético explícito de expectativas. Valida y congela el
   manifiesto; examina recibos, Vehicle, relaciones de User/Membership y
   procedencia del corte. Devuelve clasificación y códigos, sin escritura ni
   puerto de reparación. No usa balance ni cuerpos financieros para acreditar link.
2. **PrivateRecoveryDiagnostics:** frontera de credenciales opacas sintéticas del
   arnés. Miembro con capacidad de lectura propia consulta solo sus expectativas;
   diagnóstico global reservado al principal reconciler con capacidad propia.
   Un objeto de principal enviado como credencial no autentica. El inspector
   directo es un puerto interno confiable, no una API expuesta a clientes.
3. **LaboratoryQuarantine:** control persistente en un volumen Docker de ensayo
   nuevo, separado del almacenamiento PostgreSQL. Intercepta solo comandos
   explícitamente compuestos con su `execute`. No altera User.active,
   Membership.status ni el Backend público.

Las herramientas nuevas componen estas capas con `PrivateDurableVehicleLink`,
`VehicleSuccessAuthority`, lector y **VehiclesRepository.link/atomic reales e
intactos**. No se copia el algoritmo de creación/propiedad Vehicle. El nuevo
comando positivo admitido por el gate usa una placa ya propia: conserva la fila
Vehicle y registra un recibo nuevo mediante el protocolo 4B.1.

El inspector recibe proyecciones mínimas: recibo, Vehicle id/plate/label/member,
Membership id/user/status y User id/active. El adaptador usa rol SELECT y una
transacción READ ONLY/RepeatableRead para todas esas lecturas. El administrador
del ensayo prepara fixtures y copias; nunca se inyecta al inspector como escritor.
Las consultas administrativas de auditoría también son READ ONLY.

## 3. Manifiesto, alcance y criterios

El manifiesto contiene datasetId aleatorio de la ejecución, namespace fijo
`synthetic-recovery`, checkpoint sintético, UUID de sujetos/membresías, comandos
originales y, para éxitos reconocidos, recibos obtenidos de comandos reales.
Declara por separado un Vehicle legado creado expresamente sin recibo. Se
conserva una copia en el volumen de control. No se infiere una expectativa de
éxito recorriendo vehículos ni buscando coincidencias de placa.

Es una **fuente confiable de fixtures del arnés**, no un nuevo registro productivo
de admisión, PENDING, backup externo autenticado o acreditación de RPO. El
checkpoint estático solo permite ejercitar el protocolo; no detecta por sí mismo
una regresión física del almacenamiento. Se explicita el alcance
`EXPLICIT_SYNTHETIC_EXPECTATIONS`: CONSISTENT nunca significa integridad global
de toda la instalación ni garantía de que ninguna operación no inventariada ocurrió.

| Clasificación | Criterio aplicado |
| --- | --- |
| CONSISTENT | Todas las expectativas examinadas y referencias locales concuerdan; no hay contradicciones ni material necesario ausente en ese alcance |
| INDETERMINATE | Falta intención original/procedencia, hay un vínculo no atribuible, la fuente no responde o una operación sin éxito acreditado aún no tiene recibo visible |
| INCONSISTENT | Hay contradicción acreditada: falta una fila exigida por éxito reconocido, digest/UUID/clave/sujeto/vínculo no coinciden, duplicados o corte declarado incompatible |

Precedencia del agregado: INCONSISTENT sobre INDETERMINATE sobre CONSISTENT.
Cada hallazgo mantiene su propio código/severidad. Una incompatibilidad no
atribuye causa automáticamente a corrupción, restore, fallo de código o ataque.

| Caso | Código/conducta principal |
| --- | --- |
| Recibo existente sin Vehicle | RECEIPT_WITHOUT_VEHICLE, inconsistente |
| Recibo esperado ausente tras éxito acreditado | EXPECTED_SUCCESS_RECEIPT_MISSING, inconsistente; la comparación se hace por clave exacta, no por placa |
| Vehicle legado expresamente declarado sin recibo | DECLARED_LEGACY_WITHOUT_RECEIPT; no se presume pérdida ni se crea recibo |
| Vínculo sin atribución suficiente | UNATTRIBUTED_LINK, indeterminado; no se lo etiqueta automáticamente como legado o corrupto |
| Digest distinto de intención normalizada original | DIGEST_MISMATCH, inconsistente |
| Clave duplicada en copia sin restricciones | DUPLICATE_OPERATION_KEY, inconsistente; en la tabla real la PK sigue activa |
| Namespace, operación o UUID no coinciden | NAMESPACE_MISMATCH, INVALID_RECEIPT, EXPECTED_SUCCESS_RECEIPT_MISSING o ACKNOWLEDGED_RESULT_MISMATCH, según evidencia |
| Propietario/placa/membresía incompatibles | VEHICLE_BINDING_MISMATCH, RECEIPT_SUBJECT_MISMATCH o EXPECTED_IDENTITY_MISMATCH |
| Procedencia incompatible o no disponible | SOURCE_CUT_MISMATCH inconsistente; CONTINUITY_UNATTESTED indeterminado |
| Operación no acreditada sin recibo visible | NOT_OBSERVED, indeterminado; no demuestra rollback ni que nunca ocurrió |

Se reutiliza `prepare` de 4B.1 con normalizadores reales del Backend para
comparar el digest de intención. **No se recalcula usando el label persistido**:
un vehículo ya propio conserva el label anterior aunque se solicite otro.
La prueba positiva cubre esa diferencia sin falso diagnóstico.

Una reutilización incorrecta intentada por comando y rechazada por 4B.1 no
corrompe el dataset: se prueba IDEMPOTENCY_CONFLICT y se comprueba que el
diagnóstico posterior sigue consistente. Es diferente de observar dos recibos
con la misma clave en una copia de restauración sin restricciones.

## 4. Cuarentena y diagnóstico

El controlador del ensayo crea un directorio nuevo y `dataset.json` antes de usar
el gate. Si no existe o su identidad no coincide, no se inicializa automáticamente
un control alternativo. El estado sin latch es UNASSESSED; cada admisión requiere
un diagnóstico consistente, sin conservar un READY global para llamadas futuras.

Ante INDETERMINATE o INCONSISTENT, `assess/execute` crea exclusivamente un latch
`quarantine.json` mediante apertura exclusiva, escritura y fsync de archivo y
directorio. No contiene datos de propietarios: dataset sintético y motivo
agregado. No existe reset, TTL, liberación automática ni borrado. Una lectura
posterior sana puede aportar diagnóstico, pero no elimina el latch.

`execute` autentica mediante la política sintética inyectada, toma un lock de
admisión exclusivo y examina la cuarentena antes de consultar o delegar. El lock
cubre diagnóstico más delegación de los participantes hasta su terminación.
Competencia o lock residual producen RECOVERY_REQUIRED; no se roba un lock
antiguo por tiempo. Un proceso que muera con el lock deja el acceso cerrado.
Un latch ilegible o identidad de control no válida también falla cerrado.

Tras cuarentena se verifica cero llamadas al repositorio/callback y ausencia de
las placas BLK-001/002/003. Las consultas propias autorizadas y el diagnóstico
interno permanecen disponibles; no ejecutan link ni reparan registros. No se
devuelve un recibo histórico como credencial ni se abren permisos por conservarlo.

Persistencia demostrada: otro contenedor/proceso nuevo, con `--network none`,
abre el mismo volumen de control nuevo y comprueba dos latches y sus hashes.
Ambos bloquean antes de diagnosticar/delegar: cero inspecciones y cero comandos
invocados. Se conservan los volúmenes y recursos de estas ejecuciones.

**Límite de coordinación:** solo protege participantes que comparten ese
directorio/lock. No bloquea SQL externo, otra instancia con otro volumen, comandos
v1 ni Backend público. Un ensayo mantiene una transacción real fuera del gate:
mientras está sin confirmar, ausencia = indeterminación y activa cuarentena;
después la transacción original confirma y el diagnóstico pasa a consistente,
pero el gate sigue bloqueando comandos nuevos. No se presenta esto como impedir
confirmaciones tardías de escritores no participantes ni prioridad de suspensión.

## 5. Simulación de restauraciones parciales

Primero se crean y prueban vínculos/recibos coherentes mediante el proveedor real.
Después el administrador crea once schemas nuevos `recovery_case_*` en la base
sintética: copias de Vehicle, SuccessReceipt, Membership y User, sin sus
restricciones originales. Solo esas copias reciben los fallos deliberados por
UPDATE/DELETE/INSERT del arnés. No se elimina ni modifica ningún recibo o Vehicle
original para simular pérdida. No se desactiva el trigger inmutable de 4B.1.

Las copias permiten representar un restore parcial que una FK íntegra normalmente
impediría. El caso `partial` combina recibo ausente, Vehicle ausente y checkpoint
mezclado. Es **simulación de datos incompatibles**, no un procedimiento productivo
de pg_restore, daño de disco ni restauración completa con todos los triggers.
La regresión 4B.1 sí repite su restore lógico coherente en otra base nueva.

Se calculan hashes completos de cada copia después de inyectar el fallo y antes
y después de diagnosticar/cuarentenar/intentar comandos bloqueados. Las once
parejas son iguales. Las evidencias registran códigos, clasificación, hashes y
bloqueo antes del repositorio. No hay recuperación automática ni reconstrucción.

## 6. Pruebas realmente ejecutadas

| Ejecución | Resultado | Evidencia nueva en Docs/astra/evidence/ |
| --- | --- | --- |
| Unitarias finales | **126/126**, cero fallos: 102 anteriores + 24 nuevas | `identity-a4-phase4b2a-unit-bba54cbb4e562382aa29f495.json` |
| Integración final | **26 grupos aprobados** | `identity-a4-phase4b2a-a4-daa21ccc34563e1d8c4c1ac0.json` |
| Unitarias previas | 125/125, antes de añadir frontera sintética de credenciales del diagnóstico | `identity-a4-phase4b2a-unit-231bd4de5137e46c0c60b071.json` |
| Integración previa | 26 grupos, antes de esa frontera adicional | `identity-a4-phase4b2a-a4-03fc368f07161e61517ae3d4.json` |

No se suman las dos ejecuciones como si fueran una suite distinta. Los 26 grupos
son los **17 de regresión 4B.1 reejecutados**, ocho grupos nuevos de recuperación
y uno de persistencia de cuarentena en contenedor nuevo. No son 26 tests unitarios.
Los JSON originales de 4B.1 y fases anteriores quedan intactos.

La regresión conserva pruebas de core/numeración, persistencia, lecturas 3A/3B,
contrato/delegación 4A y éxitos durables 4B.1. Incluye carreras, rollback, muerte
de proveedor antes/después de commit, respuesta perdida, reinicio PostgreSQL y
restore lógico coherente. Se verifican los contratos/tipos TypeScript existentes
sin emitir con sus opciones reales, como en 4B.1; no equivale a compilar todo Backend.

| Caso requerido | Resultado observado |
| --- | --- |
| Vínculo/recibo coherentes | CONSISTENT; label previo y UUID conservados |
| Recibo sin vínculo | INCONSISTENT, cuarentena antes de delegar |
| Vínculo sin recibo esperado | INCONSISTENT si éxito acreditado; legado declarado permitido; no atribuido INDETERMINATE |
| Digest incompatible | INCONSISTENT usando intención original |
| Clave reutilizada | Comando incorrecto rechazado; duplicado persistido en copia detectado |
| Namespace, operationId, UUID, dueño y sujeto | Todos los fallos inyectados detectados |
| Restore parcial | INCONSISTENT; sin reparación de filas/identificadores |
| Operación concurrente sin confirmar | NOT_OBSERVED/INDETERMINATE por barreras deterministas, luego coherente al confirmar |
| Conservación de cuarentena | Latch intacto tras diagnóstico sano, nueva instancia y nuevo contenedor |
| Solo lectura | 38 snapshots de diagnóstico y **152 SELECT** finales; READ ONLY/RepeatableRead; escrituras negativas fallan |
| Aislamiento entre propietarios | Ajeno e inexistente con misma proyección NOT_OBSERVED; sin datos ajenos; credencial falsificada y miembro global rechazados |
| UUID y referencias financieras | 39 tablas públicas no Vehicle iguales; todos los Vehicle históricos completos iguales; cero replay financiero |

Las ocho agrupaciones nuevas incluyen once casos SQL de copias y un caso real
de ausencia en vuelo: doce entradas en `phase4b2a.cases`, además de comprobaciones
positivas, permisos, continuidad e inmutabilidad. La ausencia de procedencia y
de intención original también se prueba como indeterminación.

Después del comando positivo inicial, el diagnóstico y los comandos rechazados
conservan **las 40 tablas públicas y los recibos originales exactamente iguales**.
El ensayo concurrente posterior añade deliberadamente un Vehicle/recibo válido;
tras él siguen iguales las 39 tablas no Vehicle y todas las filas Vehicle
preexistentes, con exactamente una fila nueva. Los hashes públicos antes/después
del ensayo completo difieren por ese alta legítima; no se afirma igualdad global.
Las compras/autorizaciones guest mantienen membershipId=null en la regresión.

## 7. Aislamiento y recursos

Cada integración usa PostgreSQL, red interna y volumen de datos nuevos con nombre
aleatorio, comprobación de ausencia previa y etiquetas. Sin parámetros de URL,
volumen o recursos externos. El volumen de control también se crea nuevo y se
verifica por etiqueta antes del montaje. No se adoptan recursos históricos.

| Ejecución | Subred privada nueva | PostgreSQL / volúmenes nuevos retenidos |
| --- | --- | --- |
| Previa | 10.203.8.0/28 | a4-03fc368f07161e61517ae3d4-pg / sufijos -new-data y -new-recovery-control |
| Final | 10.203.9.0/28 | a4-daa21ccc34563e1d8c4c1ac0-pg / sufijos -new-data y -new-recovery-control |

Se inspeccionaron ambos contenedores tras terminar: **exited**, etiqueta de su
runId, PortBindings vacío y montaje exclusivo de su propio volumen de datos.
Se detienen solo tras cotejar la etiqueta; redes y volúmenes nuevos permanecen.
Workers efímeros con checkout read-only, root filesystem read-only, tmpfs nuevo,
capabilities retiradas y no-new-privileges. Cuarentena verifica reinicio en otro
worker sin red. Unitarias sin red ni base. No se instalan dependencias ni descargan
imágenes; `--pull never` con las mismas imágenes cacheadas de 4B.1:

```text
tools:    sha256:38ceee7d6e80b0ed7b3e7d4065312238874d9d10bdbba0dd1152b21ce16fe6e0
postgres: sha256:f3bd19c606e442c3d7bdfa8002e03fe260a1023351e0ea4598032022b68dd6e3
```

Docker Desktop estaba detenido; se inició para ejecutar los ensayos. Las
credenciales de roles PostgreSQL son aleatorias por ejecución y solo se pasan
en memoria/entorno del arnés. Evidencias nuevas sin URLs con contraseña, JWT ni
credenciales reales. Los usuarios, correos `.invalid`, UUID y compras son fixtures.
Ningún runner admite conexión a base operativa. No se publica puerto ni se
inicia HTTP, Gateway, Administration o Commerce.

## 8. Garantías y límites

Demostrado bajo los datasets/fallos ensayados: detección de contradicciones
locales y de expectativas confirmadas perdidas; tratamiento conservador de
ausencia incierta y legado; cuarentena persistente entre procesos participantes;
diagnóstico de solo lectura; bloqueo previo a delegar; conservación de referencias
y Backend real como único algoritmo escritor de Vehicle; ninguna reparación.

No demostrado ni prometido:

- Integridad global o completitud de un manifiesto productivo, autenticación de backups, RPO/RTO, pérdida física de disco o continuidad de un control restaurado parcialmente.
- Barrera transaccional global contra escritores externos, split brain o revocación/suspensión concurrente. El lock es de laboratorio, por directorio compartido.
- Protección frente a un administrador que borre/recree el control o supresión selectiva del latch. Una copia regresiva que pierda ese latch y conserve dataset.json no acredita por sí sola su historia; haría falta control independiente aprobado.
- Intención durable para todos los comandos, reserva de claves desde admisión, retención, archivado, eliminación o liberación de cuarentena.
- JWT real, revocación distribuida, mTLS, Gateway o autorización productiva. Las credenciales y capacidades nuevas son solo del arnés.
- Detección de toda diferencia posible en columnas fuera de las proyecciones examinadas, ni diagnóstico integral de tablas financieras. Su preservación aquí se verifica por hashes/datasets completos del ensayo.
- Recuperar un resultado perdido en todas las fuentes. Si no puede acreditarse, permanece desconocido y bloqueado; no se inventan recibos o UUID.

No hay imports de estos componentes en los runtimes Backend/Identity inspeccionados.
`lab` queda fuera del include de runtime Identity. No se modifica ningún schema
Prisma, migración operativa, VehiclesRepository.link, atomic, AuthCore,
PasswordReset, Membership.status, FuelFlow, Primax Prime o transacción financiera.

## 9. Inventario exacto nuevo y reproducción

Seis archivos de implementación/pruebas/herramientas y este informe:

```text
services/identity/lab/vehicle-recovery-inspector.cjs
services/identity/lab/vehicle-recovery-quarantine.cjs
services/identity/lab/vehicle-recovery.test.cjs
tools/astra/identity-a4-vehicle-recovery-lab.cjs
tools/astra/identity-a4-vehicle-recovery-unit-check.cjs
tools/astra/identity-a4-vehicle-recovery-worker.cjs
Docs/astra/identity-a4-phase4b2a-recovery-quarantine-results.md
```

Cuatro evidencias nuevas, conservadas también las ejecuciones previas:

```text
Docs/astra/evidence/identity-a4-phase4b2a-a4-03fc368f07161e61517ae3d4.json
Docs/astra/evidence/identity-a4-phase4b2a-a4-daa21ccc34563e1d8c4c1ac0.json
Docs/astra/evidence/identity-a4-phase4b2a-unit-231bd4de5137e46c0c60b071.json
Docs/astra/evidence/identity-a4-phase4b2a-unit-bba54cbb4e562382aa29f495.json
```

Total **11 archivos nuevos**, sin seguimiento y sin staging. Ningún archivo
versionado modificado. Las comprobaciones finales de sintaxis CJS, JSON,
whitespace, referencias y secretos completan la revisión estática. Los 1095
archivos anteriores conservan sus SHA-256; HEAD sigue en el commit documental.

Reproducción, creando nuevas evidencias/recursos en cada ejecución:

```text
node tools/astra/identity-a4-vehicle-recovery-unit-check.cjs
node tools/astra/identity-a4-vehicle-recovery-lab.cjs
```

## 10. Siguiente corte recomendado, no iniciado

Revisar primero este diff, los criterios y el límite del manifiesto/lock. Un
próximo laboratorio, solo si se autoriza, podría estudiar procedencia independiente
de snapshots y pérdida/regresión del propio control de cuarentena, con criterios
de admisión explícitos y fallos deterministas de participantes. No adoptar aún
una tecnología de coordinación global, política de retención o prioridad de
suspensión. JWT/Gateway, escrituras de estados y operación pública requieren
autorizaciones separadas. **Detener aquí: no continuar después de 4B.2A.**

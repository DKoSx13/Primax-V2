# Identity A.4 — acta formal de cierre académico experimental

Fecha: 2026-11-18. **Estado: CERRADO ACADÉMICAMENTE**, por aceptación expresa del
responsable del proyecto en esta conversación. Alcance: garantías experimentales
demostradas hasta 4B.2A. No constituye certificación de seguridad productiva,
autorización de integración pública, autonomía completa de Identity ni aprobación
de despliegue o migración.

## 1. Decisión de cierre y trazabilidad

El responsable revisó la [evaluación integral](identity-a4-integral-evaluation-and-closure.md)
y aceptó expresamente su recomendación de cierre académico hasta las garantías
demostradas en 4B.2A, con las exclusiones de la sección 5. Esta aceptación resuelve
la decisión de alcance/aceptación que la evaluación registraba como pendiente.
Se conserva aquella evaluación sin editar: sus afirmaciones de aceptación
pendiente describen su momento histórico; esta acta registra la decisión posterior.

La etapa queda terminada sin implementar los seis cortes propuestos de 4B.2B.
El [diseño 4B.2B](identity-a4-phase4b2b-independent-provenance-quarantine-control-design.md)
permanece como análisis diferido, no como funcionalidad entregada ni continuación
automática. No se abre otra fase para satisfacer este cierre.

El cierre se acepta porque existen núcleo, persistencia, contratos, laboratorios
y evidencia suficiente para el objetivo académico delimitado; se identifican
sus modelos de fallo, diferencias frente al legado y límites. No se basa en
afirmar que cada necesidad futura de integración/producción esté resuelta.

## 2. Objetivos académicos alcanzados y componentes

| Objetivo / componente | Resultado aceptado en laboratorio | Límite del resultado |
| --- | --- | --- |
| Identificadores y numeración | Núcleo puro bigint compatible con fronteras PRIME-001/A001/AA001; UUID de usuario/cuenta/membresía explícitos | No migra usuarios reales ni sustituye el alta pública |
| Persistencia privada de número/alias | Contador transaccional, registro de códigos, restricciones, AllocationReceipt, rollback, concurrencia y replay | AccountReference es ancla sintética; política de unicidad conjunta experimental no migra colisiones legadas |
| Resolución de códigos/alias | Normalización explícita exact/trim-uppercase, resolución y comparación por UUID diferenciadas | No aplica corrección OCR ni concede permisos por resolver un código |
| Lecturas privadas 3A | Binding explícito, lectura propia, errores diferenciados y snapshots de solo lectura | Principal/binding acreditados por fixtures, sin JWT real A.4 |
| Composición compatible 3B | Paridad de me/vehículos en fixtures con repositorios/servicios Backend reales y proveedores financieros de lectura | Sin paridad integral frontend/HTTP público ni snapshot distribuido entre fuentes cambiantes |
| VehicleLink.v1 | Delegación al repositorio Backend real, elegibilidad local y exclusividad; UUID y label legados conservados | operationId de v1 es correlación, no deduplicación durable |
| Recibos Vehicle v2 / 4B.1 | Vehicle y recibo en un commit, comparación de clave/digest, replay y consulta histórica autorizada en arnés | SUCCESS_ONLY_V1 guarda éxitos; no PENDING/rechazos durables ni recuperación autónoma de intención perdida |
| Diagnóstico / 4B.2A | Detecta contradicciones y distingue consistente/indeterminado/inconsistente frente a expectativas sintéticas explícitas | No acredita completitud o procedencia verdaderamente independiente |
| Cuarentena experimental | Bloquea nuevas delegaciones participantes, persiste entre procesos con su control íntegro y permite diagnóstico sin escrituras | No garantiza continuidad ante pérdida/regresión del propio control, writers ajenos o volúmenes distintos |

Se implementó y validó cada capacidad en el alcance de sus informes, no una
integración operativa nueva. Backend mantiene la autoridad y el único algoritmo
escritor Vehicle del experimento. Identity no recibe propiedad completa Vehicle,
Membership.status ni las operaciones financieras.

## 3. Resultados históricos y ejecuciones de referencia

**No se ejecutan pruebas nuevas para formalizar este cierre.** Los resultados
siguientes se verifican leyendo informes/JSON conservados. Una ejecución posterior
no reemplaza ni convierte automáticamente todas las anteriores en una suite actual.

| Etapa / ejecución identificada | Resultado histórico | Evidencia conservada |
| --- | --- | --- |
| Fases 0/1 | 15/15 pruebas del núcleo y 53002 cotejos de formato contra función legada | [Informe de invariantes y núcleo](identity-a4-invariants-and-core.md); resultado en consola documentado, sin inventar JSON |
| Fase 2, ejecución final inicial `9ba6aa4ea5db19437c335595` | 23/23 unitarias documentadas; 14 grupos de integración | [Informe fase 2](identity-a4-phase2-private-persistence-results.md), [JSON](evidence/identity-a4-phase2-a4-9ba6aa4ea5db19437c335595.json) |
| 3A, ejecución `978d9141e7ee719bd6899650` | 35/35 unitarias documentadas; nueve grupos | [Informe 3A](identity-a4-phase3a-private-read-results.md), [JSON](evidence/identity-a4-phase3a-a4-978d9141e7ee719bd6899650.json) |
| 3B, ejecuciones unitarias `9b5ac25a994e9985afb61d23` e integración `a2484c562379450d967baa14` | 58/58 unitarias; 13 grupos, 22 comparaciones de paridad y 42 checks HTTP privados | [Unitarias](evidence/identity-a4-phase3b-unit-9b5ac25a994e9985afb61d23.json), [integración](evidence/identity-a4-phase3b-a4-a2484c562379450d967baa14.json) |
| Regresión completa fase 2 durante 3B, `85c364e550500e4aae7b7b61` | 14 grupos, incluidos rollback, concurrencia y restauración de numeración | [JSON de regresión](evidence/identity-a4-phase2-a4-85c364e550500e4aae7b7b61.json) |
| 4A, unitarias `fe720cf2ee95f91923b709aa` e integración `6e7becbc51d8c31c4f541aed` | 82/82 unitarias; 15 grupos | [Unitarias](evidence/identity-a4-phase4a-unit-fe720cf2ee95f91923b709aa.json), [integración](evidence/identity-a4-phase4a-a4-6e7becbc51d8c31c4f541aed.json) |
| 4B.1, unitarias `9c305dea32ff94b93ef79fe4` e integración `ee718ee98fde9a2c9d430aac` | 102/102 unitarias; 17 grupos | [Unitarias](evidence/identity-a4-phase4b1-unit-9c305dea32ff94b93ef79fe4.json), [integración](evidence/identity-a4-phase4b1-a4-ee718ee98fde9a2c9d430aac.json) |
| 4B.2A final, unitarias `bba54cbb4e562382aa29f495` e integración `daa21ccc34563e1d8c4c1ac0` | 126/126 unitarias; 26 grupos | [Unitarias finales](evidence/identity-a4-phase4b2a-unit-bba54cbb4e562382aa29f495.json), [integración final](evidence/identity-a4-phase4b2a-a4-daa21ccc34563e1d8c4c1ac0.json) |

No sumar tests, grupos, cotejos ni repeticiones. Las 126 unitarias contienen 102
anteriores más 24 nuevas. Los 26 grupos finales son los 17 de 4B.1 más ocho de
recuperación y uno de persistencia de cuarentena; no reejecutan toda la integración
3B ni los 14 grupos completos de fase 2. Sus garantías se sustentan también en
las ejecuciones identificadas por separado.

3B incluye HTTP privado con autenticación de fixtures; sus 42 comprobaciones no
certifican AuthCore/JWT. 4B.2A incluye once copias SQL con fallos y una operación
real en vuelo, 38 snapshots de diagnóstico y 152 SELECT finales. Las once copias
conservaron sus hashes al diagnosticar/cuarentenar. Una transacción ajena al gate
puede confirmar después: el experimento demuestra ese límite, no lo corrige.

Se conservan también ejecuciones intermedias y fallidas, identificadas en los
informes originales. Los 30 JSON A.4 inventariados en la evaluación incluyen 22
ejecuciones con success=true y ocho con success=false; no equivalen a ocho defectos
vigentes. Ningún resultado se altera, elimina o regenera para formalizar el cierre.

## 4. Garantías efectivamente demostradas y criterios de aceptación

Las garantías se aceptan bajo los datos/modelos de fallo de los ensayos:

1. Formato numérico, límites y separación explícita de UUID; provisión atómica de
   número/alias, unicidad del registro experimental, rollback y recuperación de
   su recibo conservando identificadores.
2. Lecturas de propietario con snapshots y roles de solo lectura; errores de
   autorización, ausencia, binding e indisponibilidad diferenciados y saneados.
3. Compatibilidad de las proyecciones/cuerpos legados ensayados, sin trasladar el
   cálculo financiero ni crear un escritor alternativo de propiedad Vehicle.
4. Exclusividad de vínculo y preservación de UUID/label según repositorio real.
   Con el perfil durable, Vehicle y recibo confirman juntos; la recuperación de
   éxito no reejecuta el callback para fabricar el resultado.
5. Manejo conservador de respuestas perdidas: OUTCOME_UNKNOWN no prueba rollback;
   NOT_OBSERVED no garantiza que una operación nunca ocurrió; digest diferente de
   una clave confirmada produce conflicto, sujeto a las reglas del perfil.
6. Detección de incompatibilidades respecto de expectativas acreditadas del arnés,
   sin atribuir automáticamente corrupción a todo Vehicle legado sin recibo.
7. Cuarentena de participantes persistente con control conservado, sin liberación
   automática por una inspección posterior sana. Diagnóstico disponible sin
   reconstruir filas ni ejecutar comandos de reparación.
8. Preservación de referencias financieras y filas históricas en los datasets
   comparados. No se reasignan compras guest al dueño actual. En el ensayo final,
   el alta deliberada en vuelo no se presenta como igualdad de toda Vehicle.

Criterios formales de aceptación: objetivos académicos concretos cumplidos;
implementaciones y evidencia trazables; restricciones operativas respetadas;
límites/contraejemplos conservados; exclusiones aceptadas expresamente por el
responsable; ausencia de una implementación adicional indispensable dentro de
este alcance. Con esta aceptación, la Meta 1 de la evaluación queda cerrada.
Las metas de integración y producción siguen pendientes.

## 5. Exclusiones expresas aceptadas como pendientes

Estas ocho exclusiones **no son funcionalidades terminadas**:

| Exclusión | Estado pendiente y consecuencia |
| --- | --- |
| Garantía de cuarentena ante pérdida o regresión de su almacenamiento | Eliminar solo el latch con dataset.json conservado o restaurar un control antiguo puede ocultar bloqueo. No confiar en ese gate para una garantía operativa bajo ese fallo |
| Procedencia verdaderamente independiente | Manifiesto/checkpoint del arnés no autentica completitud, vigencia o supervivencia externa. Firmas/testigos/catálogos emulados tampoco prueban independencia productiva |
| Liberación de cuarentena con autorización productiva | No hay release implementado/aprobado ni actores productivos facultados por este cierre. Persistir bloqueo no demuestra procedimiento de recuperación autorizado |
| Validación real de AuthCore/JWT y Gateway | Fronteras A.4 son sintéticas. Capacidades del arnés no son nuevos permisos vigentes; login, AuthCore y PasswordReset no se sustituyen |
| Prioridad de suspensión o revocación concurrente | Estados inelegibles previos y carreras SQL probadas no establecen prioridad absoluta. Falta orden acordado y coordinación de todos los escritores relevantes |
| Integración HTTP/frontend completa | Paridad privada limitada no valida todas las rutas ni consumidores. OCR PRIME-A/AA y experiencia completa permanecen fuera |
| Restauración productiva y pérdida física | Reinicio con almacenamiento conservado y restore lógico coherente no acreditan disco perdido, RPO/RTO reales, backups arbitrariamente antiguos o recuperación de datos perdidos en todas las copias |
| Migración efectiva de propiedad de datos | Esquemas/UUID sintéticos y proyecciones Prisma no migran tablas, eliminan FK operativas ni completan autonomía. Vehicle sigue bajo su autoridad actual |

Otros límites preservados: no ejecución de función exactamente una vez, snapshot
distribuido, reserva durable desde el primer paquete, PENDING, retención/purga,
renumeración/transferencia, cobertura financiera integral ni certificación de CI
global. El caller debe conservar clave/intención para recuperar donde el perfil
lo exige. Un recibo histórico válido no otorga permisos actuales.

## 6. Riesgos que impiden integración o producción

Antes de integrar debe aprobarse la superficie concreta, su contrato/versiones,
autoridad real de bindings/UUID y autenticación humana/técnica; probar errores y
consumidores con los guards/puertos reales sintéticos. No usar actores de fixtures
ni aceptar namespace/digest del cliente como autoridad. Revisar el tipado y la
composición transaccional del adaptador de recibos antes de conectar escrituras.

Para provisión/escrituras faltan decisiones de espacio de códigos e importación,
registro-contador-bienvenida, estados y escritor único. Para recuperación faltan
modelo de fallo, custodia de evidencia/control, política de claves y backup,
RPO/RTO y procedimiento de reanudación acreditada. No introducir un segundo
commit/maestro o compensación financiera para aparentar independencia.

Producción exige además propiedad efectiva/aislamiento de datos, completar los
paquetes A+B+C de continuidad, roles/secretos, despliegue reproducible, observabilidad,
capacidad, seguridad, migración y reversión autorizadas. Ningún hash, documento,
commit o aprobación académica sustituye esas pruebas/políticas/infraestructura.

## 7. Estado de los cuatro servicios y dependencias

Estado documental del proyecto; no inspección de servicios desplegados:

| Servicio | Estado al cierre académico A.4 | Dependencia o puerta pendiente |
| --- | --- | --- |
| Identity | A.4 cerrado académicamente; A.1/A.3 son laboratorios previos, A.2 sigue bloqueado por decisiones propias; autonomía e integración operativa no declaradas | Política de recuperación, autoridad única authVersion/cuenta, coordinación con revocaciones, datos/puertos/despliegue propios y contratos externos |
| Catalog | Servicio de lectura con laboratorio propio y aceptación histórica; activación independiente no autorizada | Migrar inventario exacto, pantalla/proxy/consumidores y autorización por estación; exposición temporal legada no se retira por este cierre |
| Administration | No iniciado como microservicio independiente | Puertas Identity A+B+C mínimo o excepción explícita, límites de grants/credenciales, Station/Terminal, auditoría/Alerts y alcance acordados |
| Commerce | No iniciado como microservicio independiente | Contratos Identity/maestros estables, propiedad financiera/bienvenida y referencias históricas, inventario/reservas y unidad transaccional/idempotencia propias |

A.2 puede retomarse solo con nueva autorización. El cierre A.4 no resuelve
RecoveryPolicyPort, uso único del reset, coordinación reset–revocación ni
authVersion; sus ocho pruebas de modelo no se convierten en pruebas PostgreSQL
por existir recibos Vehicle. AuthCore y PasswordReset vigentes se preservan.

Catalog no depende de implementar 4B.2B para revisar su transición; sí requiere
la identidad técnica/alcance del destino elegido. Administration conserva las
puertas del [handoff](HANDOFF-ASTRA.md) y de la [continuidad](continuidad-primax-v2-identity-5-10.md).
Commerce no necesita toda la UI de Administration terminada, pero sí autoridades
y contratos maestros estables. Ni Administration ni Commerce acceden por SQL a
otros dominios para eludir esas dependencias.

## 8. Condiciones para reabrir A.4

Reabrir únicamente por defecto reproducible de una garantía académica aceptada,
o por requisito nuevo de integración expresamente autorizado. Antes de trabajar:

1. Definir componente/rutas, objetivo y modelo de fallo nuevos, prioridad y
   criterios verificables de salida; no reabrir por una mejora sugerida genérica.
2. Aprobar responsables/autoridades de datos y permisos, escritor único, contratos
   y preservación de UUID/referencias. Mantener Backend como escritor Vehicle
   salvo otra decisión explícita; no trasladarlo por efecto de una reapertura.
3. Seleccionar solo las garantías excluidas que el uso nuevo necesite, con
   aceptación explícita de límites y recursos. No convertir automáticamente los
   seis cortes diseñados en una obligación acumulativa.
4. Obtener autorización específica de código/pruebas/persistencia/infraestructura
   y, por separado, migración/tráfico si procede. Para integración, probar la
   composición real elegida y su reversión sin duplicar efectos.
5. Conservar este cierre, evaluación, código y evidencias como baseline histórica;
   crear evidencia nueva, nunca sustituir el pasado para aparentar cobertura.

Reabrir no autoriza modificar AuthCore, PasswordReset, finanzas o Membership.status
ni iniciar otros dominios. Esas acciones deben formar parte de una autorización
expresa distinta o del alcance concreto aprobado.

## 9. Continuación priorizada de Astra, no iniciada

1. Completar el respaldo documental local de evaluación y acta cuando el responsable
   autorice su commit después de revisar las verificaciones/rutas staged.
2. Resolver decisiones A.2: política, dueño de cuenta/authVersion, orden frente a
   revocaciones y recuperación durable; después autorizar su ensayo acotado.
3. Acordar fronteras restantes Identity y contratos de actor/estación; abordar la
   transición propia de Catalog según sus puertas de consumidores/autorización.
4. Completar autonomía mínima A+B+C de Identity y contratos maestros antes de
   iniciar Administration/Commerce, o aprobar formalmente una excepción acotada.

No se ejecuta ningún punto de desarrollo de esta lista con esta acta.

## 10. Verificación Git y preparación del respaldo

Estado inicial verificado: rama `feat/dezkz-identity-a4-core`, HEAD
`d2ef053aa7b64807e107eb669835748db4e2fb79`, diez commits anteriores intactos,
único archivo sin seguimiento la evaluación integral, cero cambios versionados
o staging. Se preservan documentos y evidencias históricos, incluida la evaluación.

Los 1108 archivos preexistentes se protegen con huella SHA-256 sobre rutas
ordenadas, NUL, contenido binario y NUL por archivo:
`b9ebbbccd47b6069a102d3087172f7a08f20530d1cdfc3df0e7ad0db369acd29`.
Se revisan contenido sensible, enlaces, codificación y whitespace de los dos
documentos; no contienen secretos, credenciales ni datos personales reales.

Rutas exclusivas del respaldo preparado:

```text
Docs/astra/identity-a4-integral-evaluation-and-closure.md
Docs/astra/identity-a4-academic-closure.md
```

Mensaje propuesto: `docs(identity): formalize A4 academic laboratory closure`.
Esta sección registra preparación/verificación, no un commit ya creado. El
responsable indicó «Una vez verificado, autorizaré»: se requiere esa autorización
posterior antes de confirmar. El hash resultante se verificará y entregará al
crearlo; no se inventa ni se modifica el acta para anticiparlo.

## 11. Constancia de detención

Solo se redacta esta acta y se preparan los dos documentos para revisión/staging.
No se implementan funcionalidades, se ejecutan pruebas de laboratorio, migraciones,
bases, servicios o tráfico, ni se alteran resultados/evidencias o código operativo.
No se modifican AuthCore, PasswordReset, Vehicle, Membership.status, finanzas,
FuelFlow o Primax Prime. No se inicia A.2, 4B.2B, Administration o Commerce.
Sin push, merge o reescritura de los diez commits existentes.
**A.4 queda cerrado académicamente. Detener aquí el trabajo técnico.**

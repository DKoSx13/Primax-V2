# Identity A.4 — evaluación integral y definición de cierre

Fecha: 2026-11-18. **Evaluación exclusivamente documental y estática.** No se
implementa ningún componente, se inicia otra fase ni se ejecutan pruebas de
producto/laboratorio, migraciones o conexiones a bases.

## 1. Dictamen y decisión de finalización

**A.4 dispone de una implementación experimental suficiente para proponer su
cierre académico con un alcance explícitamente acotado. No está listo para
conectar sus componentes al sistema operativo ni convierte Identity en autónomo
o preparado para producción.** Falta aprobar ese alcance y su aceptación final;
este informe no sustituye la decisión del responsable del proyecto.

Recomiendo terminar A.4 con lo demostrado hasta 4B.2A, conservar 4B.2B como diseño
de trabajo diferible y cerrar mediante revisión del expediente existente. **No
hay justificación para exigir los seis cortes 4B.2B como requisito general del
laboratorio.** Ninguna autorización anterior obligaba a implementar una hoja de
ruta futura completa: eran propuestas sujetas a aprobación, no deuda funcional
automáticamente incorporada al cierre.

La salvedad esencial es la cuarentena: la implementación conserva el bloqueo con
su almacenamiento intacto, pero puede perderlo si desaparece selectivamente el
latch o se restaura un control antiguo. Eso está documentado, no corregido. Para
cerrar académicamente debe quedar fuera del modelo de fallo aceptado y fuera de
cualquier uso operativo. Si se exige resistencia a esa pérdida como condición
académica, **esa condición no está cumplida**: correspondería autorizar un único
trabajo acotado con aceptación específica, no implementar automáticamente seis
cortes ni prometer independencia productiva mediante emuladores.

La ruta corta recomendada tiene tres acciones de cierre, sin nuevas fases:
aprobar el alcance finito, aceptar la trazabilidad de garantías/evidencias de este
informe y registrar la aceptación de Meta 1 con exclusiones. Las metas de
integración y producción conservan sus propias puertas y responsables.

## 2. Respaldo solicitado e integridad

Se verificaron rama `feat/dezkz-identity-a4-core`, HEAD inicial
`3e6d384e3f29238b32c7255306ee82f275637d21`, nueve commits intactos, cero modificaciones
versionadas y cero staging. El único archivo sin seguimiento era
`Docs/astra/identity-a4-phase4b2b-independent-provenance-quarantine-control-design.md`.
Su contenido no contiene secretos, credenciales ni datos personales reales.

Con esa única ruta explícita, revisión de contenido staged y whitespace, se creó:

```text
d2ef053aa7b64807e107eb669835748db4e2fb79
docs(identity): design A4 independent recovery provenance and quarantine
```

Una alta, 505 líneas añadidas; padre exactamente el HEAD inicial. Árbol limpio
tras el commit. Los nueve ancestros se conservan en este orden:

```text
3e6d384e3f29238b32c7255306ee82f275637d21
a8ca8e739cd3fbd8e699f73b298193e35d355fb4
747d3cd1ed4376fa6acf18fc15913b6e133a8326
0e563ef4f58f726da3b66a850740ecdfbc6337aa
a4dc5f59505b4088de1c50c2b8cbed8a95f9b27a
c74d20415a620f695a4119a6079b1a5cd4f5a7ec
4b41af38219b510dc053e07cf9115c859e7f9bca
b314f408b865d56bed0e765f44e7de3b5226da13
df68f698620fcd8a17a4c06256f96d7c7934e95d
```

Los **1107 archivos** previos al respaldo conservan su contenido binario. Huella
SHA-256 de rutas ordenadas, cada una seguida por NUL, bytes del archivo y NUL:
`37173b37bc4fd622160d83aac33726e905284c53e7314fac89b02e2abcb02e94`.
No hay push, merge, reescrituras ni commits adicionales.

## 3. Alcance de la revisión y fuentes

Se revisaron documentos de fases 0/1, diseño/resultados fase 2, lecturas 3A y
composición 3B, seguridad Control/OCR, VehicleLink 4A, diseño 4B, recibos 4B.1,
diagnóstico/cuarentena 4B.2A y diseños 4B.2/4B.2B. Se contrastaron con contratos,
núcleo, DDL/store/lectores, adaptadores, control de cuarentena, tests/runners y
JSON del checkout. No se considera implementado algo por figurar en un diseño.

Fuentes principales:

- [Fases 0/1 e invariantes](identity-a4-invariants-and-core.md), [persistencia fase 2](identity-a4-phase2-private-persistence-results.md), [lecturas 3A](identity-a4-phase3a-private-read-results.md), [integración privada 3B](identity-a4-phase3b-private-integration-results.md).
- [VehicleLink.v1](identity-a4-phase4a-vehicle-link-results.md), [recibos 4B.1](identity-a4-phase4b1-success-receipt-results.md), [cuarentena 4B.2A](identity-a4-phase4b2a-recovery-quarantine-results.md), [diseño 4B.2B](identity-a4-phase4b2b-independent-provenance-quarantine-control-design.md).
- [Handoff](HANDOFF-ASTRA.md), [continuidad Identity A/B/C](continuidad-primax-v2-identity-5-10.md), [bloqueo A.2](mision5-11-a2-password-reset.md), [RecoveryPolicyPort](identity-recovery-policy-port-design.md).
- [Estado Control](control-station-scope-security-fix.md), [OCR](identity-a4-phase3a-ocr-compatibility.md), [contratos Catalog](catalog-auth-contracts.md), [migración de inventario](catalog-inventory-migration.md).

Se analizaron los **30 JSON** `identity-a4-phase*.json` presentes: 22 ejecuciones
con success=true y ocho intentos con success=false, todos conservados. Es un
inventario de evidencia, no 30 suites actuales ni ocho defectos todavía abiertos.
No incluye todos los TXT o suites anteriores de Identity, ni una auditoría de
seguridad exhaustiva del repositorio o de instalaciones desplegadas.

### Correcciones de lectura del historial

1. El comprobador `tools/astra/identity-a4-static-read-checks.cjs` **ya está
   actualizado** por `a4dc5f5`: exige conjunción AND, conserva alcance con búsqueda
   y rechaza estación ajena. Los textos históricos de 3A/3B que aún lo describen
   como obsoleto corresponden a su momento; no son un pendiente actual de código.
2. El servicio Control corregido tiene hash actual
   `34b2210d87e233fdedc724f175f8b47d46e5238215c6bfc5c324260f08e688cd`, igual al
   documentado para su corrección. 3B añadió HTTP/PostgreSQL privados con frontera
   de fixtures. Eso supera el límite de la primera prueba con mocks, pero no
   valida AuthCore/JWT reales ni demuestra despliegue de la corrección.
3. Los hashes actuales de `VehiclesRepository` y `PrismaService.atomic` coinciden
   con los registrados en 4A: `de6fa991ae02381a2e6c1f65c4fc6118304bc99566f59a636d4f6ae30eb4c51f`
   y `04d8563747e90503f96e7df438cbfc98e3ce1d3bebd735f0dd228121c403d0eb`.
4. Las matrices propuestas 4B.2 y las 32 pruebas 4B.2B no son resultados ejecutados.
   Los diseños respaldados no añaden garantías al código ni obligan a seguirlos.

## 4. Evidencia empírica disponible

Todos los resultados de esta tabla son **históricos**, verificados por lectura;
no se ejecutan otra vez en esta evaluación. No sumar grupos y tests ni acumular
repeticiones como si fueran casos independientes.

| Capacidad / momento | Resultado registrado | Evidencia o fuente concreta |
| --- | --- | --- |
| Núcleo fases 0/1 | 15/15 tests; 53002 cotejos de formato contra función legada | Informe de invariantes; no inventar JSON de esa ejecución en consola |
| Provisión fase 2 | 23/23 unitarias en informe; 14 grupos finales | `identity-a4-phase2-a4-9ba6aa4ea5db19437c335595.json` |
| Lecturas 3A | 35/35 unitarias en informe; nueve grupos; regresión fase 2 separada con 14 | `identity-a4-phase3a-a4-978d9141e7ee719bd6899650.json`, fase 2 `75bee...` |
| Composición 3B | 58/58 unitarias; 13 grupos, 22 comparaciones de paridad y 42 checks HTTP | `identity-a4-phase3b-unit-9b5ac25a994e9985afb61d23.json`, `identity-a4-phase3b-a4-a2484c562379450d967baa14.json` |
| Regresión completa fase 2 durante 3B | 14 grupos, con concurrencia/rollback/restore de numeración | `identity-a4-phase2-a4-85c364e550500e4aae7b7b61.json` |
| VehicleLink 4A | 82/82 unitarias; 15 grupos | `identity-a4-phase4a-unit-fe720cf2ee95f91923b709aa.json`, `identity-a4-phase4a-a4-6e7becbc51d8c31c4f541aed.json` |
| Recibos 4B.1 | 102/102 unitarias; 17 grupos | `identity-a4-phase4b1-unit-9c305dea32ff94b93ef79fe4.json`, `identity-a4-phase4b1-a4-ee718ee98fde9a2c9d430aac.json` |
| Diagnóstico/cuarentena final | 126/126 unitarias; 26 grupos | `identity-a4-phase4b2a-unit-bba54cbb4e562382aa29f495.json`, `identity-a4-phase4b2a-a4-daa21ccc34563e1d8c4c1ac0.json` |
| Procedencia independiente y pérdida del control | Diseñadas; ninguna implementación/prueba de aceptación 4B.2B | Documento de diseño respaldado |

Las 126 unitarias incluyen las 102 previas y 24 nuevas. Los 26 grupos finales
son los 17 de 4B.1 más ocho agrupaciones nuevas y una comprobación en contenedor
nuevo de cuarentena. **No incluyen reejecución de los 13 grupos completos 3B, las
42 comprobaciones HTTP ni los 14 grupos completos de fase 2.** Reutilizan siete
verificaciones seleccionadas de provisión/lecturas. La evidencia de esas otras
garantías sigue en sus ejecuciones propias; no se presenta una supuesta suite
integral reciente ni un resultado de CI global.

La integración 3B compara métodos reales y JSON de me/lista de vehículos, con
proveedores y SQL reales sintéticos; usa credenciales de fixtures. No prueba
frontend/OCR/JWT de extremo a extremo. El DDL legado generado para el laboratorio
no reproduce toda la cadena de migraciones/triggers históricos.

Los 12 casos de 4B.2A incluyen once copias SQL con fallos y una transacción real
sin confirmar. En la ejecución final hubo 38 snapshots de diagnóstico y 152
SELECT; hashes de las once copias iguales antes/después de inspeccionar. Tras
los fallos/rechazos no se modifica el original; el ensayo en vuelo añade después
un vínculo legítimo, con 39 tablas no Vehicle y todas las filas Vehicle anteriores
preservadas. No equiparar esa preservación a validar todas las operaciones financieras.

## 5. Matriz de funcionalidades

Clasificación en el alcance indicado; **implementado y validado** significa en
los escenarios sintéticos documentados, nunca aceptación productiva implícita.

| Componente | Estado principal | Implementado/demostrado | Pendiente o límite |
| --- | --- | --- | --- |
| Identificadores y formato de numeración | Implementado y validado | Núcleo puro bigint, fronteras PRIME-001/A001/AA001, UUID diferenciados | Sin reasignación de IDs reales ni sustitución del registro público |
| Asignación de números y aliases | Implementado y validado | Contador transaccional, registro conjunto de códigos, unicidad, rollback, límites y AllocationReceipt | Política conjunta experimental distinta de colisiones cruzadas que el legado permite; transición real requiere decisión |
| Persistencia privada | Implementado y validado | Cinco tablas A.4, restricciones/roles, provisión idempotente y restore lógico coherente | AccountReference es ancla sintética; no integra A.1/A.3/registro/bienvenida ni migraciones propias operativas |
| Resolución de códigos/alias | Implementado y validado | Exact/trim-uppercase explícitos, canónico primero y comparación específica por UUID separada, snapshot en adaptador | No cambia OCR ni resuelve por sí sola existencia/actividad/permisos; no habilita renumeración/baja/reutilización |
| Lecturas privadas 3A | Implementado y validado | Binding explícito user/account/member, recursos propios, ausencia/indisponibilidad diferenciadas y rol SELECT | Autoridad de bindings es fixture; actor confiable no equivale a autenticar JWT |
| Lecturas compatibles 3B | Implementado y validado | Composición de me/vehículos y campos financieros desde proveedor real, paridad estable e inmutabilidad | Pendiente integración o validación HTTP A.4 real, consumidores y fuentes que cambian concurrentemente |
| Integración privada con Backend | Implementado parcialmente | Puertos/adaptadores delegan a repositorios/servicios reales en laboratorio | Sin composición operativa seleccionada ni transporte A.4 autenticado entre servicios; sigue dependiendo de autoridad Backend |
| Delegación VehicleLink.v1 | Implementado y validado | Escritor Backend único del experimento, binding dentro de atomic y exclusividad de placa/UUID | operationId solo correlaciona; no recupera resultado histórico durable. No reinterpretar v1 como v2 |
| Recibos durables Vehicle v2 | Implementado y validado | Vehicle/recibo en mismo commit; clave+digest; replay/lookup y respuesta perdida recuperables | Solo éxitos, no PENDING/rechazos durables; caller conserva intención. Retención/transporte productivos no decididos |
| Detección de inconsistencias | Implementado y validado | Inspector de solo lectura, clasificación consistente/indeterminada/inconsistente frente a expectativas acreditadas del arnés | No certifica completitud/autenticidad externa ni columnas/dominios fuera de su proyección |
| Cuarentena | Implementado parcialmente | Latch persistente con volumen conservado, bloquea nuevas delegaciones participantes y permite diagnóstico | Pérdida selectiva/regresión de control puede ocultar bloqueo; lock no cubre writers externos ni otros volúmenes |
| Recuperación y liberación de cuarentena | Diseñado, pero no implementado | Criterios de liberación y roles conceptuales documentados | No hay release autorizado ni reparación automática. Permanecer bloqueado no exige implementar release para cerrar laboratorio |
| Procedencia independiente | Diseñado, pero no implementado | Modelo de amenazas, alternativas y casos de pérdida definidos | Bloqueado por decisiones externas para garantía real: anclas, custodia, infraestructura, cobertura y autoridad del alcance |
| Autenticación/autorización A.4 | Implementado parcialmente | Frontera opaca sintética, capacidades propias, masking y elegibilidad operativa previa | Pendiente de integración o validación con AuthCore/JWT/grants vigentes y credenciales de servicio. TLS previo de Identity no integra A.4 automáticamente |
| Concurrencia de provisión/link/replay | Implementado y validado | Carreras SQL y barreras, rollback del perdedor, un efecto confirmado por clave conservada | No exactly-once de función ni éxito eventual con contención arbitraria; presupuestos acotados |
| Revocación y suspensión concurrentes | Bloqueado por decisiones externas | Se rechazan fixtures previamente suspendidos/inactivos; capacidad retirada en arnés | Falta orden acordado y participación de todos los escritores para garantía estricta; no se probaron setters concurrentes reales |
| Restauración y consistencia | Implementado parcialmente | Restore lógico coherente de numeración y de Backend/recibos; reinicio con volumen; incompatibilidades simuladas detectadas | No pérdida física, rollback conjunto con anclas, snapshot distribuido, RPO cero ni recuperación de commits perdidos en todas las copias |
| Compatibilidad OCR y experiencia completa | Pendiente de integración o validación | Diferencias de gramática identificadas y documentadas | PRIME-A001/AA001 no cubiertos por el filtro/reconocedor revisado; no ejecutar ni corregir OCR como cierre automático de A.4 |

No hay una segunda entidad Vehicle autoritativa en el almacén A.4. Los recibos
Vehicle permanecen junto a su autoridad Backend de laboratorio; AllocationReceipt
de numeración y recibos operacionales previos de Identity son protocolos distintos.
Conocer una placa o receipt no autoriza finanzas, consulta ajena ni cambio de estado.

## 6. Tres metas y criterios de salida

### Meta 1 — A.4 completado experimentalmente

Alcance recomendado: laboratorio académico desconectado con identidades sintéticas,
provisión número/alias, lecturas compatibles, delegación Backend y perfil durable
local, diagnóstico y cuarentena de participantes **con control conservado**.

Garantías mínimas y evidencia existente:

| Criterio académico | Evidencia disponible / condición |
| --- | --- |
| Formato/IDs/códigos estables, sin mezcla entre miembros | Core, fase 2 y lecturas 3A; modos de normalización y diferencia con legado explícitos |
| Provisión atómica, límites, rollback y replay de número | Fase 2 con constraints SQL y restore lógico en otra base nueva |
| Lectura propia sin escrituras, fallo distinto de ausencia | 3A/3B, roles negativos y snapshots completos comparados |
| Composición legada compatible en fixtures | 3B, me/vehículos/HTTP privados con límite de autenticación declarado |
| Vehicle escrito solo por Backend, UUID y referencias conservados | 4A/4B.1 y regresiones; no trasladar algoritmo ni propiedad |
| Respuesta perdida recuperada por recibo confirmado sin repetir efecto | 4B.1; NOT_OBSERVED/UNKNOWN no prueban no ejecución; digest cambiado da conflicto |
| Incompatibilidades detectadas y cuarentena que no se autoelibera tras diagnóstico sano | 4B.2A bajo su volumen de control intacto; sin garantía ante supresión/regresión del control |
| Sin reparar automáticamente ni reinterpretar finanzas | Hashes/roles de ensayos y revisión de puertos; no crear recibos/UUID faltantes |
| Reproducibilidad y trazabilidad suficientes | Runners/documentos/JSON conservados, casos fallidos identificados y código respaldado |
| Exclusiones y fin del alcance aceptados | Pendiente de aceptación del responsable; no declarar completitud global por inferencia |

**No exige:** autenticación productiva, todas las 27 rutas autónomas, migración
real, registro público separado, release de cuarentena, retención/purga, testigo
real/emulado, firmas, RPO cero, prioridad de suspensión, frontend/OCR completos ni
infraestructura productiva. Si la rúbrica académica exige alguno, debe añadirse
una sola vez con prueba de salida concreta y autorización; no por sugerencias
sucesivas de informes técnicos.

Estado Meta 1: **garantías acotadas demostradas; aceptación formal pendiente**.
No queda identificada una implementación obligatoria adicional para el alcance
recomendado. Un defecto dentro de ese alcance sí exigiría corrección; no se puede
declarar resuelto reduciendo retrospectivamente un criterio ya exigido.

### Meta 2 — Identity preparado para integración controlada

Definir primero **qué componente/rutas** se conectan y con qué garantía. Integrar
solo lecturas no obliga a habilitar comandos v2 o cuarentena experimental; validar
un comando privado no equivale a sustituir registro/PasswordReset o todo Identity.

Puertas indispensables de la integración elegida:

1. Autoridad de bindings y mapeo de UUID reales acreditados; matriz de propietarios,
   escritor único y contratos/versiones/mapping de errores aprobados. Para número
   y alta: resolver espacio de códigos, contador/registro y bienvenida sin doble maestro.
2. Identidad humana/técnica verificadas en el camino real elegido; permisos y
   elegibilidad vigentes, no roles del body ni credenciales de fixtures. Validar
   namespace/digest esperado, sujeto y perfil en respuestas; hoy #view v2 valida
   forma/sujeto pero no toda la identidad esperada de proveedor/intención.
3. Pruebas E2E sintéticas con los guards/puertos reales del componente, consumidores,
   contratos HTTP y fallos. Si se toca OCR o la exposición de códigos, resolver su
   gramática explícitamente. Política de frescura y lectura ante fuentes cambiantes.
4. Persistencia/privilegios del recibo Backend y su composición transaccional con
   tipado revisados. No conectar el shim experimental sin ese análisis ni escribir
   un recibo después de otro commit independiente.
5. Para escrituras recuperables: modelo de fallo y runbook de restauración
   aprobados; no confiar en el gate 4B.2A tras pérdida de control. Resolver ese
   bloqueo o mantenerlo fuera del camino integrado, con control operativo seguro
   equivalente explícitamente aprobado. Deshabilitar una función no acredita su garantía.
6. Activación limitada/reversible y observabilidad del componente, pruebas de
   indisponibilidad y plan de reversión sin duplicar comandos. Sin retorno
   silencioso a otro escritor. Autorización separada antes de cualquier tráfico.

Estado Meta 2: **no alcanzada para A.4 operativo**. Los laboratorios previos de
Identity con JWT/TLS y 27 contratos proporcionan material reutilizable, pero no
validan por sí solos la nueva composición A.4.

### Meta 3 — Identity autónomo y preparado para producción

Además de Meta 2 y de decidir el alcance completo de Identity:

- Resolver paquete A de propiedad/datos: A.1/A.3/A.4 integrados bajo autoridades
  aprobadas, A.2 y authVersion, grants/Control, Station/Terminal/credenciales,
  Membership.status y registro/bienvenida. Sin llevar Vehicle completo ni finanzas
  a Identity por conveniencia. Conservar UUID y relaciones históricas.
- Completar paquete B: puertos reales para dependencias financieras/Alerts y
  operacionales; ninguna consulta/escritura SQL de otro dominio desde Identity;
  los 14 modelos proyectados y el cliente compatible de 40 no prueban propiedad.
- Completar paquete C de autonomía reproducible: instalar esquema propio, generar,
  compilar y arrancar desde artefactos propios, sin Backend como instalación
  oculta; roles, secretos, salud y recuperación documentados. El runtime ya tiene
  fuentes/build propios y perfil sintético, pero sigue con proyecciones compartidas.
- Acreditar backup/restauración en los dominios de fallo prometidos, continuidad de
  control/recibos, RPO/RTO, custodia y revocación reales, aislamiento de red,
  auditoría, alertas, capacidad y pruebas de seguridad/performance acordadas.
- Aprobar transición de datos/consumidores, tratamiento de relaciones/FK, rollback
  y operación a cargo de responsables identificados. Ni independencia de carpeta
  ni manifiestos/testigos emulados sustituyen estas evidencias.

Estado Meta 3: **no alcanzada**. El cierre A+B+C mínimo en laboratorio de la
continuidad anterior es una puerta de autonomía previa al siguiente dominio;
preparación productiva añade garantías operativas reales. Ninguna implica que
ya esté autorizado desplegar o migrar usuarios reales.

## 7. Evaluación de los seis cortes 4B.2B

Son una exploración de garantías de recuperación más amplias; no una lista de
seis obligaciones para concluir A.4.

| Corte diseñado | ¿Necesario para Meta 1 recomendada? | Ubicación razonable del trabajo |
| --- | --- | --- |
| B1 Contrato de evidencia/amenazas | No implementar más; las distinciones y límites ya están documentados | Fijar alcance es P0 de cierre documental. Verificador ejecutable, solo si se integra procedencia |
| B2 Testigo/catálogo emulados | No | Opcional académico; útil para estudiar rollback. Infraestructura independiente real corresponde a garantía operativa de Meta 2/3 |
| B3 Admisión cerrada ante pérdida del control | No, si pérdida/regresión se excluyen expresamente | Bloqueante para afirmar cuarentena segura bajo ese fallo; imprescindible antes de usarla operativamente con esa promesa. Puede abordarse como un trabajo único acotado |
| B4 Testimonio de éxitos/huecos | No: respuesta perdida con almacenamiento conservado ya está probada | Necesario solo si se promete continuidad de commits ante pérdida/rollback más amplios; decidir política de reconocimiento primero |
| B5 Evaluar recuperación/liberación | No: un laboratorio puede terminar con cuarentena sin release | Procedimiento seguro previo a operación que necesite reanudación. Simular elegibilidad no demuestra recuperación operativa |
| B6 Firmas comparativas | No; ya era opcional | Mejora pedagógica o mecanismo futuro sujeto a amenaza/custodia. Firma no acredita actualidad/completitud |

Conclusión de arquitectura: conservar Backend como autoridad Vehicle y los
puertos privados ya implementados. Para una futura integración escoger la menor
superficie necesaria. No introducir un testigo/catalogo genérico, outbox o
coordinación distribuida para poder declarar cerrado un laboratorio que no
promete resistencia a pérdida total. Tampoco ocultar la limitación del latch:
es un bloqueo real del uso ampliado, aunque no fuerce todo 4B.2B.

Solo infraestructura/política/decisión real puede resolver: supervivencia de
anclas frente a pérdida conjunta, autoridad del último head, cobertura de backups,
reconocimiento de commits, RPO/RTO, custodia/revocación de claves y participación
de todos los writers. Un emulador en otro volumen del mismo host prueba lógica
del protocolo bajo el fallo inyectado, no independencia productiva.

## 8. Pendientes priorizados, sin crear nuevas fases

Las prioridades tienen **meta explícita**: P0 bloquea esa meta; P1 es importante
y obligatorio antes de la integración afectada; P2 es posterior/opcional. Un P0
de producción no se convierte en P0 académico. La tabla es el backlog propuesto,
no autorización para ejecutar ni promesa de que cada fila requiere nueva fase.

| ID / prioridad y meta | Objetivo y componentes | Dependencias | Riesgo si se omite | Prueba de aceptación | Evidencia de terminación |
| --- | --- | --- | --- | --- | --- |
| C0 P0 Meta 1 | Aprobar alcance académico y exclusiones: volumen/control conservados, actores de fixtures y proveedor Backend | Responsable/rúbrica y matriz de este informe | Cierre ambiguo que vuelve a incorporar mejoras indefinidamente, o falsa garantía de recuperación | Cada garantía de salida tiene evidencia; cada exclusión está nombrada sin llamarla implementada | Aceptación explícita del responsable sobre este informe; no exige código nuevo |
| C1 P0 Meta 1 | Aceptar expediente: revisión de fuentes/evidencias, comandos correctos y congelación del alcance | C0; suites fase 2, 3B y 4B.2A identificadas por separado | Conteos inflados, confusión de intentos fallidos con fallos vigentes o runner no correspondiente | Revisar referencias/JSON y recetas; reproducción independiente solo si el evaluador la exige o hay una discrepancia concreta | Este informe aporta trazabilidad; registro de aceptación/reproducción si se exige. No generar evidencia repetida por documentación |
| C2 P0 condicional Meta 1; P0 integración que dependa de cuarentena bajo pérdida | Evitar admisión solo por pérdida/regresión de control; gate/estado/continuidad y modelo de fallo | Decisión de incluir ese fallo, autoridad de evidencia y writers participantes | Latch ausente + snapshot sano pueden reabrir; control antiguo puede olvidar bloqueo | Pérdida selectiva/total, inaccesibilidad, rollback, reinicio y procesos contradictorios: cero nueva delegación sin decisión acreditada; mostrar writer ajeno como límite | Pruebas nuevas y reporte del alcance exacto, solo tras autorización. Si se excluye de Meta 1, exclusión aceptada y gate sin uso operativo |
| C3 P1 Meta 2 | Componer autenticación/autorización y binding reales para superficie elegida; validar respuesta proveedor/namespace/digest | Puertos vigentes AuthCore, IDs acreditados, credencial técnica y permisos definidos | Suplantación, historia concede permiso, datos cruzados o respuesta de otro proveedor aceptada | Tokens/credenciales falsos/expirados/revocados, miembro ajeno, namespace/digest/capacidad alterados y autoridad caída rechazan sin filtrar ni ejecutar | Matriz E2E sintética de esa composición con controles reales; no modificar AuthCore para hacerla aprobar |
| C4 P1 Meta 2 | Cerrar contratos de lectura/comando, consumidores y frescura; 3B/HTTP, error mapping, OCR si entra en alcance | Rutas/perfil elegidos y política de normalización/alias; proveedores actuales | Paridad estable confundida con paridad bajo cambios; PRIME-A/AA no reconocidos; 503 tomado como ausencia | Cuerpos/errores/páginas con guards y consumidores reales sintéticos, cambios concurrentes y caída; OCR A/AA solo si se modifica ese flujo | Contratos versionados y pruebas E2E del alcance, sin relajar autorización ni reordenar cuerpos para ocultar diferencias |
| C5 P0 antes de integrar provisión/escrituras | Acordar propiedad, espacio de códigos/bindings, registro-contador-bienvenida y transacción recibo/Vehicle; tipado de composición | Autoridades responsables; Backend único escritor Vehicle; UUID originales | Doble maestro, colisiones históricas, efectos de bienvenida distintos o recibo fuera del commit | Dos writers no admitidos; colisiones/importación sintética, rollback registro/provisión y mismo commit del recibo sin tocar finanzas | Matriz aprobada, diseño de transición y aceptación SQL específica. No requiere migrar para cerrar Meta 1 |
| C6 P1 Meta 2; P0 Meta 3 para garantía operativa | Acordar modelo de restauración/continuidad, no reutilizar claves, acceso histórico y reanudación autorizada | C2 si se usa cuarentena, responsables de backups/RPO/retención | Replay tras rollback duplica efecto; limpieza destruye evidencia; reapertura no acreditada | Restore coherente/incompatible según fallo prometido, bloqueo de dudas y no recreación; release solo bajo procedimiento autorizado | Runbook aprobado y ensayo trazable de restauración real de la superficie integrada; sin TTL/purga arbitrarios |
| C7 P0 de A.2 y de autonomía Identity, no Meta 1 A.4 | Resolver autoridad RecoveryPolicy/authVersion y coordinación reset–revocación; después validar A.2 | Decisiones A.2 de orden, dueño único de cuenta/versión, reserva/commit/abort/recibo y transporte/bindings | Política de contraseña obsoleta, consumo incorrecto o revocación engañosa | PostgreSQL aislado, uso único/rollback, roles Prime/Control/SYSTEM_ADMIN, carreras/reinicio/partición/commit desconocido | Aprobación de decisiones y futura evidencia A.2 propia. Ningún receipt Vehicle se presenta como receipt de reset |
| C8 P0 Meta 3 | Completar A+B+C mínimo de propiedad, puertos y runtime autónomo | C3–C7; A.1/A.3 y autoridades externas Station/Terminal/grants/Alerts | Proyecto compila solo pero datos/operación siguen compartidos o se fragmenta transacción | Instalación limpia con esquema propio y artefactos propios, cero SQL de otro dominio, proveedores reales versionados y contratos completos del runtime | Dossier de autonomía reproducible y auditoría de privilegios/imports/datos; no basta contar 14 modelos ni quitar FK del cliente |
| C9 P0 Meta 3 | Acreditar seguridad/despliegue/backup/observabilidad/capacidad y transición real | C8, infraestructura y políticas operativas autorizadas | Pérdida de commits/secretos/aislamiento; rollback de despliegue reemite o abre permisos | Restore en fallos comprometidos, claves/revocación reales, carga con umbrales acordados, rollback y consumidores sin bypass | Runbooks, responsables, evidencias operativas y plan/autorización separados; no activación por terminar laboratorio |
| C10 P2 | Firmas/testigos/catálogos emulados, release pedagógico, PENDING/outbox general o garantías adicionales no requeridas | Necesidad concreta aprobada y amenaza/scope definidos | Coste y nuevos modos de fallo sin mejorar el criterio de salida elegido | Solo las pruebas que justifiquen el objetivo nuevo; contraejemplos y límites explícitos | Entrega opcional futura. Dejar diferido no bloquea Meta 1 ni concede garantías que faltan |

No se propone modificar código para completar C0/C1. La comprobación documental
ya realizada satisface su parte técnica; la aceptación del responsable queda
pendiente. Si una reproducción solicitada detectara un fallo real, se acota esa
corrección con su prueba, sin aprovecharla para agregar funcionalidades.

## 9. Plan concreto de cierre y criterios de aceptación

### Ruta recomendada: cierre académico sin nueva implementación

1. **Decidir C0:** aceptar Meta 1 con el modelo de fallo de la sección 6 y mantener
   4B.2B diferido. Elegir una sola vez si pérdida de control es una exigencia de
   la rúbrica; no llamarla resuelta por estar diseñada.
2. **Aceptar C1:** usar este informe como expediente común. Verificar las pruebas
   mínimas de la siguiente tabla contra sus evidencias. No cambiar ni borrar
   resultados anteriores para armonizarlos con el relato final.
3. **Registrar salida:** declarar A.4 cerrado experimentalmente con sus garantías
   y exclusiones, reconocer Meta 2/3 pendientes y pasar a decisiones A.2 u otros
   trabajos autorizados. La aceptación puede referenciar este mismo informe;
   no requiere abrir otra fase ni producir documentos nuevos indefinidamente.

| Puerta de salida | Aceptación concreta | Estado en esta evaluación |
| --- | --- | --- |
| Números/alias/UUID | Fronteras y exclusividad probadas; reintento conserva resultado; ausencia/fallo distinguibles | Evidencia disponible |
| Persistencia | Rollback, roles negativos, concurrencia y restore lógico de numeración | Evidencia fase 2 disponible |
| Lecturas compatibles | 3A/3B propios/ajenos, cuerpo legado y solo lectura | Evidencia disponible; autenticación es de fixtures |
| Comando/vínculo | Backend real único escritor del experimento, carreras sin propietario duplicado | Evidencia 4A/4B.1 disponible |
| Recibo y respuesta perdida | Mismo commit, mismo resultado al recuperar; digest distinto no crea segundo efecto | Evidencia 4B.1 y regresión disponible |
| Diagnóstico/cuarentena | Contradicción detectada; UNKNOWN no provoca reparación; participantes bloqueados con control íntegro | Evidencia 4B.2A disponible |
| Preservación | UUID y referencias financieras históricos intactos en los ensayos; archivos/evidencias sin reescrituras | Evidencia histórica y cotejo Git actual disponibles |
| Honestidad del alcance | Sin afirmación de independencia, JWT real, RPO cero, revocación instantánea o liberación implementada | Limitaciones explícitas en este informe |
| Aceptación responsable | Firma/confirmación del alcance y declaración de cierre académico | Pendiente; no inferir aceptación por autorizar esta evaluación |

**Criterio de detención de la ruta:** una vez aceptadas estas puertas, no continuar
4B.2B por iniciativa técnica. Reabrir A.4 solo por defecto reproducible de una
garantía aceptada o por requisito nuevo autorizado, con salida concreta. No exigir
una nueva ronda de tests solo porque cambia documentación o se crea un respaldo.

### Ruta alternativa solo si se amplía la exigencia académica

Si el responsable exige que la pérdida del control tampoco pueda reabrir el
laboratorio, aceptar que Meta 1 aún no está cerrada bajo esa rúbrica. Autorizar
únicamente C2 con los fallos definidos y una decisión explícita sobre qué fuente
acredita continuidad. Si solo se prueba un emulador, la aceptación se limita a
ese modelo; no exigir después independencia física como nueva sorpresa.
Al aprobar esa prueba se vuelve a la misma puerta de cierre, sin encadenar B1–B6.
No se implementa esta alternativa en el turno actual.

## 10. Dependencias y orden con los demás trabajos

| Trabajo siguiente | Qué debe quedar listo de A.4/Identity antes | Qué A.4 no resuelve / condición heredada |
| --- | --- | --- |
| Retomar A.2 | Aceptación de Meta 1 y contratos/UUID/autoridades A.4 congelados como referencia. Puede retomarse el análisis de sus decisiones sin implementar 4B.2B | A.2 sigue bloqueado por su propia política, orden reset–revocación, authVersion y protocolo durable. Hace falta autorización A.2 específica para código/pruebas; A.4 no consume/reset tokens ni aporta esa atomicidad |
| Retomar Catalog | Contrato de identidad/actor y alcance de estación requerido por el destino elegido; mantener proveedor vigente hasta migración aprobada | Catalog ya tiene laboratorio propio. Su migración de inventario exacto/pantalla/proxy/consumidores es independiente de recibos Vehicle o procedencia 4B.2B. Debe resolver credencial técnica o retirar cifras, no conceder permisos Control a terminales |
| Iniciar Administration independiente | Cumplir puertas A+B+C mínimo de Identity de continuidad, o excepción acotada expresamente aceptada; límites de credenciales/grants, Station/Terminal, auditoría/Alerts y estación estables | Cerrar A.4 académico no satisface esas puertas. AuthCore conserva autoridad vigente; no SQL directo a User/grants de Identity ni compartir JWT_SECRET. Contratos pueden definirse sin esperar producción o toda la UI de Catalog |
| Iniciar Commerce independiente | Puerta de Identity/contratos maestros acordada; Station/Terminal/autoridad/auditoría y reserva/inventario estables; definir propiedad financiera y referencias membershipId/vehicleId | No necesita que toda la UI Administration esté terminada, sí autoridades/contratos. A.4 no resuelve balances, bienvenida, pagos, reservas, reversión, contabilidad ni transacciones idempotentes propias. No SQL entre dominios |

La continuidad anterior exige A+B+C o excepción explícita para iniciar
Administration; esta evaluación no rebaja esa condición a «A.4 aprobado».
Tampoco convierte preparación productiva en requisito para todo análisis de
Catalog/A.2: se pueden decidir contratos sin activar tráfico ni migrar datos.
El orden propuesto es **aceptar cierre A.4 → resolver decisiones A.2 y fronteras
pendientes de Identity → completar autonomía mínima e integración elegida**.
Catalog mantiene su trabajo de transición separado, sujeto a su propia autorización.

El inventario exacto legado conserva exposición temporal autorizada según los
documentos revisados; no se verifica estado desplegado aquí. Su retirada requiere
validación de todos los consumidores y aprobación explícita. Ninguna prueba de
A.4 o de Control autoriza activar Catalog, quitar esa excepción o iniciar Commerce.

## 11. Riesgos prioritarios y mejoras postergables

Bloqueos inmediatos de decisión: falta definición final aceptada de Meta 1 y
persisten autoridades no cerradas para A.2/registro/bienvenida/estado/grants y
otros dominios. Bloqueos de integración: actores/bindings reales, contratos E2E,
modelo de restauración y la limitación del control de cuarentena si se depende
de él. Bloqueos de producción: propiedad y aislamiento efectivos de datos,
infraestructura/operación/custodia y continuidad acreditadas.

Riesgos que no deben volver a confundirse con avances: un snapshot coherente
antiguo puede perder éxitos reconocidos; NOT_OBSERVED no prueba no ejecución;
recibo histórico no concede permiso actual; serialización local no prioriza
suspensión global; hash/firma/testigo emulado no prueba independencia real;
conservar filas financieras no acredita todas las transacciones financieras.

Postergar respecto de Meta 1: implementar B1–B6, firma de manifiestos, testigo y
catálogo emulados, automatización de release, admisión PENDING, outbox genérico,
purga/archivo/TTL de recibos, HA multirregión/HSM/broker y otros mecanismos sin
requisito concreto. **Postergable para laboratorio no significa opcional cuando
una garantía operativa concreta los requiera:** debe resolverse la garantía por
una solución aprobada, sin imponer de antemano esa tecnología.

La incompatibilidad OCR y los timeouts históricos de Identity no se declaran
resueltos ni se atribuyen a una causa nueva. Se evalúan al intervenir sus flujos;
no se baja bcrypt ni se amplían límites para ocultar fallos. El cierre académico
preserva su seguimiento como trabajo distinto, no certifica CI global.

## 12. Entrega y estado final

Único archivo nuevo posterior al commit documental: este informe, sin seguimiento,
sin staging ni commit adicional. HEAD permanece en
`d2ef053aa7b64807e107eb669835748db4e2fb79`, rama `feat/dezkz-identity-a4-core`.
Los diez commits quedan intactos y los 1107 archivos previos conservan su huella.
Se verifica estáticamente alcance Git, enlaces, codificación y whitespace.

No se modifican Backend, AuthCore, PasswordReset, Vehicle, Membership.status,
finanzas, FuelFlow, Primax Prime ni evidencias históricas. No se ejecutan
migraciones, bases, pruebas de laboratorio, infraestructura o tráfico. No se
inician nuevas fases, Administration o Commerce. Sin push ni merge.
**Detener tras esta evaluación; cualquier implementación exige autorización posterior.**

# Identity A.4 fase 4B.2B — procedencia independiente y pérdida del control de cuarentena

Fecha: 2026-11-18. Estado: **análisis y diseño exclusivamente**. El único archivo
nuevo de este corte es este documento. No se implementan componentes, contratos,
credenciales, tablas, migraciones, pruebas ejecutables ni infraestructura 4B.2B.

## 1. Respaldo 4B.2A y estado de partida

Se verificaron rama `feat/dezkz-identity-a4-core`, HEAD inicial
`a8ca8e739cd3fbd8e699f73b298193e35d355fb4`, exactamente once archivos sin seguimiento,
cero modificaciones versionadas y cero staging. Se cotejaron las once rutas con
el inventario del [informe 4B.2A](identity-a4-phase4b2a-recovery-quarantine-results.md).
La revisión de contenido no encontró secretos, credenciales ni datos personales
reales: las coincidencias son generación de credenciales de ensayo, URL
parametrizada, hash ficticio y correos `.invalid`. Los cuatro JSON son válidos y
registran éxito; sus resultados se conservan como evidencias históricas.

Tras staging por las once rutas explícitas, revisión de altas/contenido y diff
sin errores de whitespace, se creó un único commit local:

```text
3e6d384e3f29238b32c7255306ee82f275637d21
feat(identity): add A4 private recovery inspection and quarantine lab
```

Once altas, 1832 líneas añadidas. Padre exactamente el HEAD autorizado. El árbol
quedó limpio inmediatamente después. Los ocho commits anteriores permanecen
intactos, en este orden desde el padre:

```text
a8ca8e739cd3fbd8e699f73b298193e35d355fb4
747d3cd1ed4376fa6acf18fc15913b6e133a8326
0e563ef4f58f726da3b66a850740ecdfbc6337aa
a4dc5f59505b4088de1c50c2b8cbed8a95f9b27a
c74d20415a620f695a4119a6079b1a5cd4f5a7ec
4b41af38219b510dc053e07cf9115c859e7f9bca
b314f408b865d56bed0e765f44e7de3b5226da13
df68f698620fcd8a17a4c06256f96d7c7934e95d
```

Se verificó además la conservación binaria de los **1106 archivos** existentes
antes y después del commit. Huella SHA-256 de rutas ordenadas, cada una seguida
por byte NUL, contenido binario y byte NUL:
`d30edbe55675ed2be34c3219b92feffbbf32bfa0e6376e295a55fa11cbca989f`.
Los nueve commits se conservan; no hay push, merge ni commits posteriores al respaldo.

## 2. Fuentes y límites ya observados

Referencias locales examinadas:

- [Diseño 4B.2](identity-a4-phase4b2-advanced-recovery-design.md), [resultados 4B.1](identity-a4-phase4b1-success-receipt-results.md) y [resultados 4B.2A](identity-a4-phase4b2a-recovery-quarantine-results.md).
- [Inspector 4B.2A](../../services/identity/lab/vehicle-recovery-inspector.cjs), [cuarentena](../../services/identity/lab/vehicle-recovery-quarantine.cjs), pruebas, worker y runner nuevos de 4B.2A.
- [Contrato durable](../../services/identity/lab/vehicle-link-durable-contract.ts) y [autoridad de éxito](../../services/identity/lab/vehicle-link-success-authority.cjs) 4B.1.

Hechos del código actual, sin corregirlo en este corte:

1. `validateManifest` comprueba estructura, sujetos y algunos vínculos/digests de
   expectativas; congela el objeto. Eso no autentica al emisor, su procedencia,
   su vigencia o la completitud de la lista. El checkpoint es texto del arnés.
2. `inspect` contrasta datos y expectativas dentro de un snapshot de solo lectura.
   CONSISTENT solo acredita el alcance explícito de fixtures. Una lista reducida
   o una declaración de legado falsa puede ocultar historia que el inspector no
   conoce. El origen de esas expectativas todavía pertenece al mismo arnés.
3. `LaboratoryQuarantine` verifica `dataset.json`, conserva un latch mediante
   creación exclusiva/fsync y bloquea participantes por un lock de archivo. No
   incorpora una autoridad externa ni una función de liberación.
4. Si falta todo el control o es ilegible, falla cerrado. Pero si desaparece solo
   `quarantine.json` y sobrevive `dataset.json`, `state` devuelve UNASSESSED; un
   diagnóstico sano posterior puede permitir `execute`. Restaurar ambos a una
   copia anterior al bloqueo también puede ocultarlo. Este es el límite principal
   que 4B.2B debe estudiar, sin modificar retrospectivamente las garantías 4B.2A.
5. El worker verifica los hashes de latches desde `latch-evidence.json`, guardado
   en el mismo volumen de control. Demuestra persistencia entre procesos con ese
   volumen intacto; no detecta rollback conjunto de ambos archivos.
6. El lock solo coordina quienes comparten el mismo directorio. El ensayo en vuelo
   confirma que un escritor ajeno puede terminar después de la cuarentena.

Los 126 tests y 26 grupos finales de 4B.2A son resultados históricos. No se
ejecutan pruebas, Docker, bases ni servicios durante este diseño.

## 3. Modelo de confianza y garantías objetivo

Separar cuatro propiedades de la evidencia:

| Propiedad | Pregunta que responde | Lo que no acredita por sí sola |
| --- | --- | --- |
| Integridad | ¿Los bytes coinciden con una referencia confiable? | Quién produjo la referencia o si está completa |
| Autenticidad | ¿El emisor acreditado produjo/avaló estos bytes? | Veracidad de una afirmación incorrecta firmada |
| Vigencia | ¿El corte sigue siendo el autorizado para esta recuperación? | Completitud de éxitos o cuarentenas fuera de ese corte |
| Continuidad/cobertura | ¿La historia exigida por fuentes independientes está representada, sin huecos no resueltos? | Integridad de dominios no incluidos ni autorización actual del usuario |

Objetivo candidato: **ninguna admisión basada únicamente en ausencia local de
bloqueo**, ni en un manifiesto que se autoacredita. Un comando participante solo
podría admitirse con una decisión positiva explícita, vinculada a evidencia
verificada y al estado vigente de una autoridad de control acreditada. Información
desconocida cierra admisión; no inventa un fallo definitivo de una operación pasada.

Fallos a modelar: pérdida selectiva de archivos/filas, restauraciones antiguas o
mezcladas, corrupción, almacenamiento inaccesible, manifiesto erróneo o truncado,
respuesta de control vieja, proceso detenido/reiniciado, dos procesos con cortes
distintos y escritor no participante. Considerar también firma válida de contenido
semánticamente incorrecto y restauración conjunta de las evidencias locales.

Independencia tiene niveles, no se deriva del nombre del volumen:

- **Lógica:** otro proceso/puerto con permisos separados y sin escritura Vehicle.
- **De restauración:** su historia no retrocede al restaurar datos o control local.
- **De almacenamiento/operación:** otro dominio de fallo, copias y custodia con política acreditada.
- **De confianza:** ancla y responsables que el productor del manifiesto no puede sustituir unilateralmente.

Dos volúmenes del mismo host permiten simular restauraciones selectivas; no
ofrecen independencia física ni protección frente al administrador común. Una
firma cuya clave/ancla se restaura con el mismo backup tampoco evita rollback.
Si se pierden todos los anclajes independientes y todo rastro de un hecho, no es
posible demostrar su existencia/ausencia solo a partir del estado superviviente.
La respuesta permitida es incertidumbre y bloqueo, no reconstrucción por inferencia.

## 4. Procedencia independiente: información y validación

### 4.1 Identidades y evidencia que se conservarían

Modelo conceptual futuro; no es DDL, formato definitivo ni modificación del
recibo 4B.1. Mantener separados los siguientes identificadores:

| Información | Uso y condición |
| --- | --- |
| logicalAuthorityId, dominio VehicleLink, namespace estable | Identificar quién puede acreditar vínculo/recibo. Rotar credenciales o recuperar no crea otra clave de operación |
| datasetId / instancia examinada | Aislamiento del ensayo o despliegue; una etiqueta no demuestra procedencia histórica |
| recoveryId y encarnación del proceso/instancia | Identificar expediente y destino de una recuperación autorizada; no entra en operationId ni sustituye UUID de negocio |
| ManifestId, versión de esquema y serialización | Definir bytes/campos/proyección firmados o referenciados; rechazar ambigüedades, claves duplicadas y versiones no admitidas |
| Inventario/alcance requerido y su fuente independiente | Sujetos/operaciones/periodo o frontera a cubrir; un candidato no decide unilateralmente que una operación faltante sea legado o quede fuera |
| operationId, namespace, digest/política/normalización, UUID y resultado mínimo | Correlacionar intención, recibo y vínculo. Conservar label solicitado cuando sea necesario verificar digest, separado del label persistido |
| Raíces/hashes de contenido y lista exacta de artefactos | Verificar integridad del snapshot, recibos, manifiesto y expediente; counts o MAX(recordedAt) no reemplazan esa cobertura |
| Identidad de backup, procedencia de su catálogo y corte local | Correlacionar snapshot con respaldo auténtico. Para copias físicas, contexto de clúster/timeline/posición local si existe; para lógicas, snapshot y metadatos acreditados del procedimiento |
| Secuencia/head del registro testigo y prefijo sellado | Detectar regresión, truncamiento o forks respecto a un ancla externa más reciente. Un hash encadenado aislado no prueba que sea el último prefijo |
| Eventos de cuarentena, incertidumbre, validación y decisión humana | Conservar motivo, alcance, pruebas, revisiones y responsable; una liberación añade historia, no borra el bloqueo original |
| Versión/identidad del verificador y reporte de validación | Explicar reglas aplicadas y reproducir diagnóstico de solo lectura |

No guardar tokens, contraseñas, JWT_SECRET, claves privadas ni cuerpos financieros.
UUID, digest, placa y label pueden ser vinculables o sensibles: acceso restringido,
proyecciones mínimas y logs sanitizados. No fijar aquí periodos de retención ni
eliminación; las evidencias de un expediente abierto se preservan sin limpieza automática.

Un digest coincide con la **intención normalizada original**, no necesariamente
con el label del resultado. Usar la receta/versiones 4B.1 para ese perfil; no
reconstruir intención desde Vehicle. Un hash identifica contenido; no concede
permiso, no cifra ni transforma una expectativa no acreditada en verdad.

### 4.2 Verificación propuesta de un candidato

1. Iniciar con admisión cerrada; obtener identidad/alcance exigidos desde una
   referencia confiable previamente establecida, no desde el candidato restaurado.
2. Verificar esquema y serialización inequívocos, hashes y autenticidad según el
   mecanismo aprobado. El ancla, emisor permitido y políticas de versión no se
   aceptan como confiables por venir incluidos en el mismo manifiesto.
3. Consultar el head/frontera vigente del testigo por un canal acreditado. Vincular
   la respuesta al expediente, destino y consulta actual para evitar replay. Un
   nonce prueba correlación de respuesta, no que el testigo no haya sufrido rollback.
4. Contrastar inventario/frontera de expectativas con el registro independiente:
   éxitos acreditados, operaciones dudosas y cuarentenas no liberadas. Rechazar
   omisiones, reducción silenciosa de alcance y reclasificación arbitraria como legado.
5. Relacionar artefactos y snapshot con backup/corte acreditados y efectuar lecturas
   coherentes de recibo–Vehicle–Membership–User. Comparar datos reales contra la
   raíz referenciada; comprobar solo el texto de dos checkpoints no basta.
6. Comparar cortes según su linaje y dominio. Timestamps y recordedAt no establecen
   orden global. LSN de bases/clústeres o timelines no comparables no se ordenan
   numéricamente para decidir cuál es correcto. Un restore lógico puede cambiar
   el contexto físico aunque conserve contenido y UUID.
7. Emitir informe por propiedades y alcance, incluyendo cobertura incompleta y
   operaciones aún en vuelo. Una coincidencia local no libera la cuarentena.

Un manifiesto correctamente firmado pero de un backup viejo sigue siendo viejo.
Uno firmado con una lista falsa de legados sigue requiriendo contraste semántico.
La identidad de backup puede acreditar origen y corte, pero no prueba por sí sola
que cubre todos los commits reconocidos posteriormente.

## 5. Alternativas técnicas y elección limitada al futuro laboratorio

| Alternativa | Aporta | Riesgos/límite | Requisito de autorización |
| --- | --- | --- | --- |
| Hash junto al manifiesto en el mismo volumen | Detectar diferencias respecto al hash si este se conserva | Productor puede regenerar ambos; rollback conjunto invisible | Insuficiente como procedencia independiente |
| Manifiesto con firma y ancla fijada fuera del candidato | Integridad y autenticidad del emisor; permite verificación sin clave privada | Firma antigua válida, emisor equivocado o firmante que omite hechos; gestión de claves y ancla | Claves efímeras exclusivamente de ensayo si se aprueba; ninguna credencial productiva seleccionada |
| Registro testigo con eventos encadenados y head independiente | Correlación y detección de omisión/regresión contra prefijo anclado | Cadena truncada parece válida si también retrocede el head; carreras/forks y disponibilidad | Emulador aislado primero; servicio externo y custodia reales requieren decisión posterior |
| Catálogo de backups verificable | Relaciona archivos, contenido y cortes recuperables | No registra necesariamente éxitos posteriores ni cuarentena; restaurar catálogo junto a datos no es independiente | Puerto simulado en lab; integración con backups reales no autorizada |
| RecoveryId/revisión externa | Relaciona expediente, instancia autorizada y decisión más reciente | Un UUID aleatorio solo etiqueta; no acredita datos, actualidad ni exclusión de writers | Definir autoridad del contador/revisiones y protección contra rollback antes de usarlo como fence |
| Copias en varios dominios / registro con testigos | Mejora supervivencia y contraste de historia | Misma administración, forks, correlación de pérdidas y política de resolución; mayoría informal no prueba consenso | Infraestructura/custodia/protocolo productivos no seleccionados |
| WORM o repositorio de objetos con controles de inmutabilidad | Puede proteger conservación según configuración | No certifica veracidad, cobertura o último estado por sí solo; dependencia de operador y configuración | Fuera del primer perfil sin infraestructura aprobada |

**Recomendación para revisión:** arquitectura de puertos separada, con referencia
de evidencia y un testigo de control lógico. Para un primer laboratorio eventual,
emular el testigo y el catálogo en procesos/volúmenes nuevos distintos del dataset
y del control local, con ancla de referencia retenida por el controlador del
ensayo. Probar qué detecta si solo retrocede una parte y qué queda desconocido si
retroceden todas. No presentar esa emulación local como infraestructura independiente.

La comparación de firmas puede ser un corte opcional posterior con claves nuevas
efímeras de fixtures, previa aprobación. No utilizar claves AuthCore, JWT,
certificados del usuario, nuevas cuentas externas ni servicios productivos.
No se elige proveedor de almacenamiento, algoritmo/infraestructura de firma,
servicio de consenso o credencial productiva por efecto de este documento.

### 5.1 Frontera entre commit y conocimiento independiente

Una evidencia externa de éxito necesita una fuente que haya acreditado el commit,
con clave/digest/resultado ligados. Registrar una intención antes de ejecutar no
la convierte en commit. Escribir un recibo externo después de ejecutar tampoco
forma una transacción atómica con Vehicle. No sustituir el recibo Backend.

Tres políticas candidatas, pendientes de decidir:

- **Observación posterior/asíncrona:** preserva información conocida por el
  testigo, pero deja intervalo sin cobertura. Un checkpoint retrasado no permite
  garantizar la conservación de todos los éxitos ya respondidos.
- **Observar commit, registrar testimonio durable y después responder éxito al
  caller:** reduce el hueco de éxitos respondidos sin testimonio bajo el modelo
  aprobado. Si falla el testigo después del commit, el efecto puede existir y la
  respuesta debe permanecer UNKNOWN; no rollback ni otra operationId. Si el
  registro externo confirma pero se pierde su respuesta, resolver por clave.
- **Coordinación adicional de confirmación/durabilidad:** podría ofrecer garantías
  mayores según su protocolo y modelo de fallo, con costes de disponibilidad y
  cambios de arquitectura no aprobados. No proponer 2PC implícito ni modificar finanzas.

Incluso la segunda política puede dejar commits sin testimonio si el proceso cae
después del commit y antes del registro; que no hayan sido respondidos como éxito
no los hace inexistentes. Hace falta conservar intenciones dudosas/cobertura de
ese intervalo o bloquearlo hasta aclaración. El futuro laboratorio puede forzar
esos órdenes y demostrar sus límites sin cambiar la política de respuestas actual.

Los ACK del caller sirven de evidencia corroborante, no de inventario global:
pueden perderse o ser falsificados. Conservar la distinción entre commit acreditado,
éxito emitido por proveedor, entrega desconocida al cliente e intención admitida.
No prometer RPO cero ni recuperación de hechos perdidos en todos los dominios.

## 6. Arquitectura propuesta y dependencias

Componentes conceptuales; no se crean en este corte:

```text
Controlador de fixtures (ancla y alcance aprobado, fuera del restore bajo ensayo)
      |                 |                         |
 Catálogo simulado   Testigo de evidencia      Decisión de recuperación simulada
 de backup/cortes    y revisiones de control    (identidades/capacidades del arnés)
      |                 |                         |
      +-------- Verificador de procedencia --------+
                           |
 Snapshot READ ONLY -> Inspector 4B.2A -> Informe inmutable por propiedades/alcance
                           |
              Coordinador privado de admisión/recuperación
                           |
              Adaptador de comando 4B.1 -> Backend real intacto (solo laboratorio)
```

- El **catálogo** describe procedencia/cobertura de artefactos; no aprueba recuperación.
- El **testigo** conserva eventos/revisiones y la decisión vigente para un scope;
  no crea Vehicle ni recibe autoridad de propiedad. En producción requeriría
  autenticidad, continuidad y dominio de fallo acreditados, hoy inexistentes.
- El **verificador** comprueba propiedades y anclas antes de aceptar expectativas
  como acreditadas para el inspector. Un resultado desconocido sigue cerrado.
- El **inspector** mantiene el diagnóstico local de solo lectura; no obtiene
  autoridad de firma/liberación por detectar consistencia.
- El **coordinador** exige decisión positiva explícita y revisión vigente; estado
  local es réplica/caché de evidencia, nunca justificación autónoma de apertura.
- La **autoridad Backend 4B.1** conserva Vehicle y recibo en su transacción real.
  El testigo no se convierte en segundo writer ni cambia el digest/operationId.

No reinterpretar firmas/cortes/cuarentena como capacidades del contrato v2 actual.
Un eventual perfil de laboratorio nuevo debe tener puertos/versiones explícitos,
preservando las clases y pruebas históricas por defecto. Usar el reader SELECT
actual para datos y proyecciones mínimas; no darle credenciales de control o escritura.
No crear FK entre bases, modelos Vehicle en Identity ni nuevas reglas Membership.status.

## 7. Pérdida del control y comportamiento seguro

Para 4B.2B proponer estado inicial **CLOSED_UNKNOWN**. La falta de cuarentena local
no es prueba de alta ni autorización de ejecución. La autoridad de control
acreditada debe distinguir explícitamente: nunca inscrito, inscrito y cerrado,
cuarentenado, validación en curso y liberación autorizada vigente. NOT_FOUND local
o remoto sin cobertura acreditada no equivale a nunca cuarentenado.

| Escenario | Respuesta de diseño |
| --- | --- |
| Se pierde archivo, tabla o volumen de cuarentena | Cerrar admisión; contrastar historia con testigo/ancla. No crear automáticamente un control vacío ni una identidad nueva para continuar |
| Control inaccesible, timeout o permisos retirados | Estado UNKNOWN/UNAVAILABLE; cero nuevos comandos. Permitir diagnóstico disponible marcado como parcial, sin fingir consulta exitosa |
| Solo se pierde latch, dataset.json sobrevive | Contrastar revisión y eventos vigentes; un snapshot sano no suple prueba de liberación. Probar explícitamente el límite actual 4B.2A |
| Restore anterior a activación de cuarentena | Head externo más reciente invalida la copia. Si también retrocedió el testigo y falta ancla independiente, continuidad indeterminada, sin apertura |
| Datos más viejos, control más reciente | Cuarentena/decisión vigente conservadas; validar cobertura de datos antes de considerar recuperación |
| Datos recientes, control antiguo | No degradar al supuesto estado abierto antiguo; reconciliar contra eventos y revisión vigente |
| Proceso muere durante operación | Reinicio cerrado; investigar fase de envío/commit/testimonio. Lock residual no se borra por timeout; caller conserva clave e intención |
| Dos procesos discrepan | No elegir el más permisivo ni ordenar por reloj. Comparar linaje/head acreditados; fork o falta de evidencia cierra el scope |
| Componente omite la comprobación | Solo puede impedirse si la composición y acceso al writer lo obligan a participar. Prueba negativa debe demostrar el bypass cuando ese control falta |
| Escritor externo no participante | No afirmar bloqueo global. Mantener datos/evidencia, delimitar cobertura o exigir parada/coordinación autorizadas antes de liberar |
| Firma inválida o manifiesto alterado | Rechazar evidencia, registrar motivo protegido y cerrar admisión; no declarar por eso rollback del comando histórico |
| Testigo devuelve respuesta antigua válida | Requerir revisión/head vigente y vinculación a consulta/expediente; autenticidad sola no basta |

La cuarentena sigue siendo experimental y privada. El diseño no añade bloqueo al
Backend público, ni modifica estados de usuarios, membresías o módulos externos.

### 7.1 Admisión, concurrencia y riesgo de ventana

Estados conceptuales separados de negocio:
`CLOSED_UNKNOWN -> VALIDATING -> RELEASE_APPROVED -> READY(scope, revision)`.
Cualquier nueva incertidumbre/inconsistencia obliga a cerrar o mantener
QUARANTINED. Las transiciones positivas necesitan evidencia y autorización;
VALIDATING/CONSISTENT no implican READY. Una cuarentena conocida no se transforma
en CLOSED_UNKNOWN para borrar su historia: el expediente conserva ambos hechos.

Cada admisión debe contrastar decisión positiva vigente, scope, recoveryId,
destino y revisión con la autoridad acreditada. No basta cachear READY, comprobar
una firma vieja o confiar en una lease que aún no venció. Caída/reinicio invalida
la confianza local hasta revalidar. Una liberación antigua no sirve tras otra
cuarentena, otro destino o un head posterior incompatible.

Una lectura remota seguida de commit local deja una ventana. Para el laboratorio,
un coordinador único puede serializar admisión/cierre/decisiones de todos sus
participantes y conservar el cierre tras caída, con barreras deterministas.
Eso permite demostrar el orden de esos participantes; no una transacción distribuida.
Si se pide impedir todo commit posterior al punto de bloqueo, hay que drenar o
invalidar intentos previos mediante un fence aplicado en el punto de escritura,
y asegurar participación de todos los writers. Requeriría otros cambios/aprobaciones.

Dos procesos con distintas copias locales no deben autoelegir coordinador ni
tomar mayoría informal de archivos. El futuro protocolo debe definir una
autoridad de decisión y rechazar forks/revisiones no comparables. La primera
emulación no necesita resolver disponibilidad distribuida para probar cierre.

## 8. Evidencia, preservación y liberación autorizada

Conservar un expediente inmutable o append-only verificable: datos crudos
sintéticos/copia examinada, procedencia, manifiesto original, hashes, respuestas
del testigo, reporte/verificador, motivo/alcance, decisiones y responsables. La
evidencia del bloqueo debe quedar fuera del dominio de restore que se cuestiona.
Un chain/head guardado junto a todo lo demás no resuelve el problema.

No editar un manifiesto hasta que pase, recortar una operación dudosa, convertirla
en legado ni sustituir UUID para obtener consistencia. Una corrección acreditada
crea una nueva versión con referencia a la anterior y justificación; no elimina
las pruebas fallidas. Si falla la escritura del expediente/control, mantener
cerrada la admisión y registrar el fallo donde haya fuente acreditada disponible.

Criterios propuestos de liberación, todos necesarios para el alcance aprobado:

1. Expediente/recoveryId y destino identificados; autoridades del testigo,
   evidencia y aprobador vigentes y verificadas por el mecanismo autorizado.
2. Backup/snapshot y manifiesto íntegros, auténticos y con linaje/corte compatibles;
   alcance exigido independiente sin omisiones ni legados inventados.
3. Todos los éxitos y operaciones dudosas de la frontera exigida conciliados con
   evidencia suficiente. Un resultado desconocido no desaparece por decisión humana.
4. Inspección local de solo lectura consistente para ese alcance y referencias
   originales preservadas; ningún arreglo ad hoc de Vehicle/recibo/UUID o finanzas.
5. Writers/operaciones en vuelo delimitados y detenidos, drenados o coordinados
   según la garantía que se pretende. Si no puede delimitarse la pérdida, cerrar
   toda la autoridad afectada; no suponer que claves aparentemente nuevas son seguras.
6. Plan de recuperación y reporte revisados por responsable autorizado distinto
   de la detección, si se aprueba esa separación; registrar scope y límites residuales.
7. Registrar aprobación contra revisión/head exactos. Aplicar apertura solo si
   siguen vigentes, con compare-and-set o exclusión equivalente en la autoridad
   de control. Una cuarentena concurrente invalida una aprobación obsoleta.
8. Conservar evento de liberación y vínculo a la cuarentena sin borrar el latch
   histórico. Si se pierde la confirmación de apertura, consultar esa decisión;
   no repetirla a ciegas ni abrir por timeout. Reiniciar requiere revalidación.

Estos son criterios de diseño. **No se incorpora un método release a 4B.2A.**
Puede ensayarse inicialmente solo verificación de elegibilidad de una solicitud
de liberación, sin abrir comandos; la apertura efectiva requiere aprobación
explícita del alcance experimental y sigue sin ser autorización operativa.

Una recuperación acreditada puede restaurar evidencia auténtica mediante un
procedimiento futuro autorizado. No recrea automáticamente Vehicle.id,
Membership.id, User.id ni recibos desde placas, nombres o resultados reclamados.
Mantener Transaction/FuelAuthorization y referencias de compras guest intactas;
no atribuir compras pasadas al propietario actual, repetir dinero ni compensar
un vínculo dudoso con escrituras financieras. Preservar restricciones y ACL como
parte de validar un restore, sin ejecutar migraciones o reparaciones ahora.

## 9. Autoridades y seguridad, sin modificar permisos actuales

Separación de responsabilidades propuesta, **no nuevos grants AuthCore**:

| Acción | Autoridad conceptual | Restricción |
| --- | --- | --- |
| Consultar resultado propio | Solicitante autenticado y actualmente autorizado, política vigente | Proyección propia; recibo ajeno e inexistente no filtran dueño |
| Consultar estado global/expediente | Diagnóstico/reconciliación con scope acreditado | Solo lectura; no recibe facultad de apertura ni escritura Vehicle |
| Declarar hallazgo técnico | Verificador/inspector con evidencia adjunta | No cambia datos ni acredita recuperación; distinguir observación de declaración autorizada |
| Activar/cerrar por cuarentena | Coordinador de control acreditado; cierre conservador automático ante evidencia no confiable | Registrar causa/revisión; proteger frente a activación abusiva y DoS; nunca conferir apertura al detector |
| Autorizar procedimiento de recuperación | Responsable explícito de recuperación y custodia del respaldo | Autoriza un plan/scope, no convierte pérdida irrecuperable en éxito |
| Aprobar liberación | Responsable designado con atribución específica y evidencia vigente | Separación del solicitante/detector recomendada; doble revisión si se aprueba, no asumida como política existente |
| Aplicar decisión de apertura | Coordinador que comprueba aprobación, evidencia y revisión actual | No autoaprobar; apertura obsoleta/ajena/fuera de scope rechazada |

En laboratorio, identidades/capacidades distintas del arnés permiten probar esta
separación, conservando AuthCore/JWT/Gateway y permisos existentes intactos. El
reconciler 4B.2A solo tiene capacidad sintética de inspección; no inferir de ella
autoridad de recuperación/liberación. Integración con responsables reales y
revocación necesita una decisión posterior y no inicia Administration/Commerce.

Controles a evaluar: autenticidad del emisor/canal, ancla de confianza fijada
fuera del manifiesto, binding de aprobación a contenido/scope/destino/revisión,
protección de evidencia contra sustitución, aislamiento entre usuarios y
auditoría sanitizada. Rotación/revocación de firmantes o aprobadores exige política
explícita: una firma histórica verificable no concede permisos actuales. No
elegir silenciosamente entre invalidar toda historia o aceptar indefinidamente
un firmante comprometido. Un atacante capaz de controlar todas las autoridades
independientes queda fuera de la garantía; debe declararse, no ocultarse tras hash.

## 10. Plan incremental candidato, pendiente de autorización

Cada corte requiere alcance aprobado. L = comprobable en laboratorio sintético;
I = requiere infraestructura independiente o integración real. Ningún archivo
candidato, credencial, recurso o componente descrito aquí se crea ahora.

| Corte | Objetivo/componentes | Dependencias y riesgos | Pruebas / aceptación | Decisiones necesarias |
| --- | --- | --- | --- | --- |
| B1 Contrato de evidencia y amenazas | Especificar propiedades, alcance exigido, identidades y razones de rechazo en perfil nuevo | Inspector/prepare 4B.2A/4B.1 intactos; riesgo de autenticar solo estructura o reducir scope | P01–P07, P28; candidatos ambiguos/omitidos no llegan como acreditados al inspector; L | D1/D2; formatos y qué expectativas son autoridad |
| B2 Testigo y catálogo emulados | Procesos/volúmenes nuevos, ancla controlada por arnés, lectura de head y referencias de cortes | B1; riesgo de confundir independencia lógica con física o cadena íntegra con completa | P08–P14, P24; retroceso selectivo detectado; pérdida total del ancla queda UNKNOWN; L | D3/D4; modelo de fallo y recursos de ensayo nuevos |
| B3 Admisión cerrada ante pérdida de control | Perfil nuevo de coordinador/gate, sin alterar clase histórica; contrastar estado local con testigo | B2; ventana check–commit, lock residual, forks/bypass | P15–P23, P29; cero nuevas delegaciones sin decisión positiva; demostrar límite de writer ajeno; L | D5; política de admisión/participantes, sin garantía pública |
| B4 Evidencia de éxitos y huecos de observación | Capturar comandos/commits/testimonios sintéticos con barreras, sin cambiar el contrato productivo | B2/B3 y proveedor real 4B.1 en base nueva; riesgo de llamar éxito a intención o negar commit sin testimonio | P10/P11/P24/P25; cada hueco permanece visible/UNKNOWN y no provoca nuevo UUID ni efecto; L | D4/D6; política de reconocimiento a ensayar, sin seleccionarla para producción |
| B5 Evaluación de recuperación/liberación | Expediente inmutable, actores sintéticos separados y simulación de revisión condicional | B1–B4; aprobación obsoleta, rol indebido, pérdida de respuesta | P26–P30; primero solo evaluar elegibilidad, sin release efectivo; L | D7; responsables y autorización específica si después se ensaya apertura |
| B6 Firmas comparativas y límites de despliegue, opcional | Verificador de manifiestos con claves efímeras de fixtures, ancla separada y ataques de replay | B1/B2; firma válida pero mentira/antigua, custodia/rotación | P03–P09/P27; distinguir autenticidad de vigencia/cobertura; L. Credenciales y custodia reales son I | D8; claves de ensayo únicamente; ninguna infraestructura productiva elegida |

Pruebas de regresión y preservación P31/P32 acompañan todos los cortes que
ejecuten integración. No promover un mock a prueba de atomicidad PostgreSQL.
La comparación con firma puede omitirse hasta contar con autorización; la
arquitectura por puertos permite probar primero procedencia por referencias
controladas sin simular que ya existen claves/productos de producción.

## 11. Matriz de pruebas futura

**No ejecutada en este diseño.** Preparar únicamente datos sintéticos, PostgreSQL
y recursos nuevos si se autoriza la implementación. Fallos destructivos solo
en copias/volúmenes propios nuevos expresamente incluidos, nunca en recursos
retenidos, archivos Git o evidencias anteriores. Barreras/failpoints deterministas.

| ID | Escenario | Criterio de aceptación y alcance |
| --- | --- | --- |
| P01 | Manifiesto/snapshot coherentes, alcance íntegro y referencia vigente | Todas las propiedades declaradas verificadas; resultado local consistente no abre solo; L |
| P02 | Hash alterado, campos duplicados o esquema no reconocido | Candidato rechazado, sin diagnóstico que lo declare acreditado ni delegación; L |
| P03 | Firma inválida/emisor no permitido/ancla sustituida | Rechazar; no confiar en clave incluida por el propio candidato; L opcional firma, I custodia real |
| P04 | Firma válida de manifiesto viejo | Contraste con head vigente bloquea; firma no significa actualidad; L |
| P05 | Firmante permitido omite éxito acreditado o reduce scope | Contraste con inventario externo detecta omisión o deja continuidad UNKNOWN; L |
| P06 | Recibo faltante declarado falsamente legado | No aceptar reclasificación sin referencia independiente; bloqueado; L |
| P07 | Otra autoridad/namespace/UUID/intención o label pedido/persistido distintos | Detectar cruce; no recalcular digest con label persistido ni crear UUID sustitutos; L |
| P08 | Cadena de eventos válida pero truncada | Head independiente detecta falta de prefijo exigido; sin head fiable, UNKNOWN; L |
| P09 | Replay de respuesta testigo/aprobación antigua | Revisión, destino y expediente no vigentes rechazan aunque firma sea válida; L |
| P10 | Backup coherente anterior a éxito reconocido por testigo | Continuidad insuficiente, no readmitir clave ni fabricar recibo; L |
| P11 | Commit sin testimonio por caída intermedia | UNKNOWN o éxito solo al acreditar recibo conservado; ausencia externa nunca prueba no commit; L |
| P12 | Datos y control de momentos distintos | Detectar linajes/cortes incompatibles antes de admitir; L |
| P13 | Restore conjunto de datos/control/testigo, ancla posterior sobrevive | Ancla detecta regresión; L con dominios simulados |
| P14 | Se pierde también toda referencia posterior | Declarar límite de detectabilidad y mantener cerrado; no afirmar que se descubrió toda pérdida; L / I supervivencia real |
| P15 | Falta tabla/archivo/volumen completo de control | Cero delegaciones, sin bootstrap automático de control nuevo; L |
| P16 | Solo falta latch y dataset.json sobrevive | Cero reapertura por snapshot sano; referencia externa exige bloqueo; L |
| P17 | Control inaccesible, permiso retirado o respuesta inválida | UNKNOWN/UNAVAILABLE y admisión cerrada; lectura diagnóstica disponible marcada parcial; L |
| P18 | Reinicio en cada fase: antes/envío/commit/testimonio/cierre | Conservar incertidumbre y clave; no usar lock vencido como autorización; L |
| P19 | Dos procesos con revisiones contradictorias o fork | No escoger estado permisivo por reloj; cerrar hasta decisión acreditada; L |
| P20 | Proceso intenta usar READY cacheado tras cuarentena | Nueva admisión rechazada mediante revisión vigente del control; L participantes |
| P21 | Cierre concurrente con admisión participante | Orden definido por coordinador/barreras y evidencia; no afirmar exclusión más fuerte que la ensayada; L |
| P22 | Escritor no participante confirma durante cuarentena | Registrar contraejemplo y límite; no anunciar protección global. Impedirlo es I con todos los writers coordinados |
| P23 | Componente evita el gate o usa otro directorio | Prueba de bypass explícita; no habilitar garantía de scope completo sin controlar acceso al writer; L/I |
| P24 | Testigo cae antes/después de guardar evento y se pierde respuesta | Resolver evento por identificador estable o conservar UNKNOWN; nunca borrar commit ni repetir con otra clave; L |
| P25 | Falta continuidad mientras hay operaciones en vuelo | No sellar corte completo ni liberar; barrera de drenaje o intervalo pendiente acreditado; L |
| P26 | Actor de inspección/cliente intenta autorizar o liberar | Rechazar sin cambios de control/datos; capacidades sintéticas separadas; L, I integración de identidad real |
| P27 | Firmante/aprobador revocado o comprometido | Aplicar política de ensayo explícita; historia no concede permiso actual; L opcional, I política/custodia reales |
| P28 | Expediente se intenta corregir sobrescribiendo evidencia | Conservar original y referencia a nueva versión; rechazo de edición destructiva; L |
| P29 | Aprobación coincide con otra cuarentena o destino cambia | Comparación condicional falla; nueva revisión mantiene cerrado; L |
| P30 | Liberación autorizada simulada con respuesta perdida | Decisión durable consultable; sin reapertura automática ni release duplicado. Apertura efectiva solo si se autoriza ese ensayo; L |
| P31 | Diagnóstico con rol SELECT e intentos de escribir | Cero modificaciones examinadas, hashes iguales y privilegios negativos efectivos; L PostgreSQL nuevo |
| P32 | Regresión 4B.1/4B.2A y referencias históricas | Resultados previos reejecutados con evidencias nuevas; UUID y filas financieras originales iguales; ningún runtime importado ni cambio operativo; L |

Puerta de aceptación de laboratorio: matriz aplicable aprobada, informe de los
límites/contraejemplos, cero comandos admitidos solo por desaparición del control,
cero reparación de datos, evidencias nuevas y fuentes previas intactas. La pérdida
conjunta de todas las anclas se acepta únicamente como resultado desconocido y
bloqueado, nunca como éxito de recuperación. Pruebas verdes no autorizan operación.

## 12. Decisiones pendientes y límites no resueltos

| Decisión | Propuesta para revisar | Lo que queda pendiente |
| --- | --- | --- |
| D1 Modelo de fallo | Emular pérdida/restore selectivos y ausencia de referencia; declarar adversario/admin común | Independencia real y amenaza frente a administradores requieren custodia/infraestructura aprobadas |
| D2 Autoridad del alcance | Referencia exigida fuera del candidato, con frontera de éxitos y dudas | Quién acredita completitud y legado en datos reales; no inferirlos desde Vehicle |
| D3 Testigo/ancla/catálogo | Puertos y emuladores de ensayo separados, sin elección productiva | Servicio real, integridad del último head, disponibilidad, backup del testigo y protección contra rollback |
| D4 Cobertura/RPO | Declarar intervalos no cubiertos y nunca prometer RPO cero | Política de durabilidad de datos y control, reconocimiento de éxitos, RPO/RTO y costes de disponibilidad |
| D5 Participación de escritores | Solo coordinador privado del ensayo; mostrar bypass no participante | Inventario completo, punto de exclusión/fencing y eventual integración Backend, no autorizados |
| D6 Testimonio de commit | Comparar observación asíncrona y testimonio antes de respuesta como modelos, con huecos explícitos | Ninguna política de éxito/transporte real elegida ni protocolo distribuido impuesto |
| D7 Autorizar/liberar | Separar inspección, aprobación y aplicación; primero evaluar elegibilidad sin abrir | Responsables, doble revisión si procede y alcance de eventual prueba release; ningún permiso existente se amplía |
| D8 Firma/credenciales | Corte opcional con claves de fixtures efímeras si se autoriza | Algoritmo, ancla, rotación/revocación y credenciales productivas no seleccionados |
| D9 Persistencia/retención de evidencia | Conservar expediente y versiones durante ensayo, sin borrado automático | Capacidad, acceso, política temporal y recuperación de esa evidencia; no TTL arbitrario |

Persisten límites fundamentales: información perdida en todas las fuentes no se
reconstruye mediante firma/hash; procedencia no es permiso actual; control externo
no vuelve atómicos dos commits independientes; orden local no cubre writers ajenos;
snapshot consistente no acredita cobertura histórica completa. Identity no adquiere
Vehicle ni se modifica la semántica de Membership.status o finanzas por resolverlos.

## 13. Estado final y detención

HEAD conserva `3e6d384e3f29238b32c7255306ee82f275637d21`, rama autorizada, nueve commits
sin reescritura. El único archivo nuevo posterior al respaldo es este documento,
sin staging ni otro commit. Se comprueban huella de archivos preexistentes,
enlaces locales, UTF-8, whitespace y alcance Git antes de entregar.

No se implementa 4B.2B, no se ejecutan pruebas de producto/laboratorio ni migraciones,
no se accede a bases, no se inicia infraestructura/servicios y no se activa tráfico.
No se alteran Backend, Vehicle, Membership.status, AuthCore, PasswordReset, JWT,
Gateway, finanzas, FuelFlow o Primax Prime. No se inicia Administration ni Commerce.
Evidencias históricas intactas; sin push, merge o commits adicionales.
**Detener al finalizar este diseño; nuevos componentes requieren autorización expresa.**

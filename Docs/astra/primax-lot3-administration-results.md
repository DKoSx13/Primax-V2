# Lote 3 — cierre hexagonal académico de Administration

Referencia inicial: `d1aa04072f3f71d72f9313e03066c3a663738f56`.
Rama: `feat/dezkz-identity-a4-core`. Proyecto original exclusivamente.

**Administration alcanza 37/37 fronteras implementadas y comprobadas:** siete
anteriores y treinta consolidadas en este lote. Ninguna operación excluida, ningún
bloqueo C ni excepción D pendiente. Se cierra el alcance técnico académico del
Lote 3 con compatibilidad legacy explícita; no se declara autonomía productiva.

## Verificación inicial y alcance

HEAD coincidió con la referencia y el árbol versionado/índice estaban limpios.
Se verificaron ancestros de los lotes anteriores, `git fsck --connectivity-only`
y SHA-256 de los 1.437 archivos previamente versionados. No se sobrescribieron
cambios desconocidos. Los blobs dangling preexistentes no se limpiaron.
Las nueve evidencias históricas sin seguimiento coinciden con el inventario 2D
y permanecen intactas y excluidas de la entrega.

Se consultaron el plan 3J y la matriz completa 3H. La
[clasificación previa](evidence/lot3-administration/classification.json), escrita
antes de implementar, inventaría las treinta pendientes sin reinterpretar las
categorías históricas de 3H: **13 A y 17 B; cero C/D**. A significa adaptación local
directa; B, compatibilidad con el motor completo y su autoridad original.

La copia de exposición no se leyó ni modificó. No se ejecutaron comandos Compose
contra su proyecto, ni se montaron sus volúmenes o utilizaron sus datos/credenciales.
Los inventarios Docker fueron de lectura; todas las mutaciones de laboratorio
usaron proyectos nuevos propios. No hubo limpieza global Docker.

## Inventario y agrupación de las treinta operaciones

El inventario exacto de rutas, clasificación y destino está en la
[matriz de 37 contratos](primax-lot3-administration37-matrix.md). Estas son las
familias funcionales reales, sin inventar CRUD o servicios por el nombre del consumidor:

| Familia | Contratos pendientes | Motor original y límites |
|---|---:|---|
| Acceso y sesión Control | 6 | requestAccess, verifyEmail, resendVerification, login, session de ControlService; logout HTTP original |
| Administración de cuentas | 6 | pending, createAdministrativeAccount, approve con sus dos variantes y setStatus con sus dos estados |
| Supervisión administrativa | 4 | dashboard, incidents, incident e incidentStatus de ControlService |
| Supervisión operativa | 5 | operations, operationDetail, terminals, terminalStatus y audit de ControlOperationsService |
| Inventario | 8 | inventory, movements, receiveInventory, reconciliation y reconcile de ControlOperationsService; inspect, reconcile y activate de InventoryReconciliationService |
| Listado de transacciones | 1 | transactions de ControlCustomersService, con sus proyecciones y filtros originales |

Las siete lecturas 3G/3H conservan sus puertos, adaptadores, módulos y motores.
Las fachadas Catalog y las rutas operational-admin, payments, assistance y
terminal-operations de Commerce conservan su servicio original. No existen aquí
nuevos endpoints de edición de membresías, clientes, vehículos o maestros que
deban inventarse para completar los grupos propuestos por nombre.

## Fronteras implementadas

Flujo: controlador existente → adaptador de entrada → caso de uso → puerto
explícito → adaptador local → instancia original ya inyectada. Se implementan
AccountAccess, AccountAdministration, AdministrativeSupervision,
OperationalSupervision, InventoryAdministration, InventoryReconciliation y
AdministrativeTransactions. ControlSessionTransport completa el efecto HTTP de
logout. Son ocho composiciones técnicas dentro de seis familias funcionales;
no ocho etapas ni una etapa por endpoint.

Cada composición nueva tiene cinco fuentes en
`Backend/services/administration/src/`: puerto, caso de uso, entrada, salida local
y composición. Los puertos enumeran métodos; no existe `execute(any)` ni despacho
por nombre de ruta. Los tipos de argumentos/resultados concretos proceden de la
compatibilidad en la composición. Las dieciséis fuentes de aplicación/puertos
no importan Nest, Prisma, HTTP, Request/Response ni TransactionClient.

Los adaptadores locales invocan una vez el método original, sin capturar errores,
reintentar, validar de nuevo, abrir transacciones ni crear repositorios. No se
instancia otro ControlService, ControlOperationsService, ControlCustomersService,
InventoryReconciliationService, JwtService, Prisma o escritor financiero.

Logout conserva literalmente su bloque, con la única calificación
`response` → `this.response` en el adaptador local; Response y Config quedan fuera
del núcleo. Solo borra la cookie y devuelve el mensaje original. Login mantiene
en el controlador la emisión de cookie y su contexto HTTP. Terminal-status
conserva el permiso y el rechazo 409; no activa una escritura nueva.

Las dos fachadas de inventario conservan composiciones distintas: access=control
y sus permisos/estaciones frente a access=admin. Ambas invocan los mismos motores;
las inspecciones siguen usando atomic. No se convierte un workflow en lectura
readonly ficticia ni se unifican políticas por similitud de ruta.

## Preservación de seguridad y consistencia

La prueba cerrada de fuentes reconstruye los cuatro controladores de referencia
invirtiendo únicamente las composiciones/delegaciones autorizadas y la extracción
de logout. El resultado es literal. Esto conserva DTOs, pipes, decorators, throttle,
guard, actor, fechas Lima, filtros, mappers, ordenamiento, límites, serialización,
errores y códigos HTTP. En `inventory-reconciliation.ts` cambia solo la parte del
controlador y su import de composición; la clase del motor queda idéntica.

Los otros 1.433 archivos versionados inicialmente permanecen idénticos, salvo
la actualización documental prevista del plan 3J. AuthCore, PasswordReset,
AccessGuard, modelos/migraciones Prisma, motores financieros, frontends y Gateway
no cambian. La prueba recorre los imports de ejecución desde los cuatro
controladores y no detecta ciclos; los imports type-only se borran por TypeScript.

Se mantienen las autoridades por comando de 3J:

- TX10: cuentas, grants, asignaciones, auditoría y cambio de User/authVersion
  permanecen en los atomic originales de Administration. No se envían a Identity
  por HTTP y no se crea una Membership durante el alta administrativa.
- TX11: abastecimiento/conciliación/activación permanecen en sus motores originales;
  reservas, despacho, liberación y venta de Commerce conservan sus escritores.
  Los pares, locks, eventKey y secuencias siguen siendo los mismos.
- La conciliación conserva varias fases atomic y su auditoría externa a esas
  fases. Un fallo puede dejar fases previas confirmadas y un evento ERROR; no se
  promete rollback global ni atomicidad PostgreSQL/Redis/SMTP inexistente.

## Pruebas y comparaciones

| Validación | Resultado |
|---|---|
| Jest completo de src | 576 pruebas, 60 suites; incluye 29 pruebas nuevas de delegación/transportes |
| Gateway | 24/24 contratos |
| Empaquetado | 9/9 checks |
| Compilaciones | Identity, Catalog, Administration, Commerce y legacy correctos |
| Contextos Dockerfile | Diez builds baseline/candidate; sin TS2307; archivos y hashes emitidos de Identity/Catalog/Commerce idénticos |
| Docker | Cinco imágenes nuevas con Dockerfiles originales, usuario node y comandos originales; smoke interceptado sin red |
| Arranque real | Cinco imágenes con Nest real y otra PostgreSQL/Redis nuevos; health 200/database up y separación de rutas correcta |
| Arranque e integridad | Datos y secuencias PostgreSQL idénticos antes/después de los cinco arranques |
| Fuentes | Motores y contratos conservados, núcleo sin dependencias técnicas y cero ciclos nuevos de ejecución |

Las pruebas de familias de Administration utilizan PostgreSQL **17.6-bookworm**
y Redis **7.4-alpine** nuevos por brazo/familia, con datos sintéticos y secretos
aleatorios. Se verifican inexistencia/vaciedad y propiedad de volúmenes, etiquetas,
montajes, base/usuario destino, red interna y ausencia de puertos publicados antes
de ejecutar las 36 migraciones existentes. No se ejecuta un seed operativo.

Baseline restaura los cuatro controladores del commit inicial; candidate usa las
fronteras nuevas. Los motores permanecen idénticos. Cada brazo tiene una base y
Redis distintos: nunca se ejecutan dos versiones sobre una misma escritura.

| Familia Administration | Checks por brazo | Evidencia relevante |
|---|---:|---|
| Acceso/sesión | 36 | Login válido/inválido, cookie local/producción, contexto, expiración, transporte SMTP simulado, reemplazo/expiración/replay de verificación, rollback |
| Cuentas | 39 | Autoridad global, creación duplicada/concurrente, alta y grants/asignaciones atómicos, aprobación/acceso/rechazo/desactivación, reautenticación, revocación compartida Identity |
| Supervisión administrativa | 43 | Dashboard y permisos/estaciones, incidencias relacionadas, transiciones, replay, rollback y auditoría |
| Supervisión operativa | 55 | Operaciones/terminales/audit, filtros y orden, estaciones ajenas, ausencia de permisos, 409 terminal-status sin escrituras |
| Inventario | 61 | Inspecciones/políticas distintas, abastecimiento y reservas conservadas, replay, payload conflictivo, concurrencia, respuesta perdida, rollback, conciliación por fases y auditoría ERROR, activación |
| Clientes/transacciones | 90 | Siete contratos previos y listado restante, permisos/estaciones, filtros de día Lima, UUID/404/403 y ausencia de escrituras |
| Total Administration | **324** | **648 solicitudes HTTP pareadas** |

Las comparaciones incluyen cuerpos/errores HTTP, cookies donde corresponden,
tablas, relaciones, secuencias y Redis. Los JWT de cookies se verifican antes de
normalizar firma/claims/expiración variable; se exige lifetime de ocho horas y se
verifican Max-Age y Expires. Se mantienen Secure, HttpOnly, SameSite y path.
Los demás JWT, bcrypt y OTP se verifican con las reglas heredadas del laboratorio.
Los UUID generados se correlacionan por claves naturales/operación, sin remapear
IDs sintéticos preexistentes. Se preservan cantidades, estados y nulabilidad de
tiempos de ciclo de vida. El orden de los arrays HTTP se conserva; no se ordenan
para ocultar diferencias. Metadata de migraciones y tiempos variables quedan
fuera del cotejo; TTL Redis debe ser positivo en los casos que lo requieren.

Las lecturas de las familias operativa/clientes conservan snapshots y secuencias;
login/contexto/logout no escriben SQL/Redis. Las familias Administration dejan
Redis sin claves. Las familias de sesión Identity/Commerce sí prueban los efectos
técnicos Redis originales donde corresponden. Cada workflow se instrumenta para
comprobar una invocación por despacho; en concurrencia se comprueba el resultado
y el número persistido de escritores/eventos en vez de un contador secuencial.

Se repiten también los escenarios integrados Identity/Catalog de 2D y las once
familias Commerce, con recursos nuevos. Los resultados exactos, cantidades y
proyectos de esas regresiones constan en el resumen saneado. No se reutilizan
artefactos de datos ni resultados históricos como si fueran ejecuciones nuevas.

| Bloque integrado | Checks por brazo | Solicitudes pareadas |
|---|---:|---:|
| Administration, seis familias | 324 | 648 |
| Identity/Catalog, cinco familias | 174 | 348 |
| Commerce, once familias | 787 | 1.574 |
| Total de los escenarios ejecutados | **1.285** | **2.570** |

Son ejecuciones de escenarios, no 2.570 contratos distintos ni una garantía
universal. Los 49 proyectos propios registrados, incluidos intentos fallidos,
quedan sin contenedores activos y conservan sus volúmenes exclusivos.

## Incidencias del laboratorio y límites de evidencia

La primera pasada Jest detectó una colisión entre un campo del adaptador y el
método operations, y un tipado incorrecto de las tuplas de mock. Se corrigieron
únicamente el adaptador y el test; la suite completa posterior pasó.
El cotejo inicial de acceso detectó la entropía del JWT incrustado en la cookie;
se añadió su normalización después de verificar firma, claims y lifetime y se
repitió la pareja completa con recursos nuevos.

Una expectativa nueva de revocación esperaba 401 en Identity; el guard original
devuelve 403 para User inactivo en esa ruta, mientras Control devuelve 401. Se
corrigió solo el escenario y se repitió la pareja. Se conserva esa diferencia.
Un arranque simultáneo de laboratorios propios produjo solapamiento de subnet;
el intento no llegó a migrar y se repitió secuencialmente con recursos nuevos.
No se modificaron redes ajenas ni se limpió Docker. Intentos y logs quedan en cache.

SMTP y OCR usan transportes simulados; los proveedores de pago siguen los stubs
de regresión anteriores. No se certifican entrega externa, pagos reales, impresión,
todos los estados/carreras posibles ni equivalencia universal. El HTTP de familias
usa módulos, guard, pipes y filtros reales; no instala el guard global de throttle.
Su conservación se acredita por la prueba cerrada de decoradores, no por una nueva
prueba dinámica de rate limiting. Las políticas CSRF y cookies originales se
preservan; no se añade una política más fuerte bajo esta refactorización.

## Archivos de la entrega

- Cuarenta fuentes nuevas bajo `Backend/services/administration/src/`, cinco por
  cada una de las ocho composiciones técnicas enumeradas.
- Cuatro controladores afectados: `src/control/control.controller.ts`,
  `control-operations.controller.ts`, `control-customers.controller.ts` y la parte
  HTTP de `src/inventory/inventory-reconciliation.ts`.
- `Backend/src/control/lot3-boundaries.spec.ts`, fixture/integración
  `Backend/test/lot3-administration.*` y seis escenarios con su soporte común
  bajo `Backend/test/lot3-scenarios/`.
- Herramientas nuevas `tools/astra/lot3-*` para Jest/builds, contextos,
  imágenes/bootstrap, SQL/Redis, regresiones Commerce e integridad de fuentes.
- Este informe, matriz definitiva, clasificación previa, actualización del plan
  3J y resumen saneado. La lista exacta y SHA-256 está en el manifiesto de evidencia.

Solo las fuentes de HTTP antes indicadas cambian entre los archivos funcionales
preexistentes. No se alteran los módulos originales ni Dockerfiles/tsconfigs.
Los logs completos, snapshots, credenciales efímeras y Compose privados quedan
en `.cache/astra-lot3-*`, fuera de Git. Los contenedores propios se detienen y los
volúmenes propios se conservan para revisión; no se publica un despliegue nuevo.

## Evaluación formal y recomendación

Las 37 operaciones satisfacen el alcance académico 3J de aplicación/puertos,
adaptadores locales explícitos, composición real, mismo escritor/atomicidad y
contratos/seguridad comprobados. Las dos inspecciones antes D y los comandos
antes fuera de alcance se resolvieron conservando los motores completos. No queda
P0 de Administration que impida cerrar este lote. La matriz no presenta los
motores Nest/Prisma legacy como dominio puro extraído.

Dependencias compartidas: AuthCore/JWT/AccessGuard/Users, RecoveryDelivery y
PasswordReset sin cambios, Config/setup/bootstrap, Prisma/atomic y PostgreSQL
única, Redis/KioskStore, motores de cuentas/operaciones/conciliación, repositorios
y mappers originales, funciones/triggers SQL de stock/recibos/auditoría y datos
escritos por Identity/Commerce. No hay propiedad exclusiva de tablas ni despliegue,
backup o recuperación productiva autónomos por agregar puertos.

Permanecen T01 y su alcance pendiente; consumo Redis previo a rollback SQL en la
recuperación legacy; política x-kiosk-key; TARJETA/OnlineOrder_method_check;
proveedores externos; exposición de inventario Catalog y sus filas inactivas.
Identity A.4 mantiene el cierre académico y límites previos, sin reabrirse.
La conciliación por fases y el correo posterior a commit conservan sus ventanas
de incertidumbre originales. Este lote no las corrige ni promete atomicidad externa.

**Se recomienda iniciar Lote 4 solo tras aceptar esta entrega y autorizarlo**:
seleccionar las cuatro imágenes independientes en Compose del original, revisar
init/migraciones/seed únicos y ordenados, redes/volúmenes/env/health y arrancar
desde recursos nuevos. La copia de exposición no es el destino de esos cambios.
La validación global de tres frontends y Windows/Linux/macOS sigue en Lote 5;
los P0 globales de Compose y portabilidad permanecen pendientes.

Se crea un commit local del Lote 3 verificado; el hash se informa en la entrega
para evitar autorreferencia. Sin push ni merge. **Trabajo detenido al terminar
Lote 3; Lotes 4 y 5 no iniciados.**

Evidencia: [resumen saneado](evidence/lot3-administration/review-summary.json).

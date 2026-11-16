# Control — revisión separada de alcance por estación y búsqueda q

Estado: **defecto confirmado en la construcción de consultas del código revisado**.
No se corrigió Control ni se ejecutó una explotación HTTP/SQL. Requiere atención
de seguridad inmediata y autorización de corrección por separado si estas rutas
se utilizan con cuentas limitadas por estación. No se verificó el despliegue real
ni se afirma haber observado un acceso indebido en producción.

## Fuente, comprobación y causa

Base: b4594ef80bd923a449fc923b01159e2d4aeb3deb. Archivo:
`Backend/src/control/control-customers.service.ts`:

- membershipStationFilter, línea 62, construye OR de Transaction/FuelAuthorization
  con stationId en las estaciones permitidas.
- customers, líneas 86–103, expande ese objeto en where y luego expande un OR de
  búsqueda si q.trim() no está vacío.
- memberships, líneas 178–186, repite la misma composición.

La última propiedad OR de un objeto JavaScript reemplaza la anterior; no se
conjuntan. Por tanto, con q no vacío, where deja de exigir actividad en estaciones
permitidas para seleccionar la membresía. Incluir después solo operaciones o
vehículos filtrados no limita las filas de membresía que ya fueron seleccionadas.

La verificación adicional reutilizó mediante AST de TypeScript los cuerpos reales
de scope, membershipStationFilter, vehicleStationFilter, customers, memberships,
vehicles y maskEmail. Se transpilaron en memoria en un arnés sin servidor, con
repositorios vacíos que capturan los argumentos de findMany. No se reescribió el
algoritmo de consulta para obtener el resultado ni se cargó AuthCore.

Resultados de ese análisis ejecutable de construcción de consultas:

- q ausente o solo espacios: el OR superior de actividad sigue presente.
- q con texto, incluso stationId permitido explícito: el OR superior se sustituye
  por búsqueda de número/nombre/correo; sucede en customers y memberships.
- vehicles construye un AND entre búsqueda y actividad: conserva alcance en este
  punto concreto. Esto no es una auditoría completa de todas sus reglas.
- Sin asignaciones, scope rechaza antes de consultar. Una stationId explícita
  ajena sigue siendo rechazada antes de consultar.

Evidencia actual:
`Docs/astra/evidence/identity-a4-phase3a-a4-978d9141e7ee719bd6899650.json`, sección
staticChecks.control. Script nuevo, sin modificar Control:
`tools/astra/identity-a4-static-read-checks.cjs`.

## Consultas, usuarios y datos afectados

| Ruta | Condiciones necesarias | Riesgo de datos fuera de estación |
| --- | --- | --- |
| GET /api/v1/control/customers?q=... | Actor Control válido, ADMIN_CONTROL_ACCESS, ADMIN_CUSTOMER_VIEW y al menos una asignación; actor no global | Cliente coincidente por nombre/correo/número puede aparecer sin actividad autorizada: UUID de usuario, nombre, correo enmascarado, active y registeredAt; con ADMIN_MEMBERSHIP_VIEW también id/número/status de membresía |
| GET /api/v1/control/memberships?q=... | Actor Control válido, ADMIN_CONTROL_ACCESS, ADMIN_MEMBERSHIP_VIEW y al menos una asignación; actor no global | Membresía y customer coincidentes pueden aparecer fuera de scope: UUID de membresía/usuario, número, status, nombre, correo enmascarado y metadatos |

El guard mantiene comprobaciones de JWT/cookie, usuario activo, authVersion,
aprobación/correo Control y grants vigentes. Puede afectar, por ejemplo, a ADMIN o
ENCARGADO aprobados con permisos y estaciones asignadas: no basta el nombre del
rol. No concede acceso anónimo ni elimina la comprobación de permiso de la ruta.
SYSTEM_ADMIN global ya tiene alcance global y no necesita explotar esta pérdida
de restricción; seleccionar una estación como filtro también pierde su efecto en
esas búsquedas, aunque no amplíe sus derechos globales.

Customers filtra user.active después de seleccionar; memberships no tiene ese
mismo filtro posterior. La rama de búsqueda por placa de customers contiene un
scope de vehículo, pero las ramas alternativas por número/nombre/correo no lo
tienen; la presencia de esa rama no protege el OR completo.

Los importes balance solo se agregan a estas proyecciones para actor global;
no se demostró por este defecto exposición directa de dinero a un actor limitado.
Los arrays de actividad y vehículos siguen filtrados: podrían aparecer vacíos,
sin eliminar la exposición del encabezado/identidad de la fila. El límite take=100
y el enmascaramiento de email reducen contenido, no reparan la autorización.

Los detalles customers/:userId usan findFirst con alcance sin q; el detalle de
membresía delega en esa consulta. No se encontró esta misma sobrescritura en esos
caminos ni en el AND de vehicles. No extrapolarlo a una garantía integral de esas
rutas o de otros servicios.

## Corrección requerida, no aplicada

Conservar alcance y búsqueda como condiciones independientes de un AND. El
filtro de status también debe conservarse. Conceptualmente:

    AND(alcance_por_actividad, búsqueda_si_existe, estado_si_existe)

No combinar dos objetos que tengan OR mediante spread al mismo nivel. La
corrección debe mantener permisos, máscaras, proyecciones, orden/topes, errores y
filtros de relaciones actuales. No es necesario alterar AuthCore ni mover tablas.
No se propone deshabilitar permisos, q o rutas sin decisión del propietario.

## Pruebas necesarias antes de declarar aislamiento corregido

En un laboratorio nuevo, con PostgreSQL y guard Control reales sintéticos:

1. Estaciones A/B; clientes con actividad solo A, solo B, ambas y ninguna.
2. ADMIN/ENCARGADO limitados a A con grants correspondientes. B no aparece al
   buscar por número, nombre o correo; verificar también coincidencias parciales.
3. q ausente, vacío y espacios conservan filtro; q de placa no amplía otras ramas.
4. stationId=A explícita con q no selecciona B; stationId=B devuelve 403.
5. Cero asignaciones, grant revocado, sesión expirada y cuenta deshabilitada se
   rechazan como antes; el filtrado no sustituye al guard.
6. SYSTEM_ADMIN global mantiene resultados globales; al elegir estación, el filtro
   debe cumplirse según el contrato autorizado.
7. Clientes/membresías con múltiples vehículos/operaciones en distintas estaciones:
   no filtrar solo el encabezado y dejar relaciones sin alcance, ni al revés.
8. Mantener máscaras de email, campos condicionales, status, take/orden y formas de
   detalle/lista; documentar el comportamiento de usuarios inactivos.
9. Regression de detalles y vehículos para evitar introducir otro OR sobreescrito.

El arnés de construcción de consultas demuestra la causa de forma estática y
determinista, pero no reemplaza esas pruebas HTTP/DB. **No afirmar aislamiento
garantizado ni aprobar integración de Control hasta corregir y validar.**

Control queda excluido de A.4 3A. Este informe no autoriza la corrección, cambios
de despliegue, comunicación a terceros ni modificación de Administration/Commerce.

## Seguimiento posterior — corrección y validación locales

El diagnóstico anterior se conserva íntegro como evidencia del estado revisado
durante A.4 3A. Las referencias anteriores a una corrección no aplicada describen
ese momento; una autorización posterior permitió corregir Control por separado.

La vulnerabilidad original quedó confirmada mediante pruebas sintéticas del
servicio real: un segundo `OR` de búsqueda `q` sobrescribía el `OR` de alcance por
estación en las consultas de clientes y membresías. La corrección local conserva
ambos predicados mediante `AND`, manteniendo el filtro de estado cuando procede.
Además, valida el contexto de alcance antes de consultar: rechaza un indicador
global no booleano, estaciones ausentes/mal formadas y actores limitados sin
estaciones asignadas; no amplía silenciosamente los permisos.

Resultados de las ejecuciones previas conservadas, no repetidas durante este
cierre documental:

| Momento | Resultado | Evidencia en `Docs/astra/evidence/` |
| --- | --- | --- |
| Antes de corregir | 23 pruebas: 9 aprobadas y **14 fallidas** | `control-station-scope-before-e6d102269887000fa249.json` |
| Después, Control | **41/41 aprobadas**, cinco suites | `control-station-scope-after-502401468f9503ec8c02.json` |
| Después, Backend completo | **300/300 aprobadas**, 36 suites; incluye las 41 de Control | `control-station-scope-backend-42a141f2cc48a8702b34.json` |

Las pruebas usan mocks semánticos y datos sintéticos. **No se realizaron pruebas
HTTP con el guard completo ni integración PostgreSQL, ni se desplegó la
corrección.** Los intentos intermedios con errores de compilación también se
conservan; no se cuentan como validaciones satisfactorias.

Estado actualizado: **corregido y probado localmente, pendiente de integración y
despliegue**. Este resultado no acredita una reparación en producción ni una
auditoría integral de Control. El detalle de la corrección, sus límites y las
evidencias está en [control-station-scope-security-fix.md](control-station-scope-security-fix.md).

El comprobador histórico `tools/astra/identity-a4-static-read-checks.cjs` conserva
su expectativa original de consulta vulnerable. No se modifica en este cierre;
necesita autorización separada para adaptarlo antes de volver a usar el runner
3A como comprobación del estado corregido. No se inicia la fase 3B.

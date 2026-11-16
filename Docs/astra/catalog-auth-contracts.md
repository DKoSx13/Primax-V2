# Contratos Catalog: audiencia y autorización

## Contratos conservados

| Ruta actual | Consumidores/evidencia | Política vigente |
|---|---|---|
| GET /api/v1/fuels | FuelFlow, catálogo de precios | Public: activos, precio y fechas; Bearer no interpretado |
| GET /api/v1/stations | FuelFlow y listado general | Public: estaciones activas y dirección; sin alcance para anónimos |
| GET /api/v1/benefits | Prime `services.test.js` | Public: beneficios activos y costo en puntos |
| GET /api/v1/fuels/inventory | FuelFlow `src/js/inventory.js` | Public: cantidades/reservas y relaciones, incluso inactivas |

Fuentes: controladores Backend fuels/stations/benefits; AccessGuard; política kiosk.
Public describe el comportamiento existente, no una aprobación comercial de publicar
cantidades/reservas. Kiosk firmado se autentica ANTES de Public y restringe estación;
query strings firmados no están permitidos. Sin firma retorna al contrato público.
No se puede prometer confidencialidad conservando esa ruta pública de inventario.

## Separación añadida, sin migración de consumidores

GET `/api/v1/control/catalog/inventory` y `/api/v1/control/catalog/stations`:
proyección de inventario y estaciones para esa vista operativa; ambas requieren
AuthCore Control y ADMIN_INVENTORY_VIEW, conforme a la vista de inventario existente
en `control-operations.service.ts`. No son una nueva capacidad de administrar estaciones.
Gateway enruta estas dos rutas al proceso Catalog anterior que aloja la fachada;
no apunta al microservicio privado. No cambia ningún despliegue actual.

| Actor / estado | Público sin firma | Privado operativo |
|---|---|---|
| Anónimo | listado actual completo | 401 |
| Miembro Prime | listado actual completo | 403 sin acceso Control |
| JWT expirado/revocado | listado actual completo | 401 |
| Control sin ADMIN_CONTROL_ACCESS / revocado | listado actual completo | 403 |
| ADMIN o ENCARGADO aprobado, con acceso pero sin ADMIN_INVENTORY_VIEW | listado actual completo | 403 |
| ADMIN o ENCARGADO con ambos permisos | listado actual completo | solo estaciones asignadas; otra estación 403 |
| Control con cero estaciones | listado actual completo | 403 |
| SYSTEM_ADMIN activo | listado actual completo | todas las estaciones; puede seleccionar una |
| Kiosk con sesión y firma | estación propia; query manipulada 403 | 403; kiosks no son Control |
| Terminal técnico | su credencial sola no vuelve privada una ruta Public | no concede acceso Control |
| Clave interna Catalog | no es credencial de usuario | no sustituye AuthCore |

El rol por sí solo no concede lectura: se usan grants vigentes. stationId privado
se valida UUID y se comprueba contra asignaciones; sin parámetro se limita al actor.
No se confía en stationIds, role o permisos enviados por el cliente.
El monolito AppModule no añade estas rutas: se publican en el entrypoint Catalog.
Las rutas de inventario Control anteriores mantienen su contrato enriquecido
(activation/availableLiters); no se sustituyen por la proyección nueva.

## Decisiones de negocio aprobadas y exposición transitoria

Aprobado: estaciones/ubicaciones/datos generales, precios y beneficios son públicos.
Cantidades exactas, reservas, movimientos y administración son privados. Se autoriza
mantener temporalmente el contrato anterior; su retirada exige migración validada y
una autorización posterior expresa. No se ha autorizado activar Catalog independiente.

**Exposición temporal vigente:** `/api/v1/fuels/inventory` devuelve anónimamente
liters/reservedLiters de todas las estaciones, con relaciones incluso inactivas.
El gateway FuelFlow lo consulta sin credenciales. CORS o filtrar en el navegador
no lo protegen; una URL directa sigue exponiéndolo. `Cache-Control: no-store` reduce
almacenamiento intermedio, pero no elimina acceso ni borra copias ya almacenadas.

## Clasificación de campos reales

Contrato verificable: `catalog-data-contracts.json`; la aceptación compara sus
listas con las respuestas reales para detectar campos nuevos sin clasificar.

| Endpoint / campos | Clasificación |
|---|---|
| fuels: id, code, name, pricePerGallon, active, createdAt, updatedAt | Públicos; metadatos técnicos conservados por compatibilidad, sin datos personales |
| stations: id, code, name, address, active, createdAt, updatedAt | Públicos; no hay coordenadas en esta respuesta |
| benefits: id, code, title, description, category, pointsCost, active, createdAt, updatedAt | Públicos |
| fuels/inventory: liters, reservedLiters | Privados, expuestos temporalmente por el contrato legado |
| fuels/inventory: stationId, fuelId, updatedAt | Contexto de la proyección privada; no publicar una nueva proyección de stock sin revisión |
| fuels/inventory: fuel, station | Objetos completos de los tipos públicos anteriores; incluyen inactivos en el legado |
| control/catalog/inventory | Mismos campos de inventario, respuesta privada completa con alcance autorizado |
| control/catalog/stations | Campos públicos de Station dentro de una vista operativa privada y acotada |
| control/inventory: availableLiters, activation (status, reason, reconciledAt, updatedAt), litros y reservas | Privados; contrato enriquecido de Administration, no reemplazar por la proyección simple |
| control/inventory/movements | Toda la respuesta privada, con ADMIN_INVENTORY_MOVEMENT_VIEW y estación; no pertenece al catálogo público |

Movimientos reales (`InventoryMovement` y `ControlOperationsService.movements`):
id, eventKey, stationId, fuelId, sequence, reservationId, authorizationId,
terminalOperationId, transactionId, kind, physicalDeltaLiters, reservedDeltaLiters,
litersAfter, reservedLitersAfter, actorKind, actorId, reason, createdAt; incluye
inventory, reservation.operationId y fuel en la respuesta. Cantidades, actores,
referencias operativas y auditoría permanecen privados. No se trasladan a Catalog.

La autorización existente no cambia. Falta concretar la experiencia de FuelFlow:
lectura privada acotada para su identidad técnica o retirar cifras exactas de la
pantalla. No conceder ADMIN_CONTROL_ACCESS a terminales ni redirigirlas a Control.
Una disponibilidad cualitativa pública sería un contrato nuevo, no aprobado aquí.

Terminales: la autorización de ventas técnicas sigue en AccessGuard y Commerce;
no añadir permiso Control a una credencial técnica. El servicio independiente solo
acepta clave interna en red privada, nunca cookies o JWT públicos como sustituto.

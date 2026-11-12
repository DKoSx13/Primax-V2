# Cobertura comprobada y pendiente

La regresión Astra usa Backend/PostgreSQL QA reales, sin interceptores de mocks:
44 aprobadas, 0 fallidas, 4 compras responsive omitidas para no repetir ventas.
Estos resultados no certifican toda la lista funcional de la misión.

| Área | Evidencia actual | Pendiente |
|---|---|---|
| FuelFlow T01/T02 | Identidad y surtidor, OP01, prepago tarjeta, EB01/FT01, impresión simulada y sin impresión, recuperación de la misma venta T01 | Postpago y compras UI Yape/Plin reales en QA |
| FuelFlow aislamiento | Web Lock de segunda pestaña, 409 exacto de otro propietario, navegación sin cobro y cierre, accesibilidad en tres tamaños | Fallos de red durante pago y recuperación administrativa de venta ambigua |
| Prime | Login/credenciales negativas, recarga de página, navegación autenticada, membresía, vehículos, historial con recibos, billetera y EcoDigital visibles, logout, axe/responsive | Registro UI y escrituras de vehículos/membresía/billetera; no se generaron recargas |
| Control | Login/sesión, navegación de secciones, operaciones y recibos T01/T02, inventario y auditoría de lectura, encargado limitado a estación y 403 de cuentas, logout, axe/responsive | Crear/editar roles/estaciones; recuperación administrativa de operación con pago |
| Catalog | Cinco tests propios (persistencia simulada, HTTP Nest real), cuatro contratos con PostgreSQL QA real, reinicio independiente | Gateway público, rol PostgreSQL SELECT propio y contratos de identidad/alcance entre servicios |

Unitarias actuales: FuelFlow 172, Prime 31, Control 38. Sus fixtures y simulaciones
no equivalen a ventas de proveedores reales. No se repitió PrintAgent en misión 3;
56 aprobadas y una omitida siguen siendo evidencia histórica. Ninguna impresión
de esta sesión confirma hardware físico.

La próxima prueba financiera debe inspeccionar primero `financial-state.cjs`,
usar una terminal por ejecución y conservar operación/comprobante existentes.
No reutilizar ni borrar evidencia para forzar el estado inicial de una prueba.

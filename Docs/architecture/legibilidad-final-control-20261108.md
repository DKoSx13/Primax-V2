# Legibilidad final de Control — 8 noviembre 2026

Intervención puntual en el frontend de Control. Merge abierto en `qa/feria-integration`; sin commit, push, migraciones ni cambios de Backend.

## Estados y eventos

El filtro de Operaciones conserva los códigos API y muestra etiquetas centralizadas en `js/operation-labels.js`. `ACTIVE`, `CLOSED` e `INTERVENTION_REQUIRED` corresponden al estado de TerminalOperation; `RESERVED`, `DISPENSING`, `SETTLED`, `RELEASED` al estado de autorización. Los estados financieros se presentan por separado. Los códigos desconocidos no se convierten en una etiqueta financiera incorrecta.

El backend registra eventos `ASSISTANCE_CREATED`, `ASSISTANCE_ACCEPT`, `ASSISTANCE_NOTE`, `ASSISTANCE_RESOLVE`, `ASSISTANCE_ESCALATE` y `ASSISTANCE_CANCELLED`. El frontend ahora traduce esos códigos reales. Los nombres anteriores con sufijos de participio siguen soportados para compatibilidad. Un código futuro muestra «Evento de asistencia registrado» y conserva el código en Datos técnicos.

## Modal

El detalle se compone de encabezado, ubicación, operación vinculada, atención, fechas, incidencias e historial. Solo aparecen campos opcionales presentes; el UUID se muestra como referencia técnica corta con opción de revelar/copiar el valor completo. El historial se ordena cronológicamente, incluye actor cuando el backend lo entrega y mantiene datos complementarios en una sección técnica secundaria. Los estilos están restringidos al diálogo de asistencia. No se alteraron permisos, consultas, estados guardados ni acciones.

## Verificación

- `npm test --prefix Frontend_3_PrimaxControl`: 31 aprobadas, 0 fallidas.
- `npm run build --prefix Frontend_3_PrimaxControl`: aprobado, versión local `CONTROL-a66431446af2`.
- `node --check` de app y asistencia, y `git diff --check`: aprobados.
- El laboratorio sirvió `CONTROL-2167cf2d78b3` al comprobarlo; aún no contiene estos últimos cambios. No se reconstruyó el contenedor.
- No hubo navegador automatizado disponible. Selector abierto, modal completo y anchos 375/558/768/1366 px quedan pendientes de prueba visual y navegación por teclado.

Un correlativo real de operaciones requeriría una columna y secuencia transaccional en PostgreSQL, política de emisión, migración de datos anteriores y pruebas de concurrencia. No se creó ninguno: `operationId` sigue siendo UUID y el número de comprobante permanece independiente.

Para actualizar únicamente Control en el laboratorio tras revisión:

```bash
COMPOSE_PROJECT_NAME=primax-feria-check FRONTEND1_PORT=27181 FRONTEND2_PORT=27182 FRONTEND3_PORT=27183 BACKEND_PORT=27100 docker compose build frontend3
COMPOSE_PROJECT_NAME=primax-feria-check FRONTEND1_PORT=27181 FRONTEND2_PORT=27182 FRONTEND3_PORT=27183 BACKEND_PORT=27100 docker compose up -d --no-deps --no-build frontend3
```

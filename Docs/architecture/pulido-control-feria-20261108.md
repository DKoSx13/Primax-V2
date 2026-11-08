# Pulido de Primax Control — 8 noviembre 2026

El merge de `qa/feria-integration` continúa abierto y sin commit. Esta ronda modifica solo el frontend de Control.

## Detalle de cliente e identificadores

El modal de Clientes conserva la misma respuesta y permisos del endpoint `control/customers/:id`. La tabla estrecha de operaciones se sustituyó por tarjetas: fecha completa, estación, placa, estados, comprobante y acción de consulta. Los vehículos se muestran como filas compactas. El CSS está restringido al modal `.customer-dialog` y permite desplazamiento vertical interno.

El esquema Prisma guarda `operationId` como UUID único en Transaction y TerminalOperation. No existe un correlativo persistente de operación. Solo `Receipt.correlative` es una secuencia respaldada por PostgreSQL para boletas/facturas. La interfaz etiqueta el fragmento visible como «Referencia técnica» y ofrece el UUID completo y un botón para copiarlo. Un correlativo real de operaciones podría evaluarse después de la feria, con migración, reglas de emisión y concurrencia revisadas; no se improvisó uno en frontend.

## Solicitudes y notificaciones

La sección se titula «Solicitudes e historial». Reutiliza `GET /control/assistance`, que el backend limita a `ADMIN_INCIDENT_VIEW` y a `stationIds` del actor. Presenta el resultado completo de la consulta en tarjetas con motivo, estado, estación, terminal, surtidor, placa, operación, responsable y fechas. Conserva el acceso al contexto/historial y las acciones existentes. `ACCEPT` solo aparece con `ADMIN_INCIDENT_MANAGE` en solicitudes pendientes; `NOTE` y `RESOLVE` solo para quien tiene el permiso y está asignado, conforme al comportamiento existente.

Las notificaciones usan sondeo de 10 segundos. La primera respuesta por usuario/estación establece una línea base sin avisar solicitudes históricas. Los IDs vistos permanecen durante navegación y refrescos de sección para evitar duplicados; cambiar de alcance o cerrar sesión reinicia la línea base. El backend filtra antes de entregar filas, y la vista no inicia sondeo sin `ADMIN_INCIDENT_VIEW`. Un toast discreto permite descartarlo o abrir el historial de esa solicitud; nunca cambia su estado. La limitación es que solo las solicitudes presentes en la lista de hasta 100 resultados y observadas mientras Control está abierto pueden generar aviso. Una solicitud que se crea y desaparece entre dos consultas no puede detectarse fiablemente sin un cursor/evento del servidor. No se añadieron WebSockets.

## Validación

- `npm test --prefix Frontend_3_PrimaxControl`: 28 aprobadas, 0 fallidas. Incluye línea base, duplicados e historial de avisos.
- `npm run build --prefix Frontend_3_PrimaxControl`: aprobado.
- `node --check` y `git diff --check`: aprobados.
- Código de permisos verificado contra `AssistanceService.readScope` y las reglas de `assistanceActions`.
- No hubo navegador automatizado disponible; quedan pendientes inspección visual y consola/HTTP a 375, 558, 768 y 1366 px, además de interacción real del modal y los avisos con varias sesiones autorizadas.

Para mostrar estos cambios en el laboratorio, desde la raíz del repositorio:

```bash
COMPOSE_PROJECT_NAME=primax-feria-check FRONTEND1_PORT=27181 FRONTEND2_PORT=27182 FRONTEND3_PORT=27183 BACKEND_PORT=27100 docker compose build frontend3
COMPOSE_PROJECT_NAME=primax-feria-check FRONTEND1_PORT=27181 FRONTEND2_PORT=27182 FRONTEND3_PORT=27183 BACKEND_PORT=27100 docker compose up -d --no-deps --no-build frontend3
```

No se ejecutaron esos comandos en esta ronda. Reconstruyen solo Primax Control y no ejecutan migraciones ni seeds.

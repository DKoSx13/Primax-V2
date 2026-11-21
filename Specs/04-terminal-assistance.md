# 04 — Terminales, asistencia e incidencias

## Estado operativo

Una terminal registrada con un surtidor activo admite autoservicio al estar disponible. El valor histórico `BLOQUEADA` mantiene su disponibilidad automática. Personal de Control con `ADMIN_TERMINAL_MANAGE` y estación dentro de su alcance puede poner una terminal registrada en mantenimiento (`FUERA_DE_SERVICIO`). La terminal debe estar libre de atenciones abiertas y el cambio registra el motivo, el actor y la fecha. **Habilitar** restablece `DISPONIBLE` en una terminal suspendida por mantenimiento con un surtidor activo. Las terminales revocadas conservan su ciclo de vida y las intervenciones se gestionan por operación.

FuelFlow consulta el estado persistido. Con `DISPONIBLE` inicia autoservicio; con terminal suspendida muestra «Terminal temporalmente no disponible» y permite actualizar el estado. Una operación ya iniciada conserva su contexto técnico y puede terminar de forma segura. No hay apertura o cierre de turno ni inicio manual de estación.

## Asistencia

El cliente puede crear una solicitud con estación, terminal, surtidor, motivo y operación si existe. `ADMIN_INCIDENT_VIEW` permite leer solicitudes e incidencias en el alcance asignado; `ADMIN_INCIDENT_MANAGE` permite aceptar y resolver. Una sola persona toma cada solicitud mediante actualización condicional. La persona responsable registra observaciones, resultado y resolución o escalamiento. Los eventos quedan auditados.

La solicitud de asistencia y la incidencia financiera u operativa son registros distintos. Las acciones de recuperación de pagos respetan el estado financiero del Backend y los mismos grants de lectura y gestión de incidencias. Nadie modifica manualmente un pago confirmado.

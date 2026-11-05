# 04 — Terminales, asistencia e incidencias

## Estado operativo

Una terminal registrada con surtidor activo comienza `BLOQUEADA`. Personal de Control con `ADMIN_TERMINAL_MANAGE` y estación dentro de su alcance puede **Habilitar terminal** (`DISPONIBLE`) o **Suspender terminal** (`BLOQUEADA`). La suspensión exige motivo y registra actor, fecha y auditoría. Si hay una operación abierta, pasa a `ASISTENCIA` para impedir operaciones nuevas sin cancelar el proceso financiero. Al cerrarse esa operación queda `BLOQUEADA`. Una terminal revocada usa el estado `FUERA_DE_SERVICIO` según su ciclo de vida existente.

FuelFlow consulta el estado persistido. Con `DISPONIBLE` inicia autoservicio; con terminal suspendida muestra «Terminal temporalmente no disponible» y permite actualizar el estado. Una operación ya iniciada conserva su contexto técnico y puede terminar de forma segura. No hay apertura o cierre de turno ni inicio manual de estación.

## Asistencia

El cliente puede crear una solicitud con estación, terminal, surtidor, motivo y operación si existe. `ADMIN_INCIDENT_VIEW` permite leer solicitudes e incidencias en el alcance asignado; `ADMIN_INCIDENT_MANAGE` permite aceptar y resolver. Una sola persona toma cada solicitud mediante actualización condicional. La persona responsable registra observaciones, resultado y resolución o escalamiento. Los eventos quedan auditados.

La solicitud de asistencia y la incidencia financiera u operativa son registros distintos. Las acciones de recuperación de pagos respetan el estado financiero del Backend y los mismos grants de lectura y gestión de incidencias. Nadie modifica manualmente un pago confirmado.

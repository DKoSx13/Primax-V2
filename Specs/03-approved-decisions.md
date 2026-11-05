# 03 — Decisiones funcionales finales de V2

1. Control expone Administrador del sistema, Administrador y Encargado. Cliente Prime es externo a Control.
2. Administrador del sistema crea cuentas de Control, asigna estaciones y grants. El Backend aplica cada grant y el alcance de estación.
3. `ADMIN_TERMINAL_MANAGE` habilita y suspende terminales. Una suspensión exige motivo y auditoría. `DISPONIBLE`, `BLOQUEADA`, `EN_USO`, `ASISTENCIA` y `FUERA_DE_SERVICIO` son los estados operativos existentes.
4. FuelFlow inicia una nueva operación solo con terminal disponible y surtidor activo. Una suspensión no invalida una operación ya abierta.
5. `ADMIN_INCIDENT_VIEW` permite leer asistencia e incidencias; `ADMIN_INCIDENT_MANAGE` permite atender, resolver y ejecutar recuperación de pago segura.
6. La contraseña Prime exige 8 caracteres, mayúscula, minúscula, número y especial. La de Control exige 8 caracteres. Ambas se almacenan con bcrypt cost 12.
7. Los secretos técnicos conservan sus políticas existentes. El pago y la impresión siguen las reglas de `05-payments-and-receipts.md`.
8. Las tablas históricas de asignación y turno se conservan solo para compatibilidad de datos; el flujo activo no las consulta.

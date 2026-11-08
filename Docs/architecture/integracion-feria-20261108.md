# Integración feria — 8 noviembre 2026

Merge existente en qa/feria-integration; no se creó otro merge, commit, push ni despliegue.
Se inspeccionaron los stages base/ours/theirs de los seis conflictos.

## Decisiones

- kiosk.service.ts: recuperación de atenciones vacías y lease por heartbeat de dezkz combinados con rotación atómica QA y rotatedFromId. El bloqueo de fila precede ahora a la lectura del estado para evitar decisiones basadas en un estado anterior al bloqueo. Evidencia financiera, reservas e incidencias impiden cierre automático; estados de intervención siguen bloqueando.
- index.html: textos explícitos «Imprimir y finalizar» y «No imprimir y finalizar», manteniendo numeración y estructura completa.
- script.js: etiquetas coherentes con la finalización, preservando cambios combinados de concurrencia, OCR, asistencia y recuperación.
- receipts-v2.test.js: expectativas actualizadas a las etiquetas; se mantienen pruebas de errores y ausencia de efectos financieros de impresión.
- Control app.js: disponibilidad automática sin activación administrativa obligatoria; conservación QA de recuperación por intervención, asistencia o fuera de servicio y permiso ADMIN_INCIDENT_MANAGE. Corregido «automática» ilegible. Roles, reautenticación y auditoría no se eliminaron.
- PrintAgent contract.mjs: campos number/transactionId y validación de serie combinados con ordenación localeCompare consistente en ambos lados del contrato. Se mantienen contratos antiguos y numerados.

## Revisión adicional

Revisados bootstrap de servicios, AuthCoreModule, OperationsModule, rutas del gateway, helper de atención vacía, contrato de recibos, migración SQL y configuración Compose. La emisión usa trigger dentro de la venta, secuencias independientes y unicidad por transacción/número; los documentos son inmutables. No se añadieron migraciones. No se deshizo la separación de servicios ni OCR, Redis, PostgreSQL, CI o documentación.

Se actualizaron fixtures unitarios de rotación para representar la transacción ampliada y comprobar la genealogía de credenciales. npm ci indicó 18 vulnerabilidades (7 bajas, 8 moderadas, 3 altas); no se aplicó audit fix ni se modificaron dependencias indiscriminadamente.

## Validación y límites

- FuelFlow: 156 pruebas aprobadas; Control: 27; Prime: 28.
- PrintAgent: 55 aprobadas, 1 omitida. No equivale a impresión física.
- Gateway y seguridad de conexiones locales: 28 aprobadas.
- Builds de los tres frontends aprobados; backend compiló y lint aprobó.
- Primera suite backend: 228 aprobadas y 1 fallo en fixture antiguo de kiosco; corregido y repetido de forma focalizada: 2 suites, 23 pruebas aprobadas. Build y lint backend repetidos tras la corrección, ambos aprobados.
- Compose config --quiet y git diff --check aprobados.
- Integración PostgreSQL de comprobantes: 6 aprobadas, incluidas 24 ventas concurrentes, replay, rollback, reconexión e inmutabilidad.

La integración usó exclusivamente el contenedor existente primax-v2-test-postgres-1, proyecto verificado primax-v2-test, puerto loopback 26602 y esquema aleatorio receipts_*. Se aplicaron migraciones solo a ese esquema aislado; se deja como evidencia sin eliminar datos ni volúmenes. No se inició stack Docker ni se accedió a proveedores remotos.

Pendientes: suite E2E completa, arranque y smoke de todos los microservicios juntos, navegación real prepago/postpago/OCR/asistencia, concurrencia de credenciales entre procesos, impresión física y revisión detallada de advisories. Estas validaciones impiden certificar todavía la demo completa; las pruebas aprobadas no prueban el sistema extremo a extremo.

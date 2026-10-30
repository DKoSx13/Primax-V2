# 04 — Operación, asistencia e incidencias

## 1. Propósito

Definir la operación del Supervisor y separar la solicitud de ayuda del cliente del registro formal de una incidencia. FuelFlow es autoservicio prácticamente completo; la intervención humana es excepcional. Las reglas específicas de pago y comprobantes están en `05-payments-and-receipts.md`.

## 2. Actores

- **Cliente:** completa el abastecimiento y puede solicitar asistencia.
- **Supervisor:** opera una estación y atiende solicitudes/incidencias dentro de sus permisos.
- **Admin:** consulta y gestiona incidencias e historial de asistencia de estaciones bajo su alcance; no aprueba solicitudes normales antes de la atención.
- **Backend/proveedor:** autoridad sobre transacciones y estado financiero.

## 3. Flujo operativo normal

Flujo base del Supervisor: `Login → Abrir turno → Iniciar estación → FuelFlow listo`.

Puede abrir/cerrar turno, preparar la estación, consultar su estado operativo, ver terminal/surtidor asignados y operaciones que requieren atención. Cliente normalmente termina la operación sin Supervisor. Pairing, CSRF, HMAC, cookies, credenciales y sesiones técnicas permanecen internos.

### Incremento 01 — preparación de estación

Primax Control presenta una sola acción humana «Iniciar estación». Backend comprueba identidad, asignación vigente, turno `ABIERTO`, terminal registrada, surtidor activo y ausencia de bloqueo administrativo. Una terminal ya preparada debe devolver su estado listo de forma idempotente, sin duplicar habilitaciones, credenciales ni operaciones. La preparación técnica de FuelFlow se completa mediante el canal seguro existente; los secretos y pasos técnicos no se muestran al trabajador. Si falta turno, asignación, terminal o surtidor, o existe bloqueo administrativo, la acción se rechaza con un mensaje comprensible y queda registrado el fallo relevante sin secretos. Cerrar turno impide nuevas operaciones. Supervisor no puede invocar bloqueo/restauración administrativa por ninguna ruta.

## 4. Solicitud de asistencia

Una solicitud representa **“el cliente necesita ayuda”**; por sí sola no afirma que exista un problema formal. FuelFlow crea una solicitud asociada como mínimo a estación, terminal, surtidor, fecha/hora, motivo y contexto disponible, y operación si ya existe. Los motivos iniciales son `AYUDA_GENERAL`, `ERROR_PAGO`, `PROBLEMA_TERMINAL`, `PROBLEMA_DESPACHO`, `COMPROBANTE_IMPRESION` y `OTRO`. Para `OTRO` se permite descripción/observación. Este catálogo no se amplía en esta versión.

Se notifica a los Supervisores activos y autorizados de la misma estación. La solicitud comienza `PENDIENTE`. Cualquier Supervisor autorizado de esa estación puede intentar aceptarla; solo uno se convierte en responsable.

### Estados y flujo

`PENDIENTE → EN_ATENCION → RESUELTA`

o

`PENDIENTE → EN_ATENCION → ESCALADA`

o, si el cliente cancela:

`PENDIENTE o EN_ATENCION → CANCELADA_POR_CLIENTE`

El workflow tiene los estados `PENDIENTE`, `EN_ATENCION`, `RESUELTA`, `ESCALADA` y `CANCELADA_POR_CLIENTE`. El Supervisor acepta/toma la solicitud para pasarla de `PENDIENTE` a `EN_ATENCION`; no requiere aprobación previa del Admin. La aceptación debe resolverse en Backend mediante una operación transaccional/condicional segura y atómica, sin definir aquí su implementación concreta. Debe asignar `assignedSupervisorId` y `acceptedAt`. Si otro Supervisor intenta aceptarla cuando ya fue tomada, Backend no sobrescribe al responsable y responde que la solicitud ya está siendo atendida. La protección no puede depender solo del Frontend.

Tras actuar, el responsable registra resultado y observaciones cuando correspondan, y marca `RESUELTA` o `ESCALADA`. Si el cliente cancela, puede terminar como `CANCELADA_POR_CLIENTE`. Si no puede resolverse normalmente, puede generarse una incidencia vinculada. El motivo de solicitud permanece separado del estado de workflow.

Se registran como mínimo: Supervisor que tomó la solicitud, hora de creación, hora de aceptación, hora de resolución/escalamiento/cancelación, resultado y observaciones cuando corresponda. Cambios de estado y acciones quedan auditados.

## 5. Solicitud versus incidencia

- **Solicitud de asistencia:** necesidad de ayuda iniciada por el cliente, atendida principalmente por Supervisor. Puede finalizar resuelta sin incidente significativo.
- **Incidencia:** problema operativo, técnico o financiero que debe quedar registrado. Puede generarse automáticamente (por ejemplo, error relevante de pago), por fallo operacional o a partir de una solicitud no resoluble normalmente.

La incidencia tiene su propio estado/ciclo de vida, que no se presume idéntico a los estados de la solicitud. Admin puede revisar, dentro de su alcance, tipo, estado, operación, terminal, Supervisor que intervino, resultado, observaciones y timestamps. Admin no es una puerta de aprobación para la ayuda normal.

## 6. Incidencias de pago

Un error relevante de pago genera incidencia vinculada a operación. Supervisor puede consultar operación, método, estado financiero y error; reintentar/reanudar cuando sea seguro y permitido; permitir reselección de método; cancelar/liberar mediante acciones controladas; registrar observaciones y escalar. Si hay recuperación, cliente puede continuar; si no, se cancela/libera controladamente o se escala.

Backend, transacción registrada y proveedor son fuente de verdad financiera. Supervisor no edita manualmente el estado ni marca pagado sin confirmación real. Los métodos y recibos se definen en `05-payments-and-receipts.md`.

## 7. Permisos y restricciones

Supervisor puede abrir/cerrar turno e iniciar/preparar estación; consultar estado, asignaciones y operaciones que requieren atención; recibir/tomar solicitudes; consultar contexto permitido; atender, registrar actuación, resolver/escalar; y ejecutar recuperación de pago solo cuando Backend y reglas de negocio lo permitan.

No puede bloquear/desbloquear terminales, cambiar asignación terminal↔surtidor, modificar configuración administrativa, crear Admins, cambiar grants, alterar inventario arbitrariamente ni modificar manualmente estados financieros. Asistir no le concede privilegios administrativos.

## 8. Seguridad y auditoría

- Backend valida identidad, rol/grants, estación y alcance para cada lectura y mutación protegida. El control de UI no sustituye la validación; llamadas manuales no autorizadas se rechazan.
- La solicitud se vincula al contexto real disponible y solo se expone al Supervisor autorizado de la estación; incidencias son visibles a Admin únicamente dentro de su alcance.
- La toma de solicitud debe ser una transición protegida que impida una doble aceptación concurrente.
- Se auditan creación, aceptación, cambios de estado, atención, resultado, observaciones, resolución/escalamiento, actor y timestamps. Las incidencias conservan vínculos de operación/terminal y las intervenciones asociadas.
- Los eventos de auditoría V2 académica son append-only; la aplicación no los elimina automáticamente y esta versión no implementa política de purga. La retención formal para producción dependerá de requisitos legales/organizacionales futuros y queda fuera del alcance académico; no se establece un plazo.
- Los datos técnicos de pairing, CSRF, HMAC, cookies, credenciales y sesiones no forman parte del flujo visible del trabajador.

## 9. Criterios de aceptación

1. Cliente completa operación normal sin Supervisor.
2. Cliente solicita asistencia desde FuelFlow y se guardan estación, terminal, surtidor, fecha/hora, motivo/contexto disponible y operación si existe; `OTRO` admite descripción/observación.
3. Supervisores activos/autorizados de la estación reciben la solicitud correspondiente.
4. Supervisor autorizado puede tomarla y cambiar `PENDIENTE` a `EN_ATENCION`, asignando `assignedSupervisorId` y `acceptedAt` de forma atómica en Backend; una segunda toma recibe respuesta de ya atendida sin sobrescribir al responsable.
5. Supervisor puede resolverla, escalarla o registrar cancelación del cliente con resultado, timestamps y observaciones cuando correspondan auditados.
6. Admin puede consultar incidencias e historial de asistencia de estaciones bajo su alcance, incluyendo los campos descritos.
7. Admin no necesita aprobar una solicitud normal antes de que el Supervisor ayude.
8. Error relevante de pago genera incidencia; Supervisor asiste sin alterar el estado financiero.
9. Supervisor no puede bloquear/desbloquear terminales ni realizar las demás operaciones administrativas restringidas.
10. Si una operación es recuperable, cliente puede continuar; de otro modo se cancela/libera con control o se escala.
11. Auditoría es append-only, no tiene eliminación automática ni política de purga en esta versión académica.

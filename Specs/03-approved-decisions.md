# 03 — Decisiones aprobadas para V2

## Acceso y responsabilidades

1. **Principio de roles.** `Supervisor opera y asiste. Admin administra. SuperAdmin gobierna.` Los roles no se fusionan; una cuenta puede acumular roles/grants cuando sea necesario.
2. **Primax Control único.** Existe una sola aplicación `Frontend_3_PrimaxControl` y un solo login. La interfaz disponible depende de cuenta autenticada, rol, grants/permisos, estaciones asignadas y alcance global o por estación. Supervisor ve funciones operacionales; Admin/SuperAdmin, las administrativas que autoriza su alcance.
3. **Autorización Backend.** Backend valida rol, grants y alcance en cada operación protegida. Ocultar elementos en Frontend no constituye autorización; el acceso manual al endpoint también debe rechazarse si no está autorizado.
4. **Terminales.** Bloquear/desbloquear terminales es exclusivamente administrativo y se hace desde Primax Control. Supervisor no puede bloquear/desbloquear ni cambiar la asignación terminal↔surtidor.
5. **Supervisor.** Flujo base: `Login → Abrir turno → Iniciar estación → FuelFlow listo`. Puede abrir/cerrar turno, preparar estación, consultar estado operativo y terminal/surtidor asignados, ver operaciones que requieren atención y atender solicitudes/incidencias dentro de sus permisos. No puede modificar configuración administrativa, crear Admins, cambiar grants ni alterar estado financiero manualmente.
6. **Admin.** Admin administra una o varias estaciones asignadas: dashboard de alcance, Supervisores, terminales/surtidores, bloqueo/desbloqueo, operaciones, incidencias, historial de asistencias, inventario según permisos y auditoría de su alcance.
7. **SuperAdmin.** Alcance global: estaciones, Admins, asignaciones, grants/permisos, Supervisores, auditoría global y configuración global autorizada. Solo SuperAdmin puede administrar otros Admins.

## FuelFlow y atención operativa

8. **Autoservicio.** El cliente normalmente completa FuelFlow sin intervención del Supervisor; la asistencia humana es excepcional.
9. **Solicitud de asistencia.** “Solicitar asistencia” crea una solicitud con estación, terminal, surtidor, fecha/hora, motivo/contexto disponible y operación si existe. Motivos iniciales: `AYUDA_GENERAL`, `ERROR_PAGO`, `PROBLEMA_TERMINAL`, `PROBLEMA_DESPACHO`, `COMPROBANTE_IMPRESION`, `OTRO`; este último admite descripción/observación. Se notifica a Supervisores activos/autorizados de la estación, sin aprobación previa de Admin. Workflow: `PENDIENTE`, `EN_ATENCION`, `RESUELTA`, `ESCALADA`, `CANCELADA_POR_CLIENTE`; motivo y estado son campos conceptualmente separados.
10. **Asistencia e incidencia son distintas.** Asistencia significa que el cliente necesita ayuda y puede resolverse sin incidencia importante. Incidencia registra un problema operativo, técnico o financiero; puede originarse automáticamente o desde asistencia no resoluble normalmente. Admin consulta incidencias dentro de su alcance.
11. **Incidencia de pago.** Error relevante genera incidencia. Supervisor puede consultar operación, método, estado financiero y error; reintentar/reanudar de forma segura, permitir cambio de método, cancelar/liberar mediante acciones controladas o escalar, según reglas de negocio.
12. **Fuente de verdad financiera.** Backend/transacción/proveedor determinan el estado financiero. Supervisor no puede editarlo ni marcar una operación como pagada sin confirmación real.

## Pagos, comprobantes y membresía

13. **Métodos de pago V2.** Se permiten Yape, Plin, Tarjeta y Saldo Prime. Efectivo queda excluido del alcance de FuelFlow autoservicio. Ante fallo digital, el cliente puede reintentar o seleccionar otro método permitido; si no se recupera, se genera/continúa incidencia y asiste Supervisor. Detalle en `05-payments-and-receipts.md`.
14. **Impresión.** Se elimina “Imprimir desde navegador”; no se usa `window.print()` ni diálogo del navegador como flujo funcional. Las opciones al terminar son conceptualmente `Imprimir` o `No imprimir`. Impresión física significa exclusivamente FuelFlow → PrintAgent local → impresora. Si PrintAgent falla, se informa el fallo y no se altera el resultado financiero.
15. **Código público de membresía.** Formato `PRIME-...` según `06-prime-membership-numbering.md`. Es identificador público, no primary key: se conserva un ID interno estable y una secuencia numérica interna de PostgreSQL atómica. No se asigna mediante `último número + 1`; el siguiente número pasa al formatter y el código público tiene unicidad garantizada.
16. **Concurrencia y auditoría.** La aceptación `PENDIENTE → EN_ATENCION` se resuelve atómica y seguramente en Backend mediante operación transaccional/condicional; asigna `assignedSupervisorId` y `acceptedAt`. Solo un Supervisor queda responsable. Intentos posteriores no sobrescriben responsable y reciben respuesta de que ya está siendo atendida. Eventos de auditoría académica son append-only, sin eliminación automática ni purga en esta versión. La retención formal productiva queda para requisitos futuros, sin plazo definido. Detalle en `04-supervisor-assistance.md`.

## Estado documental

17. **Contrato futuro.** Estas decisiones describen SDD V2 y no afirman que estén implementadas. Referencias bajo `Specs/V12.1-reference/` describen el baseline ejecutable heredado; si difieren, prevalece el contrato futuro de estas Specs para implementación V2. No se modifica código, base de datos, UI, seeds, métodos reales, PrintAgent, repositorios, CI ni despliegues en esta fase.

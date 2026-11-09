# Recuperación administrativa excepcional de una terminal

## Diagnóstico

El bootstrap técnico normal exige la credencial anterior cuando una terminal tiene una atención activa con evidencia financiera. Esa protección se conserva. En el laboratorio, las credenciales originales de T01 y T02 vencieron; el flujo normal ya no puede recuperar OP01-0012 ni OP01-0013. Control ya autentica a un usuario real, distingue `SUPER_ADMIN` y registra auditoría; Redis ya guarda la propiedad de pestaña. Se reutilizan esas capacidades.

## Flujo implementado

1. Un `SUPER_ADMIN` autenticado en Control solicita `POST /api/v1/control/terminal-operations/:operationId/recovery-ticket` con JSON `{ "reason": "justificación de al menos diez caracteres" }`. El Backend comprueba otra vez el permiso `SYSTEM_ADMIN` vigente, bloquea la fila de la terminal, confirma la OP01 activa y la ausencia de credencial técnica vigente. Revisa orden, pago, autorización, reserva, venta, comprobante y el último evento DEMO del proveedor. Solo admite una orden DEMO pendiente sin despacho o una venta DEMO ya liquidada. Devuelve un código aleatorio de un uso válido cinco minutos y la evidencia leída del Backend. La respuesta lleva `Cache-Control: no-store`.
2. El operador presenta ese código **en el gateway de la terminal indicada**, mediante `POST /api/kiosk/terminal-recovery` con JSON `{ "ticket": "..." }`, cabeceras `Origin` del mismo origen, `X-FuelFlow-Request: 1` y `X-FuelFlow-Tab` con el UUID propio de esa pestaña. El gateway fija el código de terminal desde su configuración; el navegador no puede elegirlo. El Backend vuelve a bloquear la terminal, comprueba el permiso del administrador, la operación y una instantánea idéntica de evidencia financiera. Consume el código una sola vez, revoca todas las credenciales técnicas anteriores, sustituye el propietario Redis y emite una credencial de 15 minutos vinculada a esa terminal, operación y pestaña. Redis es obligatorio y su pérdida invalida la credencial. El gateway entrega los tokens solo en cookies `HttpOnly` y devuelve el identificador de operación y la evidencia, nunca el token técnico.
3. La credencial recuperada permite leer la atención original y cerrarla mediante el endpoint existente de terminal. La sesión de kiosco asociada permite cancelar **solo la orden original pendiente**. La evidencia financiera de recuperación procede de lecturas directas del Backend durante el canje; no se invoca el `GET` de órdenes, que puede conciliar estados. No permite iniciar otra operación, crear ventas, confirmar pagos ni modificar inventario. El cierre sigue sometido a todas las reglas financieras existentes del Backend.

Se auditan solicitud, concesión y rechazos vinculables al usuario. Los códigos y credenciales no aparecen en los detalles de auditoría. No se añadieron migraciones ni se modificaron estados financieros por esta función.

## Aplicación posterior en `primax-feria-check`

Este código aún requiere reconstrucción y despliegue local controlado; **no se ha usado sobre las operaciones reales**. Tras desplegarlo, el administrador debe volver a comprobar el respaldo y los estados. Para T02, solicitar un código para `8a8e9870-f126-4572-a48b-24aede5733bc`, canjearlo exclusivamente en `http://127.0.0.1:27184`, confirmar la evidencia `PENDING_PAYMENT`, cancelar la orden `e9e32ff8-3cf3-472a-93b2-07a442745a2c` por su endpoint existente, verificar orden, pago y reserva `CANCELLED` sin autorización ni venta, y cerrar la atención original. Para T01, solicitar un código distinto para `001f732f-d192-4dba-9e98-848690f1b9b7`, canjearlo exclusivamente en `http://127.0.0.1:27181`, comprobar `SETTLED_SALE` y el comprobante `EB01-0008`, y cerrar únicamente la atención. Cada canje exige un UUID de pestaña distinto. Si falla cualquier comprobación, detenerse.

El endpoint de Control exige la sesión administrativa normal, con su token o cookie; no acepta una firma de kiosco. El canje exige el gateway configurado de cada terminal. El código de recuperación debe manejarse como un secreto de un uso: no incluirlo en una URL, registro o captura. La respuesta de canje contiene el CSRF de la sesión de kiosco; el cierre usa el CSRF de terminal que el gateway deja en su cookie no `HttpOnly`.

## Riesgos y límites

- La autorización se limita deliberadamente a `SUPER_ADMIN`; un Encargado con permisos de terminal e incidentes no puede emitir códigos. No se creó un permiso nuevo ni una migración.
- Redis y PostgreSQL no comparten transacción distribuida. Si falla la operación tras consumir el código, se pierde ese intento y se requiere una nueva solicitud auditada; no se acepta el código de nuevo. Una caída de Redis invalida la credencial recuperada.
- La recuperación se limita a dos formas financieras DEMO verificables. Un estado comercial, parcial, ambiguo o modificado exige otro procedimiento explícito.
- La versión actual ofrece un endpoint administrativo y un endpoint de canje; no añade un formulario a Control o FuelFlow. El operador debe usar un cliente HTTP autorizado que preserve cookies y CSRF, o añadir una interfaz revisada antes de uso manual frecuente.

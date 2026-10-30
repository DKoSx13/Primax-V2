# 05 — Pagos y comprobantes

## 1. Alcance y métodos permitidos

En Primax V2, FuelFlow es autoservicio automatizado. Los métodos permitidos son **Yape, Plin, Tarjeta y Saldo Prime**. **Efectivo no es un método válido** en el contrato V2: su manejo requeriría recepción/validación de efectivo, almacenamiento, cálculo y entrega automática de vuelto, fuera del alcance actual.

La decisión no implica que proveedores, adquirencia o medios estén ya integrados ni cambia el comportamiento V12.1 ejecutable. La autoridad del estado financiero permanece en Backend, transacciones y confirmación del proveedor; la interfaz nunca declara éxito por sí sola.

## 2. Fallo y recuperación de pago

Ante fallo digital, el cliente puede **reintentar** o **seleccionar otro método permitido**. Si el fallo es relevante, el sistema genera una incidencia operativa y permite que el Supervisor asista. No se presenta una operación como pagada sin confirmación real.

Supervisor puede consultar operación, método, estado financiero y error; reintentar/reanudar solo si es seguro y permitido; facilitar reselección cuando corresponda; cancelar/liberar mediante acciones controladas o escalar. No puede editar el estado financiero. Si la operación se recupera, cliente continúa; si no, se cancela/libera controladamente o se escala. Ver `04-supervisor-assistance.md`.

## 3. Comprobante e impresión

Al concluir, cliente dispone conceptualmente de las opciones **Imprimir** o **No imprimir**. Elegir no imprimir permite finalizar sin impresión física.

La única vía de impresión física funcional es:

`FuelFlow → PrintAgent local → impresora física`

Se elimina “Imprimir desde navegador”. No se usa `window.print()` ni el diálogo de impresión del navegador como fallback o flujo funcional. PrintAgent sigue siendo el agente local de impresión.

Si PrintAgent o la impresora falla, FuelFlow informa que no se imprimió; no simula éxito, no afirma que salió el comprobante y no altera el resultado financiero de la operación. El fallo de impresión no convierte un pago confirmado en fallido ni uno no confirmado en pagado.

## 4. Criterios de aceptación

1. Métodos válidos: Yape, Plin, Tarjeta y Saldo Prime; efectivo no se ofrece como método.
2. En fallo, cliente puede reintentar o seleccionar otro método permitido.
3. Fallo relevante genera o continúa una incidencia y permite asistencia del Supervisor.
4. Supervisor no modifica manualmente el estado financiero ni puede marcar pagado sin confirmación.
5. El flujo no ofrece impresión desde navegador ni llama a `window.print()`.
6. PrintAgent local es la única vía para impresión física.
7. Si cliente elige no imprimir, la operación puede terminar normalmente.
8. Si PrintAgent falla, se informa el fallo sin fingir impresión ni alterar el resultado financiero.

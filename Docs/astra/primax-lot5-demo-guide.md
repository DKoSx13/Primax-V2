# Lote 5 — guía de demostración académica

Demostrar sobre una instalación sintética nueva y claramente identificada. No reutilizar ni recuperar por fuerza la instalación detenida del fallo T02, la incidencia T01 congelada ni la copia de exposición. Mostrar al inicio el dictamen: arquitectura consolidada, ejecución normal Windows/Linux amd64 comprobada, recuperación T02 fallida y portabilidad a hosts Linux/macOS pendiente según 3J.

1. Mostrar `docker compose ps -a`: 15 healthy, dos jobs código 0; salud agregada del Gateway. Explicar cuatro procesos separados y una PostgreSQL compartida.
2. Abrir Prime, entrar con la cuenta demo local indicada en el runbook privado/fixture de la instalación. Mostrar perfil, membresía, vehículos, wallet, puntos y beneficios. Guardar un cambio sintético y cerrar sesión. Una recarga es demo y no debe confundirse con cobro real.
3. Abrir Control con root: consultar estación, clientes/membresías/vehículos, inventario, movimientos, operaciones, terminales, accesos y auditoría. Cerrar sesión; entrar como Encargado para mostrar menú/estaciones reducidos. No conceder permisos nuevos para la demostración.
4. Abrir T01 solo para carga e identificación. Declarar su incidencia histórica; no intentar recuperarla.
5. En T02 elegir idioma → INICIAR → Regular → PREPAGO → S/20 → BOLETA → DNI sintético y placa XYZ-999 → YAPE. Pulsar una vez Simular confirmación del pago, aceptar «Entendido» y esperar Ticket digital. **No recargar durante la operación pendiente: el caso de recuperación falla y está documentado, no resuelto.**
6. Mostrar boleta demo sin validez fiscal; Imprimir y finalizar debe informar simulación guardada, sin papel. Mostrar trabajo `simulation=true`, `physicalConfirmed=false`, y venta/comprobante persistidos. La numeración depende del estado nuevo, no exigir EB01-0001 si ya hay ventas.
7. OCR: en otra atención permitida, usar el botón de captura y su entrada explícita «Imagen de prueba», cargar `PlateRecognition/fixtures/ABC-123.png`, revisar ABC123 y confirmar. Explicar que esto comprueba OCR real sobre archivo, no cámara física. No confirmar un pago adicional si no se desea otra venta.

URLs predeterminadas: T01 http://127.0.0.1:27281/src/index.html ; T02 http://127.0.0.1:27284/src/index.html ; Prime http://127.0.0.1:27282/ ; Control http://127.0.0.1:27283/ ; Gateway http://127.0.0.1:27200/api/v1/health . En el laboratorio principal validado son 27481, 27484, 27482, 27483 y 27400 respectivamente. No mezclar hostname/origen/cookies entre instalaciones.

No demostrar TARJETA, recuperación T01, pagos externos, SUNAT ni impresión física como funciones validadas. El escenario T02 fallido se presenta con su captura y snapshot conservados, sin volver a capturar el pago ni forzar datos.

Esta guía conserva la demostración anterior; no documenta una nueva ejecución al reanudar. Docker Desktop no respondía durante la auditoría. Si no hay motor disponible, presentar las capturas y manifiestos con su procedencia y fechas, sin afirmar que los contenedores están saludables actualmente. El commit documental no es aceptación académica del Lote 5.

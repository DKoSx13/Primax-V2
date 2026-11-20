# Lote 5 — resultados reales de los frontends

Chromium 158.0.8127.36 en Windows Win64 x64, navegación real mediante Playwright. Evidencia: `evidence/lot5-validation/browser-checks.json`, capturas PNG y estados HTTP saneados, sin cookies ni tokens completos. 16 casos agrupados: 15 aprobados, uno fallido. No equivalen a un caso por cada botón o contrato.

| Aplicación | Comprobado | Limitado/no comprobado |
|---|---|---|
| FuelFlow T01 | Interfaz, idioma, identificación T01/surtidor 03, bootstrap y cookies | No se inicia venta ni se intenta recuperación de la incidencia histórica. La instalación sintética no reproduce el estado operativo congelado. |
| FuelFlow T02 | Identidad T02/surtidor 04, combustibles/precios/inventario, Regular, PREPAGO 20, BOLETA, placa/DNI, QR YAPE, captura demo, autorización, abastecimiento simulado, EB01-0001, impresión demo y fin en bienvenida | Recuperar pago pendiente tras recarga falla; no se fuerza. TARJETA no habilitada ni corregida. No surtidor ni cobro físico. |
| OCR → FuelFlow | Cargar fixture ABC-123 por el control de imagen de prueba, servicio OCR real devuelve ABC123 y se confirma la placa en UI | El diálogo intentó abrir cámara; no había cámara física verificada. Una imagen subida no demuestra captura óptica en hardware. |
| Prime | Login, perfil, guardar razón social sintética, membresía, listar y añadir vehículo propio LTV-505, wallet, recarga demo 50, puntos/beneficios, rechazo por puntos insuficientes, logout | No hay recarga bancaria ni canje positivo con puntos reales. Canjes y puntos positivos se cubren con fixtures backend. |
| Control root | Login inválido 401 y válido, selector Primax Sur; clientes, membresías, vehículos, inventario, movimientos, operaciones, terminales, personal/accesos y auditoría; logout | No se recorren todos los formularios mutadores UI. Las escrituras y estados se cubren por familias HTTP en laboratorio. |
| Control Encargado | Login, menú reducido, solo Primax Sur asignada en selector, ausencia de clientes y personal | La segunda estación y rechazos cruzados se verifican con fixture backend; el navegador no simula una segunda estación real. |

Los accesos iniciales 401 a sesión Control y el canje 400 sin puntos son rechazos esperados. El mensaje UI del login Control inválido es genérico sobre permisos; no se afirma que sea una experiencia de error ideal. No hubo errores JavaScript no capturados en el colector; el defecto de recuperación T02 está capturado por la propia UI y por ello no genera `pageerror`.

La primera instalación usa puertos 273xx y conserva perfil, recarga, vehículo y pago pendiente fallido. Quedó detenida. La segunda usa 274xx, datos nuevos, y conserva la venta normal/impresión, sin reutilizar almacenamiento de navegador de la primera. No se presenta como resuelta la recuperación por haber completado otra venta en otra instalación.

## Revisión al reanudar

Los 16 resultados y las capturas ya existían: se cotejaron con `browser-final.json` privado y `screenshots.json`, sin volver a ejecutar acciones ni pagos. La validación Windows queda **aprobada con limitaciones por escenario, con recuperación T02 fallida**; no se describe como aprobación funcional integral. POSTPAGO, canje positivo, registro/reset y formularios administrativos mutadores tienen evidencia backend por familia, pero no un recorrido completo de navegador en este lote. El estado actual de la UI no se revalidó porque Docker Desktop Linux Engine no respondía. Linux/macOS/ARM64 no tienen evidencia de navegador ni runtime.

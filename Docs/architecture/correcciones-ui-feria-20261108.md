# Correcciones UI para revisión — 8 noviembre 2026

Se compararon los PR #9 (`fbc2843`), #10 (`1a146ba`) y #15 (`5305299`) con sus bases y con el worktree de `qa/feria-integration`. El PR #15 parte de #14; solo se trasladó su cambio de cuadrícula, sin repetir #14. El merge principal sigue abierto, sin commit.

| Cambio | Origen | Estado | Comprobación |
|---|---|---|---|
| PNG corporativo Prime, referencias, proporciones y caché por contenido | #9 | Integrado selectivamente | PNG 2172×724 presente en fuente y build; pruebas Prime 28/28; build aprobado |
| PNG Control de acceso y sidebar, fondo transparente y caché | #10 | Integrado selectivamente | Ambos PNG 2172×724 presentes en fuente y build; pruebas Control 27/27; build aprobado |
| Tres métodos prepago centrados y apilados en móvil | #15 | Integrado selectivamente | Métodos Yape/Plin/Tarjeta conservados; pruebas FuelFlow 156/156; build aprobado |
| Modal de asistencia: texto, labels, campos, acciones y estado inicial | Corrección nueva | Resuelto en código | Pruebas FuelFlow 156/156; falta interacción visual |
| Nombres oficiales Clientes y Membresías Prime | Corrección nueva | Resuelto en código | Pruebas Control 27/27; inspección estática |
| Contención de ancho, sidebar móvil y scroll interno de tablas Control | Corrección nueva | Resuelto en CSS | Build aprobado; faltan mediciones visuales 375/558/768/1366 |
| Favicon con recurso local en los tres frontends | Corrección nueva | Resuelto en código | Build y existencia de recursos; falta comprobar en navegador |
| Rotación 409, recuperación, impresión, OCR/cámara y duplicados | QA/Astra anterior | Sin cambio en esta ronda | Pruebas existentes pasan; no se reprodujo un fallo nuevo ni se probó navegador |
| Permisos, reautenticación, inventario y asistencia administrativa | QA anterior | Sin cambio en esta ronda | Pruebas Control pasan; falta flujo funcional en navegador |

El laboratorio `primax-feria-check` estaba saludable al momento de la consulta: PostgreSQL, Redis, cuatro servicios NestJS, API Gateway, OCR, Print Service, gateway FuelFlow y tres frontends. API y las tres páginas devolvieron HTTP 200. Esa consulta prueba disponibilidad de las imágenes existentes, no los cambios UI de esta ronda. No se ejecutaron migraciones, seeds, reinicios ni despliegues.

Para ver estas correcciones en el laboratorio hay que reconstruir `frontend1`, `frontend2` y `frontend3`, únicamente dentro de `primax-feria-check`, después de revisar el diff. No se reconstruyeron en esta ronda. El siguiente control requiere navegador a 375, 558, 768 y 1366 px: medir `document.documentElement.scrollWidth` frente a `innerWidth` en Clientes y Membresías Prime; comprobar que las tablas desplacen solo su panel; abrir asistencia, enviar, consultar, cerrar ventana sin cancelar, cancelar solicitud y reintentar; seleccionar Yape, Plin y Tarjeta; verificar logos y favicons; probar OCR y entrada manual al fallar cámara. También deben probarse prepago, postpago, numeración y finalización con y sin impresión sobre el laboratorio antes de aprobar la feria.

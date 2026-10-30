# 02 — Mapa de componentes

| Directorio | Responsabilidad | Ubicación ejecutable conservada |
| --- | --- | --- |
| `Frontend_1_FuelFlow/` | Autoservicio y operación en surtidor | Fuentes, API, tests y Docker propios |
| `Frontend_2_PrimaxPrime/` | Portal/app del cliente | Fuentes, Android, tests y Docker propios |
| `Frontend_3_PrimaxControl/` | Una sola aplicación con un solo login; UI operacional limitada para Supervisor y UI administrativa para Admin/SuperAdmin según rol, grants y alcance | Fuentes, proxy, API, tests y Docker propios |
| `Backend/` | NestJS, Prisma, autenticación/autorización y reglas de negocio | `Backend/prisma/`, fuentes, tests, scripts y Docker |
| `Database/` | Diseño y documentación PostgreSQL | No reemplaza `Backend/prisma/` |
| `PlateRecognition/` | OCR de placas | Código y tests propios |
| `PrintAgent/` | Impresión local | Código y tests propios |
| `Infrastructure/` | Referencias de Docker, Vercel, Render, Neon, Redis y despliegue | Compose y configuración ejecutable siguen en raíz o componente |
| `Tests/` | Estrategia transversal | Tests ejecutables siguen en componentes; utilidades en `tools/` |
| `Docs/` | Arquitectura, diagramas y despliegue | Referencia V12.1 en `Docs/V12.1-reference/` |

Flujo conceptual de Control: `mismo login → Backend identifica cuenta → rol/grants/alcance → UI adaptativa`. Backend valida además cada permiso y scope.

Flujo conceptual de impresión V2: `FuelFlow → PrintAgent local → impresora física`; el navegador no ofrece impresión funcional. FuelFlow admite únicamente los métodos digitales definidos en `05-payments-and-receipts.md`. La numeración pública de membresía se especifica en `06-prime-membership-numbering.md`.

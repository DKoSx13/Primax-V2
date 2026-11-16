# Identity A.4 3A — compatibilidad OCR, sin cambios de reconocimiento

Fuentes actuales: `services/identity/src/membership-codes/core.ts`,
`Backend/src/vehicles/recognition.service.ts`, copia local Identity,
`PlateRecognition/app.py` y `Frontend_1_FuelFlow/src/js/plateCamera.js`.

Se comparó el filtro regex extraído del AST real de RecognitionService con el
validador canónico de A.4. Python se inspeccionó como fuente; no se ejecutó OCR,
Tesseract, procesamiento de imagen, cámara o HTTP en esta comprobación.

Evidencia actual: `Docs/astra/evidence/identity-a4-phase3a-a4-978d9141e7ee719bd6899650.json`,
sección staticChecks.ocr. No se atribuye ninguna causa de CI a estos resultados.

| Entrada | Canónico A.4 | Filtro Nest actual | Interpretación |
| --- | --- | --- | --- |
| PRIME-001 | Sí | Admite | Prefijo sin bloque alfabético compatible |
| PRIME-A001 | Sí | Rechaza | Bloque alfabético válido, no cubierto por filtro |
| PRIME-AA001 | Sí | Rechaza | Bloque múltiple válido, tampoco cubierto |
| PRIM001A | No | Admite | Puede ser alias histórico; no debe convertirse en otro UUID |
| PRIM-001A | No | Rechaza como texto literal | Puede ser clave de alias A.4; Python elimina guiones y podría producir PRIM001A, una clave distinta |
| PRIM001AA | No | Rechaza | Forma de transporte válida para alias; OCR solo admite un sufijo alfabético en esa rama |
| PRIME-0001 | No | Admite | Filtro más permisivo que sintaxis canónica; posible alias, no prueba de existencia |
| PRIME-000 | No | Admite | No es número generado por A.4; filtro no valida ordinal/existencia |

Todos los textos de esta tabla cumplen la forma general de transporte A.4
[A-Z0-9-]{4,30}. Eso no implica que haya una membresía o alias con esa clave.

El generador produce PRIME-001..999, PRIME-A001..Z999, PRIME-AA001, etc. A.4 separa
esa sintaxis de los alias opacos: nunca repara O/I, elimina guiones o cambia
prefijos para resolver otra identidad. Solo aplica exact o trim-uppercase cuando
el llamador lo elige explícitamente.

Python elimina caracteres ajenos a A-Z0-9, hace una corrección O/I en una rama
PRIM y reconoce PRIM seguido de números y como máximo una letra, o PRIME seguido
solo de números (añadiendo luego guion). No reconoce los bloques alfabéticos
canónicos nuevos y puede cambiar una clave histórica con guiones.

Nest exige el filtro /^PRIM(?:[0-9]+[A-Z]?|E-[0-9]+)$/ y confianza suficiente antes
de consultar. En kind=membership, recognized depende además de Membership.status
ACTIVE del proveedor actual; A.4 3A no contiene ni decide ese estado. El number
exterior es texto capturado y el interior puede ser canónico. Encontrar una clave
en A.4 no permite cambiar recognized a true ni omitir el filtro actual.

FuelFlow revisa/corrige un candidato y vuelve a comprobar membresía/placa en el
backend. La lectura 3A no autentica una compra, verifica Vehicle ni reemplaza esa
comprobación. La proyección {id,number,legacyNumbers} es parcial y privada, no la
respuesta completa de /plate-recognition o /vehicles/:plate.

Pruebas posteriores recomendadas, solo bajo otra autorización: gramática acordada
para bloques A/AA y alias históricos, fixtures de imagen reales sintéticos,
confianza baja/alta, unknown code, estado suspendido, respuesta caída y paridad
del número capturado frente al canónico. Corregir solo el regex Nest no basta si
Python no puede producir el código o lo transforma. No modificar silenciosamente
normalización, contratos públicos ni interpretación de aliases históricos.

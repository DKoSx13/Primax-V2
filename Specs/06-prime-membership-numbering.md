# 06 — Numeración pública de membresía Prime

## 1. Identificadores

Cada membresía conserva un **ID interno estable** como primary key (por ejemplo, UUID). El código `PRIME-...` es un identificador público adicional y no reemplaza ni se usa como primary key o relación interna.

La secuencia interna es numérica (1, 2, 3, …, 999, 1000, …), independiente del texto público, y se gestiona de forma atómica mediante un contador/secuencia interna de PostgreSQL. La asignación no se obtiene buscando el último código y sumando uno. Conceptualmente: `next sequence number → formatter PRIME`. No se especifica aquí el mecanismo concreto de implementación o migración.

## 2. Formato y secuencia

La secuencia pública comienza con:

- 1–999: `PRIME-001` … `PRIME-999`.
- 1000–1998: `PRIME-A001` … `PRIME-A999`.
- 1999–2997: `PRIME-B001` … `PRIME-B999`.
- Continúa con bloques de una letra hasta `PRIME-Z999`.
- Después continúa con prefijos alfabéticos de dos o más letras, en orden lexicográfico tipo odómetro: `PRIME-AA001` … `PRIME-AZ999`, `PRIME-BA001` …; cada prefijo dispone de sufijos `001` a `999`.

Ejemplos aprobados:

| Secuencia | Código público |
| ---: | --- |
| 1 | `PRIME-001` |
| 999 | `PRIME-999` |
| 1000 | `PRIME-A001` |
| 1998 | `PRIME-A999` |
| 1999 | `PRIME-B001` |

El formatter convierte el número interno según los bloques anteriores. La unicidad del código público debe estar garantizada. El contador avanza sin colisiones al agotarse cada bloque y el código emitido permanece estable, salvo decisión futura explícita. Cambiar el formato futuro no debe romper relaciones ni historial.

## 3. Criterios de aceptación

1. Membresía muestra un código público `PRIME-...` conforme a la secuencia.
2. La secuencia continúa correctamente al superar `PRIME-999` y produce los ejemplos aprobados.
3. El código público no es la primary key y las relaciones usan el ID interno estable.
4. La secuencia numérica interna de PostgreSQL asigna el siguiente valor atómicamente; no se usa `último número + 1`.
5. La unicidad del código público queda garantizada y la primary key permanece independiente.
6. El contador/secuencia permite cambiar el formato futuro sin romper relaciones ni historial.

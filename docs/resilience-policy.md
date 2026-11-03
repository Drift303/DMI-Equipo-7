
# Política de resiliencia — Semana 9

## Proveedor de ubicación

`selectIncidentLocation` en `src/course-evaluation/index.ts` acepta una respuesta del proveedor solamente si es un objeto no nulo y no es un arreglo, su etiqueta contiene texto y sus coordenadas son números finitos dentro de latitud `[-90, 90]` y longitud `[-180, 180]`. La etiqueta se recorta antes de guardarse.

Cuando la respuesta está ausente, incompleta o tiene tipos/valores inválidos (incluido un objeto de error HTTP como 429), se usa la etiqueta manual recortada. Si también está vacía, se usa `Ubicación manual`. La ubicación manual no incluye coordenadas: no se inventan ni se reutilizan coordenadas dudosas. El llamador debe conservar la ubicación para que una persona pueda identificar el incidente.

No hay caché de ubicaciones implementada en este flujo. Por lo tanto, no se presenta una ubicación almacenada como si fuera el resultado actual del proveedor.

## Política de reintentos

`planRetry` decide si se puede volver a intentar una petición tras un error temporal.

- Se consideran transitorios timeout, HTTP 408, 429 y errores 5xx.
- No se permite otro reintento cuando `attempt >= 4`.
- GET puede reintentarse ante un error transitorio.
- POST necesita una clave de idempotencia estable y no vacía; se debe conservar la misma clave y el mismo payload durante la operación.
- Se respeta un `Retry-After` válido; si falta o no es válido, la demora es cero.

Ante una respuesta perdida después de guardar un POST, el resultado es incierto hasta consultar o repetir de forma segura con la misma identidad. No se debe generar una operación nueva con otra clave. La integración HTTP, la caché y la inyección de fallos de red no forman parte del adaptador puro actual.

## Evidencia y límites

`reports/week-09/fault-injection.json` registra timeout, 429, respuesta incompleta y respuesta perdida. Las pruebas unitarias del adaptador verifican decisiones para valores de entrada, pero no simulan una falla HTTP real, una respuesta perdida posterior al guardado ni una repetición contra el backend. Esos escenarios se mantienen como no ejecutados y no se reportan como aprobados.

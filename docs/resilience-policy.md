# Política de resiliencia — Semana 9 (avance)

## Alcance implementado

Este avance implementa dos adaptadores puros en `src/course-evaluation/index.ts`: `selectIncidentLocation` valida una respuesta de ubicación y conserva una etiqueta manual como fallback; `planRetry` decide si un error transitorio puede reintentarse, respeta un `Retry-After` numérico finito y bloquea un `POST` sin una clave de idempotencia no vacía.

Esto todavía no es la integración completa de la actividad. No se conectó un proveedor externo ni un caché, la interfaz no se modificó para capturar ubicación, y la respuesta perdida después de que el backend guarda no se reprodujo en esta verificación.

## Ubicación y fallback manual

- Se acepta la respuesta del proveedor solo si es un objeto con una etiqueta textual no vacía y latitud/longitud numéricas finitas dentro de los rangos públicos.
- Para una respuesta nula, incompleta o inválida, el adaptador devuelve la etiqueta manual y no inventa coordenadas.
- La prueba pública cubre una respuesta válida, valores nulos/incompletos y coordenadas fuera de rango.
- Pendiente: integrar proveedor y caché, conectar el adaptador HTTP para timeout/429/desconexión y habilitar la captura manual desde la interfaz.

## Reintentos

- Los errores considerados transitorios por el adaptador son timeout, 408, 429 y estados 5xx.
- No se reintenta desde el intento 4 inclusive.
- Un `POST` no se reintenta sin una clave de idempotencia no vacía.
- Si se proporciona un `Retry-After` numérico finito y no negativo, se devuelve ese valor como demora; en otros casos esta implementación devuelve 0.
- Pendiente: backoff progresivo, límites configurables y medición de tiempos observados. La demora actual de 0 cuando no hay `Retry-After` no satisface por sí sola el requisito de esperas progresivas.

## Respuesta perdida tras guardar

La suite pública comprueba que la política permite reintentar un `POST` con una clave estable, pero no simula que el backend guarde una operación y luego pierda la respuesta. Por lo tanto, todavía no hay evidencia de que una repetición real conserve también el mismo contenido ni de que el backend evite duplicar eventos, evidencias o notificaciones.

Antes de repetir una escritura, el flujo integrado debe conservar exactamente la misma clave y payload. Si no puede garantizarlo, debe informar el resultado incierto en vez de enviar una operación nueva.

## Verificación y pendientes

Verificación realizada: `npm run typecheck`, `npx eslint src/course-evaluation/index.ts` y `npx jest --no-watchman --cacheDirectory .jest-cache --runInBand course-tests/public/week-09.test.ts`. La suite pública pasó 4 pruebas.

La prueba pública no demuestra por sí sola proveedor/caché, fallos HTTP reales, integración de interfaz ni respuesta perdida tras guardar. Esos escenarios, la medición temporal y la evidencia real de cada integrante siguen pendientes.

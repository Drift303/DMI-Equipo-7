
# Política de resiliencia — Semana 9

## Alcance implementado

En esta semana se implementó la función `planRetry` en `src/course-evaluation/index.ts`, encargada de decidir cuándo se puede volver a intentar una petición después de un error temporal.

La función respeta el tiempo indicado por `Retry-After`, limita los reintentos y evita repetir peticiones POST cuando no existe una clave de idempotencia.

## Política de reintentos

- Se consideran errores temporales los timeout, los códigos HTTP 408, 429 y los errores 5xx.
- No se permiten reintentos cuando el número de intento es 4 o superior.
- Las peticiones GET pueden reintentarse cuando ocurre un error temporal.
- Las peticiones POST necesitan una clave de idempotencia estable y no vacía para permitir un nuevo intento.
- Cuando existe un valor válido de `Retry-After`, se respeta exactamente el tiempo indicado.
- Si `Retry-After` no está disponible o no es válido, la función utiliza una demora de 0 milisegundos.

## Protección contra operaciones duplicadas

Para evitar que una petición POST genere operaciones duplicadas, se requiere utilizar la misma clave de idempotencia en los reintentos.

La clave debe mantenerse estable durante toda la operación. Si no existe una clave válida, el reintento se rechaza.

## Límite de reintentos

La función establece un máximo de cuatro intentos. Cuando `attempt >= 4`, devuelve `retry: false` y una demora de cero milisegundos.

Esto evita que una petición continúe reintentándose indefinidamente.

## Fallback y manejo de errores

Cuando una petición no puede volver a intentarse, el flujo debe detener los intentos y comunicar que la operación no pudo completarse.

Si se trata de un POST y se perdió la respuesta después de que el servidor guardó la información, no se debe generar una nueva operación con otra clave. Se debe conservar la misma clave y el mismo contenido para consultar o repetir la operación de forma segura.

Si no se puede garantizar lo anterior, se debe informar que el resultado es incierto.

## Métricas y verificación

En `reports/week-09/retry-metrics.json` se registran los escenarios de reintento, los tiempos de espera y las decisiones tomadas.

Las pruebas públicas verifican:

- Que una respuesta 429 con `Retry-After` de 800 milisegundos respete ese tiempo.
- Que no se permita reintentar desde el cuarto intento.
- Que un POST sin clave de idempotencia no se repita.
- Que un POST con una clave estable pueda reintentarse ante un error temporal.

## Pendientes

Todavía falta integrar los reintentos con las peticiones HTTP reales, comprobar la respuesta perdida después de guardar una operación y medir los tiempos de espera reales.

También queda pendiente implementar backoff progresivo cuando no se proporciona `Retry-After`.

# Política de resiliencia — Semana 9

## Proveedor, adaptador y caché

La app usa por defecto **Open-Meteo Geocoding API** (`/v1/search`) mediante `GeocodingClient`. El adaptador convierte el primer resultado a `{ label, latitude, longitude }`; una respuesta vacía, incompleta o inválida no produce coordenadas utilizables. Configure `EXPO_PUBLIC_GEOCODING_PROVIDER=campusops` para usar el doble local `GET /v1/geocoding` en pruebas reproducibles. El doble devuelve datos sintéticos y nunca busca lugares reales.

La consulta externa ejecutada con el término ficticio `CampusOps synthetic test building` respondió correctamente sin `results`; la app la trata como ausencia de coincidencia y conserva el texto manual. La consulta no incluyó datos de una persona ni de una incidencia.

Open-Meteo no requiere clave para uso educativo no comercial. Sus términos publicados limitan el servicio gratuito a menos de 10 000 llamadas por día, 5 000 por hora y 600 por minuto, exigen uso no comercial y aplican CC BY 4.0. El proveedor no garantiza exactitud, disponibilidad ni operación ininterrumpida. Una aplicación comercial o con mayor volumen debe usar la suscripción y el endpoint de cliente; no se debe enviar descripción de incidentes, identidad ni otra información personal en la consulta. Véanse [documentación de geocodificación](https://open-meteo.com/en/docs/geocoding-api), [términos](https://open-meteo.com/en/terms) y [licencia](https://open-meteo.com/en/licence).

La caché es en memoria, por consulta normalizada, con TTL de cinco minutos para coincidencias y 30 segundos para una respuesta válida sin coincidencias; mantiene un máximo de 50 entradas LRU. Los errores y respuestas incompletas no se almacenan. Las solicitudes simultáneas para la misma consulta comparten la solicitud activa. La caché no reemplaza la entrada manual ni persiste después de cerrar la app.

## Ubicación manual

El panel **Ubicación del incidente** permite escribir un edificio, zona o referencia sin llamar al proveedor. Consultar geocodificación conserva ese texto como alternativa. Un timeout, desconexión, HTTP 429 u otro error se presenta como proveedor no disponible y mantiene la entrada manual. `selectIncidentLocation` sólo acepta una etiqueta no vacía y coordenadas numéricas finitas dentro de latitud `[-90, 90]` y longitud `[-180, 180]`; cualquier dato incompleto o inválido vuelve a `{ source: 'manual', label }`, sin coordenadas inventadas.

La interfaz muestra coordenadas únicamente cuando provienen de un resultado validado. Si la persona no conoce un edificio exacto, puede escribir una referencia textual; no se geocodifica ni se completa con coordenadas supuestas.

## Reintentos y respuesta perdida

`planRetry` configura hasta cuatro intentos totales; un fallo en el intento 4 nunca inicia otro. El backoff predeterminado es progresivo: 250, 500 y 1000 ms, con tope configurable de 30 000 ms. Un `Retry-After` válido tiene prioridad si cabe en el tope; si pide esperar más que el máximo configurado, no se reintenta antes de tiempo y se informa el fallo. Se reintentan timeout, desconexión, HTTP 408, 429 y 5xx; errores de contrato, 4xx no transitorios, conflictos de versión y falta de autorización no se repiten.

GET puede repetirse porque no modifica el servidor. POST sólo se repite con una clave de idempotencia estable. El cliente serializa el contenido antes de empezar y conserva exactamente el mismo cuerpo y la misma clave en cada intento. Si la respuesta se pierde, se informa incertidumbre hasta que el replay con esa misma identidad resuelva el resultado; no se crea una clave nueva.

Los límites se pueden reducir por `retryPolicy` en los adaptadores para pruebas. El observador opcional `onRetryMetrics` recibe sólo método, cantidad de intentos, duraciones por intento, esperas, duración total y resultado. No recibe consulta, ubicación, coordenadas, identidad de operación, cuerpo ni credenciales. No se registran datos sensibles.

### Decisión ante fallos

- **Reintentar:** sólo ante fallo transitorio y dentro de los límites; POST requiere identidad idempotente.
- **Usar alternativa:** si geocodificación expira, se desconecta, limita solicitudes o devuelve datos inválidos, conservar el texto manual y continuar sin coordenadas.
- **Informar fallo:** detenerse ante límite agotado, `Retry-After` mayor al máximo, errores no transitorios, conflicto o POST sin clave; no afirmar éxito cuando el resultado siga incierto.

## Reproducción local

Ejecutar `npm run backend:self-test` para probar el doble controlado, incluidos éxito, datos incompletos/incorrectos, 429, respuesta perdida posterior al guardado, replay idempotente y ausencia de un segundo evento de cierre. Ejecutar:

```powershell
npx jest --no-watchman --cacheDirectory .jest-cache --runInBand course-tests/week-09.location.test.ts course-tests/week-09.resilience.integration.test.ts course-tests/public/week-09.test.ts course-tests/week-09.fallback.angel.test.ts
```

La prueba de integración limita el timeout del cliente, aborta la primera respuesta de cierre después del commit y comprueba que la repetición usa la misma clave y el mismo cuerpo y deja una sola entrada `close` en el historial. El backend didáctico no ofrece un endpoint de notificaciones, por lo que la evidencia no atribuye una garantía sobre notificaciones que el doble no modela.

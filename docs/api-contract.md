# Contrato del cliente cloud de CampusOps

## Consultas

El cliente usa `GET /v1/incidents` para consultar la lista de incidencias.
Para consultar el detalle usa:
`GET /v1/incidents/:id`
Si el identificador está vacío, el cliente no realiza la consulta y devuelve `null`.

## Creación
La creación usa:
`POST /v1/incidents`

El cuerpo enviado es JSON con la forma:

```json
{
  "category": "connectivity",
  "description": "Falla ficticia",
  "location": "Edificio de prueba A"
}
```
`category` debe pertenecer al vocabulario del dominio. `description` y `location` no pueden estar vacíos.

Cada creación requiere un `Idempotency-Key` de al menos 8 caracteres. La clave se envía como encabezado para identificar de forma estable la operación.

## Autorización e identidad

Las solicitudes incluyen:
`Authorization: Bearer course-valid-token`

También incluyen:
`X-Course-Actor: reporter-1`
Estos valores forman parte de los encabezados que agrega el cliente HTTP a las solicitudes.

## Respuesta remota
El sobre remoto de una incidencia tiene la forma:

```json
{
  "id": "campus-inc-001",
  "version": 1,
  "status": "assigned",
  "payload": {
    "category": "connectivity",
    "description": "Falla ficticia",
    "location": "Edificio de prueba A"
  }
}
```
El cliente valida que:
* `id` sea un texto no vacío.
* `version` sea un entero mayor o igual a cero.
* `status` sea un texto no vacío.
* `payload` sea un objeto o `null`.

Los campos adicionales del sobre se ignoran para mantener compatibilidad con futuras versiones.
Un payload válido se transforma al modelo local `Incident`. El título se genera usando el identificador porque el backend didáctico no lo envía directamente.

## Payload nulo
`payload: null` es una respuesta remota válida, pero no contiene información suficiente para construir una incidencia.
En este caso el cliente genera un error de tipo `empty` y no inventa información.

## Datos mal formados
Si la respuesta no cumple el contrato esperado, el cliente genera un error de tipo `contract`.
Por ejemplo, una versión textual en lugar de un entero:

```json
{
  "id": "campus-inc-001",
  "version": "1",
  "status": "assigned",
  "payload": null
}
```
También se rechazan objetos, arreglos o valores que no tengan la estructura esperada.

## Errores HTTP
Cuando el servidor responde con un código HTTP no exitoso, el cliente genera un error de tipo `http` y conserva el código recibido.
Por ejemplo, una respuesta `500` se representa como:

`IncidentCloudError { kind: "http", status: 500 }`

## Timeout
El cliente utiliza un timeout local de 1000 ms por defecto.
Si la solicitud es abortada por timeout, el error se representa como:

`IncidentCloudError { kind: "timeout" }`
Los errores de transporte diferentes a timeout se representan como `network`.

## Validación antes de exponer datos
El cliente no entrega directamente a la aplicación una respuesta remota sin validar. Primero comprueba el contrato del sobre y después valida que los datos puedan convertirse al modelo `Incident`.
Los escenarios de respuesta válida, payload nulo, datos mal formados, timeout y HTTP 500 se cubren mediante las pruebas de Semana 5.

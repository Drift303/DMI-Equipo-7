# Contrato del cliente cloud de CampusOps

## Solicitudes

El cliente usa `GET /v1/incidents` para consultar la lista y `GET /v1/incidents/:id` para consultar el detalle. Las solicitudes incluyen `Authorization: Bearer course-valid-token` y `X-Course-Actor` con una identidad sintética del backend didáctico.

La creación usa `POST /v1/incidents` con JSON `{ category, description, location }`. `category` debe pertenecer al vocabulario del dominio, y `description` y `location` no pueden estar vacíos. Cada escritura incluye un `Idempotency-Key` estable de al menos ocho caracteres.

## Respuesta remota y modelo de aplicación

El sobre remoto de una incidencia tiene la forma `{ id, version, status, payload }`. El cliente valida que `id` y `status` sean textos no vacíos, que `version` sea un entero no negativo y que `payload` sea un objeto o `null`. Los campos futuros del sobre se ignoran.

El cliente transforma un payload válido al modelo local `Incident`: `id`, `title`, `description`, `category`, `locationLabel` y `status`. El título se deriva del identificador porque el backend didáctico no lo envía. El cliente valida de nuevo la categoría y el estado contra el dominio antes de exponer el objeto a los casos de uso.

Un `payload: null` es un resultado remoto válido, pero no contiene datos suficientes para construir una incidencia. Se representa como error `empty`; el cliente no inventa valores.

## Errores

`IncidentCloudError.kind` distingue:

- `contract`: JSON inválido, sobre inválido o payload incompatible con el dominio.
- `empty`: payload nulo válido sin datos de incidencia.
- `http`: respuesta no exitosa, conservando el código HTTP para diferenciar 500, 403, 404 y otros.
- `timeout`: la solicitud superó el límite local y fue abortada.
- `network`: fallo de transporte distinto de timeout.

El adaptador HTTP aplica un timeout local, captura errores de transporte y nunca entrega una respuesta sin validar a la interfaz. Los escenarios `success`, `nullable`, `malformed`, `slow` y `server_error` se prueban con el backend didáctico y dobles de respuesta, sin depender de Internet público.

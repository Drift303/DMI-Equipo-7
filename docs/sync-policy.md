# Política de sincronización — Semana 8

Implementación: [merge.ts](../src/campusops/sync/merge.ts), [syncEngine.ts](../src/campusops/sync/syncEngine.ts), [syncRemote.ts](../src/api/syncRemote.ts). Pruebas: [week-08.sync.test.ts](../course-tests/week-08.sync.test.ts) y [week-08.test.ts](../course-tests/public/week-08.test.ts).

## Qué se conserva, qué se combina, qué requiere resolución

| Situación | Regla | Prueba |
|---|---|---|
| Cambios en campos distintos desde la misma base | Se **combinan** (merge de tres vías por campo; sin mutar entradas) | `merges independent field changes…`, `exports del adaptador…` |
| Mismo campo con el mismo contenido en ambos lados | Se toma ese contenido (sin conflicto) | `compara por contenido JSON…` |
| Mismo campo con contenido distinto | **Conflicto**; campos en orden de nombre; no se sobrescribe lo remoto ni se borra la intención local | `reasignación remota vs inicio local…` |
| Reasignación remota + inicio local (`work` = asignado + estado) | Conflicto sobre `work`; la entrada pasa a `state: conflict` y sigue en la cola | prueba con servidor simulado y con backend real |
| Técnico ya no ve la incidencia (403 al leer) y estaba asignado en la base | Conflicto `assignment_lost`; se conserva la operación | `coordinación reasigna mientras…` (backend real) |

Un conflicto requiere resolución explícita (reabrir la entrada tras decidir con coordinación); el sistema nunca impone la asignación antigua ni descarta la nueva.

## Autorización

Se mantiene la de la semana 6: el técnico sólo ejecuta `start`/`resolve` sobre incidencias asignadas a él; coordinación asigna, prioriza, cierra y reabre; comentar/evidencia requiere visibilidad. `isAuthorized` evita enviar escrituras prohibidas; el servidor sigue siendo la autoridad (403). Una operación rechazada queda como `rejected` y **no se borra**. Sólo se procesan operaciones del actor autenticado.

## Identidad estable y deduplicación

- `operationId` se asigna al crear la operación y no cambia al reintentar ni al reiniciar.
- `enqueue` y `deduplicateOperations` conservan la **primera** operación por `operationId`.
- El servidor recibe `operationId` como `Idempotency-Key`; una repetición devuelve `duplicate: true` sin repetir el efecto.
- `sentVersion` fija la `baseVersion` del primer envío para que un reintento (por ejemplo tras perder la respuesta) sea idéntico y el servidor lo reconozca como duplicado.

## Reintento y retiro de la cola

- Error de red/timeout: la operación sigue `pending` (`attempts + 1`).
- 409 en el primer envío: `conflict`. 409 en un reintento con `sentVersion`: se recalcula en la siguiente sincronización.
- 403: `rejected` (o `conflict` si se perdió la asignación).
- **Sólo `applied` o `duplicate` confirmados por el servidor retiran la operación**, una a una, justo después de la confirmación.

## Límites conocidos

- La política de conflicto es por campo de nivel superior (`work` se trata como una unidad).
- La resolución manual del conflicto en la interfaz no está implementada; la cola conserva los datos para ello.
- El adaptador nativo de almacenamiento (SQLite/AsyncStorage) no está incluido.

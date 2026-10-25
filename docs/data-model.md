# Modelo de datos local — Semana 8

Todos los datos son ficticios (contrato público `docs/CAMPUSOPS_API.md`).

## Almacenamiento y versión de esquema

- **Versión de esquema actual: 2** (`CURRENT_SCHEMA_VERSION`, [operationQueue.ts](../src/campusops/sync/operationQueue.ts)).
- Almacén: interfaz `AtomicStore` ([store.ts](../src/campusops/sync/store.ts)) con `readAll()` y `commit(writes, removals)`. Un `commit` se aplica completo o no se aplica.
- Implementaciones: `MemoryAtomicStore` (pruebas, con inyección de fallo) y `FileAtomicStore` ([fileStore.ts](../src/campusops/sync/fileStore.ts), archivo en disco: escribe un temporal y lo renombra, por lo que un cierre no deja un commit a medias). En el dispositivo, un adaptador (SQLite con transacción o AsyncStorage con clave de versión) debe cumplir el mismo contrato; **ese adaptador nativo no está incluido** y es riesgo residual.

| Clave | Contenido (esquema 2) |
|---|---|
| `schemaVersion` | `"2"` |
| `incidents` | Lista de `LocalIncident`: `id`, `version`, `status`, `assignedTechnicianId`, `priority?` |
| `queue` | Lista de `QueueEntry` (cola persistente) |

## Entidades y relaciones

- **LocalIncident** (1) — (N) **QueueEntry** por `incidentId`.
- **QueueEntry** = `PendingIncidentOperation` + datos de sincronización:
  - `operationId` — identidad estable; se usa como `Idempotency-Key`.
  - `incidentId`, `actorId` (autor), `action`, `payload` (`note`, `photoRefs[]`, …).
  - `baseVersion` — versión de la incidencia en la que se basó el cambio.
  - `baseWork` — `{ assignedTechnicianId, status }` en esa versión (base del merge de tres vías).
  - `state` — `pending | conflict | rejected`; `attempts`; `detail`; `sentVersion` (versión del primer envío, reutilizada en reintentos).
- `photoRefs` identifica un recurso pendiente; **no** prueba que la imagen se haya subido.

## Esquema 1 (anterior)

`schemaVersion: "1"`, `incidents` igual y una lista `pending` con `{ id, incidentId, authorId, action, note?, photoRef? }` sin versión base.

## Migración 1 → 2 y recuperación

`migrateStore` ([operationQueue.ts](../src/campusops/sync/operationQueue.ts)):

1. Lee todo el estado v1.
2. Calcula **en memoria** el estado v2: `id → operationId`, `authorId → actorId`, `photoRef → payload.photoRefs[]`, y `baseVersion`/`baseWork` desde la incidencia local.
3. Escribe `schemaVersion`, `incidents` y `queue` y elimina `pending` en **un solo** `commit` atómico.

Si falla en cualquier paso (antes o durante el commit), el almacén queda exactamente en v1: nunca hay mezcla. Para recuperar basta volver a llamar `migrateStore`/`OperationQueue.load()`. Una versión desconocida (> 2) se rechaza sin modificar datos.

Estados observados (pruebas en [week-08.sync.test.ts](../course-tests/week-08.sync.test.ts)):

| Momento | `schemaVersion` | Cola |
|---|---|---|
| Antes | `1` | `pending` con `op-legacy-1` |
| Después de la falla inyectada | `1` (idéntico byte a byte) | `pending` con `op-legacy-1` |
| Después de recuperar | `2` | `queue` con `op-legacy-1` (mismo id, nota y foto) |

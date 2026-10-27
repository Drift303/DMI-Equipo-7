
/**
 * Pruebas individuales de migración para la semana 8.
 * Comprueba que las operaciones pendientes se conserven
 * y que un fallo permita recuperar los datos originales.
 */

import {
  CURRENT_SCHEMA_VERSION,
  migrateStore,
} from '../src/campusops/sync/operationQueue';
import { MemoryAtomicStore } from '../src/campusops/sync/store';

function createLegacyStore(): MemoryAtomicStore {
  return new MemoryAtomicStore({
    schemaVersion: '1',
    incidents: JSON.stringify([
      {
        id: 'campus-inc-001',
        version: 3,
        status: 'assigned',
        assignedTechnicianId: 'technician-1',
      },
    ]),
    pending: JSON.stringify([
      {
        id: 'op-vanne-migration-01',
        incidentId: 'campus-inc-001',
        authorId: 'technician-1',
        action: 'comment',
        note: 'Comentario pendiente de conservar',
        photoRef: 'photo-pending-01',
      },
    ]),
  });
}

describe('Pruebas individuales de migración semana 8', () => {
  test('conserva el identificador y el contenido de la operación pendiente', async () => {
    const store = createLegacyStore();

    await expect(migrateStore(store)).resolves.toBe(
      CURRENT_SCHEMA_VERSION,
    );

    const data = await store.readAll();
    const queue = JSON.parse(data.queue ?? '[]');

    expect(data.schemaVersion).toBe('2');
    expect(data.pending).toBeUndefined();
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({
      operationId: 'op-vanne-migration-01',
      incidentId: 'campus-inc-001',
      actorId: 'technician-1',
      action: 'comment',
      baseVersion: 3,
      baseWork: {
        assignedTechnicianId: 'technician-1',
        status: 'assigned',
      },
      payload: {
        note: 'Comentario pendiente de conservar',
        photoRefs: ['photo-pending-01'],
      },
    });
  });

  test('conserva intactos los datos originales tras un fallo y permite reintentar', async () => {
    const store = createLegacyStore();
    const originalData = await store.readAll();

    await expect(
      migrateStore(store, { failAfterStep: 'queue' }),
    ).rejects.toThrow('injected migration failure');

    // El estado original debe permanecer exactamente igual.
    expect(await store.readAll()).toEqual(originalData);

    // Se reintenta la migración sobre el mismo almacén.
    await expect(migrateStore(store)).resolves.toBe(
      CURRENT_SCHEMA_VERSION,
    );

    const recoveredData = await store.readAll();
    const recoveredQueue = JSON.parse(recoveredData.queue ?? '[]');

    expect(recoveredData.schemaVersion).toBe('2');
    expect(recoveredData.pending).toBeUndefined();
    expect(recoveredQueue).toHaveLength(1);
    expect(recoveredQueue[0]).toMatchObject({
      operationId: 'op-vanne-migration-01',
      incidentId: 'campus-inc-001',
      payload: {
        note: 'Comentario pendiente de conservar',
        photoRefs: ['photo-pending-01'],
      },
    });
  });
});

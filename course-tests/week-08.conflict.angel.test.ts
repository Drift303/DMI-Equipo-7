import { deduplicateOperations, resolveSync } from '../src/campusops/sync/merge';
import { OperationQueue } from '../src/campusops/sync/operationQueue';
import { MemoryAtomicStore } from '../src/campusops/sync/store';
import { syncQueue, type SyncRemote } from '../src/campusops/sync/syncEngine';

test('conserva la primera operación repetida y no modifica la entrada', () => {
  const first = { operationId: 'angel-op-001', payload: { note: 'primera intención' } };
  const operations = [
    first,
    { operationId: 'angel-op-001', payload: { note: 'reintento distinto' } },
    { operationId: 'angel-op-002', payload: { note: 'otra operación' } },
  ];
  const snapshot = structuredClone(operations);

  const result = deduplicateOperations(operations);

  expect(result).toEqual([first, operations[2]]);
  expect(result[0]).toBe(first);
  expect(operations).toEqual(snapshot);
});

test('declara conflicto cuando local y remoto cambian distinto el mismo campo', () => {
  const base = {
    id: 'campus-inc-001',
    version: 1,
    fields: {
      work: { assignedTechnicianId: 'technician-1', status: 'assigned' },
      priority: 'medium',
    },
  };
  const local = {
    ...base,
    fields: {
      work: { assignedTechnicianId: 'technician-1', status: 'assigned' },
      priority: 'high',
    },
  };
  const remote = {
    ...base,
    version: 2,
    fields: {
      work: { assignedTechnicianId: 'technician-1', status: 'assigned' },
      priority: 'low',
    },
  };
  const before = structuredClone([base, local, remote]);

  expect(resolveSync(base, local, remote)).toEqual({
    kind: 'conflict',
    fields: ['priority'],
  });
  expect([base, local, remote]).toEqual(before);
});

test('termina la sincronización sin operaciones pendientes sin llamar al remoto', async () => {
  const queue = new OperationQueue(new MemoryAtomicStore());
  await queue.load();

  const remote: SyncRemote = {
    fetchIncident: jest.fn(),
    submit: jest.fn(),
  };

  await expect(
    syncQueue(queue, remote, { actorId: 'technician-1', role: 'technician' }),
  ).resolves.toEqual({
    confirmed: [],
    conflicts: [],
    rejected: [],
    stillPending: [],
  });

  expect(remote.fetchIncident).not.toHaveBeenCalled();
  expect(remote.submit).not.toHaveBeenCalled();
});
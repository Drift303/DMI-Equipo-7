/**
 * @jest-environment node
 */
import { spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { HttpSyncRemote } from '../src/api/syncRemote';
import { FileAtomicStore } from '../src/campusops/sync/fileStore';
import { deduplicateOperations, resolveSync } from '../src/campusops/sync/merge';
import {
  CURRENT_SCHEMA_VERSION,
  OperationQueue,
  migrateStore,
  type NewOperation,
} from '../src/campusops/sync/operationQueue';
import { MemoryAtomicStore } from '../src/campusops/sync/store';
import { isAuthorized, syncQueue, type SyncRemote } from '../src/campusops/sync/syncEngine';
import * as evaluation from '../src/course-evaluation';

// Plain node:http client so the real-backend tests do not depend on the Expo fetch polyfill.
const nodeFetch: typeof fetch = (input, init) => new Promise((resolve, reject) => {
  const request = http.request(
    String(input),
    { method: init?.method ?? 'GET', headers: init?.headers as http.OutgoingHttpHeaders },
    (response) => {
      let text = '';
      response.setEncoding('utf8');
      response.on('data', (chunk: string) => { text += chunk; });
      response.on('end', () => {
        const status = response.statusCode ?? 0;
        resolve({ ok: status >= 200 && status < 300, status, json: async () => JSON.parse(text) } as Response);
      });
    },
  );
  request.on('error', reject);
  request.end(typeof init?.body === 'string' ? init.body : undefined);
});

const baseWork = { assignedTechnicianId: 'technician-1', status: 'assigned' };

function startOperation(operationId: string, overrides: Partial<NewOperation> = {}): NewOperation {
  return {
    operationId,
    incidentId: 'campus-inc-001',
    actorId: 'technician-1',
    action: 'start',
    baseVersion: 1,
    baseWork,
    payload: { note: 'Inicio sin conexiÃƒÆ’Ã‚Â³n', photoRefs: ['pending-photo-1'] },
    ...overrides,
  };
}

function legacyStore(): MemoryAtomicStore {
  return new MemoryAtomicStore({
    schemaVersion: '1',
    incidents: JSON.stringify([
      { id: 'campus-inc-001', version: 1, status: 'assigned', assignedTechnicianId: 'technician-1' },
    ]),
    pending: JSON.stringify([
      { id: 'op-legacy-1', incidentId: 'campus-inc-001', authorId: 'technician-1', action: 'comment', note: 'nota previa', photoRef: 'pending-photo-9' },
    ]),
  });
}

describe('resolveSync / deduplicateOperations (lÃƒÆ’Ã‚Â³gica real, sin mutar)', () => {
  test('exports del adaptador delegan en la lÃƒÆ’Ã‚Â³gica real de CampusOps', () => {
    expect(evaluation.resolveSync).toBeDefined();
    const base = { id: 'r', version: 1, fields: { a: 1, b: { x: 1 } } };
    const local = { id: 'r', version: 1, fields: { a: 2, b: { x: 1 } } };
    const remote = { id: 'r', version: 2, fields: { a: 1, b: { x: 3 } } };
    expect(evaluation.resolveSync(base, local, remote)).toEqual(resolveSync(base, local, remote));
    expect(resolveSync(base, local, remote)).toEqual({ kind: 'merged', fields: { a: 2, b: { x: 3 } } });
  });

  test('compara por contenido JSON y ordena los campos en conflicto', () => {
    const base = { id: 'r', version: 1, fields: { z: { k: [1] }, a: 1, m: 1 } };
    const local = { id: 'r', version: 1, fields: { z: { k: [2] }, a: 5, m: 1 } };
    const remote = { id: 'r', version: 2, fields: { z: { k: [3] }, a: 6, m: 1 } };
    expect(resolveSync(base, local, remote)).toEqual({ kind: 'conflict', fields: ['a', 'z'] });
    const sameChange = { id: 'r', version: 2, fields: { z: { k: [2] }, a: 5, m: 1 } };
    expect(resolveSync(base, local, sameChange)).toEqual({ kind: 'merged', fields: { z: { k: [2] }, a: 5, m: 1 } });
  });

  test('deduplicateOperations conserva la primera y no muta', () => {
    const first = { operationId: 'op-1', value: 'primera' };
    const input = [first, { operationId: 'op-1', value: 'repetida' }, { operationId: 'op-2', value: 2 }];
    const snapshot = JSON.stringify(input);
    const output = deduplicateOperations(input);
    expect(output).toHaveLength(2);
    expect(output[0]).toBe(first);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

describe('cola persistente y reinicio', () => {
  test('recupera identidad y contenido despuÃƒÆ’Ã‚Â©s de cerrar y reabrir (archivo en disco)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'campusops-queue-'));
    const file = path.join(dir, 'db.json');
    try {
      const first = new OperationQueue(new FileAtomicStore(file));
      await first.load();
      await first.enqueue(startOperation('op-restart-1'));
      await first.enqueue(startOperation('op-restart-1', { payload: { note: 'duplicada' } }));

      const reopened = new OperationQueue(new FileAtomicStore(file));
      await reopened.load();
      expect(reopened.list()).toHaveLength(1);
      expect(reopened.list()[0]).toMatchObject({
        operationId: 'op-restart-1',
        incidentId: 'campus-inc-001',
        actorId: 'technician-1',
        baseVersion: 1,
        state: 'pending',
        payload: { note: 'Inicio sin conexiÃƒÆ’Ã‚Â³n', photoRefs: ['pending-photo-1'] },
      });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('migraciÃƒÆ’Ã‚Â³n v1 ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ v2', () => {
  test('migra conservando incidencias y operaciones pendientes', async () => {
    const store = legacyStore();
    await expect(migrateStore(store)).resolves.toBe(CURRENT_SCHEMA_VERSION);
    const data = await store.readAll();
    expect(data.schemaVersion).toBe('2');
    expect(data.pending).toBeUndefined();
    const queue = JSON.parse(data.queue ?? '[]');
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({
      operationId: 'op-legacy-1',
      actorId: 'technician-1',
      baseVersion: 1,
      payload: { note: 'nota previa', photoRefs: ['pending-photo-9'] },
    });
    expect(JSON.parse(data.incidents ?? '[]')).toHaveLength(1);
    await expect(migrateStore(store)).resolves.toBe(2);
  });

  test.each(['incidents', 'queue'] as const)('falla inyectada tras %s: no queda estado mezclado y se recupera', async (step) => {
    const store = legacyStore();
    const before = await store.readAll();
    await expect(migrateStore(store, { failAfterStep: step })).rejects.toThrow('injected migration failure');
    expect(await store.readAll()).toEqual(before);

    await expect(migrateStore(store)).resolves.toBe(2);
    expect(JSON.parse((await store.readAll()).queue ?? '[]')[0].operationId).toBe('op-legacy-1');
  });

  test('falla en el commit atÃƒÆ’Ã‚Â³mico: sigue en v1 ÃƒÆ’Ã‚Â­ntegro y se recupera', async () => {
    const store = legacyStore();
    const before = await store.readAll();
    store.injectCommitFailure();
    await expect(migrateStore(store)).rejects.toThrow('injected commit failure');
    expect(await store.readAll()).toEqual(before);
    await expect(migrateStore(store)).resolves.toBe(2);
  });

  test('rechaza una versiÃƒÆ’Ã‚Â³n futura sin tocar los datos', async () => {
    const store = new MemoryAtomicStore({ schemaVersion: '9' });
    await expect(migrateStore(store)).rejects.toThrow('unsupported schema version 9');
  });
});

describe('autorizaciÃƒÆ’Ã‚Â³n por perfil', () => {
  const entry = { ...startOperation('op-a'), state: 'pending' as const, attempts: 0 };
  test('tÃƒÆ’Ã‚Â©cnico sÃƒÆ’Ã‚Â³lo opera sobre su asignaciÃƒÆ’Ã‚Â³n; coordinaciÃƒÆ’Ã‚Â³n cierra/reabre', () => {
    const tech = { actorId: 'technician-1', role: 'technician' as const };
    expect(isAuthorized(tech, entry, 'technician-1')).toBe(true);
    expect(isAuthorized(tech, entry, 'technician-2')).toBe(false);
    expect(isAuthorized(tech, { ...entry, action: 'close' }, 'technician-1')).toBe(false);
    const coordinator = { actorId: 'coordinator-1', role: 'coordinator' as const };
    expect(isAuthorized(coordinator, { ...entry, actorId: 'coordinator-1', action: 'close' }, null)).toBe(true);
    expect(isAuthorized(coordinator, { ...entry, actorId: 'coordinator-1', action: 'start' }, 'technician-1')).toBe(false);
  });
});

describe('sincronizaciÃƒÆ’Ã‚Â³n con un servidor simulado', () => {
  function fakeRemote(version: number, work = baseWork): SyncRemote & { applied: string[] } {
    const seen = new Set<string>();
    const applied: string[] = [];
    return {
      applied,
      async fetchIncident() {
        return { kind: 'ok', incident: { id: 'campus-inc-001', version, work } };
      },
      async submit(operation) {
        if (seen.has(operation.operationId)) {
          return { kind: 'duplicate', version: version + 1 };
        }
        seen.add(operation.operationId);
        applied.push(operation.operationId);
        return { kind: 'applied', version: version + 1 };
      },
    };
  }

  const technician = { actorId: 'technician-1', role: 'technician' as const };

  test('reasignaciÃƒÆ’Ã‚Â³n remota vs inicio local: conflicto, ambos hechos conservados', async () => {
    const queue = new OperationQueue(new MemoryAtomicStore());
    await queue.load();
    await queue.enqueue(startOperation('op-conflict'));
    const remote = fakeRemote(2, { assignedTechnicianId: 'technician-2', status: 'assigned' });
    const report = await syncQueue(queue, remote, technician);
    expect(report.conflicts).toEqual([{ operationId: 'op-conflict', fields: ['work'], reason: 'concurrent_change' }]);
    expect(remote.applied).toEqual([]);
    expect(queue.list()[0]).toMatchObject({ operationId: 'op-conflict', state: 'conflict', action: 'start' });
  });

  test('cambio remoto independiente se combina y se envÃƒÆ’Ã‚Â­a con la versiÃƒÆ’Ã‚Â³n nueva', async () => {
    const queue = new OperationQueue(new MemoryAtomicStore());
    await queue.load();
    await queue.enqueue(startOperation('op-merge'));
    const remote = fakeRemote(2);
    const report = await syncQueue(queue, remote, technician);
    expect(report.confirmed).toEqual(['op-merge']);
    expect(queue.list()).toHaveLength(0);
  });

  test('sin conexiÃƒÆ’Ã‚Â³n la operaciÃƒÆ’Ã‚Â³n permanece pendiente; un reintento con el mismo id no duplica el efecto', async () => {
    const queue = new OperationQueue(new MemoryAtomicStore());
    await queue.load();
    await queue.enqueue(startOperation('op-retry'));
    const remote = fakeRemote(1);
    const offline: SyncRemote = { ...remote, fetchIncident: async () => ({ kind: 'network' }) };
    const failed = await syncQueue(queue, offline, technician);
    expect(failed.stillPending).toEqual(['op-retry']);
    expect(queue.list()[0]).toMatchObject({ state: 'pending', attempts: 1 });

    await syncQueue(queue, remote, technician);
    await queue.enqueue(startOperation('op-retry'));
    await syncQueue(queue, remote, technician);
    expect(remote.applied).toEqual(['op-retry']);
    expect(queue.list()).toHaveLength(0);
  });

  test('una operaciÃƒÂ³n fuera de permisos se rechaza pero no se descarta; las ajenas no se procesan', async () => {
    const queue = new OperationQueue(new MemoryAtomicStore());
    await queue.load();
    await queue.enqueue(startOperation('op-forbidden', { action: 'close' }));
    await queue.enqueue(startOperation('op-other-author', { actorId: 'technician-2' }));
    const remote = fakeRemote(1);
    const report = await syncQueue(queue, remote, technician);
    expect(report.rejected).toEqual(['op-forbidden']);
    expect(report.confirmed).toEqual([]);
    expect(remote.applied).toEqual([]);
    expect(queue.list().map((entry) => [entry.operationId, entry.state])).toEqual([
      ['op-forbidden', 'rejected'],
      ['op-other-author', 'pending'],
    ]);
  });
});
describe('contra el backend didÃƒÆ’Ã‚Â¡ctico real', () => {
  const port = 4391;
  const baseUrl = `http://127.0.0.1:${port}`;
  let server: ChildProcess;

  beforeAll(async () => {
    server = spawn(process.execPath, ['course-backend/server.mjs'], {
      env: { ...process.env, COURSE_BACKEND_HOST: '127.0.0.1', COURSE_BACKEND_PORT: String(port) },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('backend did not start')), 8000);
      server.stdout?.on('data', (chunk: Buffer) => {
        if (/http:\/\/127\.0\.0\.1:\d+/.test(chunk.toString())) {
          clearTimeout(timer);
          resolve();
        }
      });
    });
  }, 15000);

  afterAll(() => {
    server.kill();
  });

  async function api(actorId: string, pathName: string, init: RequestInit = {}): Promise<Response> {
    return nodeFetch(`${baseUrl}${pathName}`, {
      ...init,
      headers: {
        Authorization: 'Bearer course-valid-token',
        'X-Course-Actor': actorId,
        'Content-Type': 'application/json',
        ...init.headers,
      },
    });
  }

  test('respuesta perdida tras guardar: la cola conserva la operaciÃƒÆ’Ã‚Â³n y el reintento no duplica', async () => {
    const queue = new OperationQueue(new MemoryAtomicStore());
    await queue.load();
    await queue.enqueue(startOperation('op-real-lost-response'));
    const technician = { actorId: 'technician-1', role: 'technician' as const };

    let loseNextResponse = true;
    const lossy: typeof fetch = async (input, init) => {
      const response = await nodeFetch(input, init);
      if (loseNextResponse && init?.method === 'POST') {
        loseNextResponse = false;
        throw new Error('response lost after commit');
      }
      return response;
    };
    const remote = new HttpSyncRemote({ baseUrl, accessToken: 'course-valid-token', fetchImpl: lossy });

    const first = await syncQueue(queue, remote, technician);
    expect(first.stillPending).toEqual(['op-real-lost-response']);
    expect(queue.list()).toHaveLength(1);

    const second = await syncQueue(queue, remote, technician);
    expect(second.confirmed).toEqual(['op-real-lost-response']);
    expect(queue.list()).toHaveLength(0);

    const incident = await (await api('coordinator-1', '/v1/incidents/campus-inc-001')).json();
    expect(incident).toMatchObject({ version: 2, status: 'in_progress' });
  }, 15000);

  test('coordinaciÃƒÆ’Ã‚Â³n reasigna mientras el tÃƒÆ’Ã‚Â©cnico trabaja sin conexiÃƒÆ’Ã‚Â³n: conflicto y la asignaciÃƒÆ’Ã‚Â³n remota se respeta', async () => {
    const created = await (await api('reporter-1', '/v1/incidents', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'create-week-08-case' },
      body: JSON.stringify({ category: 'equipment', description: 'Caso ficticio semana 8', location: 'Edificio de prueba B' }),
    })).json();
    const id: string = created.incident.id;
    const assign = (technicianId: string, baseVersion: number, key: string) => api('coordinator-1', `/v1/incidents/${id}/actions`, {
      method: 'POST',
      headers: { 'Idempotency-Key': key },
      body: JSON.stringify({ action: 'assign', technicianId, baseVersion }),
    });
    expect((await assign('technician-1', 1, 'assign-first-w8')).status).toBe(201);

    const queue = new OperationQueue(new MemoryAtomicStore());
    await queue.load();
    await queue.enqueue(startOperation('op-real-conflict', { incidentId: id, baseVersion: 2 }));

    expect((await assign('technician-2', 2, 'assign-second-w8')).status).toBe(201);

    const remote = new HttpSyncRemote({ baseUrl, accessToken: 'course-valid-token', fetchImpl: nodeFetch });
    const report = await syncQueue(queue, remote, { actorId: 'technician-1', role: 'technician' });
    expect(report.conflicts).toEqual([{ operationId: 'op-real-conflict', fields: ['work'], reason: 'assignment_lost' }]);
    expect(queue.list()[0]).toMatchObject({ operationId: 'op-real-conflict', state: 'conflict', action: 'start' });

    const current = await (await api('coordinator-1', `/v1/incidents/${id}`)).json();
    expect(current.payload.assignedTechnicianId).toBe('technician-2');
    expect(current.status).toBe('assigned');
  }, 15000);
});

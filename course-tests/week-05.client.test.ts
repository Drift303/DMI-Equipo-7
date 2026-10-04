import { IncidentCloudClient, IncidentCloudError } from '../src/api/incidentCloudClient';

type JsonResponse = Readonly<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

function response(body: unknown, status = 200): JsonResponse {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

const validIncident = {
  id: 'campus-inc-001',
  version: 1,
  status: 'assigned',
  payload: {
    category: 'connectivity',
    description: 'Sin conexión en laboratorio ficticio',
    location: 'Edificio de prueba A',
  },
};

test('maps a la aplicación un DTO cloud válido', async () => {
  const client = new IncidentCloudClient({
    fetchImpl: async () => response({ items: [validIncident] }) as Response,
  });

  await expect(client.list()).resolves.toEqual([{
    id: 'campus-inc-001',
    title: 'Incidencia campus-inc-001',
    description: 'Sin conexión en laboratorio ficticio',
    category: 'connectivity',
    locationLabel: 'Edificio de prueba A',
    status: 'assigned',
  }]);
});

test('distingue un payload nulo válido sin inventar datos', async () => {
  const client = new IncidentCloudClient({
    fetchImpl: async () => response({ ...validIncident, payload: null }) as Response,
  });

  await expect(client.getById(validIncident.id)).rejects.toMatchObject<Partial<IncidentCloudError>>({ kind: 'empty' });
});

test.each([
  [{ ...validIncident, version: '1' }],
  [{ ...validIncident, payload: [] }],
])('rechaza un objeto remoto malformado', async (malformedIncident) => {
  const client = new IncidentCloudClient({
    fetchImpl: async () => response(malformedIncident) as Response,
  });

  await expect(client.getById(validIncident.id)).rejects.toMatchObject<Partial<IncidentCloudError>>({ kind: 'contract' });
});

test.each(['', '       ', 'short'])('no envía una creación con Idempotency-Key ausente o inválida: %p', async (idempotencyKey) => {
  const fetchImpl = jest.fn();
  const client = new IncidentCloudClient({ fetchImpl: fetchImpl as typeof fetch });

  await expect(client.create({
    category: 'connectivity',
    description: 'Incidencia de prueba',
    location: 'Zona de prueba',
  }, idempotencyKey)).rejects.toMatchObject<Partial<IncidentCloudError>>({ kind: 'contract' });

  expect(fetchImpl).not.toHaveBeenCalled();
});

test('conserva el conflicto HTTP 409 que devuelve el backend', async () => {
  const client = new IncidentCloudClient({
    fetchImpl: async () => response({ code: 'version_conflict', currentVersion: 2 }, 409) as Response,
  });

  await expect(client.create({
    category: 'connectivity',
    description: 'Incidencia de prueba',
    location: 'Zona de prueba',
  }, 'create-409-conflict')).rejects.toMatchObject<Partial<IncidentCloudError>>({ kind: 'http', status: 409 });
});

test('representa un error HTTP 500 sin dejar una excepción genérica', async () => {
  const client = new IncidentCloudClient({
    fetchImpl: async () => response({ code: 'controlled_failure' }, 500) as Response,
  });

  await expect(client.list()).rejects.toMatchObject<Partial<IncidentCloudError>>({ kind: 'http', status: 500 });
});

test('representa un timeout de red como error distinguible', async () => {
  const client = new IncidentCloudClient({
    timeoutMs: 10,
    fetchImpl: async () => {
      throw new DOMException('The operation was aborted', 'AbortError');
    },
  });

  await expect(client.list()).rejects.toMatchObject<Partial<IncidentCloudError>>({ kind: 'timeout' });
});

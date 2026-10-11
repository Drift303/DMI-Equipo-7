import { IncidentCloudClient } from '../src/api/incidentCloudClient';
import {
  CampusSessionManager,
  MemorySessionStorage,
  SessionError,
  UnauthorizedResponseError,
} from '../src/api/sessionManager';

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function deferred<T>() {
  let resolve: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve: resolve! };
}

function loginPayload() {
  return {
    actorId: 'technician-1',
    role: 'technician',
    accessToken: 'access-0',
    refreshToken: 'refresh-0',
    expiresIn: 60,
  };
}

test('usa un reloj controlable para renovar una sesión expirada una sola vez', async () => {
  let now = 0;
  let refreshCalls = 0;
  const manager = new CampusSessionManager({
    baseUrl: 'http://campusops.test',
    now: () => now,
    fetchImpl: async (url) => {
      if (url.toString().endsWith('/login')) return response(loginPayload());
      refreshCalls += 1;
      return response({ accessToken: 'access-1', refreshToken: 'refresh-1', expiresIn: 60 });
    },
  });

  await manager.login('technician-1');
  now = 60_000;

  await expect(Promise.all([
    manager.withFreshToken(async (token) => token),
    manager.withFreshToken(async (token) => token),
    manager.withFreshToken(async (token) => token),
  ])).resolves.toEqual(['access-1', 'access-1', 'access-1']);

  expect(refreshCalls).toBe(1);
  expect(manager.status).toBe('authenticated');
  expect(manager.current?.generation).toBe(0);
});

test('borra la sesión cuando la renovación falla', async () => {
  let now = 0;
  const storage = new MemorySessionStorage();
  const manager = new CampusSessionManager({
    baseUrl: 'http://campusops.test',
    storage,
    now: () => now,
    fetchImpl: async (url) => (
      url.toString().endsWith('/login') ? response(loginPayload()) : response({ code: 'invalid_refresh' }, 401)
    ),
  });

  await manager.login('technician-1');
  now = 60_000;

  await expect(manager.withFreshToken(async (token) => token)).rejects.toMatchObject<Partial<SessionError>>({
    kind: 'refresh',
  });
  expect(manager.current).toBeNull();
  await expect(storage.read()).resolves.toBeNull();
  expect(manager.status).toBe('anonymous');
});

test('logout invalida una renovación que termina después y no restaura tokens', async () => {
  let now = 0;
  const refresh = deferred<Response>();
  const storage = new MemorySessionStorage();
  const manager = new CampusSessionManager({
    baseUrl: 'http://campusops.test',
    storage,
    now: () => now,
    fetchImpl: async (url) => (
      url.toString().endsWith('/login') ? response(loginPayload()) : refresh.promise
    ),
  });

  await manager.login('technician-1');
  now = 60_000;
  const pendingRequest = manager.withFreshToken(async (token) => token);
  await Promise.resolve();
  await manager.logout();
  refresh.resolve(response({ accessToken: 'access-1', refreshToken: 'refresh-1', expiresIn: 60 }));

  await expect(pendingRequest).rejects.toBeInstanceOf(SessionError);
  expect(manager.current).toBeNull();
  await expect(storage.read()).resolves.toBeNull();
});

test('el cliente comparte la renovación y no reintenta un segundo 401', async () => {
  const fetchImpl = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>();
  fetchImpl
    .mockResolvedValueOnce(response(loginPayload()))
    .mockResolvedValueOnce(response({ code: 'unauthorized' }, 401))
    .mockResolvedValueOnce(response({ accessToken: 'access-1', refreshToken: 'refresh-1', expiresIn: 60 }))
    .mockResolvedValueOnce(response({ code: 'unauthorized' }, 401));
  const manager = new CampusSessionManager({ baseUrl: 'http://campusops.test', fetchImpl });
  await manager.login('technician-1');
  const client = new IncidentCloudClient({
    baseUrl: 'http://campusops.test',
    fetchImpl,
    sessionManager: manager,
  });

  await expect(client.list()).rejects.toBeInstanceOf(UnauthorizedResponseError);

  expect(fetchImpl).toHaveBeenCalledTimes(4);
  expect(fetchImpl.mock.calls.filter(([url]) => url.toString().endsWith('/refresh'))).toHaveLength(1);
});



test('La sesión maneja correctamente un error HTTP 401', async () => {
  const fetchImpl = (async () => {
    return {
      ok: false,
      status: 401,
      json: async () => ({}),
    } as Response;
  }) as typeof fetch;

  const client = new IncidentCloudClient({
    accessToken: 'expired-token',
    fetchImpl,
  });

  await expect(client.list()).rejects.toMatchObject({
    name: 'IncidentCloudError',
    kind: 'http',
    status: 401,
  });
});

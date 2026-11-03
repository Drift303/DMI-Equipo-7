/** @jest-environment node */
import { spawn, type ChildProcess } from 'node:child_process';
import { request as httpRequest } from 'node:http';
import { IncidentCloudClient } from '../src/api/incidentCloudClient';
import { GeocodingClient, GeocodingError } from '../src/api/locationClient';
import { selectIncidentLocation } from '../src/course-evaluation';

jest.setTimeout(15_000);

let backend: ChildProcess | undefined;
let baseUrl: string;

function startBackend(): Promise<string> {
  backend = spawn(process.execPath, ['course-backend/server.mjs'], {
    cwd: process.cwd(),
    env: { ...process.env, COURSE_BACKEND_PORT: '0' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Controlled backend startup timed out.')), 5000);
    backend?.stdout?.setEncoding('utf8');
    backend?.stdout?.on('data', (chunk: string) => {
      const match = chunk.match(/(http:\/\/127\.0\.0\.1:\d+)/);
      if (match?.[1]) {
        clearTimeout(timeout);
        resolve(match[1]);
      }
    });
    backend?.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    backend?.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Controlled backend exited during startup: ${code}.`));
    });
  });
}

function scenarioFetch(scenario: string): typeof fetch {
  return async (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set('X-Course-Scenario', scenario);
    return nodeFetch(input, { ...init, headers });
  };
}

function nodeFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const url = new URL(String(input));
  return new Promise((resolve, reject) => {
    const request = httpRequest(url, {
      method: init.method ?? 'GET',
      headers: Object.fromEntries(new Headers(init.headers).entries()),
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => {
        const headers = new Headers();
        for (const [name, value] of Object.entries(response.headers)) {
          if (typeof value === 'string') headers.set(name, value);
          if (Array.isArray(value)) headers.set(name, value.join(', '));
        }
        const body = Buffer.concat(chunks).toString('utf8');
        resolve({
          ok: (response.statusCode ?? 500) >= 200 && (response.statusCode ?? 500) < 300,
          status: response.statusCode ?? 500,
          headers,
          json: async () => JSON.parse(body) as unknown,
        } as Response);
      });
    });
    const abort = () => {
      request.destroy(new DOMException('The operation was aborted.', 'AbortError'));
    };
    init.signal?.addEventListener('abort', abort, { once: true });
    if (init.signal?.aborted) abort();
    request.once('error', reject);
    if (typeof init.body === 'string') request.write(init.body);
    request.end();
  });
}

beforeAll(async () => {
  baseUrl = await startBackend();
});

afterAll(() => {
  backend?.kill('SIGTERM');
});

test('caches a real controlled geocoding response and selects manual fallback for incomplete data', async () => {
  const successFetch = jest.fn(scenarioFetch('success'));
  const provider = new GeocodingClient({
    provider: 'campusops',
    baseUrl,
    fetchImpl: successFetch,
  });

  const firstResult = await provider.geocode('Zona ficticia');
  await provider.geocode('zona ficticia');
  expect(firstResult).toEqual({ label: 'Edificio de prueba A', latitude: 0, longitude: 0 });
  expect(successFetch).toHaveBeenCalledTimes(1);

  for (const scenario of ['incomplete', 'invalid_coordinates']) {
    const client = new GeocodingClient({
      provider: 'campusops',
      baseUrl,
      fetchImpl: scenarioFetch(scenario),
      retryPolicy: { maxAttempts: 1 },
    });
    const providerResult = await client.geocode('Zona manual sintética');
    expect(selectIncidentLocation(providerResult, 'Zona manual sintética')).toEqual({
      source: 'manual',
      label: 'Zona manual sintética',
    });
  }
});

test('surfaces controlled 429 and timeout so the UI can continue manually', async () => {
  const rateLimited = new GeocodingClient({
    provider: 'campusops',
    baseUrl,
    fetchImpl: scenarioFetch('rate_limited'),
    retryPolicy: { maxAttempts: 1 },
  });
  await expect(rateLimited.geocode('Zona de prueba')).rejects.toMatchObject({
    kind: 'http',
    status: 429,
    retryAfterMs: 1000,
  });
  expect(selectIncidentLocation(null, 'Referencia manual')).toEqual({
    source: 'manual',
    label: 'Referencia manual',
  });

  const slowProvider = new GeocodingClient({
    provider: 'campusops',
    baseUrl,
    fetchImpl: scenarioFetch('slow'),
    timeoutMs: 40,
    retryPolicy: { maxAttempts: 1 },
  });
  await expect(slowProvider.geocode('Zona de prueba')).rejects.toBeInstanceOf(GeocodingError);
  await expect(slowProvider.geocode('Zona de prueba')).rejects.toMatchObject({ kind: 'timeout' });
});

test('replays a lost close response with the same key and payload without duplicate history', async () => {
  const attempts: Readonly<{ key: string | null; body: string; scenario: string }>[] = [];
  let loseCloseResponse = true;
  const metrics: Readonly<{
    method: string;
    attempts: number;
    attemptDurationsMs: readonly number[];
    retryDelaysMs: readonly number[];
    totalDurationMs: number;
    outcome: string;
  }>[] = [];
  const fetchWithLostResponse: typeof fetch = async (input, init) => {
    const headers = new Headers(init?.headers);
    const body = typeof init?.body === 'string' ? init.body : '';
    const action = body ? (JSON.parse(body) as { action?: string }).action : undefined;
    const scenario = action === 'close' && loseCloseResponse ? 'timeout_after_commit' : 'success';
    if (action === 'close' && loseCloseResponse) loseCloseResponse = false;
    headers.set('X-Course-Scenario', scenario);
    attempts.push({
      key: headers.get('Idempotency-Key'),
      body,
      scenario,
    });
    return nodeFetch(input, { ...init, headers });
  };
  const clientOptions = {
    baseUrl,
    timeoutMs: 100,
    retryPolicy: { baseDelayMs: 10, maxDelayMs: 20 },
    sleep: async (delayMs: number) => new Promise<void>((resolve) => setTimeout(resolve, delayMs)),
  };
  const technician = new IncidentCloudClient({
    ...clientOptions,
    actorId: 'technician-1',
    fetchImpl: nodeFetch,
  });
  const coordinator = new IncidentCloudClient({
    ...clientOptions,
    actorId: 'coordinator-1',
    fetchImpl: fetchWithLostResponse,
    onRetryMetrics: (value) => metrics.push(value),
  });

  await technician.performAction(
    'campus-inc-001',
    { action: 'start', baseVersion: 1 },
    'week9-start-operation',
  );
  await technician.performAction(
    'campus-inc-001',
    { action: 'resolve', baseVersion: 2, diagnosis: 'Revisión sintética completada' },
    'week9-resolve-operation',
  );
  const closeResult = await coordinator.performAction(
    'campus-inc-001',
    { action: 'close', baseVersion: 3 },
    'week9-close-operation',
  );

  expect(closeResult.incident.status).toBe('closed');
  expect(closeResult.duplicate).toBe(true);
  const closeAttempts = attempts.filter((attempt) => attempt.body.includes('"action":"close"'));
  expect(closeAttempts).toHaveLength(2);
  const firstClose = closeAttempts[0];
  const retryClose = closeAttempts[1];
  expect(firstClose?.key).toBe(retryClose?.key);
  expect(firstClose?.body).toBe(retryClose?.body);
  expect(closeAttempts.map((attempt) => attempt.scenario)).toEqual(['timeout_after_commit', 'success']);

  const stored = await nodeFetch(`${baseUrl}/v1/incidents/campus-inc-001`, {
    headers: {
      Authorization: 'Bearer course-valid-token',
      'X-Course-Actor': 'coordinator-1',
    },
  }).then((response) => response.json()) as {
    payload: { history: Readonly<{ action: string }>[] };
  };
  expect(stored.payload.history.filter((event) => event.action === 'close')).toHaveLength(1);
  expect(metrics).toEqual([expect.objectContaining({
    method: 'POST',
    attempts: 2,
    retryDelaysMs: [10],
    outcome: 'success',
  })]);
  expect(JSON.stringify(metrics)).not.toMatch(/week9-close-operation|campus-inc-001|close/i);
  console.info('WEEK09_SANITIZED_RETRY_METRICS', JSON.stringify(metrics[0]));
});

import { GeocodingClient, GeocodingError } from '../src/api/locationClient';
import { parseRetryAfterHeader } from '../src/api/resilience';
import { planRetry, selectIncidentLocation } from '../src/course-evaluation';

function response(
  body: unknown,
  status = 200,
  headers: Readonly<Record<string, string>> = {},
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    json: async () => body,
  } as Response;
}

const openMeteoResult = {
  results: [{
    name: 'Lugar de prueba',
    admin1: 'Zona sintética',
    country: 'País ficticio',
    latitude: 19.4,
    longitude: -99.1,
  }],
};

test('uses progressive bounded retries, Retry-After, and configurable attempt ceilings', () => {
  const policy = { maxAttempts: 4, baseDelayMs: 100, maxDelayMs: 500 };
  expect(planRetry({ method: 'GET', status: 503, attempt: 1 }, policy)).toMatchObject({
    retry: true,
    delayMs: 100,
  });
  expect(planRetry({ method: 'GET', status: 503, attempt: 2 }, policy)).toMatchObject({
    retry: true,
    delayMs: 200,
  });
  expect(planRetry({ method: 'GET', status: 503, attempt: 3 }, policy)).toMatchObject({
    retry: true,
    delayMs: 400,
  });
  expect(planRetry({ method: 'GET', status: 503, attempt: 4 }, policy)).toMatchObject({
    retry: false,
    delayMs: 0,
  });
  expect(planRetry({ method: 'GET', status: 429, attempt: 1, retryAfterMs: 501 }, policy)).toMatchObject({
    retry: false,
    delayMs: 0,
  });
  expect(planRetry({ method: 'POST', status: 'timeout', attempt: 1 }, policy)).toMatchObject({
    retry: false,
    requiresStableIdempotencyKey: true,
  });
  expect(planRetry({
    method: 'POST',
    status: 'timeout',
    attempt: 1,
    idempotencyKey: 'stable-operation-1',
  }, { ...policy, maxAttempts: 2 })).toMatchObject({ retry: true, delayMs: 100 });
  expect(planRetry({ method: 'GET', status: 'network', attempt: 1 }, { ...policy, maxAttempts: 1 })).toMatchObject({
    retry: false,
  });
});

test('parses Retry-After as seconds or an HTTP date', () => {
  expect(parseRetryAfterHeader('1.5', 0)).toBe(1500);
  expect(parseRetryAfterHeader('invalid', 0)).toBeUndefined();
  expect(parseRetryAfterHeader('Thu, 01 Jan 1970 00:00:02 GMT', 1000)).toBe(1000);
});

test('adapts Open-Meteo responses and caches valid normalized queries', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(response(openMeteoResult));
  const client = new GeocodingClient({ fetchImpl: fetchImpl as typeof fetch });

  await expect(client.geocode(' Lugar de prueba ')).resolves.toEqual({
    label: 'Lugar de prueba, Zona sintética, País ficticio',
    latitude: 19.4,
    longitude: -99.1,
  });
  await expect(client.geocode('lugar   de prueba')).resolves.toEqual({
    label: 'Lugar de prueba, Zona sintética, País ficticio',
    latitude: 19.4,
    longitude: -99.1,
  });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test('does not cache incomplete provider data', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(response({
    results: [{ name: 'Lugar incompleto', latitude: 19.4 }],
  }));
  const client = new GeocodingClient({ fetchImpl: fetchImpl as typeof fetch });

  for (let index = 0; index < 2; index += 1) {
    const result = await client.geocode('Lugar incompleto');
    expect(selectIncidentLocation(result, 'Edificio manual')).toEqual({
      source: 'manual',
      label: 'Edificio manual',
    });
  }
  expect(fetchImpl).toHaveBeenCalledTimes(2);
});

test('briefly caches valid no-match responses without inventing coordinates', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(response({ generationtime_ms: 0.1 }));
  const client = new GeocodingClient({ fetchImpl: fetchImpl as typeof fetch });

  await expect(client.geocode('CampusOps synthetic test building')).resolves.toBeNull();
  await expect(client.geocode('CampusOps synthetic test building')).resolves.toBeNull();
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test('retries 429 according to Retry-After and returns sanitized timing metrics', async () => {
  const fetchImpl = jest.fn()
    .mockResolvedValueOnce(response({ code: 'rate_limited' }, 429, { 'Retry-After': '0' }))
    .mockResolvedValue(response(openMeteoResult));
  const delays: number[] = [];
  const reports: unknown[] = [];
  const client = new GeocodingClient({
    fetchImpl: fetchImpl as typeof fetch,
    retryPolicy: { baseDelayMs: 5, maxDelayMs: 10 },
    sleep: async (delayMs) => { delays.push(delayMs); },
    onRetryMetrics: (metrics) => reports.push(metrics),
  });

  await expect(client.geocode('Lugar de prueba')).resolves.toMatchObject({
    label: 'Lugar de prueba, Zona sintética, País ficticio',
  });
  expect(delays).toEqual([0]);
  expect(reports).toEqual([expect.objectContaining({
    method: 'GET',
    attempts: 2,
    retryDelaysMs: [0],
    outcome: 'success',
  })]);
  expect(JSON.stringify(reports)).not.toMatch(/Lugar de prueba|latitude|longitude/i);
});

test.each([
  ['timeout', async () => { throw new DOMException('timeout', 'AbortError'); }],
  ['network', async () => { throw new TypeError('disconnected'); }],
])('uses manual location after provider %s', async (_label, fetchImpl) => {
  const client = new GeocodingClient({
    fetchImpl: fetchImpl as typeof fetch,
    retryPolicy: { maxAttempts: 1 },
  });

  let failure: unknown;
  try {
    await client.geocode('Edificio de prueba');
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(GeocodingError);
  expect(selectIncidentLocation(null, 'Zona escrita manualmente')).toEqual({
    source: 'manual',
    label: 'Zona escrita manualmente',
  });
});

test('stops after the configured attempt limit and preserves 429 as a visible failure', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(response(
    { code: 'rate_limited' },
    429,
    { 'Retry-After': '0' },
  ));
  const client = new GeocodingClient({
    fetchImpl: fetchImpl as typeof fetch,
    retryPolicy: { maxAttempts: 2 },
    sleep: async () => undefined,
  });

  await expect(client.geocode('Zona ficticia')).rejects.toMatchObject({
    kind: 'http',
    status: 429,
  });
  expect(fetchImpl).toHaveBeenCalledTimes(2);
});

test('expires cached results and enforces the cache size', async () => {
  let now = 100;
  const fetchImpl = jest.fn().mockResolvedValue(response(openMeteoResult));
  const client = new GeocodingClient({
    fetchImpl: fetchImpl as typeof fetch,
    now: () => now,
    cache: { ttlMs: 50, maxEntries: 1 },
  });

  await client.geocode('first');
  now += 51;
  await client.geocode('first');
  await client.geocode('second');
  await client.geocode('first');
  expect(fetchImpl).toHaveBeenCalledTimes(4);
});

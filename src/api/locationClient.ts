import { selectIncidentLocation } from '../course-evaluation';
import type { RetryMetrics, RetryFailure } from './resilience';
import { parseRetryAfterHeader, runWithRetry } from './resilience';
import type { RetryPolicy } from '../course-evaluation';

export type GeocodingProvider = 'open-meteo' | 'campusops';
export type LocationCacheOptions = Readonly<{
  ttlMs: number;
  maxEntries: number;
}>;

export class GeocodingError extends Error {
  readonly kind: 'input' | 'http' | 'network' | 'timeout' | 'contract';
  readonly status: number | null;
  readonly retryAfterMs: number | null;

  constructor(
    kind: GeocodingError['kind'],
    message: string,
    status: number | null = null,
    retryAfterMs: number | null = null,
  ) {
    super(message);
    this.name = 'GeocodingError';
    this.kind = kind;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

type GeocodingClientOptions = Readonly<{
  provider?: GeocodingProvider;
  baseUrl?: string;
  actorId?: () => string;
  timeoutMs?: number;
  cache?: Partial<LocationCacheOptions>;
  retryPolicy?: Partial<RetryPolicy>;
  fetchImpl?: typeof fetch;
  sleep?: (delayMs: number) => Promise<void>;
  now?: () => number;
  onRetryMetrics?: (metrics: RetryMetrics) => void;
}>;

type CachedLocation = Readonly<{
  value: Readonly<{ label: string; latitude: number; longitude: number }> | null;
  expiresAt: number;
}>;

const DEFAULT_BASE_URL = 'http://127.0.0.1:4310';
const DEFAULT_TIMEOUT_MS = 1500;
const DEFAULT_CACHE: LocationCacheOptions = { ttlMs: 300_000, maxEntries: 50 };
const OPEN_METEO_URL = 'https://geocoding-api.open-meteo.com/v1/search';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cacheKey(query: string): string {
  return query.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function parseOpenMeteo(value: unknown): unknown {
  if (!isObject(value)) return value;
  if (!Object.hasOwn(value, 'results')) return null;
  if (!Array.isArray(value.results)) return value;
  const first = value.results[0];
  if (value.results.length === 0) return null;
  if (!isObject(first)) return first ?? {};

  const labelParts = [first.name, first.admin1, first.country]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .map((part) => part.trim());
  return {
    label: labelParts.join(', '),
    latitude: first.latitude,
    longitude: first.longitude,
  };
}

export class GeocodingClient {
  readonly provider: GeocodingProvider;
  private readonly baseUrl: string;
  private readonly actorId: (() => string) | undefined;
  private readonly timeoutMs: number;
  private readonly cacheOptions: LocationCacheOptions;
  private readonly retryPolicy: Partial<RetryPolicy> | undefined;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: ((delayMs: number) => Promise<void>) | undefined;
  private readonly now: () => number;
  private readonly onRetryMetrics: ((metrics: RetryMetrics) => void) | undefined;
  private readonly cache = new Map<string, CachedLocation>();
  private readonly inFlight = new Map<string, Promise<unknown>>();

  constructor(options: GeocodingClientOptions = {}) {
    this.provider = options.provider ?? 'open-meteo';
    this.baseUrl = (options.baseUrl ?? process.env.EXPO_PUBLIC_COURSE_BACKEND_URL ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.actorId = options.actorId;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.cacheOptions = {
      ttlMs: this.validCacheValue(options.cache?.ttlMs, DEFAULT_CACHE.ttlMs),
      maxEntries: this.validCacheValue(options.cache?.maxEntries, DEFAULT_CACHE.maxEntries, true),
    };
    this.retryPolicy = options.retryPolicy;
    this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
    this.sleep = options.sleep;
    this.now = options.now ?? Date.now;
    this.onRetryMetrics = options.onRetryMetrics;
  }

  async geocode(query: string): Promise<unknown> {
    const normalizedQuery = typeof query === 'string' ? query.trim() : '';
    if (!normalizedQuery) {
      throw new GeocodingError('input', 'Enter a building, zone, or reference before searching.');
    }

    const key = cacheKey(normalizedQuery);
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > this.now()) {
      this.cache.delete(key);
      this.cache.set(key, cached);
      return cached.value ? { ...cached.value } : null;
    }
    if (cached) this.cache.delete(key);

    const pending = this.inFlight.get(key);
    if (pending) return pending;

    const lookup = this.lookup(normalizedQuery)
      .then((value) => {
        if (value === null) {
          this.cacheResult(key, null);
          return null;
        }
        const selected = selectIncidentLocation(value, '');
        if (selected.source === 'provider') {
          this.cacheResult(key, selected);
          return {
            label: selected.label,
            latitude: selected.latitude,
            longitude: selected.longitude,
          };
        }
        return value;
      })
      .finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, lookup);
    return lookup;
  }

  clearCache(): void {
    this.cache.clear();
  }

  private async lookup(query: string): Promise<unknown> {
    const result = await runWithRetry({
      method: 'GET',
      ...(this.retryPolicy !== undefined ? { policy: this.retryPolicy } : {}),
      ...(this.sleep !== undefined ? { sleep: this.sleep } : {}),
      ...(this.onRetryMetrics !== undefined ? { onMetrics: this.onRetryMetrics } : {}),
      ...(this.now !== undefined ? { now: this.now } : {}),
      execute: () => this.request(query),
      classifyError: (error): RetryFailure | null => {
        if (!(error instanceof GeocodingError)) return null;
        if (error.kind === 'timeout') return { status: 'timeout' };
        if (error.kind === 'network') return { status: 'network' };
        if (error.kind === 'http' && error.status !== null) {
          return {
            status: error.status,
            ...(error.retryAfterMs !== null ? { retryAfterMs: error.retryAfterMs } : {}),
          };
        }
        return null;
      },
    });
    return result.value;
  }

  private async request(query: string): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const url = this.provider === 'campusops'
      ? new URL('/v1/geocoding', this.baseUrl)
      : new URL(OPEN_METEO_URL);
    url.searchParams.set(this.provider === 'campusops' ? 'q' : 'name', query);
    if (this.provider === 'open-meteo') {
      url.searchParams.set('count', '1');
      url.searchParams.set('language', 'es');
      url.searchParams.set('format', 'json');
    }

    try {
      const response = await this.fetchImpl(url.toString(), {
        signal: controller.signal,
        headers: this.provider === 'campusops'
          ? {
            Authorization: 'Bearer course-valid-token',
            'X-Course-Actor': this.actorId?.() ?? 'reporter-1',
            Accept: 'application/json',
          }
          : { Accept: 'application/json' },
      });
      if (!response.ok) {
        const retryAfter = parseRetryAfterHeader(response.headers?.get('Retry-After') ?? null, this.now());
        throw new GeocodingError(
          'http',
          `Location provider returned HTTP ${response.status}.`,
          response.status,
          retryAfter ?? null,
        );
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new GeocodingError('contract', 'Location provider returned invalid JSON.');
      }
      return this.provider === 'open-meteo' ? parseOpenMeteo(payload) : payload;
    } catch (error) {
      if (error instanceof GeocodingError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new GeocodingError('timeout', 'Location provider request timed out.');
      }
      if (error instanceof TypeError || (error instanceof Error && error.name === 'NetworkError')) {
        throw new GeocodingError('network', 'Location provider could not be reached.');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private cacheResult(key: string, value: Readonly<{
    source: 'provider';
    label: string;
    latitude: number;
    longitude: number;
  }> | null): void {
    if (this.cacheOptions.maxEntries === 0 || this.cacheOptions.ttlMs === 0) return;
    if (this.cache.size >= this.cacheOptions.maxEntries) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(key, {
      value: value ? {
        label: value.label,
        latitude: value.latitude,
        longitude: value.longitude,
      } : null,
      expiresAt: this.now() + (value ? this.cacheOptions.ttlMs : Math.min(30_000, this.cacheOptions.ttlMs)),
    });
  }

  private validCacheValue(value: number | undefined, fallback: number, integer = false): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return fallback;
    return integer ? Math.floor(value) : value;
  }
}

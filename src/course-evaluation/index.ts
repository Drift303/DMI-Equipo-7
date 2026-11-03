import type {
  AuthEvent,
  JsonObject,
  ParseResult,
  PermissionEvent,
  RemoteResponse,
  SyncRecord,
} from './contracts';
import type { IncidentLocation } from '../campusops/contracts';
import { reduceRefreshEvents } from '../api/sessionManager';
import { deduplicateOperations as dedupe, resolveSync as resolveRecords } from '../campusops/sync/merge';
import type { SyncResolution } from '../campusops/sync/merge';

function pending(name: string): never {
  throw new Error(`${name} must be implemented in the assigned week`);
}

const sensitiveTelemetryKeys = new Set([
  'authorization',
  'password',
  'token',
  'accesstoken',
  'refreshtoken',
  'email',
  'displayname',
  'name',
  'userid',
  'reporterid',
  'technicianid',
  'assignedtechnicianid',
  'location',
  'latitude',
  'longitude',
  'photos',
  'evidence',
  'internalcomments',
  'assignmenthistory',
]);

function normalizeTelemetryKey(key: string): string {
  return key.toLowerCase().replace(/[_-]/g, '');
}

export function redactForTelemetry(input: unknown): unknown {
  if (Array.isArray(input)) {
    return input.map((value) => redactForTelemetry(value));
  }

  if (input !== null && typeof input === 'object') {
    return Object.fromEntries(
      Object.entries(input).map(([key, value]) => [
        key,
        sensitiveTelemetryKeys.has(normalizeTelemetryKey(key))
          ? '[REDACTED]'
          : redactForTelemetry(value),
      ]),
    );
  }

  return input;
}

export function parseRemoteResource(input: unknown): ParseResult {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, error: 'contract' };
  }

  const resource = input as Record<string, unknown>;
  const validId = typeof resource.id === 'string' && resource.id.trim().length > 0;
  const validVersion = typeof resource.version === 'number'
    && Number.isInteger(resource.version)
    && resource.version >= 0;
  const validStatus = typeof resource.status === 'string' && resource.status.trim().length > 0;
  const validPayload = resource.payload === null
    || (typeof resource.payload === 'object' && !Array.isArray(resource.payload));

  if (!validId || !validVersion || !validStatus || !validPayload) {
    return { ok: false, error: 'contract' };
  }

  return {
    ok: true,
    value: {
      id: resource.id as string,
      version: resource.version as number,
      status: resource.status as string,
      payload: resource.payload as JsonObject | null,
    },
  };
}

export function coordinateRefresh(events: readonly AuthEvent[]): Readonly<{
  status: 'anonymous' | 'authenticated';
  activeGeneration: number | null;
  refreshCalls: number;
  retriedRequestIds: readonly string[];
  persistedToken: string | null;
}> {
  return reduceRefreshEvents(events);
}

export function resolveSync(base: SyncRecord, local: SyncRecord, remote: SyncRecord): SyncResolution {
  return resolveRecords(base, local, remote);
}

export function deduplicateOperations<T extends Readonly<{ operationId: string }>>(
  operations: readonly T[],
): readonly T[] {
  return dedupe(operations);
}

export type RetryPolicy = Readonly<{
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}>;

export const DEFAULT_RETRY_POLICY: RetryPolicy = Object.freeze({
  maxAttempts: 4,
  baseDelayMs: 250,
  maxDelayMs: 30_000,
});

function boundedPolicy(policy: Partial<RetryPolicy>): RetryPolicy {
  const configuredMaxAttempts = policy.maxAttempts;
  const configuredMaxDelay = policy.maxDelayMs;
  const configuredBaseDelay = policy.baseDelayMs;
  const maxAttempts = typeof configuredMaxAttempts === 'number' && Number.isFinite(configuredMaxAttempts)
    ? Math.min(4, Math.max(1, Math.floor(configuredMaxAttempts)))
    : DEFAULT_RETRY_POLICY.maxAttempts;
  const maxDelayMs = typeof configuredMaxDelay === 'number'
      && Number.isFinite(configuredMaxDelay)
      && configuredMaxDelay >= 0
    ? Math.min(30_000, Math.floor(configuredMaxDelay))
    : DEFAULT_RETRY_POLICY.maxDelayMs;
  const baseDelayMs = typeof configuredBaseDelay === 'number'
      && Number.isFinite(configuredBaseDelay)
      && configuredBaseDelay >= 0
    ? Math.min(maxDelayMs, Math.floor(configuredBaseDelay))
    : Math.min(DEFAULT_RETRY_POLICY.baseDelayMs, maxDelayMs);

  return { maxAttempts, baseDelayMs, maxDelayMs };
}

export function planRetry(input: Readonly<{
  method: 'GET' | 'POST';
  status: number | 'timeout' | 'network';
  attempt: number;
  retryAfterMs?: number;
  idempotencyKey?: string;
}>, configuredPolicy: Partial<RetryPolicy> = {}): Readonly<{
  retry: boolean;
  delayMs: number;
  requiresStableIdempotencyKey: boolean;
}> {
  const policy = boundedPolicy(configuredPolicy);
  const attempt = Number.isFinite(input.attempt) ? Math.floor(input.attempt) : 0;

  const retryAfterMs = typeof input.retryAfterMs === 'number'
      && Number.isFinite(input.retryAfterMs)
      && input.retryAfterMs >= 0
    ? input.retryAfterMs
    : null;

  const hasStableIdempotencyKey =
    typeof input.idempotencyKey === 'string'
    && input.idempotencyKey.trim().length > 0;

  if (attempt >= policy.maxAttempts || attempt >= 4 || attempt < 1) {
    return {
      retry: false,
      delayMs: 0,
      requiresStableIdempotencyKey: false,
    };
  }

  const isTransient =
    input.status === 'timeout'
    || input.status === 'network'
    || input.status === 408
    || input.status === 429
    || (typeof input.status === 'number' && input.status >= 500 && input.status <= 599);

  if (!isTransient) {
    return {
      retry: false,
      delayMs: 0,
      requiresStableIdempotencyKey: false,
    };
  }

  if (input.method === 'POST' && !hasStableIdempotencyKey) {
    return {
      retry: false,
      delayMs: 0,
      requiresStableIdempotencyKey: true,
    };
  }

  const exponentialDelay = Math.min(
    policy.maxDelayMs,
    policy.baseDelayMs * (2 ** (attempt - 1)),
  );
  if (retryAfterMs !== null && retryAfterMs > policy.maxDelayMs) {
    return {
      retry: false,
      delayMs: 0,
      requiresStableIdempotencyKey: false,
    };
  }

  return {
    retry: true,
    delayMs: retryAfterMs ?? exponentialDelay,
    requiresStableIdempotencyKey: false,
  };
}

export function reduceRemoteResponses(_input: Readonly<{
  activeRequestId: string;
  responses: readonly RemoteResponse[];
}>): Readonly<{ state: 'success' | 'error' | 'loading'; value?: unknown; error?: string }> {
  return pending('reduceRemoteResponses');
}

export function reducePermissionLifecycle(
  _events: readonly PermissionEvent[],
): Readonly<{ status: 'available' | 'denied' | 'blocked'; resourceActive: boolean }> {
  return pending('reducePermissionLifecycle');
}

export function selectIncidentLocation(provider: unknown, manualLabel: string): IncidentLocation {
  const fallbackLabel = typeof manualLabel === 'string' ? manualLabel.trim() : '';

  if (provider && typeof provider === 'object' && !Array.isArray(provider)) {
    const candidate = provider as Record<string, unknown>;
    const label = typeof candidate.label === 'string' ? candidate.label.trim() : '';
    const latitude = candidate.latitude;
    const longitude = candidate.longitude;

    const validLabel = label.length > 0;
    const validLatitude = typeof latitude === 'number' && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90;
    const validLongitude = typeof longitude === 'number' && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;

    if (validLabel && validLatitude && validLongitude) {
      return { source: 'provider', label, latitude, longitude };
    }
  }

  return { source: 'manual', label: fallbackLabel || 'Ubicación manual' };
}

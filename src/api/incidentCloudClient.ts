import { isValidIncident, type Incident, type IncidentRepository } from '../campusops/domain/incidents';
import type { IncidentCategory } from '../campusops/contracts';
import type { JsonObject, ParseResult } from '../course-evaluation/contracts';
import { parseRemoteResource } from '../course-evaluation';

export type IncidentCloudErrorKind = 'contract' | 'empty' | 'http' | 'network' | 'timeout';

export class IncidentCloudError extends Error {
  readonly kind: IncidentCloudErrorKind;
  readonly status: number | null;

  constructor(kind: IncidentCloudErrorKind, message: string, status: number | null = null) {
    super(message);
    this.name = 'IncidentCloudError';
    this.kind = kind;
    this.status = status;
  }
}

type IncidentCloudClientOptions = Readonly<{
  baseUrl?: string;
  accessToken?: string;
  actorId?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}>;

type CreateIncidentInput = Readonly<{
  category: IncidentCategory;
  description: string;
  location: string;
}>;

const DEFAULT_URL = 'http://127.0.0.1:4310';
const DEFAULT_TIMEOUT_MS = 1000;

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mapRemoteIncident(parsed: Extract<ParseResult, { ok: true }>): Incident {
  if (parsed.value.payload === null) {
    throw new IncidentCloudError('empty', 'Incident payload is valid but empty');
  }

  const payload = parsed.value.payload;
  const category = payload.category;
  const description = payload.description;
  const location = payload.location;
  if (
    typeof category !== 'string'
    || typeof description !== 'string'
    || typeof location !== 'string'
    || !description.trim()
    || !location.trim()
  ) {
    throw new IncidentCloudError('contract', 'Incident payload does not satisfy the app contract');
  }

  const candidate: Incident = {
    id: parsed.value.id,
    title: `Incidencia ${parsed.value.id}`,
    description,
    category: category as IncidentCategory,
    locationLabel: location,
    status: parsed.value.status as Incident['status'],
  };
  if (!isValidIncident(candidate)) {
    throw new IncidentCloudError('contract', 'Incident mapping failed');
  }

  return candidate;
}

export class IncidentCloudClient implements IncidentRepository {
  private readonly baseUrl: string;
  private readonly accessToken: string;
  private readonly actorId: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: IncidentCloudClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? process.env.EXPO_PUBLIC_COURSE_BACKEND_URL ?? DEFAULT_URL).replace(/\/$/, '');
    this.accessToken = options.accessToken ?? 'course-valid-token';
    this.actorId = options.actorId ?? 'reporter-1';
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async list(): Promise<readonly Incident[]> {
    const body = await this.request('/v1/incidents');
    if (!isJsonObject(body) || !Array.isArray(body.items)) {
      throw new IncidentCloudError('contract', 'Incident list contract mismatch');
    }
    return body.items.map((item) => mapRemoteIncident(this.parse(item)));
  }

  async getById(id: string): Promise<Incident | null> {
    const normalizedId = id.trim();
    if (!normalizedId) return null;
    const body = await this.request(`/v1/incidents/${encodeURIComponent(normalizedId)}`);
    return mapRemoteIncident(this.parse(body));
  }

  async create(input: CreateIncidentInput, idempotencyKey: string): Promise<Incident> {
    if (idempotencyKey.trim().length < 8) {
      throw new IncidentCloudError('contract', 'Idempotency-Key must contain at least 8 characters');
    }
    const body = await this.request('/v1/incidents', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(input),
    });
    if (!isJsonObject(body) || !Object.hasOwn(body, 'incident')) {
      throw new IncidentCloudError('contract', 'Incident creation contract mismatch');
    }
    return mapRemoteIncident(this.parse(body.incident));
  }

  private parse(input: unknown): Extract<ParseResult, { ok: true }> {
    const parsed = parseRemoteResource(input);
    if (!parsed.ok) {
      throw new IncidentCloudError('contract', 'Remote resource contract mismatch');
    }
    return parsed;
  }

  private async request(path: string, init: RequestInit = {}): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'X-Course-Actor': this.actorId,
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...init.headers,
        },
      });
      if (!response.ok) {
        throw new IncidentCloudError('http', `Cloud request failed with ${response.status}`, response.status);
      }
      try {
        return await response.json();
      } catch {
        throw new IncidentCloudError('contract', 'Cloud response is not valid JSON');
      }
    } catch (error) {
      if (error instanceof IncidentCloudError) throw error;
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new IncidentCloudError('timeout', 'Cloud request timed out');
      }
      throw new IncidentCloudError('network', 'Cloud request failed');
    } finally {
      clearTimeout(timeout);
    }
  }
}

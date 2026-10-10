import type { CampusRole } from '../campusops/contracts';
import type { AuthEvent } from '../course-evaluation/contracts';

export type SessionStatus = 'anonymous' | 'authenticating' | 'authenticated' | 'refreshing';

export type SessionSnapshot = Readonly<{
  actorId: string;
  role: CampusRole;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  generation: number;
}>;

export type PersistedSession = Omit<SessionSnapshot, 'generation'>;

export interface SessionStorage {
  read(): Promise<PersistedSession | null>;
  write(session: PersistedSession): Promise<void>;
  clear(): Promise<void>;
}

export class MemorySessionStorage implements SessionStorage {
  private value: PersistedSession | null = null;

  async read(): Promise<PersistedSession | null> {
    return this.value;
  }

  async write(session: PersistedSession): Promise<void> {
    this.value = session;
  }

  async clear(): Promise<void> {
    this.value = null;
  }
}

type LoginResponse = Readonly<{
  actorId: string;
  role: CampusRole;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}>;

type RefreshResponse = Readonly<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}>;

type SessionManagerOptions = Readonly<{
  baseUrl: string;
  storage?: SessionStorage;
  fetchImpl?: typeof fetch;
  now?: () => number;
}>;

export class SessionError extends Error {
  constructor(
    readonly kind: 'anonymous' | 'login' | 'refresh' | 'contract',
    message = `Session ${kind} failed`,
  ) {
    super(message);
    this.name = 'SessionError';
  }
}

function isRole(value: unknown): value is CampusRole {
  return value === 'reporter' || value === 'technician' || value === 'coordinator';
}

function parseLogin(value: unknown): LoginResponse {
  const candidate = typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
  if (
    !candidate
    || typeof candidate.actorId !== 'string' || !candidate.actorId.trim()
    || !isRole(candidate.role)
    || typeof candidate.accessToken !== 'string' || !candidate.accessToken
    || typeof candidate.refreshToken !== 'string' || !candidate.refreshToken
    || typeof candidate.expiresIn !== 'number' || !Number.isFinite(candidate.expiresIn) || candidate.expiresIn <= 0
  ) {
    throw new SessionError('contract');
  }
  return {
    actorId: candidate.actorId,
    role: candidate.role,
    accessToken: candidate.accessToken,
    refreshToken: candidate.refreshToken,
    expiresIn: candidate.expiresIn,
  };
}

function parseRefresh(value: unknown): RefreshResponse {
  const candidate = typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
  if (
    !candidate
    || typeof candidate.accessToken !== 'string' || !candidate.accessToken
    || typeof candidate.refreshToken !== 'string' || !candidate.refreshToken
    || typeof candidate.expiresIn !== 'number' || !Number.isFinite(candidate.expiresIn) || candidate.expiresIn <= 0
  ) {
    throw new SessionError('contract');
  }
  return {
    accessToken: candidate.accessToken,
    refreshToken: candidate.refreshToken,
    expiresIn: candidate.expiresIn,
  };
}

export class CampusSessionManager {
  private readonly baseUrl: string;
  private readonly storage: SessionStorage;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private session: SessionSnapshot | null = null;
  private refreshInFlight: Promise<SessionSnapshot> | null = null;
  private loginInFlight: Promise<SessionSnapshot> | null = null;
  private generation = 0;

  constructor(options: SessionManagerOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.storage = options.storage ?? new MemorySessionStorage();
    this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
    this.now = options.now ?? Date.now;
  }

  get status(): SessionStatus {
    if (this.refreshInFlight) return 'refreshing';
    if (this.loginInFlight) return 'authenticating';
    return this.session ? 'authenticated' : 'anonymous';
  }

  get current(): SessionSnapshot | null {
    return this.session;
  }

  async restore(): Promise<SessionSnapshot | null> {
    const persisted = await this.storage.read();
    if (!persisted || persisted.expiresAt <= this.now()) {
      if (persisted) await this.storage.clear();
      this.session = null;
      return null;
    }
    this.session = { ...persisted, generation: this.generation };
    return this.session;
  }

  async login(actorId: string): Promise<SessionSnapshot> {
    if (!actorId.trim()) throw new SessionError('login');
    if (this.loginInFlight) return this.loginInFlight;
    this.loginInFlight = this.performLogin(actorId);
    try {
      return await this.loginInFlight;
    } finally {
      this.loginInFlight = null;
    }
  }

  async logout(): Promise<void> {
    this.generation += 1;
    this.session = null;
    await this.storage.clear();
  }

  async withFreshToken<T>(request: (accessToken: string) => Promise<T>): Promise<T> {
    const initial = await this.requireFreshSession();
    try {
      return await request(initial.accessToken);
    } catch (error) {
      if (!isUnauthorized(error)) throw error;
      const refreshed = await this.refresh(initial.generation);
      return request(refreshed.accessToken);
    }
  }

  private async requireFreshSession(): Promise<SessionSnapshot> {
    if (!this.session) throw new SessionError('anonymous');
    if (this.session.expiresAt > this.now()) return this.session;
    return this.refresh(this.session.generation);
  }

  private async performLogin(actorId: string): Promise<SessionSnapshot> {
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/v1/session/login`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ actorId }),
      });
      if (!response.ok) throw new SessionError('login');
      const payload = parseLogin(await response.json());
      return this.persist({
        ...payload,
        expiresAt: this.now() + payload.expiresIn * 1000,
      });
    } catch (error) {
      if (error instanceof SessionError) throw error;
      throw new SessionError('login', error instanceof Error ? error.message : 'Login request failed');
    }
  }

  private async refresh(expectedGeneration: number): Promise<SessionSnapshot> {
    if (this.refreshInFlight) return this.refreshInFlight;
    const snapshot = this.session;
    if (!snapshot || snapshot.generation !== expectedGeneration) throw new SessionError('anonymous');
    this.refreshInFlight = this.performRefresh(snapshot, expectedGeneration);
    try {
      return await this.refreshInFlight;
    } finally {
      this.refreshInFlight = null;
    }
  }

  private async performRefresh(snapshot: SessionSnapshot, expectedGeneration: number): Promise<SessionSnapshot> {
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/v1/session/refresh`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: snapshot.refreshToken }),
      });
      if (!response.ok) throw new SessionError('refresh');
      const payload = parseRefresh(await response.json());
      if (!this.session || this.generation !== expectedGeneration || this.session.generation !== expectedGeneration) {
        throw new SessionError('anonymous');
      }
      return this.persist({
        actorId: snapshot.actorId,
        role: snapshot.role,
        ...payload,
        expiresAt: this.now() + payload.expiresIn * 1000,
      });
    } catch (error) {
      if (this.generation === expectedGeneration) await this.logout();
      if (error instanceof SessionError) throw error;
      throw new SessionError('refresh');
    }
  }

  private async persist(value: PersistedSession): Promise<SessionSnapshot> {
    const session = { ...value, generation: this.generation };
    await this.storage.write(value);
    this.session = session;
    return session;
  }
}

export class UnauthorizedResponseError extends Error {
  constructor() {
    super('Request is unauthorized');
    this.name = 'UnauthorizedResponseError';
  }
}

function isUnauthorized(error: unknown): error is UnauthorizedResponseError {
  return error instanceof UnauthorizedResponseError;
}

export function reduceRefreshEvents(events: readonly AuthEvent[]): Readonly<{
  status: 'anonymous' | 'authenticated';
  activeGeneration: number | null;
  refreshCalls: number;
  retriedRequestIds: readonly string[];
  persistedToken: string | null;
}> {
  let activeGeneration: number | null = null;
  let token: string | null = null;
  let refreshCalls = 0;
  let refreshPending = false;
  const waiting = new Set<string>();
  const retried = new Set<string>();

  for (const event of events) {
    if (event.type === 'logout') {
      activeGeneration = null;
      token = null;
      refreshPending = false;
      waiting.clear();
      continue;
    }
    if (event.type === 'request401') {
      if (!event.requestId || typeof event.generation !== 'number') continue;
      if (activeGeneration !== null && event.generation < activeGeneration) continue;
      waiting.add(event.requestId);
      if (!refreshPending) {
        refreshPending = true;
        refreshCalls += 1;
      }
      continue;
    }
    if (event.type === 'refreshSucceeded') {
      if (typeof event.generation !== 'number' || !event.token || !refreshPending) continue;
      activeGeneration = event.generation;
      token = event.token;
      refreshPending = false;
      for (const requestId of waiting) retried.add(requestId);
      waiting.clear();
      continue;
    }
    if (event.type === 'refreshFailed') {
      refreshPending = false;
      activeGeneration = null;
      token = null;
      waiting.clear();
    }
  }

  return {
    status: token ? 'authenticated' : 'anonymous',
    activeGeneration,
    refreshCalls,
    retriedRequestIds: [...retried],
    persistedToken: token,
  };
}

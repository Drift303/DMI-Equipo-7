import type { PendingIncidentOperation } from '../contracts';
import type { AtomicStore } from './store';
import { deduplicateOperations } from './merge';

export const CURRENT_SCHEMA_VERSION = 2;

export type WorkSnapshot = Readonly<{ assignedTechnicianId: string | null; status: string }>;

export type LocalIncident = Readonly<{
  id: string;
  version: number;
  status: string;
  assignedTechnicianId: string | null;
  priority?: string;
}>;

export type QueueEntryState = 'pending' | 'conflict' | 'rejected';

/** A pending change: PendingIncidentOperation plus the base snapshot needed for a 3-way merge. */
export type QueueEntry = PendingIncidentOperation & Readonly<{
  baseWork: WorkSnapshot;
  state: QueueEntryState;
  attempts: number;
  detail?: string | undefined;
  /** Base version of the first submit attempt; retries reuse it so the server sees the same request. */
  sentVersion?: number | undefined;
}>;

export type NewOperation = Omit<QueueEntry, 'state' | 'attempts' | 'detail' | 'sentVersion'>;

// Schema 1 stored loose pending notes without a base version.
type LegacyPending = Readonly<{
  id: string;
  incidentId: string;
  authorId: string;
  action: string;
  note?: string;
  photoRef?: string;
}>;

export type QueuePatch = Readonly<{
  state?: QueueEntryState;
  attempts?: number;
  detail?: string | undefined;
  baseVersion?: number;
  sentVersion?: number | undefined;
}>;

export type MigrationOptions = Readonly<{ failAfterStep?: 'incidents' | 'queue' }>;

const KEY_VERSION = 'schemaVersion';
const KEY_INCIDENTS = 'incidents';
const KEY_QUEUE = 'queue';
const KEY_LEGACY_QUEUE = 'pending';

function parse<T>(raw: string | undefined, fallback: T): T {
  return raw === undefined ? fallback : (JSON.parse(raw) as T);
}

/**
 * v1 -> v2. The whole new state is computed in memory and written in a single
 * atomic commit, so a failure at any point leaves the v1 data untouched.
 */
export async function migrateStore(store: AtomicStore, options: MigrationOptions = {}): Promise<number> {
  const data = await store.readAll();
  const version = Number(data[KEY_VERSION] ?? 1);

  if (version === CURRENT_SCHEMA_VERSION) {
    return version;
  }
  if (version !== 1) {
    throw new Error(`unsupported schema version ${version}`);
  }

  const incidents = parse<LocalIncident[]>(data[KEY_INCIDENTS], []);
  if (options.failAfterStep === 'incidents') {
    throw new Error('injected migration failure after incidents');
  }

  const legacy = parse<LegacyPending[]>(data[KEY_LEGACY_QUEUE], []);
  const queue: QueueEntry[] = legacy.map((item) => {
    const incident = incidents.find((candidate) => candidate.id === item.incidentId);
    return {
      operationId: item.id,
      incidentId: item.incidentId,
      actorId: item.authorId,
      action: item.action,
      baseVersion: incident?.version ?? 0,
      baseWork: {
        assignedTechnicianId: incident?.assignedTechnicianId ?? null,
        status: incident?.status ?? 'open',
      },
      payload: {
        ...(item.note === undefined ? {} : { note: item.note }),
        photoRefs: item.photoRef === undefined ? [] : [item.photoRef],
      },
      state: 'pending',
      attempts: 0,
    };
  });
  if (options.failAfterStep === 'queue') {
    throw new Error('injected migration failure after queue');
  }

  await store.commit(
    {
      [KEY_VERSION]: String(CURRENT_SCHEMA_VERSION),
      [KEY_INCIDENTS]: JSON.stringify(incidents),
      [KEY_QUEUE]: JSON.stringify(queue),
    },
    [KEY_LEGACY_QUEUE],
  );
  return CURRENT_SCHEMA_VERSION;
}

/** Persistent operation queue. Every mutation is committed before it resolves. */
export class OperationQueue {
  private entries: QueueEntry[] = [];

  private incidents: LocalIncident[] = [];

  constructor(private readonly store: AtomicStore) {}

  /** Opens the store (migrating when needed) and recovers the queue exactly as persisted. */
  async load(options: MigrationOptions = {}): Promise<void> {
    await migrateStore(this.store, options);
    const data = await this.store.readAll();
    this.entries = parse<QueueEntry[]>(data[KEY_QUEUE], []);
    this.incidents = parse<LocalIncident[]>(data[KEY_INCIDENTS], []);
  }

  list(): readonly QueueEntry[] {
    return this.entries;
  }

  getIncidents(): readonly LocalIncident[] {
    return this.incidents;
  }

  async saveIncidents(incidents: readonly LocalIncident[]): Promise<void> {
    await this.store.commit({
      [KEY_VERSION]: String(CURRENT_SCHEMA_VERSION),
      [KEY_INCIDENTS]: JSON.stringify(incidents),
    });
    this.incidents = [...incidents];
  }

  /** Re-enqueuing an operationId keeps the first entry. */
  async enqueue(operation: NewOperation): Promise<void> {
    const next = deduplicateOperations([
      ...this.entries,
      { ...operation, state: 'pending' as const, attempts: 0 },
    ]);
    await this.persist([...next]);
  }

  async update(operationId: string, patch: QueuePatch): Promise<void> {
    await this.persist(this.entries.map((entry) => (entry.operationId === operationId ? { ...entry, ...patch } : entry)));
  }

  /** Only server-confirmed operations are removed. */
  async removeConfirmed(operationIds: readonly string[]): Promise<void> {
    const confirmed = new Set(operationIds);
    await this.persist(this.entries.filter((entry) => !confirmed.has(entry.operationId)));
  }

  private async persist(entries: QueueEntry[]): Promise<void> {
    await this.store.commit({
      [KEY_VERSION]: String(CURRENT_SCHEMA_VERSION),
      [KEY_QUEUE]: JSON.stringify(entries),
    });
    this.entries = entries;
  }
}

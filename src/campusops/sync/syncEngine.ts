import type { CampusRole } from '../contracts';
import type { SyncRecord } from '../../course-evaluation/contracts';
import { resolveSync } from './merge';
import type { OperationQueue, QueueEntry, WorkSnapshot } from './operationQueue';

export type RemoteIncident = Readonly<{
  id: string;
  version: number;
  work: WorkSnapshot;
  priority?: string | undefined;
}>;

export type FetchOutcome =
  | Readonly<{ kind: 'ok'; incident: RemoteIncident }>
  | Readonly<{ kind: 'forbidden' }>
  | Readonly<{ kind: 'network' }>;

export type SubmitOutcome =
  | Readonly<{ kind: 'applied'; version: number }>
  | Readonly<{ kind: 'duplicate'; version: number }>
  | Readonly<{ kind: 'conflict' }>
  | Readonly<{ kind: 'forbidden' }>
  | Readonly<{ kind: 'network' }>;

export interface SyncRemote {
  fetchIncident(incidentId: string, actorId: string): Promise<FetchOutcome>;
  /** The server must treat operationId as an idempotency key. */
  submit(operation: QueueEntry, baseVersion: number): Promise<SubmitOutcome>;
}

export type SyncActor = Readonly<{ actorId: string; role: CampusRole }>;

export type SyncReport = Readonly<{
  confirmed: readonly string[];
  conflicts: readonly Readonly<{ operationId: string; fields: readonly string[]; reason: string }>[];
  rejected: readonly string[];
  stillPending: readonly string[];
}>;

const technicianActions = new Set(['start', 'resolve']);
const coordinatorActions = new Set(['assign', 'prioritize', 'close', 'reopen']);
const sharedActions = new Set(['comment', 'add_evidence']);

/** Role rules from week 6; the server remains the authority, this only avoids sending forbidden writes. */
export function isAuthorized(actor: SyncActor, entry: QueueEntry, remoteAssignee: string | null): boolean {
  if (entry.actorId !== actor.actorId) {
    return false;
  }
  if (coordinatorActions.has(entry.action)) {
    return actor.role === 'coordinator';
  }
  if (technicianActions.has(entry.action)) {
    return actor.role === 'technician' && remoteAssignee === actor.actorId;
  }
  return sharedActions.has(entry.action);
}

function localWork(entry: QueueEntry): WorkSnapshot {
  switch (entry.action) {
    case 'start':
      return { ...entry.baseWork, status: 'in_progress' };
    case 'resolve':
      return { ...entry.baseWork, status: 'resolved' };
    case 'assign':
      return {
        assignedTechnicianId: String(entry.payload.technicianId ?? entry.baseWork.assignedTechnicianId),
        status: 'assigned',
      };
    default:
      return entry.baseWork;
  }
}

function asRecords(entry: QueueEntry, remote: RemoteIncident): [SyncRecord, SyncRecord, SyncRecord] {
  return [
    { id: entry.incidentId, version: entry.baseVersion, fields: { work: entry.baseWork } },
    { id: entry.incidentId, version: entry.baseVersion, fields: { work: localWork(entry) } },
    { id: entry.incidentId, version: remote.version, fields: { work: remote.work } },
  ];
}

/**
 * Sends the actor's pending operations in order. An operation leaves the queue
 * only after the server confirms it (applied or duplicate); conflicts, rejections
 * and network errors keep it persisted.
 */
export async function syncQueue(queue: OperationQueue, remote: SyncRemote, actor: SyncActor): Promise<SyncReport> {
  const confirmed: string[] = [];
  const conflicts: { operationId: string; fields: readonly string[]; reason: string }[] = [];
  const rejected: string[] = [];
  const stillPending: string[] = [];

  for (const entry of queue.list().filter((item) => item.actorId === actor.actorId && item.state === 'pending')) {
    const fetched = await remote.fetchIncident(entry.incidentId, actor.actorId);

    if (fetched.kind === 'network') {
      await queue.update(entry.operationId, { attempts: entry.attempts + 1, detail: 'network' });
      stillPending.push(entry.operationId);
      continue;
    }
    if (fetched.kind === 'forbidden') {
      // The actor was assigned at the base version and can no longer see it: it was reassigned.
      const lostAssignment = entry.baseWork.assignedTechnicianId === actor.actorId;
      const detail = lostAssignment ? 'assignment_lost' : 'forbidden';
      await queue.update(entry.operationId, { state: lostAssignment ? 'conflict' : 'rejected', detail });
      if (lostAssignment) {
        conflicts.push({ operationId: entry.operationId, fields: ['work'], reason: detail });
      } else {
        rejected.push(entry.operationId);
      }
      continue;
    }

    const remoteIncident = fetched.incident;

    if (remoteIncident.version !== entry.baseVersion) {
      const [base, local, current] = asRecords(entry, remoteIncident);
      const resolution = resolveSync(base, local, current);
      if (resolution.kind === 'conflict') {
        await queue.update(entry.operationId, { state: 'conflict', detail: `conflict:${resolution.fields.join(',')}` });
        conflicts.push({ operationId: entry.operationId, fields: resolution.fields, reason: 'concurrent_change' });
        continue;
      }
    }

    if (!isAuthorized(actor, entry, remoteIncident.work.assignedTechnicianId)) {
      await queue.update(entry.operationId, { state: 'rejected', detail: 'forbidden' });
      rejected.push(entry.operationId);
      continue;
    }

    const sendVersion = entry.sentVersion ?? remoteIncident.version;
    if (entry.sentVersion === undefined) {
      await queue.update(entry.operationId, { sentVersion: sendVersion });
    }
    const outcome = await remote.submit(entry, sendVersion);
    if (outcome.kind === 'applied' || outcome.kind === 'duplicate') {
      await queue.removeConfirmed([entry.operationId]);
      confirmed.push(entry.operationId);
    } else if (outcome.kind === 'conflict' && entry.sentVersion !== undefined) {
      // The first attempt may not have been committed and the record moved on: recompute next time.
      await queue.update(entry.operationId, { sentVersion: undefined, detail: 'stale_retry' });
      stillPending.push(entry.operationId);
    } else if (outcome.kind === 'conflict') {
      await queue.update(entry.operationId, { state: 'conflict', detail: 'conflict:server' });
      conflicts.push({ operationId: entry.operationId, fields: ['work'], reason: 'server_conflict' });
    } else if (outcome.kind === 'forbidden') {
      await queue.update(entry.operationId, { state: 'rejected', detail: 'forbidden' });
      rejected.push(entry.operationId);
    } else {
      await queue.update(entry.operationId, { attempts: entry.attempts + 1, detail: 'network' });
      stillPending.push(entry.operationId);
    }
  }

  return { confirmed, conflicts, rejected, stillPending };
}

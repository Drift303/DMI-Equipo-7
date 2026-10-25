import type { FetchOutcome, SubmitOutcome, SyncRemote } from '../campusops/sync/syncEngine';
import type { QueueEntry } from '../campusops/sync/operationQueue';
import { parseRemoteResource } from '../course-evaluation';

type HttpSyncRemoteOptions = Readonly<{
  baseUrl?: string;
  accessToken: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}>;

function actionBody(entry: QueueEntry, baseVersion: number): Record<string, unknown> {
  const body: Record<string, unknown> = { action: entry.action, baseVersion };
  const { payload } = entry;
  if (entry.action === 'comment') {
    body.text = payload.note;
  } else if (entry.action === 'add_evidence') {
    const refs = Array.isArray(payload.photoRefs) ? payload.photoRefs : [];
    body.evidenceId = refs[0];
  } else if (entry.action === 'resolve') {
    body.diagnosis = payload.diagnosis;
  } else if (entry.action === 'assign') {
    body.technicianId = payload.technicianId;
  }
  return body;
}

/** Talks to the course backend; the entry's operationId is sent as the Idempotency-Key. */
export class HttpSyncRemote implements SyncRemote {
  private readonly baseUrl: string;

  private readonly fetchImpl: typeof fetch;

  private readonly timeoutMs: number;

  constructor(private readonly options: HttpSyncRemoteOptions) {
    this.baseUrl = options.baseUrl ?? 'http://127.0.0.1:4310';
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 2000;
  }

  private async request(path: string, actorId: string, init: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.options.accessToken}`,
          'X-Course-Actor': actorId,
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...init.headers,
        },
      });
    } finally {
      clearTimeout(timer);
    }
  }

  async fetchIncident(incidentId: string, actorId: string): Promise<FetchOutcome> {
    try {
      const response = await this.request(`/v1/incidents/${encodeURIComponent(incidentId)}`, actorId);
      if (response.status === 403) {
        return { kind: 'forbidden' };
      }
      if (!response.ok) {
        return { kind: 'network' };
      }
      const parsed = parseRemoteResource(await response.json());
      if (!parsed.ok || parsed.value.payload === null) {
        return { kind: 'network' };
      }
      const assigned = parsed.value.payload.assignedTechnicianId;
      return {
        kind: 'ok',
        incident: {
          id: parsed.value.id,
          version: parsed.value.version,
          work: {
            assignedTechnicianId: typeof assigned === 'string' ? assigned : null,
            status: parsed.value.status,
          },
          priority: typeof parsed.value.payload.priority === 'string' ? parsed.value.payload.priority : undefined,
        },
      };
    } catch {
      return { kind: 'network' };
    }
  }

  async submit(operation: QueueEntry, baseVersion: number): Promise<SubmitOutcome> {
    try {
      const response = await this.request(
        `/v1/incidents/${encodeURIComponent(operation.incidentId)}/actions`,
        operation.actorId,
        {
          method: 'POST',
          headers: { 'Idempotency-Key': operation.operationId },
          body: JSON.stringify(actionBody(operation, baseVersion)),
        },
      );
      if (response.status === 403) {
        return { kind: 'forbidden' };
      }
      if (response.status === 409) {
        return { kind: 'conflict' };
      }
      if (!response.ok) {
        return { kind: 'network' };
      }
      const body = (await response.json()) as { duplicate?: boolean; incident?: { version?: number } };
      const version = body.incident?.version ?? baseVersion + 1;
      return body.duplicate === true ? { kind: 'duplicate', version } : { kind: 'applied', version };
    } catch {
      return { kind: 'network' };
    }
  }
}

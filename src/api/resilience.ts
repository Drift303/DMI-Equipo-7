import {
  DEFAULT_RETRY_POLICY,
  planRetry,
  type RetryPolicy,
} from '../course-evaluation';

export type RetryFailure = Readonly<{
  status: number | 'timeout' | 'network';
  retryAfterMs?: number;
}>;

export type RetryMetrics = Readonly<{
  method: 'GET' | 'POST';
  attempts: number;
  attemptDurationsMs: readonly number[];
  retryDelaysMs: readonly number[];
  totalDurationMs: number;
  outcome: 'success' | 'failure';
}>;

type RunWithRetryOptions<T> = Readonly<{
  method: 'GET' | 'POST';
  idempotencyKey?: string;
  policy?: Partial<RetryPolicy>;
  execute: (attempt: number) => Promise<T>;
  classifyError: (error: unknown) => RetryFailure | null;
  sleep?: (delayMs: number) => Promise<void>;
  now?: () => number;
  onMetrics?: (metrics: RetryMetrics) => void;
}>;

export function parseRetryAfterHeader(value: string | null, nowMs = Date.now()): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value.trim());
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  const dateMs = Date.parse(value);
  if (!Number.isFinite(dateMs)) return undefined;
  return Math.max(0, dateMs - nowMs);
}

function elapsedMs(start: number, end: number): number {
  return Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, Math.round(end - start)) : 0;
}

function defaultSleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export async function runWithRetry<T>(options: RunWithRetryOptions<T>): Promise<Readonly<{
  value: T;
  metrics: RetryMetrics;
}>> {
  const policy = options.policy ?? DEFAULT_RETRY_POLICY;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;
  const startedAt = now();
  const attemptDurationsMs: number[] = [];
  const retryDelaysMs: number[] = [];

  const finish = (outcome: RetryMetrics['outcome']): RetryMetrics => ({
    method: options.method,
    attempts: attemptDurationsMs.length,
    attemptDurationsMs,
    retryDelaysMs,
    totalDurationMs: elapsedMs(startedAt, now()),
    outcome,
  });

  for (let attempt = 1; ; attempt += 1) {
    const attemptStartedAt = now();
    try {
      const value = await options.execute(attempt);
      attemptDurationsMs.push(elapsedMs(attemptStartedAt, now()));
      const metrics = finish('success');
      options.onMetrics?.(metrics);
      return { value, metrics };
    } catch (error) {
      attemptDurationsMs.push(elapsedMs(attemptStartedAt, now()));
      const failure = options.classifyError(error);
      if (!failure) {
        const metrics = finish('failure');
        options.onMetrics?.(metrics);
        throw error;
      }

      const retryInput = {
        method: options.method,
        status: failure.status,
        attempt,
        ...(failure.retryAfterMs !== undefined ? { retryAfterMs: failure.retryAfterMs } : {}),
        ...(options.idempotencyKey !== undefined ? { idempotencyKey: options.idempotencyKey } : {}),
      } as const;
      const decision = planRetry(retryInput, policy);
      if (!decision.retry) {
        const metrics = finish('failure');
        options.onMetrics?.(metrics);
        throw error;
      }

      retryDelaysMs.push(decision.delayMs);
      await sleep(decision.delayMs);
    }
  }
}

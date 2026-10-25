import type { JsonObject, SyncRecord } from '../../course-evaluation/contracts';

export type SyncResolution =
  | Readonly<{ kind: 'merged'; fields: JsonObject }>
  | Readonly<{ kind: 'conflict'; fields: readonly string[] }>;

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item) => {
    if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
      return Object.fromEntries(
        Object.keys(item as object)
          .sort()
          .map((key) => [key, (item as Record<string, unknown>)[key]]),
      );
    }
    return item;
  });
}

function sameJson(left: unknown, right: unknown): boolean {
  return canonical(left) === canonical(right);
}

/**
 * Three-way merge by top-level field. A field changed on both sides to
 * different content is a conflict; neither side is overwritten.
 */
export function resolveSync(base: SyncRecord, local: SyncRecord, remote: SyncRecord): SyncResolution {
  const names = [...new Set([
    ...Object.keys(base.fields),
    ...Object.keys(local.fields),
    ...Object.keys(remote.fields),
  ])].sort();

  const conflicts: string[] = [];
  const merged: Record<string, unknown> = {};

  for (const name of names) {
    const baseValue = base.fields[name];
    const localValue = local.fields[name];
    const remoteValue = remote.fields[name];
    const localChanged = !sameJson(baseValue, localValue);
    const remoteChanged = !sameJson(baseValue, remoteValue);

    let chosen: unknown;
    if (localChanged && remoteChanged) {
      if (!sameJson(localValue, remoteValue)) {
        conflicts.push(name);
        continue;
      }
      chosen = localValue;
    } else if (localChanged) {
      chosen = localValue;
    } else {
      chosen = remoteChanged ? remoteValue : baseValue;
    }

    if (chosen !== undefined) {
      merged[name] = structuredClone(chosen);
    }
  }

  return conflicts.length > 0
    ? { kind: 'conflict', fields: conflicts }
    : { kind: 'merged', fields: merged };
}

/** Keeps the first operation of every operationId, in order, without mutating the input. */
export function deduplicateOperations<T extends Readonly<{ operationId: string }>>(
  operations: readonly T[],
): readonly T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const operation of operations) {
    if (!seen.has(operation.operationId)) {
      seen.add(operation.operationId);
      result.push(operation);
    }
  }
  return result;
}

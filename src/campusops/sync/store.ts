/**
 * Key/value storage whose commit is all-or-nothing. A device adapter (SQLite
 * transaction, AsyncStorage multiSet guarded by a version key) must keep that contract.
 */
export interface AtomicStore {
  readAll(): Promise<Readonly<Record<string, string>>>;
  commit(writes: Readonly<Record<string, string>>, removals?: readonly string[]): Promise<void>;
}

export class MemoryAtomicStore implements AtomicStore {
  private data: Record<string, string>;

  private failNextCommit = false;

  constructor(initial: Record<string, string> = {}) {
    this.data = { ...initial };
  }

  /** Test hook: the next commit throws before applying anything. */
  injectCommitFailure(): void {
    this.failNextCommit = true;
  }

  async readAll(): Promise<Readonly<Record<string, string>>> {
    return { ...this.data };
  }

  async commit(writes: Readonly<Record<string, string>>, removals: readonly string[] = []): Promise<void> {
    if (this.failNextCommit) {
      this.failNextCommit = false;
      throw new Error('injected commit failure');
    }
    const next = { ...this.data, ...writes };
    for (const key of removals) {
      delete next[key];
    }
    this.data = next;
  }
}

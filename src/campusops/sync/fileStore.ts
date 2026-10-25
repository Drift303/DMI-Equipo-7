import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AtomicStore } from './store';

/** Disk-backed store for Node (tests, tooling): temp file + rename, so a crash never leaves half a commit. */
export class FileAtomicStore implements AtomicStore {
  constructor(private readonly filePath: string) {}

  async readAll(): Promise<Readonly<Record<string, string>>> {
    try {
      return JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as Record<string, string>;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return {};
      }
      throw error;
    }
  }

  async commit(writes: Readonly<Record<string, string>>, removals: readonly string[] = []): Promise<void> {
    const next: Record<string, string> = { ...(await this.readAll()), ...writes };
    for (const key of removals) {
      delete next[key];
    }
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temp = `${this.filePath}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(next), 'utf8');
    fs.renameSync(temp, this.filePath);
  }
}

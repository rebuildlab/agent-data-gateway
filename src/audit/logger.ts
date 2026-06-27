import { appendFileSync } from 'fs';
import type { AccessEntry } from './types.js';

export class FileAuditLogger {
  private entries: AccessEntry[] = [];
  private output: string;

  constructor(output: string) {
    this.output = output;
    this.entries = [];
  }

  log(entry: AccessEntry): void {
    this.entries.push(entry);
    if (this.output) {
      const line = JSON.stringify(entry) + '\n';
      try {
        appendFileSync(this.output, line);
      } catch {
        // Silently fail if file can't be written
      }
    }
  }

  getEntries(): AccessEntry[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries = [];
  }
}

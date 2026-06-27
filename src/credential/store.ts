import type { Config, Credential, Source } from '../config/types.js';

export type CredentialMap = Map<string, Credential>;

export class CredentialStore {
  private store: CredentialMap = new Map();
  private sealed = false;

  static fromConfig(config: Config): CredentialStore {
    const store = new CredentialStore();
    for (const source of config.sources) {
      const key = source.name;
      if (store.store.has(key)) {
        throw new Error(`Duplicate source name: ${key}`);
      }
      store.store.set(key, source.credentials);
    }
    store.sealed = true;
    return store;
  }

  get(sourceName: string): Credential | undefined {
    if (!this.sealed) {
      throw new Error('Credential store not yet sealed');
    }
    return this.store.get(sourceName);
  }

  has(sourceName: string): boolean {
    return this.store.has(sourceName);
  }

  get size(): number {
    return this.store.size;
  }
}

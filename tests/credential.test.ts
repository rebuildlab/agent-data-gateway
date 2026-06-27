import { describe, it, expect } from 'vitest';
import { CredentialStore } from '../src/credential/store.js';
import { loadConfig } from '../src/config/loader.js';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const exampleConfig = resolve(__dirname, '../examples/config.yaml');

describe('CredentialStore', () => {
  const config = loadConfig(exampleConfig);
  const store = CredentialStore.fromConfig(config);

  it('stores credentials from config', () => {
    expect(store.size).toBe(3);
  });

  it('retrieves credentials by source name', () => {
    const creds = store.get('analytics_db');
    expect(creds).toBeDefined();
    expect(creds).toHaveProperty('password');
  });

  it('returns undefined for unknown source', () => {
    expect(store.get('nonexistent')).toBeUndefined();
  });

  it('is sealed after construction', () => {
    expect(() => {
      CredentialStore.fromConfig(config).get('analytics_db');
    }).not.toThrow();
  });

  it('prevents duplicate source names', () => {
    const badConfig = {
      ...config,
      sources: [...config.sources, config.sources[0]],
    };
    expect(() => CredentialStore.fromConfig(badConfig)).toThrow('Duplicate source name');
  });
});

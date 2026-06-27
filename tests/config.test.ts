import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config/loader.js';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const exampleConfig = resolve(__dirname, '../examples/config.yaml');

describe('Config schema', () => {
  it('loads example config without error', () => {
    const config = loadConfig(exampleConfig);
    expect(config.sources).toHaveLength(2);
    expect(config.scopes).toHaveLength(2);
  });

  it('parses Postgres source type', () => {
    const config = loadConfig(exampleConfig);
    const pg = config.sources.find((s) => s.type === 'postgres');
    expect(pg).toBeDefined();
    expect(pg!.name).toBe('analytics_db');
  });

  it('parses REST source type', () => {
    const config = loadConfig(exampleConfig);
    const rest = config.sources.find((s) => s.type === 'rest');
    expect(rest).toBeDefined();
    expect(rest!.name).toBe('github_api');
  });

  it('rejects invalid config', () => {
    expect(() => loadConfig('/tmp/nonexistent.yaml')).toThrow();
  });

  it('validates source credentials exist', () => {
    const config = loadConfig(exampleConfig);
    for (const source of config.sources) {
      expect(source.credentials).toBeDefined();
    }
  });
});

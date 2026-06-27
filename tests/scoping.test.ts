import { describe, it, expect } from 'vitest';
import { evaluateScope, rewriteQuery } from '../src/proxy/scoping.js';
import { loadConfig } from '../src/config/loader.js';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const exampleConfig = resolve(__dirname, '../examples/config.yaml');
const config = loadConfig(exampleConfig);

describe('Data scoping enforcement', () => {
  it('permits access for configured agent', () => {
    const result = evaluateScope('code-review-bot', 'analytics_db', 'pull_requests', config.scopes);
    expect(result.permitted).toBe(true);
  });

  it('denies access for unknown agent', () => {
    const result = evaluateScope('unknown-agent', 'analytics_db', 'pull_requests', config.scopes);
    expect(result.permitted).toBe(false);
    expect(result.reason).toContain('No scope defined');
  });

  it('denies access to unauthorized source', () => {
    const result = evaluateScope('code-review-bot', 'github_api', 'repos', config.scopes);
    expect(result.permitted).toBe(false);
    expect(result.reason).toContain('no access to source');
  });

  it('denies access to unauthorized table', () => {
    const result = evaluateScope('code-review-bot', 'analytics_db', 'secrets', config.scopes);
    expect(result.permitted).toBe(false);
    expect(result.reason).toContain('not in scope');
  });

  it('restricts fields per scope rule', () => {
    const result = evaluateScope('code-review-bot', 'analytics_db', 'pull_requests', config.scopes);
    expect(result.permitted).toBe(true);
    expect(result.scopedQuery?.fields).toContain('id');
    expect(result.scopedQuery?.fields).toContain('title');
    expect(result.scopedQuery?.fields).not.toContain('password');
  });

  it('applies filters from scope rule', () => {
    const result = evaluateScope('code-review-bot', 'analytics_db', 'pull_requests', config.scopes);
    expect(result.permitted).toBe(true);
    expect(result.scopedQuery?.filters).toHaveProperty('status');
  });
});

describe('Query rewriting', () => {
  it('rewrites SELECT with field restrictions', () => {
    const { sql } = rewriteQuery('SELECT * FROM pull_requests', {
      table: 'pull_requests',
      fields: ['id', 'title', 'status'],
      originalQuery: 'SELECT * FROM pull_requests',
    });
    expect(sql).toContain('SELECT id, title, status FROM');
    expect(sql).not.toContain('SELECT *');
  });

  it('applies filters as WHERE clauses', () => {
    const { sql, params } = rewriteQuery('SELECT * FROM pull_requests', {
      table: 'pull_requests',
      filters: { status: 'open' },
      originalQuery: 'SELECT * FROM pull_requests',
    });
    expect(sql).toContain('WHERE');
    expect(params).toContain('open');
  });

  it('merges scope filters with existing WHERE', () => {
    const { sql, params } = rewriteQuery(
      'SELECT * FROM pull_requests WHERE author = $1',
      {
        table: 'pull_requests',
        fields: ['id', 'title'],
        filters: { status: 'open', archived: false },
        originalQuery: 'SELECT * FROM pull_requests',
      }
    );
    expect(sql).toContain('WHERE');
    expect(params.length).toBeGreaterThan(0);
  });
});

/**
 * Toolbox Config Generator Tests
 */

import { describe, it, expect } from 'vitest';
import {
  generateToolboxConfig,
  serializeToolboxYaml,
  hasDatabaseSources,
} from '../src/toolbox/config.js';
import type { Config } from '../src/config/types.js';

const minimalConfig: Config = {
  version: '1',
  sources: [
    {
      type: 'postgres',
      name: 'analytics_db',
      connection: { host: 'localhost', database: 'analytics', port: 5432 },
      credentials: { host: 'localhost', database: 'analytics', username: 'u', password: 'p' },
    },
  ],
  scopes: [
    {
      agent: 'code-review-bot',
      sources: [
        {
          name: 'analytics_db',
          rules: [
            {
              table: 'pull_requests',
              fields: ['id', 'title', 'status'],
              filters: { status: 'open' },
            },
          ],
        },
      ],
    },
  ],
  governance: { enabled: false },
  audit: { enabled: true, format: 'jsonl', output: '/tmp/test.log' },
};

describe('Toolbox Config Generator', () => {
  describe('generateToolboxConfig', () => {
    it('generates sources for database-type sources', () => {
      const tc = generateToolboxConfig(minimalConfig);
      expect(tc.sources).toHaveLength(1);
      expect(tc.sources[0].kind).toBe('source');
      expect(tc.sources[0].name).toBe('analytics_db');
      expect(tc.sources[0].type).toBe('postgres');
    });

    it('skips REST sources (not database)', () => {
      const config: Config = {
        ...minimalConfig,
        sources: [
          ...minimalConfig.sources,
          {
            type: 'rest',
            name: 'github_api',
            connection: { url: 'https://api.github.com' },
            credentials: { apiKey: 'key123' },
          },
        ],
      };
      const tc = generateToolboxConfig(config);
      expect(tc.sources).toHaveLength(1); // Only postgres
    });

    it('generates tools from scope rules', () => {
      const tc = generateToolboxConfig(minimalConfig);
      expect(tc.tools.length).toBeGreaterThan(0);

      const prTool = tc.tools.find((t) => t.name.includes('pull_requests'));
      expect(prTool).toBeDefined();
      expect(prTool!.type).toBe('postgres-sql');
      expect(prTool!.source).toBe('analytics_db');
      expect(prTool!.statement).toContain('SELECT');
      expect(prTool!.statement).toContain('id, title, status');
    });

    it('generates toolsets per source', () => {
      const tc = generateToolboxConfig(minimalConfig);
      expect(tc.toolsets.length).toBeGreaterThan(0);
      expect(tc.toolsets[0].name).toBe('analytics_db_tools');
    });

    it('handles wildcard table scopes with table parameter', () => {
      const config: Config = {
        ...minimalConfig,
        scopes: [
          {
            agent: 'admin-bot',
            sources: [
              {
                name: 'analytics_db',
                rules: [{ fields: ['*'] }],
              },
            ],
          },
        ],
      };
      const tc = generateToolboxConfig(config);
      const wildcardTool = tc.tools.find((t) => t.name.includes('admin-bot'));
      expect(wildcardTool).toBeDefined();

      // Should have a 'table' parameter for wildcard scopes
      const tableParam = wildcardTool!.parameters.find((p) => p.name === 'table');
      expect(tableParam).toBeDefined();
    });

    it('applies governance maxRows to tools', () => {
      const config: Config = {
        ...minimalConfig,
        governance: {
          enabled: true,
          sourcePolicies: [
            {
              source: 'analytics_db',
              defaultClassification: 'internal',
              tables: [
                { table: 'pull_requests', classification: 'internal', maxRows: 50 },
              ],
            },
          ],
        },
      };
      const tc = generateToolboxConfig(config);
      const prTool = tc.tools.find((t) => t.name.includes('pull_requests'));
      expect(prTool).toBeDefined();
      expect(prTool!.maxRows).toBe(50);
    });

    it('generates tools for multiple agents scoped to same table', () => {
      const config: Config = {
        ...minimalConfig,
        scopes: [
          ...minimalConfig.scopes,
          {
            agent: 'data-scientist',
            sources: [
              {
                name: 'analytics_db',
                rules: [
                  {
                    table: 'pull_requests',
                    fields: ['id', 'title', 'author', 'metrics'],
                  },
                ],
              },
            ],
          },
        ],
      };
      const tc = generateToolboxConfig(config);
      // Should have tools for both agents
      const reviewTools = tc.tools.filter((t) => t.name.includes('code-review-bot'));
      const scientistTools = tc.tools.filter((t) => t.name.includes('data-scientist'));
      expect(reviewTools.length).toBeGreaterThan(0);
      expect(scientistTools.length).toBeGreaterThan(0);
    });
  });

  describe('serializeToolboxYaml', () => {
    it('produces valid YAML with document separators', () => {
      const tc = generateToolboxConfig(minimalConfig);
      const yaml = serializeToolboxYaml(tc);
      expect(yaml).toContain('kind: source');
      expect(yaml).toContain('kind: tool');
      expect(yaml).toContain('kind: toolset');
      expect(yaml).toContain('---'); // Document separators
    });

    it('produces parsable YAML', () => {
      const tc = generateToolboxConfig(minimalConfig);
      const yaml = serializeToolboxYaml(tc);
      // Should not throw when parsed
      const { parse } = require('yaml');
      expect(() => {
        const docs = yaml.split('---\n').filter(Boolean);
        for (const doc of docs) {
          parse(doc);
        }
      }).not.toThrow();
    });
  });

  describe('hasDatabaseSources', () => {
    it('returns true when config has database sources', () => {
      expect(hasDatabaseSources(minimalConfig)).toBe(true);
    });

    it('returns false when config has only REST sources', () => {
      const config: Config = {
        ...minimalConfig,
        sources: [
          {
            type: 'rest',
            name: 'api_only',
            connection: { url: 'https://api.example.com' },
            credentials: { apiKey: 'key123' },
          },
        ],
      };
      expect(hasDatabaseSources(config)).toBe(false);
    });

    it('returns true with mixed sources', () => {
      const config: Config = {
        ...minimalConfig,
        sources: [
          ...minimalConfig.sources,
          {
            type: 'rest',
            name: 'api',
            connection: { url: 'https://api.example.com' },
            credentials: { apiKey: 'key123' },
          },
        ],
      };
      expect(hasDatabaseSources(config)).toBe(true);
    });
  });

  describe('Cloud source types', () => {
    it('maps cloud-sql-postgres type correctly', () => {
      const config: Config = {
        ...minimalConfig,
        sources: [
          {
            type: 'cloud-sql-postgres',
            name: 'prod_db',
            connection: {
              project: 'my-project',
              region: 'us-central1',
              instance: 'prod-instance',
              database: 'production',
            },
            credentials: { host: '', database: '', username: 'svc', password: 'secret' },
          },
        ],
      };
      const tc = generateToolboxConfig(config);
      expect(tc.sources[0].type).toBe('cloud-sql-postgres');
      expect(tc.sources[0].project).toBe('my-project');
      expect(tc.sources[0].region).toBe('us-central1');
      expect(tc.sources[0].instance).toBe('prod-instance');
    });

    it('handles BigQuery sources', () => {
      const config: Config = {
        ...minimalConfig,
        sources: [
          {
            type: 'bigquery',
            name: 'warehouse',
            connection: { project: 'data-project' },
            credentials: { host: '', database: '', username: '', password: '' },
          },
        ],
      };
      const tc = generateToolboxConfig(config);
      expect(tc.sources[0].type).toBe('bigquery');
    });
  });
});

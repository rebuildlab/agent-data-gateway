/**
 * Governance Engine Tests
 */

import { describe, it, expect } from 'vitest';
import {
  evaluateGovernance,
  quickGovernanceCheck,
  findAgentPolicy,
  findSourcePolicy,
  findTablePolicy,
  findColumnPolicy,
  canAccessClassification,
  maskValue,
  applyColumnMasking,
} from '../src/governance/engine.js';
import type { Governance, AgentPolicy, SourcePolicy, TablePolicy } from '../src/config/types.js';

const defaultGovernance: Governance = {
  enabled: true,
  sourcePolicies: [
    {
      source: 'analytics_db',
      defaultClassification: 'internal',
      tables: [
        {
          table: 'users',
          classification: 'pii',
          maxRows: 100,
          columns: [
            { name: 'email', classification: 'pii', masking: 'partial', maskFormat: '***@****.***' },
            { name: 'ssn', classification: 'pii', masking: 'redact' },
            { name: 'name', classification: 'pii', masking: 'none' },
          ],
          rowFilter: 'deleted_at IS NULL',
        },
        {
          table: 'pull_requests',
          classification: 'internal',
          maxRows: 500,
        },
      ],
    },
  ],
  agentPolicies: [
    {
      agent: 'code-review-bot',
      allowedClassifications: ['public', 'internal'],
      maxRowsPerQuery: 500,
      maxConcurrency: 3,
      queryTimeoutMs: 15000,
      allowedOperations: ['SELECT'],
      allowedSources: ['analytics_db'],
      allowRawSQL: false,
    },
    {
      agent: 'admin-bot',
      allowedClassifications: ['public', 'internal', 'confidential', 'restricted', 'pii'],
      maxRowsPerQuery: 10000,
      maxConcurrency: 10,
      queryTimeoutMs: 120000,
      allowedOperations: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
      requireApprovalForWrites: true,
      allowRawSQL: true,
    },
  ],
  defaultAgentPolicy: {
    agent: 'default',
    allowedClassifications: ['public'],
    maxRowsPerQuery: 100,
    maxConcurrency: 1,
    queryTimeoutMs: 10000,
    allowedOperations: ['SELECT'],
  },
};

describe('Governance Engine', () => {
  // ── Agent Policy Lookup ──────────────────────────────────────

  describe('findAgentPolicy', () => {
    it('returns explicit policy when agent matches', () => {
      const policy = findAgentPolicy('code-review-bot', defaultGovernance);
      expect(policy.agent).toBe('code-review-bot');
      expect(policy.allowedClassifications).toContain('internal');
    });

    it('falls back to default policy for unknown agents', () => {
      const policy = findAgentPolicy('unknown-bot', defaultGovernance);
      expect(policy.agent).toBe('default');
      expect(policy.allowedClassifications).toEqual(['public']);
    });
  });

  // ── Classification Checks ────────────────────────────────────

  describe('canAccessClassification', () => {
    it('allows agent to access data at or below their clearance', () => {
      const agentPolicy: AgentPolicy = {
        agent: 'test',
        allowedClassifications: ['public', 'internal'],
        maxRowsPerQuery: 100,
        maxConcurrency: 1,
        queryTimeoutMs: 5000,
        allowedOperations: ['SELECT'],
      };

      expect(canAccessClassification(agentPolicy, 'public')).toBe(true);
      expect(canAccessClassification(agentPolicy, 'internal')).toBe(true);
    });

    it('blocks agent from data above their clearance', () => {
      const agentPolicy: AgentPolicy = {
        agent: 'test',
        allowedClassifications: ['public'],
        maxRowsPerQuery: 100,
        maxConcurrency: 1,
        queryTimeoutMs: 5000,
        allowedOperations: ['SELECT'],
      };

      expect(canAccessClassification(agentPolicy, 'pii')).toBe(false);
      expect(canAccessClassification(agentPolicy, 'confidential')).toBe(false);
    });
  });

  // ── Column Masking ───────────────────────────────────────────

  describe('maskValue', () => {
    it('returns value unchanged with "none" strategy', () => {
      expect(maskValue('hello@test.com', 'none')).toBe('hello@test.com');
    });

    it('redacts value completely', () => {
      expect(maskValue('hello@test.com', 'redact')).toBe('***REDACTED***');
    });

    it('hashes value deterministically', () => {
      const h1 = maskValue('hello@test.com', 'hash');
      const h2 = maskValue('hello@test.com', 'hash');
      expect(h1).toBe(h2);
      expect(String(h1)).toMatch(/^sha256:[a-f0-9]+$/);
    });

    it('tokenizes value', () => {
      const tok = maskValue('hello@test.com', 'tokenize');
      expect(String(tok)).toMatch(/^tok_[a-f0-9]+$/);
    });

    it('partially masks with default (show last 4)', () => {
      expect(maskValue('hello@test.com', 'partial')).toBe('****.com');
      expect(maskValue('ab', 'partial')).toBe('****');
    });

    it('partially masks with custom format', () => {
      expect(maskValue('123-45-6789', 'partial', '***-**-****')).toBe('***-**-6789');
    });

    it('handles null/undefined gracefully', () => {
      expect(maskValue(null, 'redact')).toBeNull();
      expect(maskValue(undefined, 'hash')).toBeUndefined();
    });
  });

  // ── Row Masking ──────────────────────────────────────────────

  describe('applyColumnMasking', () => {
    it('applies masking to specified columns', () => {
      const rows = [
        { id: 1, email: 'alice@test.com', name: 'Alice' },
        { id: 2, email: 'bob@test.com', name: 'Bob' },
      ];

      const tablePolicy: TablePolicy = {
        table: 'users',
        classification: 'pii',
        columns: [
          { name: 'email', classification: 'pii', masking: 'redact' },
          { name: 'name', classification: 'pii', masking: 'none' },
        ],
      };

      const result = applyColumnMasking(rows, tablePolicy, defaultGovernance);
      expect(result[0].email).toBe('***REDACTED***');
      expect(result[0].name).toBe('Alice');
      expect(result[1].email).toBe('***REDACTED***');
      expect(result[1].name).toBe('Bob');
    });

    it('returns rows unchanged when no masking columns', () => {
      const rows = [{ id: 1, name: 'Alice' }];
      const tablePolicy: TablePolicy = {
        table: 'users',
        classification: 'internal',
        columns: [{ name: 'name', classification: 'internal', masking: 'none' }],
      };
      const result = applyColumnMasking(rows, tablePolicy, defaultGovernance);
      expect(result).toEqual(rows);
    });

    it('returns rows unchanged when no table policy columns', () => {
      const rows = [{ id: 1 }];
      const result = applyColumnMasking(rows, undefined, defaultGovernance);
      expect(result).toEqual(rows);
    });
  });

  // ── Full Governance Evaluation ───────────────────────────────

  describe('evaluateGovernance', () => {
    it('allows SELECT on internal data for code-review-bot', () => {
      const result = evaluateGovernance(
        { sourceName: 'analytics_db', table: 'pull_requests', columns: ['id', 'title'], operation: 'SELECT' },
        'code-review-bot',
        defaultGovernance
      );
      expect(result.allowed).toBe(true);
      expect(result.maxRows).toBe(500); // min(table:500, agent:500)
    });

    it('blocks code-review-bot from PII-classified table', () => {
      const result = evaluateGovernance(
        { sourceName: 'analytics_db', table: 'users', columns: ['email'], operation: 'SELECT' },
        'code-review-bot',
        defaultGovernance
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('pii');
    });

    it('allows admin-bot to access PII data', () => {
      const result = evaluateGovernance(
        { sourceName: 'analytics_db', table: 'users', columns: ['email'], operation: 'SELECT' },
        'admin-bot',
        defaultGovernance
      );
      expect(result.allowed).toBe(true);
      expect(result.maxRows).toBe(100); // table policy: 100
      expect(result.maskedColumns).toBeDefined();
      expect(result.maskedColumns!.find((c) => c.name === 'email')).toBeDefined();
    });

    it('blocks write operations that require approval', () => {
      const result = evaluateGovernance(
        { sourceName: 'analytics_db', table: 'users', columns: [], operation: 'DELETE' },
        'admin-bot',
        defaultGovernance
      );
      expect(result.requiresApproval).toBe(true);
      // Still allowed, but requires approval
    });

    it('blocks agents from restricted sources', () => {
      const result = evaluateGovernance(
        { sourceName: 'other_db', table: 'secrets', columns: [], operation: 'SELECT' },
        'code-review-bot',
        defaultGovernance
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('not allowed to access source');
    });

    it('blocks operations not in allowedOperations', () => {
      const result = evaluateGovernance(
        { sourceName: 'analytics_db', table: 'pull_requests', columns: [], operation: 'INSERT' },
        'code-review-bot',
        defaultGovernance
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('INSERT');
    });

    it('returns row filter when table policy defines one', () => {
      const result = evaluateGovernance(
        { sourceName: 'analytics_db', table: 'users', columns: ['id'], operation: 'SELECT' },
        'admin-bot',
        defaultGovernance
      );
      expect(result.rowFilter).toBe('deleted_at IS NULL');
    });

    it('passes all queries when governance is disabled', () => {
      const govDisabled: Governance = {
        ...defaultGovernance,
        enabled: false,
      };
      const result = evaluateGovernance(
        { sourceName: 'analytics_db', table: 'users', columns: ['email'], operation: 'SELECT' },
        'code-review-bot',
        govDisabled
      );
      expect(result.allowed).toBe(true);
    });
  });

  // ── Quick Check ──────────────────────────────────────────────

  describe('quickGovernanceCheck', () => {
    it('returns allowed=true for valid access', () => {
      const result = quickGovernanceCheck(
        'code-review-bot',
        'analytics_db',
        'pull_requests',
        defaultGovernance
      );
      expect(result.allowed).toBe(true);
    });

    it('returns allowed=false for PII without clearance', () => {
      const result = quickGovernanceCheck(
        'code-review-bot',
        'analytics_db',
        'users',
        defaultGovernance
      );
      expect(result.allowed).toBe(false);
    });
  });

  // ── Source/Table Lookup Helpers ─────────────────────────────

  describe('findSourcePolicy', () => {
    it('finds existing source policy', () => {
      const policy = findSourcePolicy('analytics_db', defaultGovernance);
      expect(policy).toBeDefined();
      expect(policy!.defaultClassification).toBe('internal');
    });

    it('returns undefined for unknown source', () => {
      const policy = findSourcePolicy('nonexistent', defaultGovernance);
      expect(policy).toBeUndefined();
    });
  });

  describe('findTablePolicy', () => {
    it('finds table policy within source policy', () => {
      const sourcePolicy = findSourcePolicy('analytics_db', defaultGovernance)!;
      const tablePolicy = findTablePolicy('users', sourcePolicy);
      expect(tablePolicy).toBeDefined();
      expect(tablePolicy!.classification).toBe('pii');
    });
  });

  describe('findColumnPolicy', () => {
    it('finds column policy within table policy', () => {
      const sourcePolicy = findSourcePolicy('analytics_db', defaultGovernance)!;
      const tablePolicy = findTablePolicy('users', sourcePolicy)!;
      const colPolicy = findColumnPolicy('email', tablePolicy);
      expect(colPolicy).toBeDefined();
      expect(colPolicy!.masking).toBe('partial');
    });
  });
});

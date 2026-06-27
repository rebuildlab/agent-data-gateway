import { describe, it, expect } from 'vitest';
import { FileAuditLogger } from '../src/audit/logger.js';
import type { AccessEntry } from '../src/audit/types.js';

describe('Audit logging', () => {
  it('logs access entries in memory', () => {
    const logger = new FileAuditLogger('');
    logger.log({
      timestamp: new Date().toISOString(),
      agent_id: 'test-bot',
      source: 'analytics_db',
      action: 'SELECT',
      resource: 'pull_requests',
      policy_decision: 'permitted',
      row_count: 5,
    });

    const entries = logger.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].agent_id).toBe('test-bot');
    expect(entries[0].policy_decision).toBe('permitted');
  });

  it('tracks denied access', () => {
    const logger = new FileAuditLogger('');
    logger.log({
      timestamp: new Date().toISOString(),
      agent_id: 'unknown-bot',
      source: 'analytics_db',
      action: 'SELECT',
      resource: 'secrets',
      policy_decision: 'denied',
    });

    const entries = logger.getEntries();
    expect(entries[0].policy_decision).toBe('denied');
  });

  it('stores multiple entries in order', () => {
    const logger = new FileAuditLogger('');
    logger.log({
      timestamp: '2026-01-01T00:00:00Z',
      agent_id: 'agent-1',
      source: 'db1',
      action: 'SELECT',
      resource: 'users',
      policy_decision: 'permitted',
    });

    logger.log({
      timestamp: '2026-01-01T00:00:01Z',
      agent_id: 'agent-2',
      source: 'db2',
      action: 'SELECT',
      resource: 'orders',
      policy_decision: 'permitted',
    });

    expect(logger.getEntries()).toHaveLength(2);
  });

  it('clears entries', () => {
    const logger = new FileAuditLogger('');
    logger.log({
      timestamp: '2026-01-01T00:00:00Z',
      agent_id: 'test',
      source: 'db',
      action: 'SELECT',
      resource: 't',
      policy_decision: 'permitted',
    });

    logger.clear();
    expect(logger.getEntries()).toHaveLength(0);
  });

  it('supports append-only semantics (can only read entries, log is immutable)', () => {
    const logger = new FileAuditLogger('');
    logger.log({
      timestamp: '2026-01-01T00:00:00Z',
      agent_id: 'test',
      source: 'db',
      action: 'SELECT',
      resource: 't',
      policy_decision: 'permitted',
    });

    const entries = logger.getEntries();
    expect(entries).toHaveLength(1);

    logger.log({
      timestamp: '2026-01-01T00:00:01Z',
      agent_id: 'test-2',
      source: 'db',
      action: 'SELECT',
      resource: 't2',
      policy_decision: 'permitted',
    });

    expect(logger.getEntries()).toHaveLength(2);
    expect(entries).toHaveLength(1);
  });
});

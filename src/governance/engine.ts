/**
 * Governance Policy Engine
 *
 * Enforces data governance policies at query time:
 * - Data classification (Public, Internal, Confidential, PII, PHI, PCI)
 * - Column-level masking (redact, hash, tokenize, partial mask)
 * - Agent policy enforcement (allowed classifications, row limits, concurrency)
 * - Row-level security filters
 * - Write operation approval gates
 */

import type {
  AgentPolicy,
  ColumnPolicy,
  DataClass,
  Governance,
  SourcePolicy,
  TablePolicy,
} from '../config/types.js';

// ── Classification hierarchy ──────────────────────────────────────
// Higher index = more sensitive, agents can access UP TO their allowed level

const CLASSIFICATION_LEVEL: Record<DataClass, number> = {
  public: 0,
  internal: 1,
  confidential: 2,
  restricted: 3,
  pii: 4,
  phi: 5,
  pci: 6,
};

// ── Decision types ────────────────────────────────────────────────

export interface GovernanceDecision {
  allowed: boolean;
  reason?: string;
  /** Columns to mask and their masking strategy */
  maskedColumns?: Array<{ name: string; strategy: ColumnPolicy['masking']; format?: string }>;
  /** Row-level filter to inject (e.g., "region = 'EU'") */
  rowFilter?: string;
  /** Max rows to return */
  maxRows: number;
  /** Whether write approval is required */
  requiresApproval: boolean;
}

export interface QueryClassification {
  sourceName: string;
  table: string;
  columns: string[];
  operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
}

// ── Policy Lookup ─────────────────────────────────────────────────

export function findAgentPolicy(
  agentId: string,
  governance: Governance
): AgentPolicy {
  const explicit = governance.agentPolicies?.find((p) => p.agent === agentId);
  return explicit || governance.defaultAgentPolicy;
}

export function findSourcePolicy(
  sourceName: string,
  governance: Governance
): SourcePolicy | undefined {
  return governance.sourcePolicies?.find((p) => p.source === sourceName);
}

export function findTablePolicy(
  table: string,
  sourcePolicy?: SourcePolicy
): TablePolicy | undefined {
  return sourcePolicy?.tables?.find((t) => t.table === table);
}

export function findColumnPolicy(
  columnName: string,
  tablePolicy?: TablePolicy
): ColumnPolicy | undefined {
  return tablePolicy?.columns?.find((c) => c.name === columnName);
}

// ── Classification Check ──────────────────────────────────────────

/**
 * Check if an agent is allowed to access data at a given classification level.
 * An agent can access data at or below their highest allowed classification.
 */
export function canAccessClassification(
  agentPolicy: AgentPolicy,
  classification: DataClass
): boolean {
  const maxAllowed = Math.max(
    ...agentPolicy.allowedClassifications.map((c) => CLASSIFICATION_LEVEL[c] || 0)
  );
  const targetLevel = CLASSIFICATION_LEVEL[classification] || 0;
  return targetLevel <= maxAllowed;
}

// ── Column Masking ────────────────────────────────────────────────

export function maskValue(
  value: unknown,
  strategy: ColumnPolicy['masking'],
  format?: string
): unknown {
  if (value === null || value === undefined) return value;

  switch (strategy) {
    case 'none':
      return value;

    case 'redact':
      return '***REDACTED***';

    case 'hash':
      return `sha256:${simpleHash(String(value))}`;

    case 'tokenize':
      return `tok_${simpleHash(String(value)).slice(0, 12)}`;

    case 'partial': {
      // Use mask format if provided, e.g. "***-***-1234"
      const str = String(value);
      if (format) {
        // Simple format: replace non-digit/non-alpha with mask,
        // keep matching chars from end
        return applyMaskFormat(str, format);
      }
      // Default: show last 4, mask the rest
      if (str.length <= 4) return '****';
      return '****' + str.slice(-4);
    }

    default:
      return value;
  }
}

function applyMaskFormat(value: string, format: string): string {
  // Count trailing '*' as visible positions
  let visibleCount = 0;
  for (let i = format.length - 1; i >= 0; i--) {
    if (format[i] === '*') visibleCount++;
    else break;
  }

  const visiblePart = visibleCount > 0 ? value.slice(-visibleCount) : '';
  let visibleIdx = 0;

  const result: string[] = [];
  for (let i = 0; i < format.length; i++) {
    if (format[i] === '*') {
      // Is this position in the visible tail?
      if (i >= format.length - visibleCount && visibleIdx < visiblePart.length) {
        result.push(visiblePart[visibleIdx]);
        visibleIdx++;
      } else {
        result.push('*');
      }
    } else {
      result.push(format[i]);
    }
  }

  return result.join('');
}

function simpleHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16);
}

// ── Masked Row Processor ──────────────────────────────────────────

/**
 * Apply column masking to query results.
 * Returns the rows with sensitive columns masked according to policy.
 */
export function applyColumnMasking(
  rows: Record<string, unknown>[],
  tablePolicy: TablePolicy | undefined,
  governance: Governance
): Record<string, unknown>[] {
  if (!tablePolicy?.columns || tablePolicy.columns.length === 0) {
    return rows;
  }

  const maskingColumns = tablePolicy.columns.filter(
    (c) => c.masking !== 'none'
  );

  if (maskingColumns.length === 0) return rows;

  return rows.map((row) => {
    const masked = { ...row };
    for (const col of maskingColumns) {
      if (col.name in masked) {
        masked[col.name] = maskValue(masked[col.name], col.masking, col.maskFormat);
      }
    }
    return masked;
  });
}

// ── Main Governance Check ─────────────────────────────────────────

/**
 * Evaluate a query against all governance policies.
 * Returns a decision with masking instructions, row limits,
 * and approval requirements.
 */
export function evaluateGovernance(
  query: QueryClassification,
  agentId: string,
  governance: Governance
): GovernanceDecision {
  if (!governance.enabled) {
    return { allowed: true, maxRows: 0, requiresApproval: false };
  }

  const agentPolicy = findAgentPolicy(agentId, governance);

  // Check operation type
  if (!agentPolicy.allowedOperations.includes(query.operation)) {
    return {
      allowed: false,
      reason: `Agent ${agentId} is not allowed to perform ${query.operation} operations`,
      maxRows: 0,
      requiresApproval: false,
    };
  }

  // Check source restrictions
  if (
    agentPolicy.allowedSources &&
    agentPolicy.allowedSources.length > 0 &&
    !agentPolicy.allowedSources.includes(query.sourceName)
  ) {
    return {
      allowed: false,
      reason: `Agent ${agentId} is not allowed to access source: ${query.sourceName}`,
      maxRows: 0,
      requiresApproval: false,
    };
  }

  // Find source and table policies
  const sourcePolicy = findSourcePolicy(query.sourceName, governance);
  const tablePolicy = findTablePolicy(query.table, sourcePolicy);

  // Determine effective classification
  const effectiveClass: DataClass =
    tablePolicy?.classification ||
    sourcePolicy?.defaultClassification ||
    'internal';

  // Check classification access
  if (!canAccessClassification(agentPolicy, effectiveClass)) {
    return {
      allowed: false,
      reason: `Agent ${agentId} cannot access ${effectiveClass}-classified data in ${query.sourceName}.${query.table}`,
      maxRows: 0,
      requiresApproval: false,
    };
  }

  // Determine masked columns
  const maskedColumns = (tablePolicy?.columns || [])
    .filter((c) => c.masking !== 'none' && query.columns.includes(c.name))
    .map((c) => ({ name: c.name, strategy: c.masking, format: c.maskFormat }));

  // Build row filter
  const rowFilter = tablePolicy?.rowFilter;

  // Determine max rows
  const sourceMaxRows = tablePolicy?.maxRows || 0;
  const agentMaxRows = agentPolicy.maxRowsPerQuery;
  const maxRows =
    sourceMaxRows > 0 && agentMaxRows > 0
      ? Math.min(sourceMaxRows, agentMaxRows)
      : Math.max(sourceMaxRows, agentMaxRows);

  // Determine approval requirements
  const isWrite = ['INSERT', 'UPDATE', 'DELETE'].includes(query.operation);
  const requiresApproval =
    isWrite &&
    (agentPolicy.requireApprovalForWrites ||
      (tablePolicy?.requireApprovalForWrites ?? true));

  return {
    allowed: true,
    maskedColumns: maskedColumns.length > 0 ? maskedColumns : undefined,
    rowFilter,
    maxRows,
    requiresApproval,
  };
}

/**
 * Quick check: is this agent allowed to access this table at all?
 * Use for pre-flight checks before executing queries.
 */
export function quickGovernanceCheck(
  agentId: string,
  sourceName: string,
  table: string,
  governance: Governance
): { allowed: boolean; reason?: string } {
  const result = evaluateGovernance(
    {
      sourceName,
      table,
      columns: [],
      operation: 'SELECT',
    },
    agentId,
    governance
  );
  return { allowed: result.allowed, reason: result.reason };
}

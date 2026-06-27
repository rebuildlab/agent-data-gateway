import type { Scope, ScopeRule } from '../config/types.js';

export interface ScopedQuery {
  table: string;
  fields?: string[];
  filters?: Record<string, unknown>;
  originalQuery: string;
}

export interface ScopeDecision {
  permitted: boolean;
  reason?: string;
  scopedQuery?: ScopedQuery;
}

export function evaluateScope(
  agentId: string,
  sourceName: string,
  table: string,
  scopes: Scope[]
): ScopeDecision {
  const agentScope = scopes.find((s) => s.agent === agentId);
  if (!agentScope) {
    return { permitted: false, reason: `No scope defined for agent: ${agentId}` };
  }

  const sourceScope = agentScope.sources.find((s) => s.name === sourceName);
  if (!sourceScope) {
    return { permitted: false, reason: `Agent ${agentId} has no access to source: ${sourceName}` };
  }

  const matchingRules = sourceScope.rules.filter((r) => !r.table || r.table === table);
  if (matchingRules.length === 0) {
    return { permitted: false, reason: `Table ${table} not in scope for agent ${agentId}` };
  }

  const mergedRule = mergeRules(matchingRules);

  return {
    permitted: true,
    scopedQuery: {
      table,
      fields: mergedRule.fields,
      filters: mergedRule.filters,
      originalQuery: table,
    },
  };
}

function mergeRules(rules: ScopeRule[]): ScopeRule {
  const fields = new Set<string>();
  const filters: Record<string, unknown> = {};

  for (const rule of rules) {
    if (rule.fields) {
      for (const f of rule.fields) fields.add(f);
    }
    if (rule.filters) {
      Object.assign(filters, rule.filters);
    }
  }

  return {
    fields: fields.size > 0 ? Array.from(fields) : undefined,
    filters: Object.keys(filters).length > 0 ? filters : undefined,
  };
}

export function rewriteQuery(
  query: string,
  scope: ScopedQuery
): { sql: string; params: unknown[] } {
  let sql = query;
  const params: unknown[] = [];

  if (scope.fields && scope.fields.length > 0) {
    const selectMatch = query.match(/SELECT\s+(.+?)\s+FROM/i);
    if (selectMatch) {
      const fieldList = scope.fields.join(', ');
      sql = query.replace(selectMatch[0], `SELECT ${fieldList} FROM`);
    }
  }

  if (scope.filters && Object.keys(scope.filters).length > 0) {
    const whereClauses: string[] = [];
    for (const [key, value] of Object.entries(scope.filters)) {
      whereClauses.push(`${key} = $${params.length + 1}`);
      params.push(value);
    }
    const whereStr = whereClauses.join(' AND ');
    if (/WHERE/i.test(sql)) {
      sql = sql.replace(/WHERE/i, `WHERE ${whereStr} AND`);
    } else {
      sql += ` WHERE ${whereStr}`;
    }
  }

  return { sql, params };
}

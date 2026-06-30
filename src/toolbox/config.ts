/**
 * Toolbox Config Generator
 *
 * Converts ADG's governance configuration into Google MCP Toolbox's
 * tools.yaml format. ADG sources become Toolbox sources; ADG scope
 * rules become Toolbox parameterized tools with row/column constraints.
 */

import type { Config, Source, Scope, SourcePolicy, TablePolicy } from '../config/types.js';
import { stringify } from 'yaml';

export interface ToolboxSource {
  kind: 'source';
  name: string;
  type: string;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  project?: string;
  region?: string;
  instance?: string;
}

export interface ToolboxTool {
  kind: 'tool';
  name: string;
  type: string;
  source: string;
  description: string;
  parameters: Array<{ name: string; type: string; description: string }>;
  statement: string;
  maxRows?: number;
}

export interface ToolboxToolset {
  kind: 'toolset';
  name: string;
  tools: string[];
}

export interface ToolboxConfig {
  sources: ToolboxSource[];
  tools: ToolboxTool[];
  toolsets: ToolboxToolset[];
}

/**
 * Map ADG source type to Toolbox source type.
 * ADG uses 'postgres', 'mysql' etc; Toolbox uses the same names
 * plus cloud variants like 'cloud-sql-postgres'.
 */
function mapSourceType(adgType: string): string {
  // Direct passthrough for most types
  const passthrough = [
    'postgres', 'mysql', 'mariadb',
    'alloydb', 'bigquery', 'spanner',
    'cloud-sql-postgres', 'cloud-sql-mysql',
  ];
  if (passthrough.includes(adgType)) return adgType;
  // REST sources aren't database sources in Toolbox
  return adgType;
}

/**
 * Determine if a source type is a database (Toolbox-managed).
 */
function isDatabaseSource(type: string): boolean {
  return type !== 'rest';
}

/**
 * Convert an ADG source to a Toolbox source entry.
 */
function toToolboxSource(source: Source, configPath?: string): ToolboxSource {
  const src: ToolboxSource = {
    kind: 'source',
    name: source.name,
    type: mapSourceType(source.type),
  };

  const conn = source.connection || {};

  if (conn.host) src.host = conn.host;
  if (conn.port) src.port = conn.port;
  if (conn.database) src.database = conn.database;
  if (conn.project) src.project = conn.project;
  if (conn.region) src.region = conn.region;
  if (conn.instance) src.instance = conn.instance;

  // Resolve credentials with env var references for Toolbox
  const creds = source.credentials as Record<string, string>;
  if ('username' in creds) {
    src.user = creds.username;
  }
  if ('password' in creds) {
    // Use env var reference pattern if ADG_CONFIG_PATH is set,
    // otherwise inline (note: Toolbox supports ${ENV_VAR} syntax)
    src.password = creds.password;
  }

  return src;
}

/**
 * Generate Toolbox tools from ADG scope rules for a single source.
 * Each scope rule becomes a parameterized SQL tool in Toolbox.
 */
function scopeRulesToTools(
  sourceName: string,
  sourceType: string,
  scopes: Scope[],
  policies?: SourcePolicy
): ToolboxTool[] {
  const tools: ToolboxTool[] = [];
  const seen = new Set<string>();

  for (const scope of scopes) {
    const sourceScope = scope.sources.find((s) => s.name === sourceName);
    if (!sourceScope) continue;

    for (const rule of sourceScope.rules) {
      const table = rule.table || '*';
      const toolName = `query_${sourceName}_${table}_${scope.agent}`
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .toLowerCase();

      if (seen.has(toolName)) continue;
      seen.add(toolName);

      // Build parameterized statement from scope rules
      let statement: string;
      const fieldList = rule.fields?.length
        ? rule.fields.join(', ')
        : '*';

      if (table === '*') {
        // Wildcard scope: allow any table with a table parameter
        statement = `SELECT ${fieldList} FROM {{.table}}`;
        if (rule.filters) {
          const whereClauses = Object.entries(rule.filters)
            .map(([k, v], i) => `${k} = $${i + 1}`);
          statement += ` WHERE ${whereClauses.join(' AND ')}`;
        }
      } else {
        statement = `SELECT ${fieldList} FROM ${table}`;
        if (rule.filters) {
          const whereClauses = Object.entries(rule.filters)
            .map(([k, v], i) => `${k} = $${i + 1}`);
          statement += ` WHERE ${whereClauses.join(' AND ')}`;
        }
      }

      // Apply governance policies
      let maxRows: number | undefined;
      if (policies) {
        const tablePolicy = policies.tables?.find((t) => t.table === table);
        if (tablePolicy?.maxRows && tablePolicy.maxRows > 0) {
          maxRows = tablePolicy.maxRows;
        }
      }

      const tool: ToolboxTool = {
        kind: 'tool',
        name: toolName,
        type: `${mapSourceType(sourceType)}-sql`,
        source: sourceName,
        description: `Query ${table} in ${sourceName} (agent: ${scope.agent})${
          rule.fields ? ` — fields: ${rule.fields.join(', ')}` : ''
        }`,
        parameters: [
          { name: 'agent', type: 'string', description: 'Agent identifier for audit' },
        ],
        statement,
      };

      if (table === '*') {
        tool.parameters.push({
          name: 'table',
          type: 'string',
          description: 'Table name to query',
        });
      }

      if (maxRows) {
        tool.maxRows = maxRows;
      }

      tools.push(tool);
    }
  }

  return tools;
}

/**
 * Generate a full Toolbox tools.yaml representation from ADG config.
 * Only database sources are included; REST sources are handled
 * separately by ADG's own connector layer.
 */
export function generateToolboxConfig(config: Config): ToolboxConfig {
  const sources: ToolboxSource[] = [];
  const tools: ToolboxTool[] = [];
  const toolsets: ToolboxToolset[] = [];

  for (const source of config.sources) {
    if (!isDatabaseSource(source.type)) continue;

    sources.push(toToolboxSource(source));

    // Find governance policy for this source
    const policy = config.governance?.sourcePolicies?.find(
      (p) => p.source === source.name
    );

    // Generate tools from scopes
    const sourceTools = scopeRulesToTools(source.name, source.type, config.scopes, policy);
    tools.push(...sourceTools);

    // Create a toolset per source for easy grouping
    if (sourceTools.length > 0) {
      toolsets.push({
        kind: 'toolset',
        name: `${source.name}_tools`,
        tools: sourceTools.map((t) => t.name),
      });
    }
  }

  return { sources, tools, toolsets };
}

/**
 * Serialize ToolboxConfig to YAML string (tools.yaml format).
 * Uses multiple YAML documents separated by '---'.
 */
export function serializeToolboxYaml(tc: ToolboxConfig): string {
  const docs: string[] = [];

  for (const source of tc.sources) {
    docs.push(stringify(source));
  }

  for (const tool of tc.tools) {
    docs.push(stringify(tool));
  }

  for (const toolset of tc.toolsets) {
    docs.push(stringify(toolset));
  }

  return docs.join('---\n');
}

/**
 * Check if any sources in the config are Toolbox-manageable databases.
 */
export function hasDatabaseSources(config: Config): boolean {
  return config.sources.some((s) => isDatabaseSource(s.type));
}

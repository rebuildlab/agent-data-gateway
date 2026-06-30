/**
 * ADG MCP Admin Tools
 *
 * Administrative MCP tool definitions and handlers that let AI agents
 * (Claude Desktop, Codex, Cursor, etc.) configure the Agent Data Gateway
 * at runtime. These tools are only exposed when enableAdmin is true
 * in the MCP server configuration.
 *
 * Available admin tools:
 *   - adg_list_sources   — List all data sources (credentials masked)
 *   - adg_add_source     — Add a new data source
 *   - adg_remove_source  — Remove a data source
 *   - adg_list_scopes    — List all agent access scopes
 *   - adg_set_scope      — Add or update an agent's access scope
 *   - adg_remove_scope   — Remove an agent's access scope
 *   - adg_view_audit     — View recent audit log entries
 *   - adg_health         — Server health check with stats
 */

import { readFileSync } from 'fs';
import type { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ConfigManager } from '../config/manager.js';
import type { CredentialStore } from '../credential/store.js';
import type { FileAuditLogger } from '../audit/logger.js';
import type { Source, Scope, ScopeRule } from '../config/types.js';

/**
 * Connector wrapper interface.
 * Mirrors the one in mcp/server.ts — kept here to avoid circular imports.
 */
export interface ConnectorWrapper {
  execute(
    sourceName: string,
    query: { text: string; values: unknown[] }
  ): Promise<{ rows: Record<string, unknown>[]; rowCount: number }>;
}

/**
 * Context provided to each admin tool handler.
 */
export interface AdminToolContext {
  configManager: ConfigManager;
  connectors: Map<string, ConnectorWrapper>;
  auditLogger: FileAuditLogger;
  credentialStore: CredentialStore;
  startTime: number;
  /** Rebuild the connector registry after source changes */
  rebuildConnectors: () => void;
}

// ─── Sanitisation ───────────────────────────────────────────────────

/** Mask sensitive credential fields in all responses. */
function sanitize(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(sanitize);
  if (typeof obj === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (key === 'password' || key === 'apiKey') {
        sanitized[key] = '***';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = sanitize(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }
  return obj;
}

/** Create a standardised JSON text content response. */
function jsonContent(data: unknown, isError = false): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    ...(isError ? { isError: true } : {}),
  } as CallToolResult;
}

// ─── Tool Definitions ───────────────────────────────────────────────

export const adminToolDefinitions: Tool[] = [
  {
    name: 'adg_list_sources',
    description:
      'List all configured data sources with their types and connection info. ' +
      'All sensitive credential fields (passwords, API keys) are masked.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'adg_add_source',
    description:
      'Add a new data source to the gateway configuration. ' +
      'Supports postgres, rest (REST API), and mysql source types. ' +
      'The source is validated and persisted to the config file.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Unique source name (e.g. "analytics_db")' },
        type: {
          type: 'string',
          enum: ['postgres', 'rest', 'mysql'],
          description: 'Source type',
        },
        connection: {
          type: 'object',
          description: 'Connection details',
          properties: {
            host: { type: 'string', description: 'Database host (postgres/mysql)' },
            database: { type: 'string', description: 'Database name (postgres/mysql)' },
            port: { type: 'number', description: 'Database port (postgres/mysql)' },
            url: { type: 'string', description: 'API base URL (rest)' },
          },
        },
        credentials: {
          type: 'object',
          description: 'Authentication credentials',
          properties: {
            host: { type: 'string', description: 'Database host' },
            database: { type: 'string', description: 'Database name' },
            username: { type: 'string', description: 'Database username' },
            password: { type: 'string', description: 'Database password' },
            apiKey: { type: 'string', description: 'API key (REST sources)' },
            headerName: { type: 'string', description: 'Auth header name (default: Authorization)' },
          },
        },
      },
      required: ['name', 'type', 'connection', 'credentials'],
    },
  },
  {
    name: 'adg_remove_source',
    description:
      'Remove a data source from the gateway configuration by name. ' +
      'Persists the change to the config file.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the source to remove' },
      },
      required: ['name'],
    },
  },
  {
    name: 'adg_list_scopes',
    description:
      'List all configured agent access scopes with their permitted sources and rules.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'adg_set_scope',
    description:
      'Add or update an agent access scope. If a scope for the given agent ' +
      'already exists, it is replaced. Otherwise, a new scope is created. ' +
      'Persists the change to the config file.',
    inputSchema: {
      type: 'object',
      properties: {
        agent: { type: 'string', description: 'Agent identifier (e.g. "code-review-bot")' },
        sources: {
          type: 'array',
          description: 'Sources and their access rules',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Source name' },
              rules: {
                type: 'array',
                description: 'Access rules for this source',
                items: {
                  type: 'object',
                  properties: {
                    table: { type: 'string', description: 'Table name (optional wildcard)' },
                    fields: {
                      type: 'array',
                      items: { type: 'string' },
                      description: 'Allowed field names',
                    },
                    filters: {
                      type: 'object',
                      description: 'Row-level filters (key-value pairs)',
                    },
                  },
                },
              },
            },
            required: ['name', 'rules'],
          },
        },
      },
      required: ['agent', 'sources'],
    },
  },
  {
    name: 'adg_remove_scope',
    description:
      'Remove an agent access scope entirely. Returns false if the agent ' +
      'has no defined scope.',
    inputSchema: {
      type: 'object',
      properties: {
        agent: { type: 'string', description: 'Agent identifier to remove scope for' },
      },
      required: ['agent'],
    },
  },
  {
    name: 'adg_view_audit',
    description:
      'View recent audit log entries from the ADG audit file. ' +
      'Returns entries in reverse chronological order (most recent first).',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of entries to return (default: 20)',
        },
        agent: {
          type: 'string',
          description: 'Filter by agent ID (optional)',
        },
      },
    },
  },
  {
    name: 'adg_health',
    description:
      'Health check with gateway server stats: version, source count, ' +
      'scope count, and uptime in seconds.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

// ─── Handler Functions ──────────────────────────────────────────────

async function handleListSources(
  _args: Record<string, unknown>,
  ctx: AdminToolContext
): Promise<CallToolResult> {
  const config = ctx.configManager.getConfig();
  const sources = sanitize(config.sources) as Source[];
  return jsonContent({ sources, count: sources.length });
}

async function handleAddSource(
  args: Record<string, unknown>,
  ctx: AdminToolContext
): Promise<CallToolResult> {
  try {
    const source: Source = {
      name: args.name as string,
      type: args.type as Source['type'],
      connection: (args.connection as Source['connection']) || {},
      credentials: (args.credentials as Source['credentials']) || ({} as Source['credentials']),
    };

    ctx.configManager.addSource(source);
    ctx.rebuildConnectors();

    const config = ctx.configManager.getConfig();
    return jsonContent({
      success: true,
      message: `Source "${source.name}" added successfully`,
      sourceCount: config.sources.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to add source';
    return jsonContent({ success: false, error: message }, true);
  }
}

async function handleRemoveSource(
  args: Record<string, unknown>,
  ctx: AdminToolContext
): Promise<CallToolResult> {
  const name = args.name as string;
  const removed = ctx.configManager.removeSource(name);

  if (!removed) {
    return jsonContent(
      { success: false, error: `Source "${name}" not found` },
      true
    );
  }

  ctx.rebuildConnectors();

  const config = ctx.configManager.getConfig();
  return jsonContent({
    success: true,
    message: `Source "${name}" removed`,
    sourceCount: config.sources.length,
  });
}

async function handleListScopes(
  _args: Record<string, unknown>,
  ctx: AdminToolContext
): Promise<CallToolResult> {
  const config = ctx.configManager.getConfig();
  return jsonContent({ scopes: config.scopes, count: config.scopes.length });
}

async function handleSetScope(
  args: Record<string, unknown>,
  ctx: AdminToolContext
): Promise<CallToolResult> {
  try {
    const agent = args.agent as string;
    const rawSources = (args.sources as Array<{
      name: string;
      rules: Array<Record<string, unknown>>;
    }>) || [];

    const scopeSources = rawSources.map((src) => ({
      name: src.name,
      rules: (src.rules || []).map((rule) => {
        const scopeRule: ScopeRule = {};
        if (typeof rule.table === 'string') scopeRule.table = rule.table;
        if (Array.isArray(rule.fields)) scopeRule.fields = rule.fields as string[];
        if (rule.filters && typeof rule.filters === 'object') {
          scopeRule.filters = rule.filters as Record<string, unknown>;
        }
        return scopeRule;
      }),
    }));

    const scope: Scope = { agent, sources: scopeSources };
    ctx.configManager.addScope(scope);

    const config = ctx.configManager.getConfig();
    return jsonContent({
      success: true,
      message: `Scope for agent "${agent}" saved`,
      scopeCount: config.scopes.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to set scope';
    return jsonContent({ success: false, error: message }, true);
  }
}

async function handleRemoveScope(
  args: Record<string, unknown>,
  ctx: AdminToolContext
): Promise<CallToolResult> {
  const agent = args.agent as string;
  const removed = ctx.configManager.removeScope(agent);

  if (!removed) {
    return jsonContent(
      { success: false, error: `No scope found for agent "${agent}"` },
      true
    );
  }

  const config = ctx.configManager.getConfig();
  return jsonContent({
    success: true,
    message: `Scope for agent "${agent}" removed`,
    scopeCount: config.scopes.length,
  });
}

async function handleViewAudit(
  args: Record<string, unknown>,
  ctx: AdminToolContext
): Promise<CallToolResult> {
  const limit = Math.max(1, typeof args.limit === 'number' ? args.limit : 20);
  const agentFilter = typeof args.agent === 'string' ? args.agent : undefined;

  try {
    // Get entries from the in-memory audit logger (authoritative source)
    const allEntries = ctx.auditLogger.getEntries();
    let entries = [...allEntries];

    if (agentFilter) {
      entries = entries.filter((e) => e.agent_id === agentFilter);
    }

    // Most recent entries first (reverse chronological)
    entries.reverse();
    entries = entries.slice(0, limit);

    return jsonContent({
      entries,
      count: entries.length,
      total: allEntries.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to read audit log';
    return jsonContent(
      { entries: [], count: 0, total: 0, note: message },
      true
    );
  }
}

async function handleHealth(
  _args: Record<string, unknown>,
  ctx: AdminToolContext
): Promise<CallToolResult> {
  const config = ctx.configManager.getConfig();
  const uptimeMs = Date.now() - ctx.startTime;
  const uptimeSec = Math.floor(uptimeMs / 1000);

  return jsonContent({
    status: 'ok',
    version: '0.1.0',
    sourceCount: config.sources.length,
    scopeCount: config.scopes.length,
    uptimeSeconds: uptimeSec,
  });
}

// ─── Handler Map ────────────────────────────────────────────────────

export const adminToolHandlers: Record<
  string,
  (args: Record<string, unknown>, ctx: AdminToolContext) => Promise<CallToolResult>
> = {
  adg_list_sources: handleListSources,
  adg_add_source: handleAddSource,
  adg_remove_source: handleRemoveSource,
  adg_list_scopes: handleListScopes,
  adg_set_scope: handleSetScope,
  adg_remove_scope: handleRemoveScope,
  adg_view_audit: handleViewAudit,
  adg_health: handleHealth,
};

/**
 * ADG MCP Server
 *
 * Exposes ADG data sources as MCP tools that AI agents
 * (Claude Desktop, Codex, Cursor, etc.) can discover and call.
 *
 * Every tool call passes through the ADG security pipeline:
 *   credentials injection → data scoping → immutable audit log
 *
 * The agent sends only a source name and a query string;
 * the MCP server injects credentials server-side (the agent
 * never sees them), applies per-agent scoping rules, and
 * records every access immutably.
 *
 * When enableAdmin is set, administrative tools are also
 * exposed, letting agents add/remove data sources, manage
 * access scopes, and inspect audit logs at runtime.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import type { Config } from '../config/types.js';
import type { ConfigManager } from '../config/manager.js';
import type { CredentialStore } from '../credential/store.js';
import { evaluateScope } from '../proxy/scoping.js';
import { FileAuditLogger } from '../audit/logger.js';
import type { AccessEntry } from '../audit/types.js';
import { PostgresConnector, RestConnector } from '../connectors/index.js';
import type { ConnectorConfig } from '../connectors/base.js';
import {
  adminToolDefinitions,
  adminToolHandlers,
  type ConnectorWrapper,
  type AdminToolContext,
} from './admin-tools.js';
import {
  evaluateGovernance,
  applyColumnMasking,
  findTablePolicy,
  findSourcePolicy,
  type GovernanceDecision,
} from '../governance/engine.js';
import type { TablePolicy } from '../config/types.js';

/** Re-export for downstream consumers */
export type { ConnectorWrapper };

export interface MCPToolConfig {
  config: Config;
  credentialStore: CredentialStore;
  connectors: Map<string, ConnectorWrapper>;
  auditLogger: FileAuditLogger;
  /** Optional ConfigManager for admin tool enablement */
  configManager?: ConfigManager;
  /** Enable the admin tool set (default false) */
  enableAdmin?: boolean;
}

function buildTools(config: Config): Tool[] {
  return config.sources.map((source) => ({
    name: `adg__${source.name}`,
    description:
      `Query the "${source.name}" ${source.type} data source through the Agent Data Gateway. ` +
      `Credentials are injected server-side. Access is scoped and audited. ` +
      `Returns JSON rows matching your agent's access scope.`,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: `SQL query or API path to execute against "${source.name}"`,
        },
        agent: {
          type: 'string',
          description: 'Agent identifier for scoping and audit (e.g., "code-review-bot")',
        },
      },
      required: ['query', 'agent'],
    },
  }));
}

export function createMCPServer(cfg: MCPToolConfig): Server {
  const serverStartTime = Date.now();

  // ── Mutable tool list (rebuilt when sources change via admin) ───
  let tools = buildTools(cfg.config);

  // ── Connector rebuild function ─────────────────────────────────
  const rebuildConnectors = () => {
    if (!cfg.configManager) return;
    const updatedConfig = cfg.configManager.getConfig();
    const newStore = cfg.configManager.reloadCredentialStore();

    // Rebuild tools from updated config
    tools = buildTools(updatedConfig);
    if (cfg.enableAdmin && cfg.configManager) {
      tools.push(...adminToolDefinitions);
    }

    // Rebuild connector registry
    const pgConn = new PostgresConnector();
    const restConn = new RestConnector();
    cfg.connectors.clear();
    for (const source of updatedConfig.sources) {
      const creds = newStore.get(source.name);
      if (!creds) continue;

      const connectorConfig: ConnectorConfig = {
        name: source.name,
        connection: source.connection as Record<string, unknown>,
        credentials: creds,
      };

      if (source.type === 'postgres') {
        cfg.connectors.set(source.name, {
          execute: async (_name, query) =>
            pgConn.execute(source.name, query.text, connectorConfig),
        });
      } else if (source.type === 'rest') {
        cfg.connectors.set(source.name, {
          execute: async (_name, query) => {
            const result = await restConn.execute(source.name, query.text, connectorConfig);
            return { rows: result.rows, rowCount: result.rowCount };
          },
        });
      }
      // MySQL connectors would follow the same pattern
    }
  };

  // ── Merge admin tools initially if enabled ─────────────────────
  if (cfg.enableAdmin && cfg.configManager) {
    tools.push(...adminToolDefinitions);
  }

  // ── Build admin tool context (shared across admin handlers) ────
  const adminCtx: AdminToolContext | null =
    cfg.enableAdmin && cfg.configManager
      ? {
          configManager: cfg.configManager,
          connectors: cfg.connectors,
          auditLogger: cfg.auditLogger,
          credentialStore: cfg.credentialStore,
          startTime: serverStartTime,
          rebuildConnectors,
        }
      : null;

  const server = new Server(
    {
      name: 'agent-data-gateway',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // ── List available tools ──────────────────────────────────────────
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

  // ── Execute tool calls through ADG security pipeline ──────────────
  server.setRequestHandler(
    CallToolRequestSchema,
    async (request): Promise<CallToolResult> => {
      const { name, arguments: args } = request.params;

      // ── Admin tool routing ──────────────────────────────────
      if (adminCtx && adminToolHandlers[name]) {
        return adminToolHandlers[name]((args || {}) as Record<string, unknown>, adminCtx);
      }

      const sourceName = name.replace(/^adg__/, '');
      const { query, agent } = (args || {}) as {
        query?: string;
        agent?: string;
      };

      if (!query || !agent) {
        return {
          content: [
            {
              type: 'text',
              text: 'Missing required parameters: query and agent',
            },
          ],
          isError: true,
        };
      }

      // Verify the source exists
      const sourceEntry = cfg.config.sources.find((s) => s.name === sourceName);
      if (!sourceEntry) {
        return {
          content: [
            {
              type: 'text',
              text: `Unknown source: ${sourceName}. Available: ${cfg.config.sources.map((s) => s.name).join(', ')}`,
            },
          ],
          isError: true,
        };
      }

      // ── Step 1: Access scoping check ──────────────────────
      const table = extractTableName(query);
      const scopeResult = evaluateScope(
        agent,
        sourceName,
        table,
        cfg.config.scopes
      );

      if (!scopeResult.permitted) {
        const entry: AccessEntry = {
          timestamp: new Date().toISOString(),
          agent_id: agent,
          source: sourceName,
          action: 'MCP_QUERY',
          resource: table,
          policy_decision: 'denied',
        };
        cfg.auditLogger.log(entry);

        return {
          content: [
            {
              type: 'text',
              text: `Access denied: ${scopeResult.reason}`,
            },
          ],
          isError: true,
        };
      }

      // ── Step 2: Governance policy check ───────────────────
      const operation = detectOperation(query);
      let governanceDecision: GovernanceDecision | null = null;

      if (cfg.config.governance?.enabled) {
        governanceDecision = evaluateGovernance(
          {
            sourceName,
            table,
            columns: extractColumns(query),
            operation,
          },
          agent,
          cfg.config.governance
        );

        if (!governanceDecision.allowed) {
          const entry: AccessEntry = {
            timestamp: new Date().toISOString(),
            agent_id: agent,
            source: sourceName,
            action: 'MCP_QUERY',
            resource: table,
            policy_decision: 'denied',
          };
          cfg.auditLogger.log(entry);

          return {
            content: [
              {
                type: 'text',
                text: `Governance denied: ${governanceDecision.reason}`,
              },
            ],
            isError: true,
          };
        }

        // Block writes that require approval (for now, always block unapproved writes)
        if (governanceDecision.requiresApproval && operation !== 'SELECT') {
          const entry: AccessEntry = {
            timestamp: new Date().toISOString(),
            agent_id: agent,
            source: sourceName,
            action: 'MCP_QUERY',
            resource: table,
            policy_decision: 'denied',
          };
          cfg.auditLogger.log(entry);

          return {
            content: [
              {
                type: 'text',
                text: `Write operation blocked: ${operation} on ${sourceName}.${table} requires approval. Use adg_approve_write to request access.`,
              },
            ],
            isError: true,
          };
        }
      }

      // ── Step 3: Execute through connector ────────────────
      const connector = cfg.connectors.get(sourceName);
      if (!connector) {
        return {
          content: [
            {
              type: 'text',
              text: `No connector available for source: ${sourceName}`,
            },
          ],
          isError: true,
        };
      }

      try {
        const start = performance.now();
        let result = await connector.execute(sourceName, {
          text: query,
          values: [],
        });
        const duration = Math.round(performance.now() - start);

        // ── Step 4: Apply column masking ───────────────────
        if (
          governanceDecision &&
          cfg.config.governance?.enabled &&
          result.rows.length > 0
        ) {
          const sourcePolicy = findSourcePolicy(sourceName, cfg.config.governance);
          const tablePolicy = findTablePolicy(table, sourcePolicy);
          result = {
            rows: applyColumnMasking(
              result.rows,
              tablePolicy,
              cfg.config.governance
            ),
            rowCount: result.rowCount,
          };
        }

        const entry: AccessEntry = {
          timestamp: new Date().toISOString(),
          agent_id: agent,
          source: sourceName,
          action: 'MCP_QUERY',
          resource: table,
          row_count: result.rowCount,
          policy_decision: 'permitted',
          duration_ms: duration,
        };
        cfg.auditLogger.log(entry);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  rows: result.rows,
                  rowCount: result.rowCount,
                  durationMs: duration,
                  ...(governanceDecision?.maskedColumns?.length
                    ? { maskedColumns: governanceDecision.maskedColumns.map((c) => c.name) }
                    : {}),
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Query execution failed';
        return {
          content: [{ type: 'text', text: `Error: ${message}` }],
          isError: true,
        };
      }
    }
  );

  return server;
}

/**
 * Start the MCP server with stdio transport.
 * This is used by Claude Desktop, Codex, and other MCP clients
 * that communicate via stdin/stdout.
 */
export async function startMCPServer(cfg: MCPToolConfig): Promise<void> {
  const server = createMCPServer(cfg);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('ADG MCP server started (stdio transport)');
}

function extractTableName(query: string): string {
  const match = query.match(/FROM\s+(\w+)/i);
  return match ? match[1] : query.split(/\s+/)[0] || 'unknown';
}

function detectOperation(query: string): 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' {
  const trimmed = query.trim().toUpperCase();
  if (trimmed.startsWith('INSERT')) return 'INSERT';
  if (trimmed.startsWith('UPDATE')) return 'UPDATE';
  if (trimmed.startsWith('DELETE')) return 'DELETE';
  return 'SELECT';
}

function extractColumns(query: string): string[] {
  // Extract columns from SELECT clause
  const selectMatch = query.match(/SELECT\s+(.+?)\s+FROM/i);
  if (!selectMatch) return [];

  const columnPart = selectMatch[1];
  if (columnPart.trim() === '*') return []; // Wildcard, all columns

  return columnPart
    .split(',')
    .map((c) => {
      // Handle aliases: "column AS alias"
      const trimmed = c.trim();
      const asMatch = trimmed.match(/\s+AS\s+(\w+)$/i);
      if (asMatch) return asMatch[1];
      // Handle table.column notation
      const dotMatch = trimmed.match(/\.(\w+)$/);
      if (dotMatch) return dotMatch[1];
      return trimmed;
    })
    .filter(Boolean);
}

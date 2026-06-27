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
import type { CredentialStore } from '../credential/store.js';
// Connector interface for executing queries through ADG connectors
export interface ConnectorWrapper {
  execute(sourceName: string, query: { text: string; values: unknown[] }): Promise<{ rows: Record<string, unknown>[]; rowCount: number }>;
}
import { evaluateScope } from '../proxy/scoping.js';
import { FileAuditLogger } from '../audit/logger.js';
import type { AccessEntry } from '../audit/types.js';

interface MCPToolConfig {
  config: Config;
  credentialStore: CredentialStore;
  connectors: Map<string, ConnectorWrapper>;
  auditLogger: FileAuditLogger;
}

function buildTools(config: Config): Tool[] {
  return config.sources.map((source) => ({
    name: `adg__${source.name}`,
    description: `Query the "${source.name}" ${source.type} data source through the Agent Data Gateway. ` +
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

  const tools = buildTools(cfg.config);

  // ── List available tools ──────────────────────────────────────────
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

  // ── Execute tool calls through ADG security pipeline ──────────────
  server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
    const { name, arguments: args } = request.params;
    const sourceName = name.replace(/^adg__/, '');
    const { query, agent } = (args || {}) as { query?: string; agent?: string };

    if (!query || !agent) {
      return {
        content: [{ type: 'text', text: 'Missing required parameters: query and agent' }],
        isError: true,
      };
    }

    // Verify the source exists
    const sourceEntry = cfg.config.sources.find((s) => s.name === sourceName);
    if (!sourceEntry) {
      return {
        content: [{ type: 'text', text: `Unknown source: ${sourceName}. Available: ${cfg.config.sources.map(s => s.name).join(', ')}` }],
        isError: true,
      };
    }

    // Check scoping
    const table = extractTableName(query);
    const scopeResult = evaluateScope(agent, sourceName, table, cfg.config.scopes);

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
        content: [{ type: 'text', text: `Access denied: ${scopeResult.reason}` }],
        isError: true,
      };
    }

    // Execute through connector
    const connector = cfg.connectors.get(sourceName);
    if (!connector) {
      return {
        content: [{ type: 'text', text: `No connector available for source: ${sourceName}` }],
        isError: true,
      };
    }

    try {
      const start = performance.now();
      const result = await connector.execute(sourceName, { text: query, values: [] });
      const duration = Math.round(performance.now() - start);

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
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Query execution failed';
      return {
        content: [{ type: 'text', text: `Error: ${message}` }],
        isError: true,
      };
    }
  });

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

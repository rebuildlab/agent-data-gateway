import { loadConfig, ConfigManager } from './config/index.js';
import { createProxyServer } from './proxy/index.js';
import { startMCPServer } from './mcp/index.js';
import { CredentialStore } from './credential/store.js';
import { FileAuditLogger } from './audit/logger.js';
import { PostgresConnector, RestConnector } from './connectors/index.js';
import type { ConnectorConfig } from './connectors/base.js';

const configPath = process.env.ADG_CONFIG_PATH || './examples/config.yaml';
const port = parseInt(process.env.ADG_PORT || '7377', 10);
const mcpMode = process.env.ADG_MCP === 'stdio';
const mcpOnly = process.env.ADG_MCP === 'only';
const mcpAdmin = process.env.ADG_MCP_ADMIN === 'true';

async function main() {
  // Use ConfigManager for mutable config when admin tools are enabled,
  // fall back to plain loadConfig for read-only mode
  const configManager =
    mcpAdmin || mcpOnly ? ConfigManager.load(configPath) : null;
  const config = configManager ? configManager.getConfig() : loadConfig(configPath);

  const audit = new FileAuditLogger(
    config.audit.output || '/tmp/adg-audit.log'
  );

  // Build initial credential store — ConfigManager will rebuild it
  // when sources change via admin tools
  const credentialStore = configManager
    ? configManager.reloadCredentialStore()
    : CredentialStore.fromConfig(config);

  if (mcpOnly) {
    // MCP-only mode: no HTTP proxy, just stdio
    const connectors = buildConnectorRegistry(config, credentialStore);
    await startMCPServer({
      config,
      credentialStore,
      connectors,
      auditLogger: audit,
      configManager: configManager ?? undefined,
      enableAdmin: mcpAdmin,
    });
    return;
  }

  const server = createProxyServer(config, audit);

  try {
    await server.listen({ port, host: '0.0.0.0' });
    console.log(`ADG proxy listening on :${port}`);

    if (mcpMode) {
      // Start MCP stdio server alongside the HTTP proxy
      const connectors = buildConnectorRegistry(config, credentialStore);
      startMCPServer({
        config,
        credentialStore,
        connectors,
        auditLogger: audit,
        configManager: configManager ?? undefined,
        enableAdmin: mcpAdmin,
      });
    }
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

function buildConnectorRegistry(
  config: ReturnType<typeof loadConfig>,
  credentialStore: CredentialStore
) {
  const registry = new Map<
    string,
    {
      execute(
        sourceName: string,
        query: { text: string; values: unknown[] }
      ): Promise<{ rows: Record<string, unknown>[]; rowCount: number }>;
    }
  >();
  const pgConn = new PostgresConnector();
  const restConn = new RestConnector();

  for (const source of config.sources) {
    const creds = credentialStore.get(source.name);
    if (!creds) continue;

    const connectorConfig: ConnectorConfig = {
      name: source.name,
      connection: source.connection as Record<string, unknown>,
      credentials: creds,
    };

    if (source.type === 'postgres') {
      registry.set(source.name, {
        execute: async (_, query) =>
          pgConn.execute(source.name, query.text, connectorConfig),
      });
    } else if (source.type === 'rest') {
      registry.set(source.name, {
        execute: async (_, query) => {
          const result = await restConn.execute(
            source.name,
            query.text,
            connectorConfig
          );
          return { rows: result.rows, rowCount: result.rowCount };
        },
      });
    }
  }

  return registry;
}

main();

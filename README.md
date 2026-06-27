# Agent Data Gateway (ADG)

Open-core middleware that gives AI agents secure, auditable access to production data. Converts databases and APIs into MCP tools with credential isolation, per-agent data scoping, and immutable audit logs.

## Features

- **Credential isolation** — agents never see passwords, API keys, or tokens
- **Per-agent scoping** — each agent sees only the tables, fields, and rows it's allowed to
- **Multi-protocol** — PostgreSQL, MySQL, REST APIs (single interface)
- **MCP server** — exposes data sources as MCP tools for Claude Desktop, Codex, Cursor, etc.
- **Immutable audit** — every access logged to append-only JSONL file
- **Docker-ready** — single `docker compose up` to start ADG + Postgres

## Architecture

```
                    ┌─────────────────────────────────────────────┐
                    │               ADG Proxy (:7377)             │
                    │  ┌──────────┐  ┌──────────┐  ┌──────────┐  │     ┌──────────────┐
  Agent ────────────▶│  Scoping   │─▶│  Creds    │─▶│Connector │  │────▶│  Postgres     │
  (HTTP / MCP)      │  Engine    │  │  Store    │  │Registry  │  │     │  / MySQL     │
                    │  └──────────┘  └──────────┘  └──────────┘  │     │  / REST API  │
                    │  ┌──────────────────────────┐               │     └──────────────┘
                    │  │   Audit Logger (JSONL)    │               │
                    │  └──────────────────────────┘               │
                    └─────────────────────────────────────────────┘
                    ┌─────────────────────────────────────────────┐
                    │         MCP Server (stdio or alongside)      │
 Agent (MCP) ──────▶│  adg__analytics_db, adg__github_api, ...    │────▶ same pipeline
                    └─────────────────────────────────────────────┘
```

## Quick Start

```bash
# Install
npm install

# Build
npm run build

# Configure
cp examples/config.yaml config.yaml
# Edit config.yaml with your sources

# Run (HTTP proxy)
npm start

# Run (development with hot reload)
npm run dev

# Run with MCP stdio alongside
ADG_MCP=stdio npm start

# Run MCP-only mode (no HTTP server, stdio only)
ADG_MCP=only npm start
```

## Configuration (YAML)

Define your data sources, credentials, and per-agent access scopes:

```yaml
version: "1"

sources:
  - type: postgres
    name: analytics_db
    connection:
      host: localhost
      database: analytics
      port: 5432
    credentials:
      username: readonly_user
      password: secret-db-pass

  - type: rest
    name: github_api
    connection:
      url: https://api.github.com
    credentials:
      apiKey: ghp_example-token
      headerName: Authorization

  - type: mysql
    name: user_db
    connection:
      host: localhost
      database: users
      port: 3306
    credentials:
      username: app_user
      password: mysql-secret

scopes:
  - agent: code-review-bot
    sources:
      - name: analytics_db
        rules:
          - table: pull_requests
            fields: [id, title, status, author, created_at]
            filters:
              status: open
          - table: deployments
            fields: [id, environment, status, deployed_at]

audit:
  enabled: true
  format: jsonl
  output: /tmp/adg-audit.log
```

## API Endpoints

### `POST /query`
Agent submits a query referencing a source. Credentials are injected server-side.

```json
{
  "source": "analytics_db",
  "agent": "code-review-bot",
  "query": "SELECT * FROM pull_requests LIMIT 10"
}
```

Response:
```json
{
  "status": "ok",
  "source": "analytics_db",
  "agent": "code-review-bot",
  "scope": {
    "table": "pull_requests",
    "fields": ["id", "title", "status", "author", "created_at"],
    "filters": { "status": "open" },
    "originalQuery": "pull_requests"
  },
  "message": "Query received (connector not yet implemented)"
}
```

### `GET /health`
Health check — returns version and source count.

### `GET /audit`
Returns all audit log entries (agent, source, action, policy decision, timing).

## MCP Integration

ADG exposes every configured data source as an MCP tool. Tools are named `adg__{source_name}` and pass through the full ADG security pipeline (credential injection → scoping → audit).

### Claude Desktop

Add to `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "adg": {
      "command": "node",
      "args": ["/path/to/adg/dist/index.js"],
      "env": {
        "ADG_CONFIG_PATH": "/path/to/adg/examples/config.yaml",
        "ADG_MCP": "stdio"
      }
    }
  }
}
```

### Codex / Cursor

Same MCP stdio configuration. ADG handles the `ListTools` and `CallTool` protocol requests automatically.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ADG_CONFIG_PATH` | `./examples/config.yaml` | Path to YAML config |
| `ADG_PORT` | `7377` | HTTP proxy port |
| `ADG_MCP` | *(unset)* | Set to `stdio` to run MCP alongside HTTP; `only` for MCP-only |

## Security Model

- **Credentials never leave the server** — agents provide only source name + query
- **CredentialStore is immutable after init** — no runtime credential mutation
- **Sensitive fields redacted** — `password`, `apiKey`, `secret`, `token`, etc. redacted from logs
- **Per-agent data scoping** — each agent's access restricted to configured tables, fields, and row filters
- **Immutable audit trail** — every access (permitted or denied) logged to append-only JSONL

## Project Structure

```
src/
├── index.ts               # Entry point, CLI arg parsing, MCM/HTTP modes
├── config/
│   ├── types.ts           # Zod schemas + TypeScript types
│   ├── loader.ts          # YAML config loader
│   └── index.ts           # Re-exports
├── credential/
│   ├── store.ts           # Immutable in-memory credential store
│   └── index.ts           # Re-exports
├── proxy/
│   ├── server.ts          # Fastify HTTP server (/query, /health, /audit)
│   ├── interceptor.ts     # Credential injection + log redaction
│   ├── scoping.ts         # Per-agent scope evaluation + SQL rewriting
│   └── index.ts           # Re-exports
├── connectors/
│   ├── base.ts            # Connector interface + ConnectorConfig type
│   ├── postgres.ts        # PostgreSQL connector (pg)
│   ├── mysql.ts           # MySQL connector (mysql2/promise)
│   ├── rest.ts            # Generic REST connector
│   └── index.ts           # Registry exports
├── mcp/
│   ├── server.ts          # MCP stdio server (ListTools / CallTool)
│   └── index.ts           # Re-exports
└── audit/
    ├── types.ts           # AccessEntry type
    ├── logger.ts          # Append-only JSONL logger
    └── index.ts           # Re-exports
```

## Docker

```bash
# Start ADG + Postgres
docker compose up

# ADG listens on :7377
# Postgres on :5432 (adg_demo / adg_demo_pass)
```

## Examples

- `examples/config.yaml` — full configuration with all source types and scopes
- `examples/langchain-integration.ts` — using ADG with LangChain
- `examples/vercel-ai-sdk-integration.ts` — using ADG with Vercel AI SDK

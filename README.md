# Agent Data Gateway (ADG)

**Database Governance for AI Agents** — built on Google MCP Toolbox.

ADG sits between your AI agents and your databases, enforcing governance policies at every query. Data classification, column-level masking, row-level security, per-agent access scoping, and immutable audit trails — all without agents ever touching your credentials.

> **Powered by** [Google MCP Toolbox](https://github.com/googleapis/mcp-toolbox) for database connectivity, connection pooling, IAM auth, and OpenTelemetry observability. ADG adds the governance layer on top.

## Why ADG

AI agents need database access to be useful. But giving agents raw SQL access is a governance nightmare:
- Agents see PII they shouldn't
- No audit trail of what was queried
- Credentials scattered across agent configs
- No way to enforce data classification policies

ADG solves this with a **governance-first architecture**:

```
Agent (MCP/HTTP) → ADG Governance Proxy → Google MCP Toolbox → Database
                       │
                  ┌────┴────┐
                  │ Policy  │  Classification, masking, scoping, row filters
                  │ Engine  │
                  ├─────────┤
                  │ Cred    │  Agents never see passwords or API keys
                  │ Vault   │
                  ├─────────┤
                  │ Audit   │  Immutable JSONL audit trail
                  │ Logger  │
                  └─────────┘
```

## Governance Features

### 🔐 Credential Isolation
Database credentials live in ADG, never exposed to agents. Agents reference sources by name only.

### 🏷️ Data Classification
Tag tables and columns with classification levels: `public`, `internal`, `confidential`, `restricted`, `pii`, `phi`, `pci`. Agents can only access data at or below their clearance level.

### 🎭 Column-Level Masking
Sensitive columns are automatically masked before results reach the agent:
- **Redact** — Replace with `***REDACTED***`
- **Hash** — Deterministic hash for analytics without raw data
- **Tokenize** — Reversible pseudonyms
- **Partial** — Show last-4 patterns like `***-***-1234`

### 📐 Row-Level Security
Inject `WHERE` clauses automatically: `deleted_at IS NULL`, `region = 'EU'`, etc.

### 🛡️ Agent Policies
Per-agent rules for:
- Allowed classification levels
- Max rows per query
- Query timeout
- Allowed operations (SELECT only, or full CRUD)
- Write operation approval gates

### 📊 Immutable Audit
Every query logged with agent ID, source, table, operation, row count, policy decision, and duration.

### 🔌 Database Support (via Google MCP Toolbox)
PostgreSQL, MySQL, MariaDB, AlloyDB, BigQuery, Cloud SQL, Spanner, SQL Server, Oracle, MongoDB, Redis, Snowflake, and more.

## Quick Start

```bash
# Install
npm install

# Build
npm run build

# Configure
cp examples/config.yaml config.yaml
# Edit config.yaml with your sources + governance policies

# Run (HTTP proxy)
npm start

# Run MCP stdio mode (for Claude Desktop / Codex / Cursor)
ADG_MCP=stdio npm start

# MCP-only mode
ADG_MCP=only npm start

# Enable admin tools (runtime config management by agents)
ADG_MCP_ADMIN=true ADG_MCP=only npm start
```

## Configuration

ADG uses a single YAML file for sources, scopes, and governance policies:

```yaml
version: "1"

# Database sources (passed through to Google MCP Toolbox)
sources:
  - type: postgres
    name: analytics_db
    connection:
      host: localhost
      database: analytics
      port: 5432
    credentials:
      username: readonly_user
      password: ${DB_PASSWORD}  # env var supported

# Per-agent access scoping
scopes:
  - agent: code-review-bot
    sources:
      - name: analytics_db
        rules:
          - table: pull_requests
            fields: [id, title, status, author]
            filters: { status: open }

# Governance policies
governance:
  enabled: true

  sourcePolicies:
    - source: analytics_db
      defaultClassification: internal
      tables:
        - table: users
          classification: pii
          maxRows: 100
          columns:
            - name: email
              classification: pii
              masking: partial
              maskFormat: "***@****.***"
            - name: ssn
              classification: pii
              masking: redact
          rowFilter: "deleted_at IS NULL"

  agentPolicies:
    - agent: code-review-bot
      allowedClassifications: [public, internal]
      maxRowsPerQuery: 500
      allowedOperations: [SELECT]
      allowedSources: [analytics_db]

audit:
  enabled: true
  format: jsonl
  output: /var/log/adg/audit.log
```

## MCP Integration

ADG exposes governed data sources as MCP tools. Tools are named `adg__{source_name}`.

### Claude Desktop

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

### Google MCP Toolbox

ADG delegates database execution to Google MCP Toolbox. For sources with type `postgres`, `mysql`, `cloud-sql-postgres`, etc., ADG generates a `tools.yaml` config and manages Toolbox instances automatically. REST sources are handled by ADG's native connector.

Toolbox provides: connection pooling, IAM auth, OpenTelemetry observability, and supports 20+ database engines.

## API Endpoints

### `POST /query`
Submit a governed query. Credentials injected server-side, policies enforced.

```json
{
  "source": "analytics_db",
  "agent": "code-review-bot",
  "query": "SELECT * FROM pull_requests LIMIT 10"
}
```

Response includes masked columns notification when governance policies apply:
```json
{
  "status": "ok",
  "rows": [...],
  "rowCount": 10,
  "maskedColumns": ["email"],
  "durationMs": 42
}
```

### `GET /health` — Health check
### `GET /audit` — Audit log retrieval

## Admin Tools

When `ADG_MCP_ADMIN=true` is set, ADG exposes admin MCP tools for runtime configuration:

| Tool | Description |
|------|-------------|
| `adg_list_sources` | List all data sources |
| `adg_add_source` | Add a new data source |
| `adg_remove_source` | Remove a data source |
| `adg_list_scopes` | List all agent scopes |
| `adg_set_scope` | Add or update agent scope |
| `adg_remove_scope` | Remove agent scope |
| `adg_view_audit` | View audit log entries |
| `adg_health` | System health check |

## Security Model

- **Credentials never leave ADG** — agents provide source name + query only
- **Immutable credential store** — no runtime credential mutation
- **Sensitive field redaction** — passwords, keys, tokens masked in all logs
- **Per-agent scoping** — table, column, and row-level access control
- **Classification enforcement** — agents blocked from data above their clearance
- **Column masking** — PII automatically masked in query results
- **Write approval gates** — mutations require explicit approval
- **Immutable audit trail** — every access decision logged to append-only JSONL

## Project Structure

```
src/
├── index.ts               # Entry point, CLI arg parsing, MCP/HTTP modes
├── config/
│   ├── types.ts           # Zod schemas + TypeScript types (sources, scopes, governance)
│   ├── loader.ts          # YAML config loader
│   ├── manager.ts         # Runtime config management (admin tools)
│   └── index.ts           # Re-exports
├── credential/
│   ├── store.ts           # Immutable in-memory credential store
│   └── index.ts           # Re-exports
├── governance/
│   ├── engine.ts          # Policy engine (classification, masking, agent policies)
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
├── toolbox/
│   ├── config.ts          # ADG config → Toolbox tools.yaml generator
│   ├── manager.ts         # Toolbox child process lifecycle
│   └── index.ts           # Re-exports
├── mcp/
│   ├── server.ts          # MCP stdio server (governance + Toolbox integration)
│   ├── admin-tools.ts     # Runtime admin tools (add/remove sources, scopes)
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

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ADG_CONFIG_PATH` | `./examples/config.yaml` | Path to YAML config |
| `ADG_PORT` | `7377` | HTTP proxy port |
| `ADG_MCP` | *(unset)* | Set to `stdio` for MCP alongside HTTP; `only` for MCP-only |
| `ADG_MCP_ADMIN` | *(unset)* | Set to `true` to enable admin tools |

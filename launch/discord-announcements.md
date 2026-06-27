# Discord Launch Announcements

---

## LangChain Discord (#show-and-tell)

**Post:**

ADG – drop-in proxy layer between AI agents and data sources. Open-source (MIT).

Problem we're solving: AI agents need data access, but giving them DB passwords is risky. Per-agent scoping is tedious. Audit is nonexistent.

ADG solves it:
```yaml
sources:
  - type: postgres
    name: analytics_db
    credentials:
      username: readonly
      password: ${DB_PASSWORD}
scopes:
  - agent: code-review-bot
    tables: [pull_requests]
    fields: [id, title, status]
```

Agents query through ADG → credential injection → scope enforcement → audit log → connector execution.

Also auto-exposes each source as MCP tools. Claude Desktop connects via `http://localhost:7377/mcp`.

Tech: TypeScript + Fastify, Docker Compose, 66 tests. Looking for early feedback!

---

## MCP Discord (#tools-integrations)

**Post:**

Built an open-source MCP gateway that auto-discovers tools from YAML config.

Point ADG at your Postgres DB or REST API and it generates:
- `tools/list` → query_{source_name} for each configured source
- `tools/call` → routed through credential injection + scope enforcement + audit

```bash
curl -X POST http://localhost:7377/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

What makes this different from other DB→MCP tools:
- Credential separation (agent never sees passwords)
- Per-agent scope rules (field-level + row filters)
- Immutable audit trail
- Multi-source (Postgres + REST API connectors, more coming)

Repo: (link) – MIT, Docker Compose.

---

## AI Agent Dev Discord (#projects)

**Post:**

Agent Data Gateway – middleware for secure AI agent data access. MIT, Docker Compose, 66 tests.

Core idea: AI agents should never hold database credentials. ADG sits between agents and data, handling auth, scoping, and audit.

Postgres and REST API connectors work today. MCP protocol built in. Looking for early adopters who want MySQL, GraphQL, or other connectors.

Repo: (link)

# Show HN: Agent Data Gateway – 10 config lines, drop-in MCP proxy for any DB/API

---

## Title Options

### Option A (direct):
Show HN: ADG – Open-source proxy that turns any Postgres/API into MCP tools with credential hiding + per-agent scoping

### Option B (problem-focused):
Show HN: The .gitignore fallacy – we built a proxy so AI agents never see your passwords

### Option C (short):
Show HN: Agent Data Gateway – 10 lines of YAML, zero passwords for your AI agents

---

## Post Body

We built an open-source middleware layer between AI agents and their data sources. The problem: every team we talked to is using .gitignore and .cursorignore to "protect" database credentials from AI agents. That's security theater.

**Agent Data Gateway (ADG)** is a drop-in proxy that:

- **Hides credentials** — agents query through ADG, credentials stay in config
- **Enforces per-agent scoping** — agent A sees PRs, agent B sees deployments, never the other way
- **Immutable audit trail** — every query logged to append-only JSONL
- **MCP native** — exposes each source as an MCP tool automatically (Claude Desktop, Codex, any MCP client)

```yaml
# 10 lines of YAML
sources:
  - type: postgres
    name: analytics_db
    credentials:
      username: readonly
      password: ${DB_PASSWORD}
scopes:
  - agent: code-review-bot
    sources:
      - name: analytics_db
        rules:
          - table: pull_requests
            fields: [id, title, status]
            filters:
              status: open
```

```bash
docker compose up
curl -X POST http://localhost:7377/query \
  -H "Content-Type: application/json" \
  -d '{"source":"analytics_db","agent":"code-review-bot","query":"SELECT * FROM pull_requests"}'
```

The MCP endpoint auto-discovers tools from config:

```bash
curl -X POST http://localhost:7377/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

**Stack:** TypeScript, Fastify, Zod, Pino, Vitest – 40 tests, clean build.

**Status:** We're at the "works on our machine" phase — Postgres and REST API connectors done, MCP protocol implemented, Docker Compose ready. Looking for early feedback from teams running AI agents against production data.

**Repo:** (link once pushed to GitHub)

**Questions we'd love your take on:**
1. What data sources do you need most? (MySQL coming next)
2. Are you doing anything to scope agent data access today?
3. What's your biggest pain with agent data security?
4. Would you use an MCP bridge to existing APIs, or primarily DBs?

---

## Comments to respond with

### If someone asks "why not just use a read-only DB user?"
You're right that a read-only user solves credential scope. But it doesn't solve:
- Per-agent field/row restrictions (two agents, same DB, different views)
- Audit trail tied to agent identity, not DB user
- MCP tool auto-generation from schema
- Enabling non-DB sources (REST APIs, S3) with the same security model

Think of ADG as the policy enforcement point between your agent identity system and your data.

### If someone asks "how does this compare to Hasura/PostgREST?"
They solve a different problem — exposing DBs as REST/GraphQL APIs. ADG is specifically for AI agent access patterns: MCP protocol, per-agent scoping, credential injection, audit. An agent shouldn't need to know your DB host, port, or user.

### If someone asks about production readiness
Right now: Postgres + REST + MySQL connectors, MCP tools/list + tools/call, Docker Compose. Needs: connection pooling, TLS, and broader MCP spec coverage before we'd call it production. The security core (credential injection + scoping + audit) is tested and solid.

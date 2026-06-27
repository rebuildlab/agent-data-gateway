# Reddit Launch Posts

---

## r/LLMDevs – Primary target

**Title:** We built an open-source proxy that turns Postgres/APIs into MCP tools — no more putting DB passwords in .cursorignore

**Body:**

Every team I talk to is doing the same thing: putting .env in .gitignore, hoping AI agents don't find credentials. That's security theater when agents can read files, follow symlinks, or get prompt-injected.

We built Agent Data Gateway — a drop-in proxy that lives between your agents and your data:

- Agents query through ADG, never see credentials
- Per-agent scoping (field-level + row filters)
- Immutable audit trail (append-only JSONL)
- Auto-exposes each source as MCP tools

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

Then Claude Desktop connects via `http://localhost:7377/mcp` and auto-discovers your DB as tools.

Tech: TypeScript + Fastify, 66 tests, MIT license.

We're early-stage and looking for feedback. What's your current setup for agent data access?

---

## r/selfhosted

**Title:** Agent Data Gateway – self-hosted proxy for AI agent data access (Docker Compose, MIT)

**Body:** https://github.com/... (link once pushed)

Self-hosted middleware that sits between AI agents and your databases/APIs. Features:
- Credential hiding (agents never see config)
- Per-agent data scoping
- Audit logging
- MCP protocol (auto-discovers tools)
- Postgres + REST API connectors
- Web UI for audit log browsing

```bash
git clone ... && docker compose up
```

One command, runs on any Linux box with Docker. MIT license.

---

## r/devops

**Title:** How are you managing AI agent access to production data?

**Body:**

We're building ADG and want to understand the current landscape. Questions:
1. Are your AI agents (Copilot, Cody, custom agents) accessing prod data today?
2. How are you controlling what they can see?
3. Do you audit agent queries?

We built ADG as our answer, but want to hear what others are doing.

---

## r/MCP

**Title:** ADG – turn any Postgres DB or REST API into MCP tools with credential hiding + scoping

**Body:**

Made an open-source tool that auto-generates MCP tools from config. Define a source in YAML, get back tools/list and tools/call for that source. Key difference from other MCP servers: ADG also handles credential injection, per-agent scoping, and audit logging.

```bash
curl -X POST http://localhost:7377/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

Works with Claude Desktop, Codex, any MCP client.

Repo: (link) – MIT, Docker Compose, 66 tests.

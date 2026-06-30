# ADG Launch — Twitter/X Thread

Post at launch time. Tag: @LangChainAI, @Anthropic, @OpenAI

---

## Tweet 1 (hook)

Your AI agents shouldn't have your database passwords.

We built Agent Data Gateway — open-source proxy that keeps credentials OUT of agent context while giving them safe, scoped data access.

MCP-native, zero config, one docker compose up.

🧵👇

## Tweet 2 (problem)

Most teams either:
• Put creds in .env and hope agents don't leak them
• Give agents full DB access (no per-agent scoping)
• Skip agent→DB integration altogether

None of these scale. ADG is the security layer AI agents need.

## Tweet 3 (solution)

How ADG works:

1️⃣ Define sources + credentials in YAML (never in agent context)
2️⃣ Set per-agent scopes — table/field/row-level access
3️⃣ Agents query through ADG proxy — automatic credential injection
4️⃣ Every query logged to immutable audit trail

## Tweet 4 (MCP)

MCP-native: ADG auto-discovers tools from config.

```bash
curl -X POST http://localhost:7377/mcp \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

Connect Claude Desktop, Codex, or any MCP client in seconds.

## Tweet 5 (call to action)

Postgres + REST API connectors done. MySQL next. Docker Compose ready.

Star us on GitHub, try the quickstart, and tell us what data sources you need:

[GitHub link]
[HN link]

#MCP #AIAgents #oss #Security #DevTools

---

## Visual suggestions
- Screenshot: ADG config YAML (10 lines)
- Screenshot: MCP tool list response
- GIF: docker compose up → query in <5 seconds

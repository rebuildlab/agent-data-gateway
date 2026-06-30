# ADG Production Hardening Plan
**Date:** 2026-06-28
**Pipeline:** Plan → Build → Review → Test
**Scope:** HOLD SCOPE — implementation fixes only, no new features

## Audit Findings (from Felix CEO tech stack audit)

6 critical-to-medium fixes identified:

| # | Issue | Severity | Files | Test Coverage |
|---|-------|----------|-------|---------------|
| 1 | Sync audit I/O (`appendFileSync`) | 🔴 Critical | `src/audit/logger.ts` | Unit: verify async writes |
| 2 | Hard-coded pool size (max:5) | 🟠 High | `src/connectors/postgres.ts`, `src/connectors/mysql.ts`, `src/config/types.ts` | Unit: pool config parsing |
| 3 | No graceful shutdown | 🟠 High | `src/index.ts`, `src/connectors/postgres.ts`, `src/connectors/mysql.ts` | Integration: SIGTERM flow |
| 4 | No query timeout | 🟠 High | `src/connectors/postgres.ts`, `src/connectors/mysql.ts` | Unit: timeout triggers |
| 5 | pino-pretty in production | 🟡 Medium | `src/index.ts`, `src/proxy/server.ts` | Unit: env-based config |
| 6 | Missing Docker HEALTHCHECK | 🟡 Medium | `Dockerfile` | Manual: docker inspect |
| 7 | No rate limiting on /query | 🟡 Medium | `src/proxy/server.ts`, `package.json` | Integration: rate-limit header |
| 8 | No explicit body size limit | 🟡 Medium | `src/proxy/server.ts` | Unit: body rejection |

## Fix Specifications

### Fix 1: Async Audit Logging (Critical)
**Current:** `appendFileSync()` blocks event loop on every log write
**Target:** Use Pino async file transport (already in dependencies)
**Implementation:**
- Replace `FileAuditLogger` with Pino-based `AuditLogger`
- Use `pino.destination({ sync: false })` for async buffered writes
- Keep the same `getEntries()` API for the `/audit` endpoint
- In-memory buffer + Pino write stream for production
- Fall back to sync if Pino destination fails

### Fix 2: Configurable Connection Pools (High)
**Current:** Hard-coded `max: 5` / `connectionLimit: 5`
**Target:** Per-source pool configuration from YAML config
**Implementation:**
- Add optional `pool` section to source config schema in `src/config/types.ts`:
  ```yaml
  sources:
    - type: postgres
      name: analytics_db
      pool:
        max: 10
        idleTimeoutMs: 30000
        connectionTimeoutMs: 5000
  ```
- Default values when not configured: max=5, idleTimeout=30000, connectionTimeout=5000
- Apply to both PostgresConnector and MySqlConnector

### Fix 3: Graceful Shutdown (High)
**Current:** No signal handling — pools leak on process exit
**Target:** SIGTERM/SIGINT handlers that close pools, flush audit logs, exit cleanly
**Implementation:**
- Add `shutdown()` method to both connectors (close all pools)
- Add `flush()` method to audit logger
- Register `process.on('SIGTERM', ...)` and `process.on('SIGINT', ...)` in `src/index.ts`
- Close Fastify server → flush audit → close pools → exit(0)
- Timeout: force exit(1) after 10s if graceful shutdown stalls

### Fix 4: Query Timeout (High)
**Current:** No protection against long-running queries
**Target:** Per-query timeout, configurable, default 30s
**Implementation:**
- Add `queryTimeoutMs` to pool config (default 30000)
- For Postgres: use `statement_timeout` via `pool.query('SET statement_timeout = ...')` or `query_timeout` pool option
- For MySQL: use `queryTimeout` in connection config
- On timeout: return error response, don't crash

### Fix 5: Production Logging Config (Medium)
**Current:** pino-pretty always enabled
**Target:** JSON output in production (NODE_ENV=production), pretty only in dev
**Implementation:**
- Check `NODE_ENV` in `src/index.ts`
- Pass logger config to `createProxyServer`
- Production: `pino({ level: 'info' })` — raw JSON
- Development: `pino({ transport: { target: 'pino-pretty' } })`

### Fix 6: Docker HEALTHCHECK (Medium)
**Current:** No health check in Dockerfile
**Target:** HEALTHCHECK instruction using /health endpoint
**Implementation:**
```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:7377/health || exit 1
```

### Fix 7: Rate Limiting (Medium)
**Current:** No request throttling
**Target:** Rate limit on `/query` endpoint to prevent agent abuse
**Implementation:**
- Add `@fastify/rate-limit` dependency
- Default: 100 requests per minute per IP on `/query`
- Configurable via env: `ADG_RATE_LIMIT_MAX`, `ADG_RATE_LIMIT_WINDOW_MS`
- `/health` and `/audit` endpoints exempt

### Fix 8: Explicit Body Size Limit (Medium)
**Current:** Relies on Fastify default (1MB)
**Target:** Explicit body limit appropriate for SQL queries
**Implementation:**
- Set `bodyLimit` to 10KB in Fastify server config
- SQL queries shouldn't exceed this; prevents memory exhaustion attacks

## Files to Modify

| File | Fixes | Type |
|------|-------|------|
| `src/config/types.ts` | #2 (pool config schema) | Schema |
| `src/config/loader.ts` | #2 (pool config parsing) | Logic |
| `src/audit/logger.ts` | #1 (async audit) | Rewrite |
| `src/connectors/postgres.ts` | #2, #4 (pool config, timeout) | Logic |
| `src/connectors/mysql.ts` | #2, #4 (pool config, timeout) | Logic |
| `src/connectors/base.ts` | #2 (ConnectorConfig type) | Schema |
| `src/index.ts` | #3, #5 (shutdown, logging) | Logic |
| `src/proxy/server.ts` | #5, #7, #8 (logging, rate limit, body limit) | Logic |
| `Dockerfile` | #6 (HEALTHCHECK) | Config |
| `package.json` | #7 (rate-limit dep) | Config |
| `tests/` | All fixes | New tests |

## Test Plan

| Fix | Test Type | What to Verify |
|-----|-----------|----------------|
| #1 | Unit | AuditLogger writes asynchronously, flush() resolves all writes |
| #2 | Unit | Pool config parses with defaults, overrides apply |
| #3 | Integration | SIGTERM triggers shutdown, pools closed, audit flushed |
| #4 | Unit | Timeout config applied, abort controller works |
| #5 | Unit | Production → JSON, dev → pretty |
| #6 | Manual | `docker build` + `docker inspect` shows HEALTHCHECK |
| #7 | Integration | Rate limit headers present, 429 after threshold |
| #8 | Unit | Oversize body returns 413 |

## Decision Principles
- Existing patterns over new ones (don't change architecture)
- Safe defaults over clever ones (all new features have sensible defaults)
- Completeness over shortcuts (every error path handled)
- Configurable but not required (zero-config still works)

# Agent Data Gateway (ADG)

Open-core middleware that gives AI agents secure, auditable access to production data. Converts existing APIs/DBs into MCP tools with credential hiding, data scoping, and immutable audit logs.

## Architecture (M1)

```
┌─────────────┐     ┌──────────────────────────────────┐     ┌──────────────┐
│   Agent     │────▶│      ADG Proxy (Fastify)          │────▶│  Backend     │
│ (no creds)  │     │  ┌────────────┐  ┌─────────────┐  │     │  API / DB    │
│             │     │  │ Interceptor │──│ Credential   │  │     │              │
└─────────────┘     │  │ inject creds│  │ Store (mem) │  │     └──────────────┘
                    │  └────────────┘  └─────────────┘  │
                    │  ┌────────────┐                    │
                    │  │  Audit Log  │                    │
                    │  └────────────┘                    │
                    └──────────────────────────────────┘
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

# Run
npm start        # production
npm run dev      # development with hot reload
```

## API Endpoints

### `POST /proxy`
Agent sends a request referencing a source by name. Proxy injects credentials server-side.

```json
{
  "source": "stripe-api",
  "url": "https://api.stripe.com/v1/charges",
  "method": "GET"
}
```

### `GET /health`
Health check — returns status and source count.

### `GET /sources`
Lists known source names (no credentials).

## Security

- Credentials stored in-memory only, never persisted to disk after boot
- All credential fields redacted from logs, error messages, and responses
- `CredentialNotFoundError` leaks only the source name, never credential values
- Credential store is immutable after initialization

## Project Structure

```
├── src/
│   ├── index.ts               # Entry point & Fastify server
│   ├── config/
│   │   ├── loader.ts          # YAML config loader
│   │   └── schema.ts          # Zod schema & types
│   ├── credentials/
│   │   ├── store.ts           # In-memory credential store
│   │   ├── types.ts           # Credential types
│   │   └── redact.ts          # Credential redaction utilities
│   ├── proxy/
│   │   └── interceptor.ts     # Credential injection middleware
│   └── audit/
│       └── logger.ts          # Immutable audit logger
├── tests/
│   ├── credentials/
│   │   ├── redact.test.ts
│   │   └── store.test.ts
│   └── proxy/
│       └── interceptor.test.ts
├── examples/
│   └── config.yaml
├── docker-compose.yml
└── package.json
```

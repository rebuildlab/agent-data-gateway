# Contributing to Agent Data Gateway

Thanks for your interest in contributing! ADG is open-core under Apache 2.0.

## How to Contribute

1. **Open an issue** — Describe what you want to add or fix
2. **Fork the repo** — Create your feature branch
3. **Write code** — Follow the patterns in `src/`
4. **Add tests** — Every feature needs test coverage
5. **Submit a PR** — CI will run lint, test, and build

## Adding a New Connector

Connectors let ADG proxy data from different sources. Each connector lives in `src/connectors/`.

### Steps

1. Create `src/connectors/<name>.ts` implementing `ConnectorConfig`:

```typescript
import type { ConnectorConfig } from './base.js';

export class MyConnector {
  async execute(sourceName: string, query: string, config: ConnectorConfig) {
    // config.connection has your source-specific connection params
    // config.credentials has the injected credentials
    // Return { rows: [...], rowCount: N }
  }
}
```

2. Register it in `src/connectors/index.ts`
3. Add the source type to `src/config/schema.ts` (Zod validation)
4. Add it to the connector registry in `src/proxy/server.ts`
5. Write tests in `tests/`

### Connector Pattern

```
Source config → Zod validation → CredentialStore lookup
     ↓
Connector.execute(sourceName, query, config)
     ↓
{ rows, rowCount }  ← credentials injected, scoping applied
```

## Adding a Framework Integration Example

Add examples to `examples/` following the pattern:

- TypeScript: `examples/<framework>-integration.ts`
- Python: `examples/<framework>-integration.py`

Each example should demonstrate:
1. Connecting to a running ADG proxy
2. Sending a query through ADG (no credentials in agent code)
3. Using the result in the framework's native patterns

## Code Style

- TypeScript: strict mode, ES modules
- Python: PEP 8
- Tests: Vitest for TS, pytest for Python
- Use `npm run lint` and `npm test` before committing

## License

By contributing, you agree that your contributions will be licensed under Apache 2.0.

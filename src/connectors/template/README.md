# Adding a New Connector

Connectors are ADG's plugins for different data source types. Each connector implements the `Connector` interface and is registered in the connector registry.

## Interface

```typescript
interface Connector {
  execute(sourceName: string, query: string, config: ConnectorConfig): Promise<QueryResult>;
  test(config: ConnectorConfig): Promise<boolean>;
}
```

## Steps

1. **Copy template:** `cp src/connectors/template/mysql.ts src/connectors/<name>.ts`
2. **Define config type:** Extend `ConnectorConfig` with source-specific connection fields
3. **Implement `execute`:** Connect, run query, return `{ rows, rowCount, duration }`
4. **Implement `test`:** Verify connection works (used in health checks)
5. **Register in index:** Add export to `src/connectors/index.ts`
6. **Add config schema:** Add type to `ConfigSource.discriminatedUnion` in `src/config/types.ts`
7. **Wire builder:** Add case in `createConnectorRegistry` in `src/proxy/server.ts`
8. **Test:** Create `tests/<name>.test.ts` with integration-style tests
9. **Verify:** `npm test && npm run typecheck`

## Example (MySQL)

See `src/connectors/template/mysql.ts` for a complete scaffold.

## Existing Connectors

| Type | File | Status |
|------|------|--------|
| postgres | `src/connectors/postgres.ts` | ✅ Production |
| rest | `src/connectors/rest.ts` | ✅ Production |
| mysql | `src/connectors/template/mysql.ts` | 🔧 Template (needs `mysql2` npm dep) |
| mongo | (planned) | 📋 |
| graphql | (planned) | 📋 |
| s3 | (planned) | 📋 |

## Best Practices

- **Connection pooling:** Use connection pools (not one-off connections) for production
- **Timeout:** Set query timeouts to prevent long-running queries
- **Error wrapping:** Catch connection/query errors and wrap with context (source name, query preview)
- **Sanitization:** The connector receives already-scoped queries — no need to re-implement auth
- **Audit:** Audit logging is handled by the proxy layer, not the connector

import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { loadConfig } from '../src/config/loader.js';
import { createProxyServer } from '../src/proxy/server.js';
import { FileAuditLogger } from '../src/audit/logger.js';
import { redact, stripCredentials } from '../src/proxy/interceptor.js';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const exampleConfig = resolve(__dirname, '../examples/config.yaml');
const config = loadConfig(exampleConfig);

describe('Proxy server', () => {
  it('responds to health check', async () => {
    const server = createProxyServer(config);
    const response = await server.inject({
      method: 'GET',
      url: '/health',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('ok');
    await server.close();
  });

  it('rejects query without source', async () => {
    const server = createProxyServer(config);
    const response = await server.inject({
      method: 'POST',
      url: '/query',
      payload: { agent: 'test', query: 'SELECT 1' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('Missing source name');
    await server.close();
  });

  it('rejects query without agent', async () => {
    const server = createProxyServer(config);
    const response = await server.inject({
      method: 'POST',
      url: '/query',
      payload: { source: 'analytics_db', query: 'SELECT 1' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('Missing agent identifier');
    await server.close();
  });

  it('accepts valid scoped query', async () => {
    const server = createProxyServer(config);
    const response = await server.inject({
      method: 'POST',
      url: '/query',
      payload: { source: 'analytics_db', agent: 'code-review-bot', query: 'SELECT * FROM pull_requests' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('ok');
    expect(response.json().scope).toBeDefined();
    await server.close();
  });

  it('returns 404 for unknown source', async () => {
    const server = createProxyServer(config);
    const response = await server.inject({
      method: 'POST',
      url: '/query',
      payload: { source: 'unknown_source', agent: 'code-review-bot', query: 'SELECT 1' },
    });
    expect(response.statusCode).toBe(404);
    await server.close();
  });

  it('returns 403 for unauthorized table', async () => {
    const server = createProxyServer(config);
    const response = await server.inject({
      method: 'POST',
      url: '/query',
      payload: { source: 'analytics_db', agent: 'code-review-bot', query: 'SELECT * FROM secrets' },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error).toBe('Access denied');
    await server.close();
  });

  it('returns 403 for unauthorized agent', async () => {
    const server = createProxyServer(config);
    const response = await server.inject({
      method: 'POST',
      url: '/query',
      payload: { source: 'analytics_db', agent: 'unknown-bot', query: 'SELECT * FROM pull_requests' },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error).toBe('Access denied');
    await server.close();
  });

  it('logs audit entries', async () => {
    const auditLogger = new FileAuditLogger('');
    const server = createProxyServer(config, auditLogger);

    await server.inject({
      method: 'POST',
      url: '/query',
      payload: { source: 'analytics_db', agent: 'code-review-bot', query: 'SELECT * FROM pull_requests' },
    });

    const auditResponse = await server.inject({ method: 'GET', url: '/audit' });
    expect(auditResponse.json().count).toBeGreaterThanOrEqual(1);
    await server.close();
  });
});

describe('Redaction', () => {
  it('redacts sensitive fields from objects', () => {
    const input = { password: 'secret123', name: 'test', apiKey: 'key123' };
    const result = redact(input) as Record<string, unknown>;
    expect(result.password).toBe('[REDACTED]');
    expect(result.name).toBe('test');
    expect(result.apiKey).toBe('[REDACTED]');
  });

  it('redacts nested sensitive fields', () => {
    const input = { credentials: { password: 'secret', token: 'abc' }, data: { ok: true } };
    const result = redact(input) as Record<string, unknown>;
    expect((result.credentials as Record<string, unknown>).password).toBe('[REDACTED]');
    expect((result.credentials as Record<string, unknown>).token).toBe('[REDACTED]');
  });

  it('redacts sensitive headers', () => {
    const headers = { Authorization: 'Bearer token123', 'Content-Type': 'application/json' };
    const result = stripCredentials(headers);
    expect(result.Authorization).toBe('[REDACTED]');
    expect(result['Content-Type']).toBe('application/json');
  });
});

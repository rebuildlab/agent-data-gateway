import Fastify from 'fastify';
import type { Config } from '../config/types.js';
import { CredentialStore } from '../credential/store.js';
import { FileAuditLogger } from '../audit/logger.js';
import type { AccessEntry } from '../audit/types.js';
import { evaluateScope } from './scoping.js';

export function createProxyServer(config: Config, auditLogger?: FileAuditLogger) {
  const credentialStore = CredentialStore.fromConfig(config);
  const audit = auditLogger || new FileAuditLogger('/tmp/adg-audit.log');

  const server = Fastify({
    logger: {
      level: 'info',
      transport: {
        target: 'pino-pretty',
        options: { colorize: true },
      },
    },
  });

  server.post('/query', async (request, reply) => {
    const { source, agent, query } = (request.body as Record<string, unknown>) || {};

    if (typeof source !== 'string' || !source) {
      return reply.status(400).send({ error: 'Missing source name' });
    }

    if (typeof agent !== 'string' || !agent) {
      return reply.status(400).send({ error: 'Missing agent identifier' });
    }

    const creds = credentialStore.get(source);
    if (!creds) {
      audit.log({
        timestamp: new Date().toISOString(),
        agent_id: agent,
        source,
        action: 'QUERY',
        resource: 'unknown',
        policy_decision: 'denied',
      });
      return reply.status(404).send({ error: 'Source not found', source });
    }

    request.log.info({ source, agent, queryLength: query?.toString().length || 0 }, 'Proxy request');

    const table = extractTableName((query as string) || '');
    const scopeResult = evaluateScope(agent, source, table, config.scopes);

    if (!scopeResult.permitted) {
      audit.log({
        timestamp: new Date().toISOString(),
        agent_id: agent,
        source,
        action: 'QUERY',
        resource: table,
        policy_decision: 'denied',
      });
      return reply.status(403).send({ error: 'Access denied', reason: scopeResult.reason });
    }

    audit.log({
      timestamp: new Date().toISOString(),
      agent_id: agent,
      source,
      action: 'QUERY',
      resource: table,
      row_count: 0,
      policy_decision: 'permitted',
    });

    return {
      status: 'ok',
      source,
      agent,
      scope: scopeResult.scopedQuery,
      message: 'Query received (connector not yet implemented)',
    };
  });

  server.get('/health', async () => ({
    status: 'ok',
    version: '0.1.0',
    sources: credentialStore.size,
  }));

  server.get('/audit', async () => ({
    entries: audit.getEntries(),
    count: audit.getEntries().length,
  }));

  return server;
}

function extractTableName(query: string): string {
  const match = query.match(/FROM\s+(\w+)/i);
  return match ? match[1] : query.split(/\s+/)[0] || 'unknown';
}

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { CredentialStore } from '../credential/store.js';

const SENSITIVE_FIELDS = [
  'password', 'apikey', 'api_key', 'secret', 'token',
  'authorization', 'x-api-key', 'x-auth-token',
];

export function createCredentialInterceptor(credentialStore: CredentialStore) {
  return async function interceptor(
    request: FastifyRequest,
    reply: FastifyReply
  ) {
    const { source, agent, query } = (request.body as Record<string, unknown>) || {};

    if (typeof source !== 'string' || !source) {
      return reply.status(400).send({ error: 'Missing source name' });
    }

    if (typeof agent !== 'string' || !agent) {
      return reply.status(400).send({ error: 'Missing agent identifier' });
    }

    const creds = credentialStore.get(source);
    if (!creds) {
      return reply.status(404).send({
        error: 'Source not found',
        source,
      });
    }

    request.log.info({
      source,
      agent,
      queryLength: typeof query === 'string' ? query.length : 0,
    }, 'Proxy request');

    const credsForLog = redact(creds);
    request.log.debug({
      source,
      credentials: credsForLog,
    }, 'Resolved credentials');
  };
}

function redact(obj: unknown, depth = 0): unknown {
  if (depth > 10) return obj;
  if (Array.isArray(obj)) return obj.map((v) => redact(v, depth + 1));
  if (obj && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (SENSITIVE_FIELDS.includes(key.toLowerCase())) {
        result[key] = '[REDACTED]';
      } else {
        result[key] = redact(value, depth + 1);
      }
    }
    return result;
  }
  return obj;
}

function stripCredentials(headers: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (SENSITIVE_FIELDS.includes(key.toLowerCase())) {
      result[key] = '[REDACTED]';
    } else {
      result[key] = value;
    }
  }
  return result;
}

export { redact, stripCredentials, SENSITIVE_FIELDS };

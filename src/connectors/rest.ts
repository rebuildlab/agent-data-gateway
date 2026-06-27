import type { Connector, ConnectorConfig, QueryResult } from './base.js';
import type { ApiCredential } from '../config/types.js';

export class RestConnector implements Connector {
  async execute(
    _sourceName: string,
    query: string,
    config: ConnectorConfig
  ): Promise<QueryResult> {
    const creds = config.credentials as ApiCredential;
    const baseUrl = (config.connection.url as string) || '';

    const url = new URL(query, baseUrl);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    headers[creds.headerName || 'Authorization'] = creds.apiKey;

    const start = performance.now();
    const response = await fetch(url.toString(), { headers });
    const duration = performance.now() - start;

    if (!response.ok) {
      throw new Error(`REST API error: ${response.status} ${response.statusText}`);
    }

    const body = await response.json();
    const rows = Array.isArray(body) ? body : [body];

    return {
      rows,
      rowCount: rows.length,
      duration: Math.round(duration),
    };
  }

  async test(config: ConnectorConfig): Promise<boolean> {
    const baseUrl = (config.connection.url as string) || '';
    if (!baseUrl) return false;
    try {
      const response = await fetch(baseUrl, { method: 'HEAD' });
      return response.ok || response.status < 500;
    } catch {
      return false;
    }
  }
}

import pg from 'pg';
import type { Connector, ConnectorConfig, QueryResult } from './base.js';
import type { DbCredential } from '../config/types.js';

const { Pool } = pg;

export class PostgresConnector implements Connector {
  private pools = new Map<string, pg.Pool>();

  async execute(
    sourceName: string,
    query: string,
    config: ConnectorConfig
  ): Promise<QueryResult> {
    const creds = config.credentials as DbCredential;
    const pool = this.getPool(sourceName, config, creds);
    const start = performance.now();
    const result = await pool.query(query);
    const duration = performance.now() - start;

    return {
      rows: result.rows,
      rowCount: result.rowCount ?? 0,
      duration: Math.round(duration),
    };
  }

  async test(config: ConnectorConfig): Promise<boolean> {
    const creds = config.credentials as DbCredential;
    const pool = this.getPool('__test__', config, creds);
    try {
      await pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    } finally {
      await pool.end();
      this.pools.delete('__test__');
    }
  }

  private getPool(
    name: string,
    config: ConnectorConfig,
    creds: DbCredential
  ): pg.Pool {
    const existing = this.pools.get(name);
    if (existing) return existing;

    const pool = new Pool({
      host: creds.host,
      database: creds.database,
      user: creds.username,
      password: creds.password,
      port: (config.connection.port as number) || 5432,
      max: 5,
    });

    this.pools.set(name, pool);
    return pool;
  }

  async close(): Promise<void> {
    for (const [, pool] of this.pools) {
      await pool.end();
    }
    this.pools.clear();
  }
}

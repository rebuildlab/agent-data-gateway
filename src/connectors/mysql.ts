import mysql from 'mysql2/promise';
import type { Connector, ConnectorConfig, QueryResult } from './base.js';
import type { DbCredential } from '../config/types.js';

export class MySqlConnector implements Connector {
  private pools = new Map<string, mysql.Pool>();

  async execute(
    sourceName: string,
    query: string,
    config: ConnectorConfig
  ): Promise<QueryResult> {
    const creds = config.credentials as DbCredential;
    const pool = this.getPool(sourceName, config, creds);
    const start = performance.now();
    const [rows] = await pool.query(query);
    const duration = performance.now() - start;
    const rowArray = Array.isArray(rows) ? rows : [rows];

    return {
      rows: rowArray as Record<string, unknown>[],
      rowCount: rowArray.length,
      duration: Math.round(duration),
    };
  }

  async test(config: ConnectorConfig): Promise<boolean> {
    const creds = config.credentials as DbCredential;
    const pool = this.getPool('__test__', config, creds);
    try {
      const conn = await pool.getConnection();
      await conn.ping();
      conn.release();
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
  ): mysql.Pool {
    const existing = this.pools.get(name);
    if (existing) return existing;

    const pool = mysql.createPool({
      host: creds.host,
      database: creds.database,
      user: creds.username,
      password: creds.password,
      port: (config.connection.port as number) || 3306,
      connectionLimit: 5,
      waitForConnections: true,
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

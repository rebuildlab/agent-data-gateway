/**
 * MySQL Connector — Template for new ADG connectors
 *
 * 1. Copy this file to src/connectors/mysql.ts
 * 2. Implement the Connector interface
 * 3. Add import + builder to src/connectors/index.ts
 * 4. Add 'mysql' type to ConfigSource schema in src/config/types.ts
 * 5. Add builder case in src/proxy/server.ts
 * 6. Write tests in tests/mysql.test.ts
 * 7. Run: npm test && npm run typecheck
 */

import type { Connector, ConnectorConfig, QueryResult } from '../base.js';

interface MySqlConfig extends ConnectorConfig {
  connection: {
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
  };
}

export class MySqlConnector implements Connector {
  async execute(
    sourceName: string,
    query: string,
    config: MySqlConfig
  ): Promise<QueryResult> {
    const start = Date.now();

    // TODO: Implement MySQL connection + query execution
    // import mysql from 'mysql2/promise';
    // const conn = await mysql.createConnection({
    //   host: config.connection.host,
    //   port: config.connection.port ?? 3306,
    //   user: config.connection.username,
    //   password: config.connection.password,
    //   database: config.connection.database,
    // });
    // const [rows] = await conn.execute(query);
    // await conn.end();

    throw new Error('MySQL connector not yet implemented');
  }

  async test(config: MySqlConfig): Promise<boolean> {
    try {
      // TODO: Implement connection test
      // const conn = await mysql.createConnection({ ... });
      // await conn.ping();
      // await conn.end();
      // return true;
      return false;
    } catch {
      return false;
    }
  }
}

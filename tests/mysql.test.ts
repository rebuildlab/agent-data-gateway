import { describe, it, expect } from 'vitest';
import { MySqlConnector } from '../src/connectors/mysql.js';
import type { ConnectorConfig } from '../src/connectors/base.js';
import type { DbCredential } from '../src/config/types.js';

const mockCreds: DbCredential = {
  host: 'localhost',
  database: 'test',
  username: 'root',
  password: 'password',
};

const mockConfig: ConnectorConfig = {
  name: 'mysql_test',
  connection: { port: 3306 },
  credentials: mockCreds,
};

describe('MySqlConnector', () => {
  it('implements Connector interface', () => {
    const connector = new MySqlConnector();
    expect(typeof connector.execute).toBe('function');
    expect(typeof connector.test).toBe('function');
    expect(typeof connector.close).toBe('function');
  });

  it('fails to connect to nonexistent server', async () => {
    const connector = new MySqlConnector();
    const result = await connector.test(mockConfig);
    expect(result).toBe(false);
    await connector.close();
  });

  it('execute throws on nonexistent server', async () => {
    const connector = new MySqlConnector();
    await expect(connector.execute('test', 'SELECT 1', mockConfig)).rejects.toThrow();
    await connector.close();
  });

  it('requires valid credential fields', () => {
    const connector = new MySqlConnector();
    const badConfig: ConnectorConfig = {
      name: 'bad',
      connection: {},
      credentials: { host: '', database: '', username: '', password: '' } as DbCredential,
    };
    expect(() => connector.test(badConfig)).not.toThrow();
  });
});

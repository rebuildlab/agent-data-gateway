import type { Credential } from '../config/types.js';

export interface ConnectorConfig {
  name: string;
  connection: Record<string, unknown>;
  credentials: Credential;
}

export interface QueryResult {
  rows: Record<string, unknown>[];
  rowCount: number;
  duration: number;
}

export interface Connector {
  execute(sourceName: string, query: string, config: ConnectorConfig): Promise<QueryResult>;
  test(config: ConnectorConfig): Promise<boolean>;
}

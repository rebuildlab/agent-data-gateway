export interface AccessEntry {
  timestamp: string;
  agent_id: string;
  source: string;
  action: string;
  resource: string;
  row_count?: number;
  policy_decision: 'permitted' | 'denied';
  duration_ms?: number;
}

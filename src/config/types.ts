import { z } from 'zod';

// ── Credential types ──────────────────────────────────────────────

const DbCredentialSchema = z.object({
  host: z.string(),
  database: z.string(),
  username: z.string(),
  password: z.string(),
});

const ApiCredentialSchema = z.object({
  apiKey: z.string(),
  headerName: z.string().default('Authorization'),
});

const CredentialSchema = z.union([DbCredentialSchema, ApiCredentialSchema]);

// ── Data Source ───────────────────────────────────────────────────

// Supported source types (aligns with Google MCP Toolbox sources)
export const SourceTypeEnum = z.enum([
  'postgres',
  'mysql',
  'mariadb',
  'cloud-sql-postgres',
  'cloud-sql-mysql',
  'alloydb',
  'bigquery',
  'spanner',
  'rest',
]);

export const SourceSchema = z.object({
  type: SourceTypeEnum,
  name: z.string(),
  connection: z.object({
    host: z.string().optional(),
    database: z.string().optional(),
    port: z.number().optional(),
    url: z.string().optional(),
    // Google Cloud fields
    project: z.string().optional(),
    region: z.string().optional(),
    instance: z.string().optional(),
  }),
  credentials: CredentialSchema,
});

// ── Access Scoping ────────────────────────────────────────────────

export const ScopeRuleSchema = z.object({
  table: z.string().optional(),
  endpoint: z.string().optional(),
  methods: z.array(z.string()).optional(),
  filters: z.record(z.any()).optional(),
  fields: z.array(z.string()).optional(),
});

export const ScopeSchema = z.object({
  agent: z.string().min(1, 'Agent ID must not be empty'),
  sources: z.array(z.object({
    name: z.string().min(1),
    rules: z.array(ScopeRuleSchema),
  })).min(1, 'At least one source is required'),
});

// ── Governance Policy ─────────────────────────────────────────────

/** Data classification levels */
export const DataClassEnum = z.enum([
  'public',
  'internal',
  'confidential',
  'restricted',
  'pii',
  'phi',
  'pci',
]);

/** Column-level classification */
export const ColumnPolicySchema = z.object({
  name: z.string(),
  classification: DataClassEnum,
  masking: z.enum(['none', 'hash', 'redact', 'tokenize', 'partial']).default('none'),
  /** Masking format: e.g. '***-***-1234' for partial SSN */
  maskFormat: z.string().optional(),
  description: z.string().optional(),
});

/** Table-level governance policy */
export const TablePolicySchema = z.object({
  table: z.string(),
  classification: DataClassEnum,
  columns: z.array(ColumnPolicySchema).optional(),
  /** Row-level filter applied to ALL queries on this table */
  rowFilter: z.string().optional(),
  /** Max rows returnable per query (0 = unlimited) */
  maxRows: z.number().int().nonnegative().default(0),
  /** Require approval for write operations */
  requireApprovalForWrites: z.boolean().default(true),
  /** Data residency: restrict to specific regions */
  residency: z.array(z.string()).optional(),
  description: z.string().optional(),
});

/** Source-level governance policy */
export const SourcePolicySchema = z.object({
  source: z.string(),
  /** Default classification for tables without explicit policies */
  defaultClassification: DataClassEnum.default('internal'),
  tables: z.array(TablePolicySchema).optional(),
  /** Require all queries to pass through policy engine */
  enforceAll: z.boolean().default(true),
});

/** Agent-level governance rules */
export const AgentPolicySchema = z.object({
  agent: z.string(),
  /** Classification levels this agent is allowed to access */
  allowedClassifications: z.array(DataClassEnum).default(['internal', 'public']),
  /** Max rows this agent can return per query */
  maxRowsPerQuery: z.number().int().nonnegative().default(1000),
  /** Max concurrent queries */
  maxConcurrency: z.number().int().positive().default(5),
  /** Query timeout in milliseconds */
  queryTimeoutMs: z.number().int().positive().default(30000),
  /** Allowed query types: SELECT, INSERT, UPDATE, DELETE */
  allowedOperations: z.array(z.enum(['SELECT', 'INSERT', 'UPDATE', 'DELETE'])).default(['SELECT']),
  /** Require human approval before executing writes */
  requireApprovalForWrites: z.boolean().default(true),
  /** Allowed source names (empty = all scoped sources) */
  allowedSources: z.array(z.string()).optional(),
  /** Allow raw SQL or force parameterized only */
  allowRawSQL: z.boolean().default(false),
});

/** Top-level governance configuration */
export const GovernanceSchema = z.object({
  enabled: z.boolean().default(true),
  /** Source-level policies (classification, column masking, residency) */
  sourcePolicies: z.array(SourcePolicySchema).optional(),
  /** Agent-level policies (allowed classifications, operation limits) */
  agentPolicies: z.array(AgentPolicySchema).optional(),
  /** Default agent policy applied when no explicit policy matches */
  defaultAgentPolicy: AgentPolicySchema.default({
    agent: 'default',
    allowedClassifications: ['public'],
    maxRowsPerQuery: 100,
    maxConcurrency: 1,
    queryTimeoutMs: 10000,
    allowedOperations: ['SELECT'],
  }),
  /** Data retention policies */
  retention: z.object({
    /** Audit log retention in days */
    auditLogDays: z.number().int().positive().default(365),
    /** Query result cache TTL in seconds */
    resultCacheTTL: z.number().int().nonnegative().default(0),
  }).optional(),
});

// ── Audit ─────────────────────────────────────────────────────────

const AuditSchema = z.object({
  enabled: z.boolean().default(true),
  format: z.enum(['json', 'jsonl']).default('jsonl'),
  output: z.string().default('/var/log/adg/audit.log'),
});

// ── Top-level Config ──────────────────────────────────────────────

export const ConfigSchema = z.object({
  version: z.string().default('1'),
  sources: z.array(SourceSchema),
  scopes: z.array(ScopeSchema),
  governance: GovernanceSchema.default({}),
  audit: AuditSchema.default({}),
});

// ── Type exports ──────────────────────────────────────────────────

export type DbCredential = z.infer<typeof DbCredentialSchema>;
export type ApiCredential = z.infer<typeof ApiCredentialSchema>;
export type Credential = z.infer<typeof CredentialSchema>;
export type SourceType = z.infer<typeof SourceTypeEnum>;
export type Source = z.infer<typeof SourceSchema>;
export type ScopeRule = z.infer<typeof ScopeRuleSchema>;
export type Scope = z.infer<typeof ScopeSchema>;
export type DataClass = z.infer<typeof DataClassEnum>;
export type ColumnPolicy = z.infer<typeof ColumnPolicySchema>;
export type TablePolicy = z.infer<typeof TablePolicySchema>;
export type SourcePolicy = z.infer<typeof SourcePolicySchema>;
export type AgentPolicy = z.infer<typeof AgentPolicySchema>;
export type Governance = z.infer<typeof GovernanceSchema>;
export type Audit = z.infer<typeof AuditSchema>;
export type Config = z.infer<typeof ConfigSchema>;

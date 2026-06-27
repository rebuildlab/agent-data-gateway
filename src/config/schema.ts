import { z } from 'zod';

// ─── Credential schemas ────────────────────────────────────────────────

export const DbCredentialsSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().positive().default(5432),
  database: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
});

export const ApiCredentialsSchema = z.object({
  apiKey: z.string().min(1),
  headerName: z.string().default('Authorization'),
  headerTemplate: z.string().default('Bearer {apiKey}'),
});

// ─── Source schemas ────────────────────────────────────────────────────

export const DbSourceSchema = z.object({
  type: z.literal('db'),
  host: z.string().min(1),
  port: z.number().int().positive().default(5432),
  database: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
});

export const ApiSourceSchema = z.object({
  type: z.literal('api'),
  baseUrl: z.string().url(),
  apiKey: z.string().min(1),
  headerName: z.string().default('Authorization'),
  headerTemplate: z.string().default('Bearer {apiKey}'),
});

export const SourceSchema = z.discriminatedUnion('type', [
  DbSourceSchema,
  ApiSourceSchema,
]);

// ─── Config top-level ──────────────────────────────────────────────────

export const AuditConfigSchema = z.object({
  enabled: z.boolean().default(true),
  format: z.enum(['json', 'ndjson']).default('ndjson'),
  output: z.enum(['file', 'stdout', 'stderr']).default('stdout'),
});

export const ScopeFieldSchema = z.object({
  field: z.string().min(1),
  operator: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'nin', 'contains']),
  value: z.union([z.string(), z.number(), z.array(z.union([z.string(), z.number()]))]),
});

export const ScopeEntrySchema = z.object({
  table: z.string().min(1),
  filters: z.array(ScopeFieldSchema).default([]),
  allowedFields: z.array(z.string()).optional(),
});

export const AgentScopeSchema = z.object({
  agentId: z.string().min(1),
  sources: z.array(z.string().min(1)).min(1),
  tables: z.array(ScopeEntrySchema).optional(),
  maxRows: z.number().int().positive().default(100),
});

export const ConfigSchema = z.object({
  server: z.object({
    host: z.string().default('0.0.0.0'),
    port: z.number().int().positive().default(3101),
  }).default({}),
  sources: z.record(z.string(), SourceSchema).default({}),
  scopes: z.array(AgentScopeSchema).default([]),
  audit: AuditConfigSchema.default({}),
});

// ─── Inferred types ────────────────────────────────────────────────────

export type DbCredentials = z.infer<typeof DbCredentialsSchema>;
export type ApiCredentials = z.infer<typeof ApiCredentialsSchema>;
export type Source = z.infer<typeof SourceSchema>;
export type DbSource = z.infer<typeof DbSourceSchema>;
export type ApiSource = z.infer<typeof ApiSourceSchema>;
export type AuditConfig = z.infer<typeof AuditConfigSchema>;
export type ScopeEntry = z.infer<typeof ScopeEntrySchema>;
export type AgentScope = z.infer<typeof AgentScopeSchema>;
export type Config = z.infer<typeof ConfigSchema>;

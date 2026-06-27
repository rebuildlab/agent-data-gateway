import { z } from 'zod';

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

const SourceSchema = z.object({
  type: z.enum(['postgres', 'rest']),
  name: z.string(),
  connection: z.object({
    host: z.string().optional(),
    database: z.string().optional(),
    port: z.number().optional(),
    url: z.string().optional(),
  }),
  credentials: CredentialSchema,
});

const ScopeRuleSchema = z.object({
  table: z.string().optional(),
  endpoint: z.string().optional(),
  methods: z.array(z.string()).optional(),
  filters: z.record(z.any()).optional(),
  fields: z.array(z.string()).optional(),
});

const ScopeSchema = z.object({
  agent: z.string(),
  sources: z.array(z.object({
    name: z.string(),
    rules: z.array(ScopeRuleSchema),
  })),
});

const AuditSchema = z.object({
  enabled: z.boolean().default(true),
  format: z.enum(['json', 'jsonl']).default('jsonl'),
  output: z.string().default('/var/log/adg/audit.log'),
});

export const ConfigSchema = z.object({
  version: z.string().default('1'),
  sources: z.array(SourceSchema),
  scopes: z.array(ScopeSchema),
  audit: AuditSchema.default({}),
});

export type DbCredential = z.infer<typeof DbCredentialSchema>;
export type ApiCredential = z.infer<typeof ApiCredentialSchema>;
export type Credential = z.infer<typeof CredentialSchema>;
export type Source = z.infer<typeof SourceSchema>;
export type ScopeRule = z.infer<typeof ScopeRuleSchema>;
export type Scope = z.infer<typeof ScopeSchema>;
export type Audit = z.infer<typeof AuditSchema>;
export type Config = z.infer<typeof ConfigSchema>;

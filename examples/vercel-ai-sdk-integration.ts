/**
 * ADG + Vercel AI SDK Integration Example
 *
 * Shows how to use ADG as a secure tool provider in the Vercel AI SDK.
 * ADG handles credential injection, data scoping, and audit logging —
 * the AI SDK tool never needs database passwords or API keys.
 *
 * Usage:
 *   1. Start ADG proxy: ADG_CONFIG_PATH=examples/config.yaml npx tsx src/index.ts
 *   2. Run this example: npx tsx examples/vercel-ai-sdk-integration.ts
 *
 * Required: npm install ai @ai-sdk/openai
 */

import { tool } from 'ai';
import { z } from 'zod';

const ADG_URL = process.env.ADG_URL || 'http://localhost:7377';

/**
 * ADG Query Tool — AI SDK compliant
 *
 * Registers the ADG proxy as a tool the AI can call.
 * Credentials are injected by ADG server-side — the AI model
 * only sends `source` and `query` references.
 */
const adgQueryTool = tool({
  description:
    'Execute a database query through the Agent Data Gateway (ADG). ' +
    'The gateway handles authentication, credential injection, ' +
    'data scoping, and immutable audit logging. ' +
    'Use source names defined in ADG configuration.',
  parameters: z.object({
    source: z
      .string()
      .describe('The data source name configured in ADG (e.g., analytics_db)'),
    query: z
      .string()
      .describe('SQL query to execute against the source'),
  }),
  execute: async ({ source, query }) => {
    const response = await fetch(`${ADG_URL}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source,
        agent: 'code-review-bot',
        query,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      return { error: result.error || 'ADG query failed', source, status: response.status };
    }

    return {
      source: result.source,
      rows: result.rows,
      rowCount: result.rowCount,
      durationMs: result.duration_ms,
    };
  },
});

/**
 * Example: Using ADG tool with AI SDK streamText
 *
 * The AI model calls adgQueryTool, ADG validates scoping,
 * injects credentials server-side, executes the query, and
 * logs every access immutably.
 */
async function main() {
  console.log('ADG + Vercel AI SDK Integration');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Proxy: ${ADG_URL}`);

  // Health check
  const health = await fetch(`${ADG_URL}/health`);
  const healthData = await health.json();
  console.log('ADG status:', healthData.status);

  // Direct tool invocation (simulates what the AI model calls)
  console.log('\n[1] Invoking ADG query tool...');
  const result = await adgQueryTool.execute({
    source: 'analytics_db',
    query: 'SELECT id, title, status, author FROM pull_requests WHERE status = \'open\' LIMIT 10',
  });

  if ('error' in result) {
    console.error('Query failed:', result.error);
  } else {
    console.log(`Returned ${result.rowCount} rows in ${result.durationMs}ms`);
    console.log(JSON.stringify(result.rows, null, 2));
  }

  // Audit check
  console.log('\n[2] ADG audit log (all accesses recorded)...');
  const audit = await fetch(`${ADG_URL}/audit`);
  const auditData = await audit.json();
  console.log(`Audited queries: ${auditData.count}`);
}

main().catch(console.error);

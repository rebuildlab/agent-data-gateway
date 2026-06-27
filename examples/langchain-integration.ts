/**
 * ADG + LangChain Integration Example
 *
 * Shows how to use ADG as a secure data source in LangChain chains.
 * ADG handles credential injection, data scoping, and audit logging —
 * the agent never sees DB passwords or API keys.
 *
 * Usage:
 *   1. Start ADG proxy: ADG_CONFIG_PATH=examples/config.yaml npx tsx src/index.ts
 *   2. Run this example: npx tsx examples/langchain-integration.ts
 *
 * Required: npm install @langchain/core langchain
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { RunnableSequence } from '@langchain/core/runnables';
import { z } from 'zod';

// The ADG proxy URL — credentials never leave this server
const ADG_URL = process.env.ADG_URL || 'http://localhost:7377';

/**
 * ADG Query Tool
 *
 * Wraps ADG's /query endpoint as a LangChain tool.
 * The agent specifies which source to query; ADG injects credentials
 * server-side and enforces per-agent scoping rules.
 */
const adgQueryTool = new DynamicStructuredTool({
  name: 'adg_query',
  description:
    'Query a data source through the ADG proxy. ' +
    'Source names are defined in the ADG config. ' +
    'Returns rows matching the agent\'s access scope.',
  schema: z.object({
    source: z.string().describe('Data source name (e.g., "analytics_db")'),
    query: z.string().describe('SQL query or API path to execute'),
  }),
  func: async ({ source, query }) => {
    const response = await fetch(`${ADG_URL}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source,
        agent: 'code-review-bot', // This agent's scoping rules apply
        query,
      }),
    });

    const result = await response.json();
    if (!response.ok) {
      return `Error: ${result.error || response.statusText}`;
    }

    return JSON.stringify(result.rows, null, 2);
  },
});

/**
 * Example: PR analysis chain using ADG + LangChain
 *
 * 1. ADG proxy authenticates and scopes the request
 * 2. LangChain formats the query and passes it through ADG
 * 3. ADG injects credentials, checks scoping, logs the access
 * 4. Results flow back to the LLM for analysis
 */
async function main() {
  console.log('ADG + LangChain Integration');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Proxy: ${ADG_URL}`);

  // Health check
  const health = await fetch(`${ADG_URL}/health`);
  const healthData = await health.json();
  console.log('ADG status:', healthData.status, `(sources: ${healthData.sources})`);

  // Direct query through ADG
  console.log('\n[1] Querying PRs through ADG...');
  const result = await adgQueryTool.invoke({
    source: 'analytics_db',
    query: 'SELECT id, title, status, author FROM pull_requests LIMIT 5',
  });
  console.log(result);

  // Show audit log
  console.log('\n[2] Checking ADG audit log...');
  const audit = await fetch(`${ADG_URL}/audit`);
  const auditData = await audit.json();
  console.log(`Total audited accesses: ${auditData.count}`);
}

main().catch(console.error);

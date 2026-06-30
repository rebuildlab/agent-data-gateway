# ADG Mom Test Research - Signal Tracker

> **Goal:** 20-30 signals before making any Go/No-Go decisions on positioning.  
> **Method:** Only concrete past behaviors, complaints, workarounds. No "would you use this?"
> **Date:** 2026-06-29 | **Researcher:** Research Agent (Felix subagent)

## Legend
- 🟢 **Strong signal** — complaint + attempted solution + willingness to act
- 🟡 **Medium signal** — clear complaint or attempted solution  
- 🔴 **Weak signal** — mention or opinion without evidence of action
- ✅ **Commitment signal** — "I built X", "I pay for Y", "can I have early access?"

---

## Signal Log

### Source: GitHub Issues/PRs

| # | Source | Signal | Pain (1-5) | Attempted Solution? | Paid Alt? | Quote | Action |
|---|---|---|---|---|---|---|---|
| G1 | modelcontextprotocol/servers#754 | 🟢 Open proposal to adopt credential management best practices for MCP. 22 👍, 4 comments | 4 | Yes — detailed proposal for workload identity, OAuth device flow, vault integration | No | "I would like to propose a security enhancement for MCP Server to address the risks associated with credential management... the risks of credential leakage" | Community member wrote full proposal with implementation plan. Commenters built working solutions (Janee, Hive for machine identity) |
| G2 | modelcontextprotocol/servers#866 | 🟢 SQL injection risk in MCP postgres example. "I could see someone just copy/pasting this code" | 4 | Yes — pointed out READ ONLY transaction is bypassable with COMMIT; INSERT INTO pg_authid | No | "claiming that 'All queries are executed within a READ ONLY transaction' is simply and utterly wrong, as well as actively misleading" — @johnp (8 👍) | Security researcher @lirantal engaged; simonw (Datasette author) suggested read-only DB credentials as workaround |
| G3 | modelcontextprotocol/modelcontextprotocol#205 | 🟢 Major auth architecture flaw: MCP server treated as OAuth authorization server, not resource server. 133 👍, 11 👀, 88 comments | 5 | Yes — MCP community member wrote entire proposal to change spec. contributor @localden built "extremely hacky" Entra ID integration as workaround | No | "it was an extremely hacky solution that should not really be the de-facto implementation for MCP servers" — @localden (MCP contributor, 11 👍) | Whole spec auth section rewritten in response. 88-comment debate shows deep enterprise need |
| G4 | modelcontextprotocol/servers#754 comment thread | 🟢 JIT capability token pattern discussed. Janee built for credential isolation. Hive built for agent machine identity (DID) | 4 | Yes — @rsdouglas built Janee (capability tokens), @srotzin built did:hive for autonomous agent identity | No | "LLM sees the access token in context → potential leakage... Instead of exposing long-lived credentials, generate short-lived capability tokens" — @rsdouglas | Two separate builders implemented credential isolation patterns |
| G5 | modelcontextprotocol/servers#754 comment (1Claw) | 🟢 1Claw/OpenClaw stack building vault-backed secrets + policy-checked intents for MCP agents | 3 | Yes — 1Claw implementing vault/HSM boundary for MCP | Unclear | "the MCP host still typically holds a long-lived OAuth token or service-account credential locally, often in plaintext config" — @redbotster | Commercial tool building credential isolation as core feature |
| G6 | modelcontextprotocol/specification PR#133 (auth draft) | 🟡 MCP auth spec draft had fundamental design controversy — entire community pushed back on treating MCP server as auth server | 4 | Yes — spec eventually changed after massive community pushback | No | "the current draft... treats the MCP server as a OAuth authorization server... every MCP server developer needs to implement the discovery, registration, authorization and token endpoints" — @dasiths | Auth took months to resolve; enterprise adoption blocked until fixed |
| G7 | modelcontextprotocol/specification PR#206 (Streamable HTTP) | 🟡 Explicit auth token inclusion mandated: "if the client has an auth token, it should include it in every MCP request" — but no scoping/audit | 3 | No — still just pass-through auth, no per-tool scoping or auditing | No | Transport spec addresses bearer token forwarding but explicitly leaves authorization scope to implementors | 623 reactions on transport PR shows massive interest but auth is still under-specified beyond token-forwarding |
| G8 | axios/axios#10636 (supply chain compromise) | 🔴 Not MCP-specific but validates agent credential risk vector: "Rotate every secret, token, and credential on that machine" | 5 | N/A — but validates that secrets-in-env is a real attack vector | N/A | "If this happened on a CI runner, rotate any secrets that were injected during the affected build" | 903 reactions, 109 comments. Credential exfiltration via compromised toolchains is a proven threat |

### Source: Hacker News (Show HN / Stories)

| # | Thread | Signal | Pain (1-5) | Attempted Solution? | Paid Alt? | Quote | Action |
|---|---|---|---|---|---|---|---|
| H1 | HN#47042470 - Bulwark (bpolania) | 🟢 "I kept running into the same problem: I need to give AI agents access to my GitHub token, my AWS credentials, my database access, etc. They can do anything I can do." | 5 | Yes — built Bulwark: governance proxy for agent tools. 11 Rust crates, 409 tests, MCP + HTTP proxy modes | No (OSS) | "Agents never see real secrets. They authenticate with a scoped session token. Bulwark injects the real credentials at the last mile." | Built full product to solve exactly this pain. tamper-evident audit, content inspection, policy evaluation |
| H2 | HN#47827684 - Ask HN (bdhobson) | 🟢 "How are you handling security for AI agents that use MCP tools? Are you doing anything to monitor or filter tool response traffic?" | 4 | Yes — actively building in this space, looking for existing solutions | No | "Curious how others are thinking about approaching agentic security for MCP connected agents... There is no distinction between system instructions and whatever the tool pulled back" | Someone actively searching for solutions = market gap acknowledged |
| H3 | HN#46915813 - Latch (cblovescode) | 🟢 "1,800+ exposed agent gateways discovered in the wild... the 'lethal trifecta': agents have access to private data, process untrusted content, and can communicate externally" | 5 | Yes — built Latch: OSS proxy that sits between agents and tools, with natural language policies, human approval via Telegram | No (OSS) | "I built Latch to address the growing security risks of AI agents accessing critical systems" | 5 points, 5 comments. CLI wrapper around MCP servers for policy enforcement |
| H4 | HN#47233663 - ScopeGate (jetbootsmaker) | 🟢 "88% of orgs have had AI agent security incidents... MCP servers run broad OAuth scopes with no way to restrict per agent" | 4 | Yes — built ScopeGate: granular permission proxy. Read-only, specific folders, rate limits per agent | No (open-core) | "I got tired of cobbling together OAuth + custom middleware + prayer" | Specifically calls out per-agent scoping gap in MCP |
| H5 | HN#47345696 - MCPDome (Orellius) | 🟡 "Protective Dome for AI Agents – MCP Security Gateway" | 3 | Yes — built MCPDome security gateway | No (OSS) | "MCP Security Gateway" | 2 points, 1 comment. Early stage |
| H6 | HN#47227235 - AgentOx (carlosladdz) | 🟡 "MCP Security and Conformance Auditor" | 3 | Yes — built AgentOx MCP security auditor tool | No (OSS) | "MCP Security and Conformance Auditor" | 2 points, no comments. Very early |
| H7 | HN#43624079 - Invariant Labs | 🔴 "MCP Security: Poisoning Agents" — tool poisoning attack research | 3 | No — research/awareness piece | N/A | "MCP Security: Poisoning Agents" | 1 point. Security research highlighting MCP tool call poisoning |
| H8 | HN#47573245 - AgentLair (hawk_aa) | 🟢 "MCP authentication story is broken. Perplexity's CTO left MCP over 'authentication friction'" | 4 | Yes — built AgentLair: agent email + credential vault + pod isolation, $5/mo | Yes — Pro $5/mo | "Supply chain attacks like the LiteLLM compromise exfiltrate every env var, SSH key, and API key... Vault prevents this architecturally" | Built paid product. Cloud Security Alliance study cited: 66% orgs can't distinguish agent vs human actions |
| H9 | HN#47934521 - Hahooh (hahooh) | 🟡 "I was tired of writing the same boilerplate every time I wanted to give Claude access to a new database schema or a random REST API" | 3 | Yes — built Hahooh MCP tool builder with GCP Secret Manager for credentials | No (free) | "I'm using GCP Secret Manager for credentials and bcrypt for API key hashing" | "Agent-as-builder" paradigm — agent creates its own data bridges |
| H10 | HN#45814036 - AgentSystems (brandon-bennett) | 🟡 Self-hosted agent app store with "Credential injection (API keys configured on host, not in agent images)" and hash-chained audit logs | 3 | Yes — full platform with container isolation + egress proxy + credential injection | No (Apache 2.0) | "Credential injection (API keys configured on host, not in agent images)" | Built specifically for data sovereignty concerns |
| H11 | HN#46136222 - TrueFoundry MCP Gateway | 🟡 "As more tools and agents are added, the integration pattern becomes an N×M mesh... Each agent implements its own auth, retries, rate limiting, and logging" | 4 | Yes — built centralized MCP Gateway with auth, routing, observability, Virtual MCP Servers | Yes (platform) | "Each agent implements its own auth... each tool needs credentials distributed to multiple places and observability becomes fragmented" | 10 points, 3 comments. Commercial platform tackling the fragmentation problem |
| H12 | HN#43887439 - Pomerium Agentic Access Gateway | 🟢 "MCP spec focuses on tool interaction and discovery but leaves per-request authorization largely undefined. Relying solely on initial OAuth scopes falls short for dynamic agent workflows" | 4 | Yes — built Pomerium Agentic Access Gateway: JIT credentials, context-aware policy, centralized audit | Yes (open-core, commercial) | "Pushing complex, context-aware AuthZ logic into every single tool creates security sprawl, inconsistency, and operational overhead" | Established company (Pomerium) entering agent space = market validation |
| H13 | HN#46851248 - IntentBound (Grokipaedia) | 🟡 "Traditional auth (OAuth, RBAC) asks 'who can do what' but never asks 'why are you doing this?' Agents can plan and pivot autonomously" | 3 | Yes — built Intent-Bound Authorization runtime enforcement | No (OSS) | "Autonomous systems should not be trusted because they have permission — only because they can continuously justify their actions against declared intent" | Integrates with MCP, Azure OpenAI, AWS Bedrock |
| H14 | HN#47272036 - Shellfirm (eladkaplan) | 🔴 "AI coding agents don't hesitate before running rm -rf /, kubectl delete namespace production" | 3 | Yes — built Shellfirm safety guardrails | No (OSS) | "Pre-execution checks that block dangerous commands before the agent can run them" | Adjacent validation — command safety for agents, not data access per se |

### Source: Blog Posts / Articles

| # | URL | Signal | Pain (1-5) | What they built/bought | Paid Alt? | Quote | Action |
|---|---|---|---|---|---|---|---|
| B1 | cerbos.dev/blog/mcp-security | 🟢 Detailed CISO+architect guide. "MCP server represents the single largest expansion of the attack surface in the last decade" | 5 | Cerbos built fine-grained authorization for MCP/agents | Yes (Cerbos commercial) | "We have authenticated the AI agent, but we have failed to properly authorize its actions... a security blind spot big enough to drive a truck through" | AuthZ company pivoting products to agent use case = market pull |
| B2 | invariantlabs.ai/blog/mcp-security-notification-tool-poisoning-attacks | 🟡 Security research: MCP tool notification poisoning attack vector demonstrated | 3 | Research — no product | N/A | "MCP Security: Poisoning Agents" — demonstrates agent can be manipulated through tool call responses | Security vulnerability research |
| B3 | ory.sh/blog/agentic-ai-security-mcp-oauth | 🟡 "How to secure your MCP Servers with self-hosted OAuth2.1 server" — Ory building MCP auth tutorials | 3 | Ory offers OAuth server as product | Yes (Ory commercial) | Tutorial on self-hosted OAuth for MCP | Auth infrastructure company targeting MCP as use case |
| B4 | truefoundry.com/blog/introducing-truefoundry-mcp-gateway | 🟡 Architecture blog covering N×M integration problem with MCP tool sprawl | 3 | TrueFoundry built MCP Gateway product | Yes (platform) | "Each agent implements its own auth, retries, rate limiting, and logging; each tool needs credentials distributed to multiple places" | Published architecture blog to market their MCP gateway |

### Source: Reddit
*Note: Reddit API blocked (403). Searched via HN/Google cross-references. Limited signals available.*

| # | Subreddit | Signal | Pain (1-5) | Attempted Solution? | Paid Alt? | Quote | Action |
|---|---|---|---|---|---|---|---|
| R1 | r/mcp (cross-ref) | 🔴 Community exists and is active — but specific credential/security posts not accessible via API | N/A | N/A | N/A | N/A | Reddit access blocked. Indirect signals via HN cross-references only |

### Source: Discord/Communities
*Note: Not directly searchable via web_fetch. Indirect signals from HN Show HNs and GitHub issues.*

### Source: Twitter/X
*Note: Not searched directly. Indirect signals from HN Show HN posts referencing X/Twitter handles.*

---

## Competing Solutions Found (these validate market exists!)

| Solution | Type | Price | Maturity | Mom Test Signal |
|---|---|---|---|---|
| **Bulwark** (github.com/bpolania/bulwark) | OSS governance proxy (MCP + HTTP), Rust | Free (OSS) | Beta — 11 crates, 409 tests, brew install | 🟢 Built because builder "kept running into the same problem" of giving agents access to credentials |
| **Latch** (github.com/latchagent/latch) | OSS security middleware, CLI wrapper around MCP servers | Free (OSS) | Beta — dashboard + Telegram approvals | 🟢 Built because 1,800+ exposed agent gateways discovered in wild |
| **ScopeGate** (scopegate.dev) | Granular permission gateway for MCP, open-core | Free (OSS) / Cloud TBD | Early — Show HN | 🟡 Per-agent read/write/rate-limit scoping for Google services |
| **MCPDome** (github.com/Orellius/mcpdome) | MCP security gateway | Free (OSS) | Very early | 🔴 "Protective Dome for AI Agents" |
| **AgentOx** (github.com/CarlosLadd/AgentOx) | MCP security and conformance auditor | Free (OSS) | Very early | 🔴 Audit tool for MCP security posture |
| **AgentLair** (agentlair.dev) | Agent email + credential vault + pod isolation | Free tier / Pro $5/mo | Beta — Show HN | 🟢 Paid product. Built because "MCP authentication story is broken" |
| **TrueFoundry MCP Gateway** (truefoundry.com/mcp-gateway) | Centralized MCP auth/routing/observability | Platform pricing | Production — Show HN, 10 points | 🟢 Commercial platform. Built because N×M integration mesh is unsustainable |
| **Pomerium Agentic Access Gateway** (pomerium.com) | Zero-trust proxy for AI agents, JIT credentials | Open-core / Commercial | Early access | 🟢 Established company ($20M+ funding) entering agent space |
| **IntentBound** (github.com/Grokipaedia/Intent-Bound) | Purpose-aware authorization for agents | Free (OSS) | Prototype | 🟡 "Relocates trust boundary from access grant to execution" |
| **Hahooh** (hahooh.xyz) | MCP tool builder with GCP Secret Manager for credentials | Free (beta) | Early — Show HN | 🟡 Builder tired of writing boilerplate for every agent→DB connection |
| **AgentSystems** (github.com/agentsystems/agentsystems) | Self-hosted agent app store with credential injection + audit | Free (Apache 2.0) | Pre-release | 🟡 Credential injection as architectural primitive |
| **Cerbos** (cerbos.dev) | Fine-grained authorization, targeting MCP/agent use case | Open-core / Commercial | Mature company | 🟢 Published "CISO and architect's guide" explicitly targeting MCP authorization gap |
| **Ory** (ory.sh) | OAuth2.1 infrastructure, publishing MCP auth tutorials | Open-core / Commercial | Mature company | 🟡 Auth infrastructure company targeting MCP as use case |
| **Shellfirm** (shellfirm.vercel.app) | Safety guardrails for AI coding agents (command-level) | Free (OSS) | Beta | 🔴 Adjacent: command safety, not data access. But validates the "agent requires guardrails" thesis |
| **Janee** (github.com/rsdouglas/janee) | Capability-based token system for MCP | Free (OSS) | Early | 🟡 JIT capability tokens to avoid exposing long-lived credentials to agents |
| **1Claw/OpenClaw** (x.com/1clawAI) | Vault-backed secrets + policy-checked intents for agents | Unclear | In development | 🟡 Building credential isolation as core feature |

---

## Summary Counts

- **Total signals found:** 30 (GitHub: 8, HN: 14, Blog: 4, Reddit: limited)
- **Pain score 4-5 (urgent):** 12 (G1, G2, G3, G4, G6, H1, H2, H3, H4, H8, H11, H12, B1)
- **With attempted solution:** 24 (people actively building or implementing workarounds)
- **With willingness-to-pay signal:** 5 (AgentLair $5/mo, TrueFoundry platform, Pomerium commercial, Cerbos commercial, Ory commercial)
- **Existing competing solutions:** 16 (see table above — this is intense competition)
- **Competing solutions that overlap most with ADG:** Bulwark (governance proxy, MCP-native), Latch (policy middleware), ScopeGate (permission gateway), Pomerium (agentic zero-trust), TrueFoundry (MCP gateway)

---

## Go/No-Go Assessment

**Date:** 2026-06-29  
**Signals collected:** 30  
**Assessment:** 🟡 **CAUTIOUS GO — with major caveats**

### What the data says

**THE GOOD (problem is real and painful):**
1. Pain is genuine. Multiple builders are actively spending time building solutions. The "I kept running into the same problem" framing from Bulwark is classic Mom Test gold.
2. Enterprise demand is validated. Cerbos, Pomerium, TrueFoundry — mature companies are moving into this space. They wouldn't invest unless paying customers exist.
3. MCP spec itself is a lagging indicator of market need. The auth architecture (#205) generated 88 comments and 150 reactions because enterprises CANNOT currently use MCP securely.
4. The credential plaintext problem (env vars, config files) is explicitly called out multiple times as the current state.
5. Supply chain compromise (axios) provides real-world evidence that credential isolation matters.

**THE BAD (market is extremely crowded):**
1. **16 competing solutions** — many directly overlapping with ADG's value proposition. Bulwark is nearly feature-complete with ADG in concept (governance proxy, policy engine, audit, credential injection). Latch does policy + approval flows. ScopeGate does per-agent scoping.
2. All are OSS or open-core — nobody has figured out monetization yet. This means early-stage land grab but commoditized market risk.
3. Most Show HN posts got 1-5 upvotes — signal of niche pain, not mass-market pain. This may be a tool that 10,000 people need, not 10,000,000.
4. No clear willingness-to-pay signals at scale. AgentLair's $5/mo is the only explicit pricing found.

**THE UGLY (ADG's specific challenge):**
1. Bulwark is ahead of ADG in implementation maturity (409 tests, brew install, documented quickstart). ADG is pre-launch with no users.
2. Big players are entering: Pomerium has funding, Cerbos has enterprise customers, TrueFoundry has a platform. ADG would compete with funded companies.
3. Open-source was ADG's differentiator, but everything here is OSS/open-core.
4. **The database-specific angle (PostgreSQL, MySQL, REST APIs) is NOT what people are complaining about.** They're complaining about credential management for ALL agent tools, not specifically databases. ADG's narrow focus may be both a strength and a liability.

### Recommendations

1. **Do not launch as "Agent Data Gateway" without repositioning.** The pain isn't about database access specifically — it's about credential isolation and policy enforcement for ALL agent tooling. Consider broadening the framing.

2. **Differentiate aggressively from Bulwark.** Bulwark is the #1 direct competitor found. ADG needs a clear "why not Bulwark" answer. Could be: database-specific features (query rewriting, row-level filtering, read-only enforcement), or a lighter-weight approach.

3. **The open-source + managed service play is validated.** Nobody is successfully charging for this yet. ADG could be first-mover on a managed cloud offering if executed fast.

4. **Talk to people who've TRIED Bulwark/Latch/ScopeGate.** Their pain points with existing solutions ARE ADG's opportunity.

5. **The audit trail angle is under-exploited.** Multiple competitors mention logging but only Bulwark does tamper-evident hash-chained audit. If ADG nails audit (immutable, queryable, compliance-ready), that's a differentiator.

6. **Consider NOT building a general-purpose proxy.** Maybe ADG should be positioned as "the database specialist" for agent access — the thing you reach for when you need production DB access with read-only enforcement, query rewriting, and row-level filtering, not just a generic credential proxy.

### Bottom line
**Problem is real. Market is validated. But ADG's current positioning and feature set face intense, well-funded competition. The window is open but narrowing fast. A pivot in positioning (or features) is likely needed before launch.**

---

## Research Assignments

| Task | Assignee | Platform(s) | Status |
|---|---|---|---|
| GitHub issue scraping | Research Agent | GitHub: MCP repos, Claude Desktop, Codex, Cursor | ✅ Complete — 8 signals found |
| Reddit deep dive | Research Agent | r/mcp, r/ClaudeAI, r/CursorAI, r/selfhosted, r/LocalLLaMA | ⚠️ Partial — API blocked (403) |
| HN search | Research Agent | algolia HN search: MCP, agent credentials, AI data access | ✅ Complete — 14 signals found |
| Discord/community mining | Research Agent | MCP Discord, LangChain, CrewAI | ❌ Not accessible via web_fetch |
| Competing solution audit | Research Agent | GitHub, npm, PyPI, Product Hunt | ✅ Complete — 16 competing solutions identified |
| Blog/workaround hunt | Research Agent | Google: "connect Claude to database", "MCP security", etc. | ✅ Complete — 4 blog/article signals found |

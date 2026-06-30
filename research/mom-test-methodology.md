# ADG: The Mom Test Research Methodology

> *"You shouldn't ask anyone if your business is a good idea. It's a bad question, and everyone will lie to you at least a little."* — Rob Fitzpatrick, The Mom Test

## The Problem With How We Built ADG

We built it first. We wrote launch content. We have a narrative ("the .gitignore fallacy").

**Every single one of these is a Mom Test violation.** We're pitching, not listening. We're looking for compliments, not commitment. We haven't found evidence that real people are in pain.

## Mom Test Rules Applied to ADG

### Rule 1: Talk About Their Life, Not Your Idea

| ❌ Bad (what we'd do without the Mom Test) | ✅ Good (Mom Test approach) |
|---|---|
| "Would you use a credential proxy for MCP?" | "Walk me through how your team gives AI agents access to databases today" |
| "Do you like the idea of per-agent scoping?" | "Tell me about the last time an AI agent touched production data. What happened?" |
| "We built ADG, here's what it does" | "How are you handling credential security with your agents right now?" |

### Rule 2: Ask About Specifics in the Past, Not Generics or Opinions

| ❌ Bad | ✅ Good |
|---|---|
| "Would you pay for a solution like this?" | "What's the last tool or service you paid for to solve an agent infrastructure problem?" |
| "Do you think credential isolation is important?" | "When was the last time you worried about an agent having too much data access? What did you do about it?" |
| "Is this a problem for your team?" | "Can you show me your current .env or .cursorignore file? What's in it?" |

### Rule 3: Talk Less and Listen More

The HN post we wrote is a pitch. A Mom Test conversation should be 90% them talking about their pain, and at most 10% us describing what we built — and only at the very end, and only after they've described a concrete unsolved problem.

### Rule 4: Look for Commitment, Not Compliments

| ❌ Not evidence of need | ✅ Evidence of need |
|---|---|
| "This is cool!" | "Can I get early access?" |
| "I'd pay for this" | "Here's my company credit card" |
| "We definitely need this" | "We built our own internal version last month" |
| "Let me know when you launch" | "Here's a specific integration we need by next week" |

### Rule 5: Dig for the Bad Data

The most important signals are the ones that disprove our thesis:
- Teams that HAVE solved this already (what did they use?)
- Teams that DON'T think this is a problem (why not?)
- Teams that tried to solve this but abandoned it (what happened?)

## What We're Actually Trying to Learn

1. **Problem Existence:** Do real teams have trouble giving AI agents secure, scoped access to data?
2. **Current Behavior:** What are they doing NOW? (Concrete actions, not opinions)
3. **Pain Level:** Is it a papercut ("nice to have") or a knife wound ("we can't ship without this")?
4. **Attempted Solutions:** Have they tried to solve this themselves? What did they build/try/buy?
5. **Willingness to Pay:** Have they paid for anything adjacent? What's their budget?
6. **Buying Process:** Who decides? Is this a developer tool purchase or an enterprise security purchase?

## Research Sources (Prioritized)

### Tier 1: Where People Complain Publicly (unbiased signal)
- **GitHub Issues/PRs** — Search MCP repos, Claude Desktop, Codex, Cursor for credential/security complaints
- **Hacker News** — Search for MCP discussions, agent security threads
- **Reddit** — r/mcp, r/ClaudeAI, r/CursorAI, r/LocalLLaMA, r/selfhosted
- **Discord/Slack** — MCP community server, LangChain, CrewAI communities
- **Twitter/X** — Search for "MCP security", "agent credentials", "AI data access"

### Tier 2: Where People Build Workarounds (commitment signal)
- **GitHub repos** — Search for custom proxy/middleware/gateway repos for agent data access
- **Blog posts** — "How we connected Claude to our database" type content
- **npm/PyPI** — Packages that solve even part of this problem

### Tier 3: Direct Outreach (only after Tiers 1-2)
- DM people who complained publicly (warm outreach, follow up on their complaint)
- Post in MCP/HN/Reddit asking about their CURRENT solutions (NOT pitching ADG)

## Data We're Collecting

For every signal found, capture:
- **Source** (link to comment/thread)
- **Signal Type** (complaint, workaround, question, abandoned attempt)
- **Pain Score** (1-5: 1="mentioned once casually", 5="actively looking for solution RIGHT NOW")
- **Verbatim Quote** (exact words matter)
- **Evidence of Attempted Solution** (did they build something? try something?)
- **Evidence of Willingness to Pay** (mention of budget, pricing, "paid for X instead")
- **Demographic Signal** (indie dev? startup? enterprise? what stack?)

## Output: Go/No-Go Decision Framework

After 20-30 signals collected, we assess:

| Green Light | Yellow Light | Red Light |
|---|---|---|
| Multiple people have built workarounds | People say "interesting" but no action | Nobody has the problem |
| Someone is paying for an inferior alternative | One or two clear pain signals | Existing solutions solve it well |
| Recurring complaint with high engagement | Interest but unclear who would pay | Problem is real but market too small |
| "When can I have this?" (commitment) | "Let me know when it's ready" (compliment) | People actively choose NOT to solve this |

## The Irony

We built ADG first. The Mom Test says we should have done this research BEFORE a single line of code. But we have what we have — built, tested, ready.

The research now serves a different purpose: **validate our launch messaging and find our first 10 users.** If the research shows the problem isn't as we assumed, we pivot the positioning before launch. If it confirms the problem, we have concrete quotes and evidence for the HN Show HN post.

This research isn't about whether ADG exists — it's about whether ADG should be positioned as we planned, or differently.

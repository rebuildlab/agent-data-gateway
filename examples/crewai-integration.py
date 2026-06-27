"""
ADG + CrewAI Integration Example

Shows how to use ADG as a secure tool provider in CrewAI agent crews.
ADG handles credential injection, data scoping, and audit logging —
the CrewAI agents never see database passwords or API keys.

Usage:
  1. Start ADG proxy: ADG_CONFIG_PATH=examples/config.yaml npx tsx src/index.ts
  2. Run this example: python examples/crewai-integration.py

Required: pip install crewai requests
"""

import json
import os
import requests

ADG_URL = os.environ.get("ADG_URL", "http://localhost:7377")


class ADGQueryTool:
    """CrewAI-compatible tool that queries data through ADG."""

    def __init__(self, source: str, agent_id: str = "code-review-bot"):
        self.name = "adg_query"
        self.source = source
        self.agent_id = agent_id
        self.description = (
            f"Query the '{source}' data source through the ADG proxy. "
            "Credentials are injected server-side and access is scoped "
            "per agent. Every query is immutably logged."
        )

    def run(self, query: str) -> str:
        """Execute a query through ADG. Called by CrewAI agents."""
        response = requests.post(
            f"{ADG_URL}/query",
            json={
                "source": self.source,
                "agent": self.agent_id,
                "query": query,
            },
        )

        if not response.ok:
            err = response.json()
            return f"Error: {err.get('error', response.status_code)}"

        result = response.json()
        return json.dumps(result["rows"], indent=2)


# ── Example: CrewAI agents using ADG ──────────────────────────────

def run_crew_example():
    """
    Simulated CrewAI flow:
    
      Crew "PR Review" has two agents using ADG:
        - Data Analyst: queries pull_requests table (scoped to ONLY open PRs)
        - Reviewer: reads deployments table
        
      ADG enforces scoping:
        - code-review-bot can only see open PRs (filter in config.yaml)
        - Every access is immutably logged
    """

    print("ADG + CrewAI Integration")
    print("━━━━━━━━━━━━━━━━━━━━━━━━")
    print(f"Proxy: {ADG_URL}")

    # Health check
    resp = requests.get(f"{ADG_URL}/health")
    print(f"ADG status: {resp.json()['status']}")

    # Tool for Data Analyst agent
    pr_tool = ADGQueryTool(source="analytics_db", agent_id="code-review-bot")

    # Tool for Reviewer agent
    deploy_tool = ADGQueryTool(source="analytics_db", agent_id="code-review-bot")

    # Simulate Data Analyst querying PRs
    print("\n[Data Analyst] Querying open pull requests...")
    prs = pr_tool.run(
        "SELECT id, title, status, author, created_at "
        "FROM pull_requests LIMIT 5"
    )
    print(prs[:500])

    # Simulate Reviewer checking deployments
    print("\n[Reviewer] Checking recent deployments...")
    deploys = deploy_tool.run(
        "SELECT id, environment, status, deployed_at "
        "FROM deployments ORDER BY deployed_at DESC LIMIT 5"
    )
    print(deploys[:500])

    # Show audit trail
    print("\n[Audit] All ADG accesses logged:")
    audit = requests.get(f"{ADG_URL}/audit")
    audit_data = audit.json()
    print(f"Total audited queries: {audit_data['count']}")


if __name__ == "__main__":
    run_crew_example()

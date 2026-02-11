---
date: 2026-02-08
topic: morning-briefing
---

# Morning Briefing: The "First Tab" Experience

## What We're Building

A morning briefing experience that answers "What happened while I was away, and what needs my attention?" by pulling activity from GitHub, Slack, Vercel, and PostHog, correlating events across sources, and presenting a prioritized, conversational digest. The AI learns over time what matters to the user and surfaces increasingly relevant insights.

## Target Personas

- **OSS maintainers** managing repos, triaging issues, reviewing PRs
- **OSS-first product builders** shipping products on open-source, managing teams and community

## The Core Experience

When a user opens their space (or triggers a briefing), the AI generates something like:

```
Since you were last here (14 hours ago):

IN FLIGHT (3 projects)
 - agentic-canvas: 2 PRs merged, 1 awaiting your review, deploy succeeded
 - oss-lib: 5 new issues (1 looks like a regression), CI green
 - internal-tool: @alice opened a PR for the auth refactor

NEEDS YOUR ATTENTION
 - PR #142 on oss-lib has been open 6 days, CI green → merge or comment?
 - Issue #89 has 18 thumbs-up, no one assigned → prioritize?
 - Vercel deploy on agentic-canvas has elevated error rate since 2am

TEAM ACTIVITY
 - @alice merged 3 PRs on internal-tool
 - @bob commented on your issue in oss-lib
 - 12 new messages in #oss-lib, 3 mention you
```

## Why This Approach

We considered three approaches:
1. **Morning Briefing first** (chosen) — Build one killer experience that forces all the hard infrastructure (temporal tracking, cross-source correlation, AI summarization) into existence
2. **Smart Tiles bottom-up** — Enhance existing tiles incrementally. Lower risk but no "wow" moment.
3. **Project Entity top-down** — Model projects as first-class entities first. Clean but risks YAGNI.

We chose the briefing because it's the single feature that proves the whole "AI chief of staff" thesis and creates daily habit formation.

## Key Decisions

- **Template-based, creates a new space**: The briefing is a template. Selecting it creates a new space populated with individual components (PRs tile, issues tile, team activity, deploy status, etc.). This pattern extends to future templates (Release Prep, OSS Health, Sprint Review).
- **Guided configuration**: The template walks the user through setup — pick your repos, Slack channels, Vercel projects. This creates the lightweight project config (project name → {github repo, vercel project, slack channel}).
- **Individual components, AI narrative on top**: Each tile is a standalone component showing one data surface. The AI weaves a cross-component narrative, correlates events, and surfaces recommendations in the chat or a summary tile.
- **"Since last visit" as the time anchor**: Track when user last viewed their briefing space. Everything is relative to that timestamp.
- **Layered delivery**: Start with in-app (on space load). Email/Slack delivery is future scope.
- **Reuse existing integrations**: All 4 API routes (GitHub, Slack, Vercel, PostHog) already support the queries needed. The gap is aggregation, temporal filtering, and the guided template flow.

## What Exists Today (Reusable)

| Existing Infrastructure | How It Helps |
|------------------------|--------------|
| GitHub API route (activity, my_activity, team_activity, PRs, issues) | Rich data already available |
| Slack API route (mentions, channel_activity, thread_watch) | Mention tracking ready |
| Vercel API route (deployments, project_info) | Deploy status ready |
| PostHog API route (site_health, top_pages) | Traffic/analytics ready |
| Notification slice (queue, priority, categories, dedup) | Briefing delivery mechanism |
| Insights API (LLM-powered, memory-aware, context-driven) | Summarization engine |
| Supermemory integration (preferences, patterns, feedback) | Personalization backbone |
| Template system (state-aware, category-based selection) | Briefing layout generation |
| Spaces system (routing, lifecycle, snapshot hashing) | Dedicated briefing space |

## Gaps to Fill

1. **Briefing aggregator** — New API route that calls all sources in parallel, filters by time window, ranks by importance
2. **Temporal state** — Track "last visited" timestamp per user/space; filter data to "since then"
3. **Project config** — Lightweight mapping of project name → integration identifiers
4. **Cross-source correlation** — Connect events across sources (e.g., deploy failure + error spike + related PR)
5. **Briefing-specific AI prompt** — Extend insights system with a "briefing mode" that generates structured narrative
6. **Briefing UI component** — New component type for rendering the digest (or a dedicated briefing template)
7. **Personalization feedback loop** — Track which briefing items user acts on vs. ignores; reweight over time

## Resolved Questions

- **Where does it live?** Template creates a new space with individual components.
- **First visit default:** Last 24 hours when no prior visit timestamp exists.
- **Initial tile set:** Summary/AI Recommendations, Open PRs, Issues, Deploy Status, Team Activity, Slack Mentions.

## Open Questions

- Cadence: Fresh data on every visit? Once daily with manual refresh?
- Should the AI recommendations tile auto-refresh, or require user prompt?

## Next Steps

→ `/workflows:plan` for implementation details — start with the briefing aggregator API + temporal tracking + a basic briefing component.

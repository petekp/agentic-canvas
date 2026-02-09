# Agentic Canvas — Situational Awareness as a Service

## Source

> The field of Human-Computer Interaction (HCI) is undergoing a significant transformation
> with the advent of agentic AI. This new class of AI systems, capable of autonomous planning,
> reasoning, and action, is shifting the primary interaction paradigm from direct manipulation
> to one of delegation and orchestration. Users are increasingly interacting with complex
> computational systems not as tools to be directly controlled, but as autonomous or
> semi-autonomous agents to which they can delegate high-level goals.
> — HCI Research Review (Manus AI, Feb 2025)

> The app sits at an interesting crossroads. It has the architecture of a Centaurian system
> (tight human-AI symbiosis) but the product framing of a dashboard builder with AI assistance.
> The gap between those two things is where the killer use case lives.

> The Slack mentions problem is a perfect example of what's actually broken. Right now to get
> "my mentions" without a user token, you need add_filtered_component with slack.channel-activity,
> the UI prompts for channel selection, it creates one component per channel with a mentions
> filter. You end up with N widgets showing filtered views of N channels. That's not "show me
> my mentions." That's "help me build a Rube Goldberg machine that approximates my mentions."

> We're developing this prototype with the intent of trying to sell this vision to enterprises,
> but using a developer-first marketing motion similar to Slack. We want developers to see the
> potential of this for their own use, but we also want to make it super easy for them to onboard
> their colleagues, even non-technical ones, and to provide some admin-level features. One feature
> that would be very helpful is to allow an admin to manage integrations for colleagues, so
> colleagues never have to set up their own integrations (slack, github, etc).

---

## Problem

- The system doesn't know who "me" is across services — there is no identity layer connecting a user to their GitHub username, Slack user ID, or Vercel team membership
- Each user must configure their own API tokens via environment variables, which kills adoption for non-technical colleagues and prevents team-wide deployment
- The AI composes one component at a time instead of orchestrating whole Spaces from user intent — "prep me for standup" should produce a complete, personalized, cross-source workspace, not require the user to specify each widget
- Cross-source queries are impossible — a Slack mention about PR #47 and PR #47 in GitHub are disconnected events, with no way to correlate them
- The current Slack mentions flow is a Rube Goldberg machine requiring user OAuth tokens or per-channel filtered components

## Outcome

- A developer installs the app, an admin connects integrations once, each team member logs in and asks "what needs my attention?" — and gets a real, cross-source, personalized answer
- Non-technical colleagues never touch an API token
- The AI orchestrates complete Spaces from intent ("prep me for standup", "what's blocking the release?") with the right components, filters, and layout — personalized to who you are across services
- The solo developer experience is magical in the first 5 minutes: install, add tokens, ask a question, get a real answer
- The "invite your team" moment is frictionless: admin connects integrations, colleague logs in, it just works

---

## Requirements (R)

| ID | Requirement | Status |
|----|-------------|--------|
| R0 | User asks "what needs my attention?" and gets a personalized, cross-source answer | Core goal |
| R1 | Admin connects integrations (GitHub, Slack, Vercel, PostHog) once for the whole team | Must-have |
| R2 | Each user has an identity that maps to their accounts across services (GitHub username, Slack user ID, etc.) | Must-have |
| R3 | Non-technical colleagues can use the app without configuring any API tokens | Must-have |
| R4 | AI creates complete Spaces from natural-language intent (e.g., "standup prep", "release review") | Must-have |
| R5 | Solo developer experience works without a database — env vars still supported for single-user mode | Must-have |
| R6 | Integration credentials are stored securely in a database (SQLite default, upgradable to Postgres) | Must-have |
| R7 | Cross-source correlation: the AI can connect related items across services (Slack mention about a PR + the PR itself) | Nice-to-have |
| R8 | Admin can manage team member identity mappings (or auto-discover via OAuth) | Must-have |
| R9 | The system degrades gracefully: features work with whatever integrations are connected | Must-have |
| R10 | SSO/SAML authentication for enterprise deployments | Nice-to-have |
| R11 | Role-based access: different team members see different data based on their role | Nice-to-have |
| R12 | Team Spaces: shared workspaces visible to the whole team with individual highlights | Nice-to-have |
| R13 | Audit logging for enterprise compliance | Nice-to-have |

---

## Shapes

### CURRENT: Dashboard Builder with AI Assistance

The existing system. Users interact through chat to place individual components on a canvas grid. Integrations are configured via environment variables per deployment. No user accounts, no identity layer, no team features.

| Part | Mechanism |
|------|-----------|
| **CUR1** | Chat-based AI places components one at a time via tools (add_component, etc.) |
| **CUR2** | Integrations via env vars: GITHUB_TOKEN, SLACK_BOT_TOKEN, POSTHOG_API_KEY, VERCEL_TOKEN |
| **CUR3** | Spaces for organizing component sets, AI can create/switch/pin |
| **CUR4** | Templates for generating component sets from cognitive state signals |
| **CUR5** | Transforms for per-source data filtering (JavaScript code, stored per workspace) |
| **CUR6** | No user accounts — single-user deployment |
| **CUR7** | No identity mapping — system doesn't know who "me" is across services |

---

### A: Three-Phase Rollout — Solo, Team, Enterprise

Build in three phases that each deliver standalone value while building toward the full vision.

| Part | Mechanism | Flag |
|------|-----------|:----:|
| **A1** | **Intent-driven Spaces** — Expand system prompt + add intent examples so AI creates complete Spaces from natural-language goals instead of placing components one at a time | |
| **A2** | **Cross-source narration** — After creating a Space, AI summarizes what it sees across all visible component data in chat (using existing canvas context) | |
| **A3** | **Auth + user accounts** — Add NextAuth.js with email/password + OAuth providers. Session-based auth. Users table in SQLite (via Drizzle ORM) | ⚠️ |
| **A4** | **Integration credentials store** — Admin UI to connect integrations. Credentials stored encrypted in SQLite. API routes read from DB instead of env vars, with env var fallback for solo mode | ⚠️ |
| **A5** | **Identity mapping** — Per-user profile linking their GitHub username, Slack user ID, etc. Auto-discovered from OAuth where possible, manual mapping by admin as fallback | ⚠️ |
| **A6** | **Aggregation queries** — New API layer that queries across all channels/repos for a specific user (e.g., "all my mentions across all Slack channels"), replacing per-channel filtered components | ⚠️ |
| **A7** | **Team onboarding flow** — Admin invites colleagues via email, colleague logs in, identity mapping is pre-populated or auto-discovered, integrations are already connected | ⚠️ |
| **A8** | **SSO/SAML** — Enterprise auth via SAML providers (Okta, Azure AD, etc.) | ⚠️ |
| **A9** | **Team Spaces** — Shared Spaces visible to the whole team, with per-user data highlights | ⚠️ |
| **A10** | **Role-based access** — Admin, Member roles. Admins manage integrations + team. Members use the workspace. | ⚠️ |
| **A11** | **Audit logging** — Log all AI actions, integration access, and admin operations for enterprise compliance | ⚠️ |

---

## Fit Check: R × A

| Req | Requirement | Status | A |
|-----|-------------|--------|---|
| R0 | User asks "what needs my attention?" and gets a personalized, cross-source answer | Core goal | ❌ |
| R1 | Admin connects integrations once for the whole team | Must-have | ❌ |
| R2 | Each user has an identity that maps to their accounts across services | Must-have | ❌ |
| R3 | Non-technical colleagues can use the app without configuring any API tokens | Must-have | ❌ |
| R4 | AI creates complete Spaces from natural-language intent | Must-have | ✅ |
| R5 | Solo developer experience works without a database — env vars still supported | Must-have | ✅ |
| R6 | Integration credentials stored securely in a database | Must-have | ❌ |
| R7 | Cross-source correlation: AI connects related items across services | Nice-to-have | ❌ |
| R8 | Admin can manage team member identity mappings | Must-have | ❌ |
| R9 | System degrades gracefully with whatever integrations are connected | Must-have | ✅ |
| R10 | SSO/SAML authentication for enterprise deployments | Nice-to-have | ❌ |
| R11 | Role-based access based on team member role | Nice-to-have | ❌ |
| R12 | Team Spaces: shared workspaces with individual highlights | Nice-to-have | ❌ |
| R13 | Audit logging for enterprise compliance | Nice-to-have | ❌ |

**Notes:**
- R0 fails: A6 (aggregation queries) is flagged — we don't yet know concretely how cross-source "what needs my attention" works at the API layer
- R1 fails: A4 (credentials store) is flagged — needs spike on encryption approach + admin UI
- R2 fails: A5 (identity mapping) is flagged — needs spike on auto-discovery via OAuth
- R3 fails: depends on A4 + A7 both being resolved
- R6 fails: A4 is flagged
- R7 fails: A6 is flagged — cross-source correlation depends on aggregation queries
- R8 fails: A5 is flagged
- R10 fails: A8 is flagged
- R11 fails: A10 is flagged
- R12 fails: A9 is flagged
- R13 fails: A11 is flagged

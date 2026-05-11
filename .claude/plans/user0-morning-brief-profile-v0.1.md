# User 0 Morning Brief Profile v0.1

Last updated: 2026-02-12

## Purpose

Define the Morning Brief behavior for User 0 (founder/operator workflow) so implementation can be evaluated against concrete needs.

Primary implementation contract:
- `.claude/plans/morning-brief-output-schema-v0.2.md`

## Core Outcome

The brief should give immediate clarity on what deserves attention and why, with evidence that can be shared with stakeholders.

## Decision Window

First 10 minutes should answer:

- What I should focus on now.
- Why this is highest impact.
- How I should approach it.

## Priority Order (Current)

1. Engineering delivery
2. Team communications
3. Strategy and planning

Default ranking policy: highest impact first.

## Default Horizon

- Today
- This week

## Preferred Brief Format

- Hybrid output:
  - concise top summary
  - top 3 priorities max
  - progressively disclosed evidence and rationale

## Confidence + Recommendation Style

- Always provide best hypotheses first.
- Then ask for verification/adjustment.
- Show both:
  - confidence score
  - plain-language certainty

## Failure Modes To Avoid

- Over-indexing on one source without cross-source context.
- Surfacing items outside likely ownership.
- Low-priority noise presented as urgent.
- Overconfident recommendations without context checks.

## Behavior Expectations

- Learning mindset: invite feedback and adapt quickly.
- Clarify ownership by forming and testing hypotheses from repo/app surface area.
- Ask directly when ownership is uncertain.

## Key Stakeholder Context

- Primary stakeholder channel: Slack team updates.
- Friday check-in quality is critical (including updates for Simon).
- Preferred weekly output: bullet recap.

## Current Workstreams + Success Signals

### Tool UI

Goal:
- Dramatically improve developer experience for installing and using components.
- Reduce time between discovery and a working Tool UI integration.

Success signal examples:
- Fewer setup blockers.
- Faster path to first successful install/use.

### MCP App Studio

Goal:
- Ship an impressive new starter template.
- Execute a marketing push to increase awareness.

Success signal examples:
- Template shipped and showcased.
- Clear awareness lift from launch activity.

### Blog Drafting

Goal:
- Finish a near-complete post.
- Make voice sound authentically like User 0.
- Get Simon edit pass, publish, then distribute on social.

Success signal examples:
- Draft finalized and approved.
- Published and shared with clear follow-through.

### Capacitor

Goal:
- Complete remaining requirements for public alpha release.

Success signal examples:
- Alpha checklist burn-down.
- No unresolved blockers on critical path.

### X Promotion

Goal:
- Improve engagement quality.
- Reach the right audience more consistently.

Success signal examples:
- Higher quality interactions.
- Better alignment between content and target audience response.

## Integration Priority For Morning Brief

1. GitHub
2. Slack
3. PostHog
4. Vercel

## Open Decisions (To Resolve)

- Default hidden-by-default sections.
- Tone finalization beyond current default "operator".
- Contextual tie-break variants beyond "highest impact first."
- Per-workstream progress scoring model details.

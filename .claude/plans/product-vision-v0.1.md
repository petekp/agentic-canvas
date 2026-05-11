# Product Vision v0.1

Last updated: 2026-02-11

## North Star

Agentic Canvas is the first screen you open in the morning to immediately understand:

- what matters now,
- what changed since yesterday,
- what to do next.

The product should reduce orientation overhead to near zero and convert intent into focused execution.

## Product Promise

Agentic Canvas is a mercurial interface: it adapts to each user and each moment.

It synthesizes signals from:

- connected tools and data sources (Slack, GitHub, PostHog, etc.),
- memory of prior conversations and decisions,
- explicit and implicit user preferences,
- generated components built from primitives chosen for the information at hand.

The interface should not be static. It should generate the most useful representation for the task:

- chart,
- feed,
- stat grid,
- chart + actions,
- videos, links, other media and resources,
- proactively drafted messages and responses the user can edit and send,
- briefing + follow-up actions.

## Experience Goals

1. Morning orientation in one place.
2. Clear priorities with rationale, not just raw data.
3. Fast path from insight to action.
4. Low-friction workflow switching via spaces.
5. Continually improving personalization and prediction quality.

## Personalization Ratchet

The system should get better with repeated use by learning:

- which sources are trusted for which decisions,
- which components and formats each user prefers,
- what timing and cadence each user responds to,
- what priorities are likely before the user asks.

Target state: the app reliably infers likely priorities and proactively surfaces the exact context needed to make real progress.

## Product Principles

1. Synthesize before displaying.
2. Recommend, then let users override.
3. Prefer clarity over novelty.
4. Preserve trust through traceability (tool-call/result integrity, telemetry, auditability).
5. Treat adaptability as a core capability, not an add-on.

## What This Means for Building

- Reliability work (tool-loop integrity, ledger parity, route/runtime resilience) is foundational, not optional.
- Primitives should enable component generation that is semantically matched to the data and user goal.
- Spaces should remain the unit of task focus and context isolation.
- Memory and preference signals should influence both what is surfaced and how it is presented.
- Success is measured by user orientation speed, action throughput, and confidence in decisions.

## Execution Anchors

- Personal dogfood use cases: `.claude/plans/dogfood-use-cases-v0.1.md`
- Vision-alignment gate for each slice: `.claude/plans/vision-alignment-checklist-v0.1.md`

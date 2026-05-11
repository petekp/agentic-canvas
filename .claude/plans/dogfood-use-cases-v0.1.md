# Personal Dogfood Use Cases v0.1

Last updated: 2026-02-11

## Purpose

Turn product vision into daily, personally useful workflows that we can run in the real app now.

This document is intentionally use-case-first, not metrics-first.

## How To Use This Document

For each implementation slice:

1. Pick one primary use case from this file.
2. Ship the smallest change that makes it noticeably better.
3. Validate with a real prompt in the running app.
4. Capture evidence in telemetry + ledger.

For Morning Brief slices, use:
- `.claude/plans/user0-morning-brief-profile-v0.1.md`

## P0 Personal Use Cases (Dogfood First)

### UC-1: Morning Orientation Brief

Outcome:
- Start the day with one clear mission and the top reasons it matters.

Typical prompt:
- "Give me my morning brief. What should I focus on first and why?"

Expected assistant behavior:
- Creates or updates a Morning Brief space.
- Synthesizes across connected sources (not single-source dumps).
- Proposes 1-3 concrete next actions.
- Lets user accept, reframe, or deprioritize.

Minimum acceptable output:
- A readable brief component with mission + evidence + actions.
- Follow-up action can be executed without rebuilding the space manually.

Current gaps:
- Composition quality and consistency across runs.
- Personalization signals are still shallow.

### UC-2: Blocker Triage Across Sources

Outcome:
- Quickly identify what is blocking progress today.

Typical prompt:
- "What is blocking me right now across Slack, GitHub, and product signals?"

Expected assistant behavior:
- Builds a focused triage space or section with blocker-centric components.
- Correlates signals (for example, Slack escalation + related PR/work item).
- Ranks blockers by likely impact.

Minimum acceptable output:
- Top blockers are obvious and actionable.
- Assistant proposes one resolution step per blocker.

Current gaps:
- Cross-source correlation is incomplete.
- Slack intent-to-query mapping still fragile in some prompts.

### UC-3: Standup/Status Prep

Outcome:
- Generate a concise "what changed / what next / what help needed" snapshot.

Typical prompt:
- "Prep me for standup with what changed since yesterday and what I should say."

Expected assistant behavior:
- Produces a concise narrative plus supporting components.
- Includes risks and asks for help where relevant.
- Avoids raw-data overload.

Minimum acceptable output:
- A standup-ready summary in under one screen.
- Sources are inspectable via linked/supporting components.

Current gaps:
- Quality depends heavily on connector completeness.
- Some component defaults are generic instead of context-specific.

### UC-4: Priority Replan Midday

Outcome:
- Recompute priorities when new events land.

Typical prompt:
- "Given what changed this morning, should I switch priorities?"

Expected assistant behavior:
- Compares prior mission vs current evidence.
- Explains whether to stay the course or replan.
- Creates/switches to a focused execution space if needed.

Minimum acceptable output:
- Clear keep/switch recommendation with rationale.
- One-click path into execution context.

Current gaps:
- Memory of prior accepted mission is early-stage.
- Reframing logic is not yet deeply personalized.

### UC-5: Execution Space From Intent

Outcome:
- Convert a high-level goal into a ready-to-use workspace.

Typical prompt:
- "Set up a release-risk workspace for today."

Expected assistant behavior:
- Creates a new space.
- Adds multiple relevant components in sequence.
- Applies meaningful defaults (labels, limits, filters) without extra prompting.

Minimum acceptable output:
- Space contains a coherent set of components, not just one widget.
- Tool call/results are complete and durable (no dropped follow-up calls).

Current gaps:
- Model planning sometimes stops after `create_space`.
- Argument completeness still needs stronger normalization for some tools.

## Slice Priority (Next)

1. UC-5 hardening: improve multi-tool completion and argument normalization.
2. UC-1 quality: tighten morning brief synthesis + actionability.
3. UC-2 quality: improve blocker correlation and ranking.
4. UC-3 quality: improve concise narrative generation from component state.
5. UC-4 quality: improve mission reframe logic from memory + new evidence.

## Dogfood Session Template

Use this quick template after each manual run:

- Date/time:
- Use case:
- Prompt used:
- What worked:
- What failed:
- Telemetry evidence (event names / run id):
- Ledger parity (calls/results):
- Next smallest fix:

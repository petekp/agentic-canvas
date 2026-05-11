# Morning Brief OpenClaw Principles v0.1

Last updated: 2026-02-12
Status: Active implementation guardrails

## Purpose

Codify the OpenClaw-inspired principles for Morning Brief migration work so every slice stays:

- LLM-first for synthesis/inference
- deterministic and safe under failure
- reliable in PI/tool-loop execution
- observable during rollout

This document complements:

- `.claude/plans/morning-brief-output-schema-v0.2.md`
- `.claude/plans/morning-brief-lifecycle-v0.1.md`
- `.claude/plans/user0-morning-brief-profile-v0.1.md`

## Architectural Principles

1. Thin route, centralized orchestration.
   - Keep `/api/briefing` as request/response orchestration only.
   - Put reasoner/fallback/repair logic in focused library modules.

2. LLM-first inference, deterministic rails.
   - Prioritization and synthesis come from schema-constrained LLM reasoning.
   - Deterministic code provides validation, repair, safety limits, and fallback only.

3. Schema is the hard contract.
   - Accept output only if it passes v0.2 schema validation.
   - Allow one bounded repair attempt; then fail closed to deterministic fallback.

4. Fallback is a safety net, not a second reasoner.
   - Fallback may normalize, validate, and minimally structure data.
   - Fallback must not accumulate heuristic ranking/synthesis logic over time.

5. Evidence integrity is mandatory.
   - Priority/correlation references must resolve to valid evidence IDs.
   - Enforce bounded priority count and rank integrity (`<=3`, unique ranks).
   - Missing/stale assumptions and verification prompts must be repaired deterministically.

6. Reliability over cleverness in tool loops.
   - Preserve PI/tool-loop determinism and idempotent behavior.
   - Prefer serialized, auditable execution paths over implicit side effects.

7. Isolation for recurring runs.
   - Scheduled or background brief generation should use isolated run/session scope.
   - Do not silently pollute interactive chat/session context.

8. Explicit durable memory boundaries.
   - Treat transient briefing context and durable memory as separate systems.
   - Persist only intentional user/profile facts needed across runs.

9. Telemetry is part of the contract.
   - Emit reasoner lifecycle signals needed for rollout decisions.
   - Required dimensions: `reasoning_mode`, `validation_fail`, `repair_used`, `fallback_reason`.

## Required Telemetry Fields

Each briefing run should be attributable and diagnosable with:

- `reasoning_mode`: `llm` or `fallback`
- `schema_version`: output contract version (currently `v0.2`)
- `attempt`: initial vs repair attempt
- `validation_fail`: boolean
- `repair_used`: boolean
- `fallback_reason`: enum/string (only when fallback path is used)
- `duration_ms`: end-to-end reasoner duration

## Anti-Patterns (Do Not Introduce)

- Re-expanding heuristic ranking logic in deterministic fallback.
- Duplicating inference behavior across route and helper modules.
- Silent fallback without telemetry explaining why.
- Blending scheduled-automation context with interactive user sessions.
- Treating schema validation as optional or best-effort.

## Slice Exit Checklist

A Morning Brief migration slice is done when:

1. LLM path is schema-constrained and validated.
2. Repair path is bounded and covered by tests.
3. Deterministic fallback remains minimal and non-heuristic.
4. Telemetry fields above are emitted and test-verified.
5. Route complexity decreases (logic extracted to focused modules).

# Agentic Canvas v2 Alignment (OpenClaw + pi-mono)

Last updated: 2026-02-12  
Status: Active

## Why this exists

This document pins the implementation shape for the morning-brief rewrite loop:

1. schedule config
2. precompute brief
3. render V1 required sections
4. quick reaction writeback

The rewrite is intentionally not constrained by v0 backward compatibility.

## Alignment decisions

1. Thin route, centralized orchestration:
   - `/api/briefing/v2` does routing + normalization only.
   - Reasoning, validation, projection, and fallback live in `packages/agentic-canvas-v2/src/core/*`.
2. LLM-first with deterministic rails:
   - `reasonMorningBrief` attempts LLM synthesis, then one bounded repair attempt.
   - Invalid output fails closed to deterministic fallback.
3. Hard schema contract:
   - Brief contract is `v0.2` (`brief-v0.2.ts`).
   - View contract is fixed `v1` required sections (`view-v1.ts`).
4. Evidence integrity and bounded ranking:
   - Validation enforces max 3 priorities, unique rank, evidence references, and verification prompt for low confidence.
5. Telemetry is mandatory:
   - `reasoning_mode`, `schema_version`, `attempt`, `validation_fail`, `repair_used`, `fallback_reason`, `duration_ms`.
6. Tool-loop determinism:
   - Read/write patterns remain explicit, bounded, and shell-escaped following pi-mono tool conventions.

## Implementation anchor files

- `packages/agentic-canvas-v2/src/contracts/brief-v0.2.ts`
- `packages/agentic-canvas-v2/src/contracts/view-v1.ts`
- `packages/agentic-canvas-v2/src/core/validate.ts`
- `packages/agentic-canvas-v2/src/core/project-v1-sections.ts`
- `packages/agentic-canvas-v2/src/core/reasoner.ts`
- `packages/agentic-canvas-v2/src/core/telemetry.ts`
- `src/app/api/briefing/v2/route.ts`

## Primary source citations

- OpenClaw principles: `/Users/petepetrash/Code/agentic-canvas/.claude/plans/morning-brief-openclaw-principles-v0.1.md` (thin route/orchestration, LLM-first rails, bounded repair/fallback, evidence integrity, telemetry, isolation): lines 23-70.
- pi-mono read tool contract and bounded truncation behavior: `/Users/petepetrash/Code/pi-mono/packages/mom/src/tools/read.ts`: lines 27-48, 68-82, 108-147.
- pi-mono write tool deterministic escaped write flow: `/Users/petepetrash/Code/pi-mono/packages/mom/src/tools/write.ts`: lines 5-9, 23-33, 43-44.
- pi-mono platform-agnostic architecture goals: `/Users/petepetrash/Code/pi-mono/packages/mom/docs/new.md`: lines 3-10, 31-80.
- pi-mono package/runtime context: `/Users/petepetrash/Code/pi-mono/README.md`: lines 30-40.

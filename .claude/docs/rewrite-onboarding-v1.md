# Rewrite Onboarding (Morning Brief v2)

Last updated: 2026-02-12  
Audience: new coding agents entering the rewrite

## First 10 minutes

1. Read `AGENT_CHANGELOG.md` for current runtime direction.
2. Read `.claude/docs/agentic-alignment-openclaw-pi-mono-v0.1.md`.
3. Read `.claude/docs/chunk-walkthrough-checklist-v1.md`.
4. Open the v2 package:
   - `packages/agentic-canvas-v2/src/contracts/*`
   - `packages/agentic-canvas-v2/src/core/*`
5. Open the route slice:
   - `src/app/api/briefing/v2/route.ts`
   - `src/app/api/briefing/v2/route.test.ts`

## Canonical rewrite loop

1. Schedule config normalization in route.
2. Precompute via reasoner (`LLM -> repair -> fallback`).
3. Render fixed V1 required sections.
4. Quick reaction writeback payload.

## Guardrails

- No v0 backward-compat shims unless explicitly requested.
- Fallback remains minimal and deterministic.
- Validation rules are hard contract, not best-effort:
  - max 3 priorities
  - unique ranks
  - evidence references required
  - verification prompt required for low confidence
- Telemetry fields are mandatory for every run.

## Primary references

- OpenClaw principles: `/Users/petepetrash/Code/agentic-canvas/.claude/plans/morning-brief-openclaw-principles-v0.1.md` (lines 23-70).
- pi-mono deterministic read/write patterns:
  - `/Users/petepetrash/Code/pi-mono/packages/mom/src/tools/read.ts` (lines 38-48, 68-82, 108-147)
  - `/Users/petepetrash/Code/pi-mono/packages/mom/src/tools/write.ts` (lines 11-17, 23-33)

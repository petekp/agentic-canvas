# Chunk Notes: Morning Brief v2 (2026-02-12)

## Chunk 1: Contracts (`brief-v0.2`, `view-v1`)

- Output schema fixed at `v0.2`; render projection fixed at `v1` required sections.
- Decision: route and reasoner both treat schema as hard gate, not advisory.
- Source citation:
  - OpenClaw schema hard-contract + bounded repair requirement:
    `/Users/petepetrash/Code/agentic-canvas/.claude/plans/morning-brief-openclaw-principles-v0.1.md` lines 31-34.

## Chunk 2: Validation rails

- Added hard rules:
  - priorities <= 3
  - duplicate rank rejected
  - evidence refs required and resolvable
  - low-confidence priorities require verification prompt
- Source citation:
  - OpenClaw evidence integrity + rank integrity:
    `/Users/petepetrash/Code/agentic-canvas/.claude/plans/morning-brief-openclaw-principles-v0.1.md` lines 39-43.

## Chunk 3: V1 section projection

- Projection is deterministic and always returns all required sections.
- Empty source data never yields empty UI blocks (fallback text enforced).
- Source citation:
  - OpenClaw fallback as minimal safety net, not second reasoner:
    `/Users/petepetrash/Code/agentic-canvas/.claude/plans/morning-brief-openclaw-principles-v0.1.md` lines 35-37.

## Chunk 4: Reasoner (LLM -> repair -> fail-closed fallback)

- One synthesis attempt + one bounded repair attempt.
- On continued invalid output, route returns deterministic fallback brief.
- Telemetry contract emitted with required fields.
- Source citations:
  - OpenClaw bounded repair/fail-closed telemetry:
    `/Users/petepetrash/Code/agentic-canvas/.claude/plans/morning-brief-openclaw-principles-v0.1.md` lines 33-34, 56-70.
  - pi-mono reliability pattern (explicit bounded IO behavior):
    `/Users/petepetrash/Code/pi-mono/packages/mom/src/tools/read.ts` lines 68-82, 108-131.

## Chunk 5: Route vertical loop

- Route executes schedule normalization -> precompute -> render -> writeback.
- Route remains orchestration-only; no ranking/synthesis heuristics in route.
- Source citations:
  - OpenClaw thin-route principle:
    `/Users/petepetrash/Code/agentic-canvas/.claude/plans/morning-brief-openclaw-principles-v0.1.md` lines 23-25.
  - pi-mono architecture separation:
    `/Users/petepetrash/Code/pi-mono/packages/mom/docs/new.md` lines 31-80.

## Chunk 6: Test coverage

- Added deterministic tests for validation, projection, reasoner semantics, and route behavior.
- Source citation:
  - OpenClaw slice exit checklist (repair/fallback/telemetry test verification):
    `/Users/petepetrash/Code/agentic-canvas/.claude/plans/morning-brief-openclaw-principles-v0.1.md` lines 80-88.

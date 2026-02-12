# Principles Adherence Review (2026-02-12)

Scope: morning-brief v2 rewrite + bridge integration path in PR #3.

## DeepWiki research log

### openclaw

- Tool: `deepwiki.ask_question`
- Repo: `openclaw/openclaw`
- Question: architecture principles for agent orchestration, filesystem safety, and LLM-vs-deterministic rails.
- Result summary:
  - Gateway-centered orchestration with per-session serialization.
  - Tool policy + sandbox layers for filesystem and command execution safety.
  - Deterministic workflow shells (e.g., Lobster), approvals, and policy gates around LLM tool execution.
  - Strong emphasis on explicit security modes and validation rails.

### pi-mono

- Tool: `deepwiki.ask_question`
- Repo attempted: `mariozechner/pi-mono`
- Result: not indexed / repository not found in DeepWiki at time of review.
- Fallback evidence (local source references already used in rewrite docs):
  - `/Users/petepetrash/Code/pi-mono/packages/mom/src/tools/read.ts`
  - `/Users/petepetrash/Code/pi-mono/packages/mom/src/tools/write.ts`
  - `/Users/petepetrash/Code/pi-mono/packages/mom/docs/new.md`
- Fallback summary:
  - explicit bounded read/write tool contracts,
  - deterministic rails around IO behavior,
  - architecture separation supporting filesystem-first agent workflows.

## Alignment decisions for this repo

1. Keep route layer thin and orchestration-focused.
2. Keep deterministic validation/fallback rails hard and explicit around LLM synthesis.
3. Keep filesystem/tool interactions policy-bounded and observable.
4. Preserve required telemetry fields for autonomous debugging by coding agents.

## Intentional deviations (current)

- No major deviation from openclaw/pi-mono direction in the current v2 slice.
- Current emphasis remains local-first and single-user design-phase iteration.

## Implications for current PR and next slices

- Continue rewrite-first isolation in `agentic-canvas-v2` repo.
- Keep old repo as bridge only via feature flag + adapter.
- Require principles adherence notes for behavior-changing PRs under the new process gates.

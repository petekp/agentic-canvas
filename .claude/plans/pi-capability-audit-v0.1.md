# Pi Capability Audit (Phase 1 Guardrails)

**Date:** 2026-02-11  
**Scope:** avoid re-implementing capabilities already available in pi-mono extension/runtime layers and assistant-ui helper packages.

## 1) Capability overlap to avoid re-implementing

### 1.1 pi-mono (`pi-coding-agent` / `pi-agent-core`)

Already provided upstream (based on current public docs/changelog snapshots):

- Extension system with `defineExtension(...)`
- SDK-level extension injection via `createAgentSession({ extensions: [...] })`
- Extension runtime architecture and shared context
- Tool override support via extensions (`setActiveTools`-style behavior noted in changelog)

Implication for Agentic Canvas:

- Do not build an independent extension registry in `pi-runtime`.
- Keep our runtime seam thin and delegate extension/tool policies to external pi engine when plugged in.
- Prefer engine capability detection + pass-through config over local re-implementation.

### 1.2 assistant-ui / assistant-stream helpers

Already provided in installed dependencies:

- Tool schema forwarding helpers:
  - `frontendTools(...)` from `@assistant-ui/react-ai-sdk`
  - `toToolsJSONSchema(...)` in assistant-stream (used by `AssistantChatTransport`)
- Runtime transport wiring:
  - `AssistantChatTransport`
- Tool result stream/runtime machinery in assistant-stream:
  - `toolResultStream`, tool execution orchestration primitives

Implication for Agentic Canvas:

- Keep using `frontendTools(...)` for route tool schema projection.
- Avoid introducing custom tool-schema conversion pipelines unless compatibility requires it.
- Avoid server-side tool execution loops in phase 1; preserve assistant-ui client tool execution model.

## 2) What remains intentionally custom in this repo

- Filesystem-first session artifacts (`episodes/`, `ledger/`, `snapshots/`, `memory/`)
- Retention/compaction scheduler and policies
- Route/session-specific telemetry and workspace/thread/space session scoping
- Adapter contract mapping and invariants specific to current `agentic-canvas` migration

## 3) Decision checklist before adding new runtime code

For each new runtime feature, answer:

1. Is this already available via pi-mono extension/runtime API?
2. Is this already available via assistant-ui / assistant-stream utility?
3. If yes, can we delegate instead of implementing locally?
4. If no, does the custom implementation belong to migration glue or product-specific policy?

Only implement locally when (3) is no and (4) is yes.

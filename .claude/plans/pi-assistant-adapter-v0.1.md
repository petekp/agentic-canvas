# Pi + assistant-ui Adapter Contract (Phase 1)

**Status:** Contract drafted, phase-1 shim implemented  
**Date:** 2026-02-11  
**Scope:** Backend orchestration swap only (`/api/chat`), preserve existing `assistant-ui` client runtime and client-side tool execution model.

## Goal

Integrate a `pi`-based orchestration loop behind the existing chat transport so Agentic Canvas can run a filesystem-first, agentic runtime shared with Morning Brief, without breaking current assistant-ui UX or frontend tool behavior.

## Non-goals (Phase 1)

- No migration away from `assistant-ui` UI/runtime on the client.
- No server-side execution of canvas mutation tools.
- No changes to store mutation ownership (still client/Zustand).

## Existing Seams (Confirmed)

- Client transport/runtime: `src/components/chat/AssistantProvider.tsx`
- Server orchestration seam: `src/app/api/chat/route.ts`
- Client tool registry/execution: `src/lib/canvas-tools.tsx`
- Chat shell + lazy tool mount: `src/components/chat/ChatPanel.tsx`

## Contract Artifacts

Canonical runtime contract types/schemas live in:

- `src/lib/pi-adapter-contract.ts`

These contracts are intentionally framework-agnostic and define the boundary between:

1. `pi` event stream
2. assistant-ui/AI-SDK message stream semantics
3. frontend tool call/result loop
4. session + filesystem persistence

## 1) Phase-1 Adapter Contract: `pi` Events -> Assistant Stream

### 1.1 Canonical `pi` event envelope

Each runtime event must include:

- `type` (discriminant)
- `runId`
- `timestamp` (epoch ms)
- `sequence` (strictly increasing integer per run)

Supported types:

- `response.created`
- `response.output_text.delta`
- `response.output_text.done`
- `response.tool_call`
- `response.completed`
- `response.error`
- `response.cancelled`

### 1.2 Normalized assistant bridge event

The adapter must normalize `pi` events into assistant-facing bridge events:

- `assistant.message.start`
- `assistant.message.delta`
- `assistant.message.done`
- `assistant.tool.call`
- `assistant.run.completed`
- `assistant.run.error`
- `assistant.run.cancelled`

### 1.3 Mapping table (normative)

- `response.created` -> `assistant.message.start`
- `response.output_text.delta` -> `assistant.message.delta`
- `response.output_text.done` -> `assistant.message.done`
- `response.tool_call` -> `assistant.tool.call`
- `response.completed` -> `assistant.run.completed`
- `response.error` -> `assistant.run.error`
- `response.cancelled` -> `assistant.run.cancelled`

### 1.4 Sequence invariant

For a given `runId`, `sequence` must be strictly increasing. Adapter rejects out-of-order streams as protocol violations.

## 2) Tool Contract

### 2.1 Source of truth

Phase 1 tool schema source of truth is the frontend-provided `tools` payload already sent by assistant-ui transport and consumed in `route.ts` via `frontendTools(...)`.

Implication:

- Do not introduce a second server-owned tool schema registry for execution semantics in Phase 1.
- Any server-side `pi` adapter tool projection must be derived from the incoming frontend tool definitions.

### 2.2 Tool call envelope

Tool calls emitted by the adapter must include:

- `toolCallId` (stable per call)
- `toolName` (snake_case)
- `args` (JSON object)
- `idempotencyKey` (`<sessionId>:<toolCallId>`)

### 2.3 Tool result return path

Tool results are represented as:

- `toolCallId`
- `toolName`
- `result` (arbitrary JSON payload)
- `isError` (boolean)
- `idempotencyKey` (same derivation as call)

Validation rule:

- Every tool result must reference a previously emitted tool call for the same run/session.

## 3) Session + Filesystem Memory Contract

### 3.1 Session scope

Session scope dimensions:

- `workspaceId`
- `threadId`
- `spaceId` (nullable)

Session ID format:

- `<workspaceId>:<spaceId|none>:<threadId>`

### 3.2 Filesystem layout

Runtime root (recommended phase-1 default):

- `.runtime/pi/sessions/<url-encoded-session-id>/`

Per-session directories:

- `memory/` persistent working/profile memory
- `episodes/` raw event logs (`*.jsonl`)
- `ledger/` idempotency + tool call/result ledger
- `snapshots/` compacted summaries/checkpoints

### 3.3 Retention + compaction

Default policy:

- keep raw episodes for 14 days
- compact after 3 days into `snapshots/`
- keep ledger for 30 days

Compaction must be loss-aware:

- preserve tool idempotency records across compaction window
- preserve enough run metadata for replay/debug

## 4) Error + Cancel Contract

### 4.1 Cancellation propagation

- Route request `AbortSignal` cancellation must propagate into `pi` runtime cancellation.
- Runtime must emit `response.cancelled` before stream close when cancellation is acknowledged.

### 4.2 Partial output semantics

- Any emitted text deltas before error/cancel remain committed to transcript.
- Terminal event defines final run status (`completed`, `error`, or `cancelled`).

### 4.3 Retry + idempotency

- Retries must reuse `toolCallId` and therefore `idempotencyKey` where possible.
- Duplicate tool results with same `idempotencyKey` must be treated as replay-safe and not re-applied.

## 5) Eval Gates (Must pass before implementation merge)

### 5.1 Stream correctness gate

Automated by:

- `src/lib/pi-adapter-contract.test.ts`

Checks:

- event schema validation
- strict sequence monotonicity
- deterministic event normalization

### 5.2 Tool-loop correctness gate

Automated by:

- `src/lib/pi-adapter-contract.test.ts`

Checks:

- tool result references prior call
- idempotency key derivation is stable
- duplicate-result guard rails are enforceable by key

### 5.3 Morning Brief non-regression gate

Must pass unchanged:

- `src/store/workspace-slice.morning-brief.test.ts`
- `src/lib/morning-brief.test.ts`

Convenience command:

- `pnpm run eval:pi:phase1`

## 6) Implementation Order (Confirmed)

1. Add `pi` adapter inside `/api/chat` while preserving assistant-ui transport contract.
2. Validate all gates above.
3. Only after stability, evaluate runtime surface migration on client.

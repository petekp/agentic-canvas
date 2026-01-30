# Agent Changelog

> This file helps coding agents understand project evolution, key decisions,
> and deprecated patterns. Updated: 2026-01-30

## Current State Summary

Agentic Canvas is a greenfield project with **complete specifications ready for implementation**. Three spec documents define all types, component schemas, and store architecture. No code has been written yet—the next step is scaffolding the Next.js/React project and implementing the Zustand store.

## Stale Information Detected

None currently—this is a greenfield project with no code to contradict.

## Timeline

### 2026-01-30 - Store Architecture Defined (v0.1.0)

**What changed:** Defined complete Zustand store architecture including:
- Four slices: Canvas, History, Data, Workspace
- Command executor bridge between LLM tools and store
- Immer middleware for immutable updates
- React hooks for component integration
- Selector patterns for performance

**Why:** To establish the state management foundation before implementation.

**Agent impact:**
- Reference `.claude/plans/store-architecture-v0.1.md` for store implementation
- All state mutations flow through slice actions
- Commands produce `UndoEntry` automatically via `_pushUndo`
- Use `shallow` from zustand for selector equality
- Data fetching uses cache-first strategy with TTL

**Key patterns:**
- `useStore` is the single store hook
- `createCommandExecutor()` bridges LLM tools → store actions
- `executeCommandWithoutHistory()` handles undo/redo without recursion

---

### 2026-01-30 - Component Schemas Defined (v0.1.0)

**What changed:** Defined complete schemas for all four v0.1 components:
- `github.pr-list` — PR list with checks, reviewers, actions
- `github.issue-grid` — Issue grid with labels, grouping, actions
- `github.stat-tile` — Single metric with trend, thresholds
- `github.activity-timeline` — Activity feed with typed payloads

**Why:** To fully specify component contracts, data shapes, and AI actions before building.

**Agent impact:**
- Reference `.claude/plans/component-schemas-v0.1.md` for component implementation
- Each component has `configSchema` (JSON Schema) for validation
- Data shapes use discriminated unions (`ActivityPayload` variants)
- Actions define what the assistant can do with selected items
- Summary generation templates provided for AI context

**Key decisions:**
- Computed fields (`age`, `isStale`, `priority`) derived at render, not stored
- Activity payloads are discriminated by `type` field
- Mock data source returns pre-shaped data (no client-side transforms in v0.1)

---

### 2026-01-30 - Primitives Spec Revised (v0.1.1)

**What changed:** After external agent review, revised the core spec:
- Added `HistoryState`, `UndoEntry`, `HistoryAction` for undo/redo
- Added `PlacementResult`, `LayoutEngine`, `PlacementHints` for auto-placement
- Fixed `Canvas` to include `grid: GridConfig` (matching proposal)
- Renamed `ComponentState` → `DataLoadingState` for clarity
- Simplified `ProactiveTrigger` to `session_start` and `time_based` only
- Added component-specific config schemas to LLM tools (`oneOf`)
- Added `refresh_component`, `undo`, `redo` tools

**Why:** External review identified 20+ issues; critical blocking issues were fixed.

**Agent impact:**
- Use `DataLoadingState` not `ComponentState`
- Undo entries store both `forward` and `inverse` commands
- `PlacementResult.reason` indicates how position was determined
- LLM tools have typed config schemas, not opaque objects
- Component IDs come from `CanvasContext`, not a list tool

**Deferred to v0.2:**
- `DataTransform` (client-side filter/sort/limit)
- `ErrorRecovery` (auto-recovery actions)
- Cron-based and data-condition triggers

---

### 2026-01-30 - Primitives Spec Created (v0.1.0)

**What changed:** Initial specification of core TypeScript interfaces.

**Why:** To establish a robust, extensible foundation before implementation.

**Agent impact:** Superseded by v0.1.1—see above.

---

### 2026-01 - Project Proposal Drafted

**What changed:** Initial technical proposal defining product vision, architecture, and phased implementation plan.

**Why:** To align team on scope, validate technical approach, and define v0.1 boundaries.

**Agent impact:**
- Proposal is background context, not implementation spec
- Spec documents override proposal if there's a conflict
- Proposal's `CanvasAction` type was replaced by `CanvasCommand` in spec

**Key scope decisions:**
- v0.1 is experience-first prototype, not production system
- Proactive behaviors are simulated, not implemented
- Only mock GitHub data source (no real connectors)
- 4 component types for v0.1

---

## Deprecated Patterns

| Don't | Do Instead | Since |
|-------|------------|-------|
| Use `ComponentState` | Use `DataLoadingState` | v0.1.1 |
| Use `DataTransform` in bindings | Handle filtering in query params or render logic | v0.1.1 (deferred) |
| Implement cron-based triggers | Use `session_start` or `time_based` trigger types | v0.1.1 |
| Create `ErrorRecovery` logic | Show errors to user, let assistant explain | v0.1.1 (deferred) |
| Use `CanvasAction` (from proposal) | Use `CanvasCommand` (from spec) | v0.1.0 |
| Store computed fields (`age`, `isStale`) | Derive at render time | v0.1.0 |
| Create `list_components` tool | Inject component IDs via `CanvasContext` | v0.1.1 |

## Key Documents

| Document | Purpose | Authority Level |
|----------|---------|-----------------|
| `.claude/plans/store-architecture-v0.1.md` | Zustand slices, hooks, middleware | **Authoritative** for store |
| `.claude/plans/component-schemas-v0.1.md` | Component configs, data shapes, actions | **Authoritative** for components |
| `.claude/plans/primitives-spec-v0.1.md` | Core types, commands, protocols | **Authoritative** for types |
| `agentic-canvas-proposal.md` | Product vision and architecture overview | Background context |

## Trajectory

The project is ready to begin implementation:

1. **Next:** Scaffold Next.js + TypeScript project, install deps (zustand, immer, nanoid, tailwind)
2. **Then:** Implement store slices following `store-architecture-v0.1.md`
3. **Then:** Build canvas grid component with drag/resize
4. **Then:** Implement `github.stat-tile` (simplest component) with mock data
5. **Then:** Add remaining components, assistant integration

**Phase 1 goal:** Canvas shell with manual component placement and basic undo/redo.

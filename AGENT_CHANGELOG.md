# Agent Changelog

> This file helps coding agents understand project evolution, key decisions,
> and deprecated patterns. Updated: 2026-02-08

## Current State Summary

Agentic Canvas is a **working v0.1 implementation** with canvas + chat interface, AI-powered component manipulation, spaces grid + navigation, assistant-driven space management, and multi-source data integrations. It now includes a **template generation engine** with state-signal inference and a toolbar-driven generation UI. Undo/redo is snapshot-based with space-aware restoration, audit logging, and policy hooks, and now covers space operations as first-class undoable actions.

## Stale Information Detected

| Location | States | Reality | Since |
|----------|--------|---------|-------|
| `.claude/plans/primitives-spec-v0.1.md` | View lacks `pinned`, `createdBy`, `updatedAt`; ComponentMeta lacks `template` | Runtime types include these fields | 2026-02-03 |
| `.claude/plans/component-schemas-v0.1.md` | Documents only 4 GitHub components | Runtime supports GitHub + PostHog + Slack + personal filters + commit/team analysis | 2026-02-01 |
| `.claude/plans/store-architecture-v0.1.md` | References `history-slice.ts` | Undo/redo implemented in `undo-slice.ts` with snapshots | 2026-01-31 |

## Timeline

### 2026-02-11 - Pi Adapter Contract Baseline (Phase 1)

**What changed:** (uncommitted)
- Added explicit phase-1 integration spec for `pi` + `assistant-ui`:
  - `.claude/plans/pi-assistant-adapter-v0.1.md`
- Added machine-checked protocol contracts:
  - `src/lib/pi-adapter-contract.ts`
  - `src/lib/pi-adapter-contract.test.ts`
- Added phase-1 adapter seam implementation:
  - `src/lib/pi-phase1-adapter.ts`
  - `src/lib/pi-phase1-adapter.test.ts`
  - `src/app/api/chat/route.ts` now routes through `streamWithPiPhase1Adapter(...)`
  - `src/components/chat/AssistantProvider.tsx` now forwards `workspaceId`, `threadId`, and `activeSpaceId`
- Added dedicated filesystem-first runtime seam behind the adapter:
  - `src/lib/pi-runtime.ts`
  - `src/lib/pi-runtime.test.ts`
  - `src/lib/pi-phase1-adapter.ts` now delegates stream orchestration to `streamWithPiRuntime(...)`
  - Runtime now writes both `episodes/` (pi stream) and `ledger/` (tool call/result loop)
  - Runtime ingests historical tool results from incoming model messages and appends replay-safe ledger results by idempotency key
  - Runtime now runs throttled retention/compaction jobs during chat traffic (`maybeRunPiRetentionJobs`)
  - Runtime now resolves a pluggable external engine via `PI_RUNTIME_ENGINE_MODULE` (optional `PI_RUNTIME_ENGINE_EXPORT`) and falls back to the in-repo AI-SDK engine.
  - `streamWithPiRuntime(...)` is now async so external engine resolution can happen at request time.
- Added eval gate runner:
  - `scripts/run-pi-phase1-gates.sh`
  - `pnpm run eval:pi:phase1`
- Added `/api/chat` phase-1 integration coverage for route semantics:
  - `src/app/api/chat/route.test.ts`
  - Covers abort propagation, stream error mapping/telemetry, and partial stream pass-through
  - Included in `eval:pi:phase1` gates
- Added runtime seam coverage for external engine delegation:
  - `src/lib/pi-runtime.test.ts` now verifies external engine module delegation preserves the route-facing stream API.
  - Runtime extraction now normalizes assistant-ui wrapped tool-result payloads (`output.value`) so ledger ingestion stores actual tool outputs instead of wrapper envelopes.
- Added filesystem retention/compaction jobs for session runtime data:
  - `src/lib/pi-retention.ts`
  - `src/lib/pi-retention.test.ts`
  - Compacts old `episodes/*.jsonl` into `snapshots/` with preserved tool idempotency keys
  - Prunes expired files across `episodes/`, `ledger/`, `snapshots/`, and date-prefixed `memory/`
  - Included in `eval:pi:phase1` gates
- Added explicit retention trigger API for cron/manual operation:
  - `src/app/api/pi/retention/route.ts`
  - `src/app/api/pi/retention/route.test.ts`
  - Optional bearer auth via `PI_RETENTION_API_TOKEN`
- Added explicit runtime diagnostics API for manual/e2e verification:
  - `src/app/api/pi/runtime/route.ts`
  - `src/app/api/pi/runtime/route.test.ts`
  - Guarded by `PI_RUNTIME_DIAGNOSTICS_ENABLED=1`
  - Reports configured module/export and resolved engine source/id (external vs internal fallback)
- Refined external runtime engine loading in `src/lib/pi-runtime.ts`:
  - Uses dynamic `import(/* webpackIgnore: true */ ...)` with file-URL normalization for relative/absolute paths
  - Supports CJS default-export containers and ESM exports when resolving `piRuntimeEngine` candidates
  - Added regression test for file-URL ESM module loading
- Added real pi-mono external engine bridge module:
  - `src/lib/pi-mono-runtime-engine.mjs`
  - Uses `@mariozechner/pi-ai` for provider/tool-call streaming and AI SDK UI stream helpers for assistant-ui-compatible transport
  - Includes `PI_MONO_DRY_RUN` mode for deterministic local integration tests
- Added route integration coverage for external pi-mono runtime wiring:
  - `src/app/api/chat/pi-mono.route.integration.test.ts`
  - Verifies `/api/chat` can stream through `PI_RUNTIME_ENGINE_MODULE` with dry-run mode

**Why:** Lock protocol decisions (stream/tool/session/error semantics) before runtime implementation to avoid ambiguous adapter behavior and regressions in Morning Brief.

**Agent impact:**
- Treat `src/lib/pi-adapter-contract.ts` as the canonical phase-1 adapter boundary.
- Treat `src/lib/pi-phase1-adapter.ts` as the only backend orchestration seam for chat in phase 1.
- Use `pnpm run eval:pi:phase1` before merging any `pi` orchestration work.
- Keep `src/app/api/chat/route.test.ts` passing when modifying stream/cancel/error behavior.
- Keep `src/lib/pi-runtime.test.ts` passing when modifying runtime orchestration or tool-loop persistence.
- Keep `src/lib/pi-phase1-adapter.ts` and `src/app/api/chat/route.ts` aligned with async runtime delegation.
- Use `runPiRetentionJobs(...)` from `src/lib/pi-retention.ts` for runtime filesystem hygiene.
- `streamWithPiRuntime(...)` now invokes retention scheduling; tune via `PI_RETENTION_INTERVAL_MS`.
- Preserve frontend tool execution model in phase 1; backend swap should respect existing assistant-ui transport semantics.

**Deprecated:** None

---

### 2026-02-03 - Template Engine + View-Undo Coverage

**What changed:** (commit 7f57636)
- Added template system (`src/lib/templates/*`) with selection, parameter resolution, state signals, and compilation
- Added toolbar menu and state debug panel for generation workflows
- Made view operations (create, rename, delete, pin/unpin, load) fully undoable via view-state snapshots
- Improved undo semantics for data binding updates and added undo test coverage

**Why:** Provide state-aware, repeatable component generation and ensure undo/redo covers AI-native view workflows end-to-end.

**Agent impact:**
- Use template APIs in `src/lib/templates/*` for generation; register defaults before selection
- Undo entries may include view state; undo/redo restores view lists + active view
- View operations now produce undo entries (no manual “undo missing” workarounds)
- New tests in `src/store/undo-system.test.ts` guard undo invariants

**Deprecated:** None

---

### 2026-02-01 - Native assistant-ui Tool Pattern

**What changed:** (commit ad7c232)
- Refactored from custom `ToolExecutionHandler` to assistant-ui's native `makeAssistantTool`
- Tools now execute automatically via assistant-ui framework
- Eliminated O(n²) message scanning that caused app freezes
- Server uses `frontendTools()` to receive client-defined tools

**Why:** Custom tool execution was fighting against the framework and causing severe app freezes. assistant-ui's native pattern handles the complete tool lifecycle automatically.

**Agent impact:**
- Tools defined in `/src/lib/canvas-tools.tsx` using `makeAssistantTool`
- Do NOT use `ToolExecutionHandler` - it no longer exists
- Do NOT look for `/src/lib/tool-executor.ts` - deleted
- Do NOT look for `/src/components/chat/tool-uis.tsx` - deleted
- Tool execute functions access store imperatively via `useStore.getState()`
- Each tool renders its own inline UI via the `render` prop

**Files:**
- Created: `src/lib/canvas-tools.tsx` - all 10 tools with execute + render
- Modified: `src/app/api/chat/route.ts` - uses `frontendTools(tools)`
- Modified: `src/components/chat/ChatPanel.tsx` - mounts `<CanvasTools />`
- Deleted: `src/lib/tool-executor.ts`
- Deleted: `src/components/chat/tool-uis.tsx`

**Deprecated:**
- Custom `ToolExecutionHandler` component
- Manual tool execution via state subscription
- `tool-executor.ts` file
- `tool-uis.tsx` file

---

### 2026-02-01 - Slack Integration & GitHub Commit Analysis

**What changed:** (commit 9d488d0)
- New Slack API route with channel activity, mentions (docs only), thread watch
- New GitHub commit analysis: `commits` and `team_activity` query types
- Team Activity extracts work themes from commit messages (features, bugs, refactoring, etc.)
- 5 new component types added

**Why:** Enable cross-source insights. Slack provides communication context, commit analysis reveals what teams are working on.

**Agent impact:**
- Slack components: `slack.channel-activity`, `slack.mentions`, `slack.thread-watch`
- GitHub components: `github.commits`, `github.team-activity`
- `mentions` requires user token (bot token limitation) - returns helpful error
- Bot must be invited to Slack channels to read them
- Theme extraction uses regex patterns on commit messages

**Files added:**
- `src/app/api/slack/route.ts`

**Files modified:**
- `src/app/api/github/route.ts` - added commits, team_activity
- `src/lib/tool-executor.ts` - DEFAULT_SIZES, DEFAULT_BINDINGS
- `src/lib/canvas-context.ts` - component metadata
- `src/components/canvas/ComponentContent.tsx` - renderers
- `src/components/canvas/Canvas.tsx` - dropdown menu
- `src/lib/ai-tools.ts` - system prompt

---

### 2026-02-01 - Proactive Insights & Notifications System

**What changed:** (commit 6eda00a)
- Insight engine generates contextual notifications from canvas data
- Server-side insight generation via `/api/insights`
- Memory service for feedback storage
- UI notifications for surfacing insights

**Why:** Assistant should proactively notice patterns and alert users.

**Agent impact:**
- Use `/api/insights` route, not client-side insight-engine
- `src/lib/insights/deprecated-engine.ts` is deprecated
- Memory feedback stored via `/api/memory/feedback`

**Deprecated:**
- Client-side `InsightEngine` class - use server route instead

---

### 2026-02-01 - Assistant-Driven View Management

**What changed:** (committed with 6eda00a)
- Views have `pinned`, `createdBy`, `createdAt` fields
- Assistant can create views via `create_view` tool
- Assistant can navigate via `switch_view` tool
- Assistant can pin/unpin via `pin_view`, `unpin_view` tools
- Unpinned assistant-created views auto-cleanup after 7 days

**Why:** Canvas views should be ephemeral workspaces the assistant creates on demand.

**Agent impact:**
- Use `create_view` to create focused, task-specific workspaces
- Proactively create views when starting new topics/tasks
- Views include current components in system prompt context

---

### 2026-01-31 - Canvas-Aware AI Assistant

**What changed:** (commit 0b2c01c)
- Assistant receives full canvas context in system prompt
- Tool executor bridges AI tool calls to store actions
- AssistantProvider component wraps chat with canvas awareness

**Why:** Assistant needs to understand current canvas state.

**Agent impact:**
- Canvas context automatically injected into prompts
- ~~Tool executor in `src/lib/tool-executor.ts`~~ Now in `canvas-tools.tsx`

---

### 2026-01-31 - Snapshot-Based Undo/Redo System

**What changed:** (commits ac55486, c7e9341, 8b7dea2)
- Replaced command-based undo with snapshot-based system
- Undo/redo preserves view context for cross-view navigation
- Removed `history-slice.ts`, integrated into `canvas-slice.ts`

**Why:** Command-based approach was complex and error-prone.

**Agent impact:**
- Don't look for `history-slice.ts` - it no longer exists
- Undo/redo is in `canvas-slice.ts`
- `UndoEntry` contains full canvas snapshots

**Deprecated:**
- `history-slice.ts` - deleted
- Command-based undo patterns

---

### 2026-01-31 - Saved Views with Tabs UI

**What changed:** (commits 918e63f, 4199915)
- View tabs above canvas
- Click to switch, double-click to rename
- Views persist via localStorage

**Agent impact:**
- Use `useViews()` hook
- Views in `WorkspaceSlice`

---

### 2026-01-30 - Chat Interface with AI Tools

**What changed:** (commit 1f16a23)
- Chat panel with message history
- Tools: `add_component`, `move_component`, `resize_component`, `remove_component`, `update_component`, `clear_canvas`

**Agent impact:**
- Use Vercel AI SDK v6 patterns (see CLAUDE.md)
- Tools use snake_case naming

---

### 2026-01-30 - Initial Implementation

**What changed:** (commits f972776 through 9a8a878)
- Next.js 15 + React 19 + TypeScript
- Zustand store with slices
- react-grid-layout for drag & drop
- GitHub and PostHog data sources

---

## Deprecated Patterns

| Don't | Do Instead | Since |
|-------|------------|-------|
| Use `history-slice.ts` | Undo/redo is in canvas-slice | 2026-01-31 |
| Use command-based undo | Use snapshot-based undo | 2026-01-31 |
| Use `ComponentState` type | Use `DataLoadingState` | v0.1.1 |
| Store computed fields | Derive at render time | v0.1.0 |
| Create `list_components` tool | Inject via `CanvasContext` | v0.1.1 |
| Use client-side `InsightEngine` | Use `/api/insights` route | 2026-02-01 |
| Call memory service from client | Use `/api/memory/*` routes | 2026-02-01 |
| Use `ToolExecutionHandler` | Use `makeAssistantTool` in canvas-tools.tsx | 2026-02-01 |
| Use `tool-executor.ts` | Tools execute in canvas-tools.tsx | 2026-02-01 |
| Use `tool-uis.tsx` | Tool UIs are in canvas-tools.tsx render | 2026-02-01 |
| Subscribe to messages for tool execution | Use `makeAssistantTool` auto-execute | 2026-02-01 |

## Data Sources

| Source | Route | Components |
|--------|-------|------------|
| GitHub | `/api/github` | stat-tile, pr-list, issue-grid, activity-timeline, my-activity, commits, team-activity |
| PostHog | `/api/posthog` | site-health, property-breakdown, top-pages |
| Slack | `/api/slack` | channel-activity, mentions*, thread-watch |
| Vercel | `/api/vercel` | deployments, project-status |
| Integrations | `/api/integrations` | availability status (github, posthog, slack, vercel) |

*mentions requires user token, not bot token

## Environment Variables

```bash
OPENAI_API_KEY=        # Required for AI
SUPERMEMORY_API_KEY=   # Required for memory + insights
GITHUB_TOKEN=          # For GitHub API
GITHUB_REPO=           # owner/repo format
GITHUB_USERNAME=       # For personal filters
POSTHOG_API_KEY=       # For PostHog
POSTHOG_PROJECT_ID=    # PostHog project
SLACK_BOT_TOKEN=       # xoxb-... token
SLACK_USER_TOKEN=      # xoxp-... token (required for mentions/search)
VERCEL_TOKEN=          # For Vercel API
VERCEL_PROJECT_ID=     # Optional default project
VERCEL_TEAM_ID=        # Optional default team
```

## Trajectory

Current trajectory based on recent commits:

1. **Completed:** Multi-source data (GitHub, PostHog, Slack)
2. **Completed:** Commit analysis and team activity insights
3. **Completed:** Native assistant-ui tool execution pattern
4. **Next likely:** Real-time updates / WebSocket support
5. **Future:** User authentication, multi-user support
6. **Future:** Additional data sources (Linear, Jira, etc.)

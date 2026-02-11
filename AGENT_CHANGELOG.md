# Agent Changelog

> This file helps coding agents understand project evolution, key decisions,
> and deprecated patterns. Updated: 2026-02-11

## Current State Summary

Agentic Canvas is a working v0.1+ system with spaces-first navigation, assistant-ui native tool execution, and multi-source canvas components. Backend chat orchestration now has a filesystem-first phase-1 `pi` runtime seam (`pi-phase1-adapter` -> `pi-runtime`) with optional external engine delegation, while preserving the existing assistant-ui client/runtime contract. Morning Brief lifecycle integration has landed as system-managed space/component scaffolding with coverage, and runtime maintenance/diagnostics endpoints now exist for retention and engine verification.

## Stale Information Detected

| Location | States | Reality | Since |
|----------|--------|---------|-------|
| `.claude/plans/primitives-spec-v0.1.md` | View lacks `pinned`, `createdBy`, `updatedAt`; ComponentMeta lacks `template` | Runtime types include these fields | 2026-02-03 |
| `.claude/plans/component-schemas-v0.1.md` | Documents only 4 GitHub components | Runtime supports GitHub + PostHog + Slack + personal filters + commit/team analysis | 2026-02-01 |
| `.claude/plans/store-architecture-v0.1.md` | References `history-slice.ts` | Undo/redo implemented in `undo-slice.ts` with snapshots | 2026-01-31 |
| `.claude/plans/assistant-ui-native-tools.md` | Tool list is `*_view` terminology (`create_view`, `switch_view`, etc.) | Runtime/tools are space-first (`create_space`, `switch_space`, `pin_space`, `unpin_space`) | 2026-02-11 |
| `.claude/plans/undo-redo-system-v2.md` | Uses legacy “view context” framing | Product/runtime vocabulary is now “space” across store/routes/UI | 2026-02-11 |

## Timeline

### 2026-02-11 - Deterministic Chat-Loop FS E2E + Ledger Integrity

**What changed:**
- Added deterministic `/api/chat` integration coverage that executes real server-side filesystem tools through the runtime loop:
  - `src/app/api/chat/pi-filesystem.route.integration.test.ts`
  - Uses a deterministic mock language model stream to trigger `write_file` then `read_file`
  - Verifies mutation under `PI_FS_ALLOWED_ROOT`
  - Verifies ledger evidence and call/result integrity under `PI_RUNTIME_ROOT/sessions/.../ledger/*.jsonl`
- Wired the new integration test into existing eval/smoke runners:
  - `scripts/run-pi-phase1-gates.sh`
  - `scripts/run-pi-filesystem-smoke.sh`
- Added local fs-testing env profile scaffolding:
  - `.env.example` (`PI_FILESYSTEM_TOOLS_ENABLED`, `PI_FS_ALLOWED_ROOT`, fs limits, delete gate defaults)
- Added manual browser verification checklist for fs tool flow:
  - `.claude/plans/pi-local-prototype-scope-v0.1.md`
- Executed live local phase-2 smoke against running dev server (2026-02-11):
  - `pnpm run eval:pi:phase2:smoke --expect-engine-source external --expect-engine-id external.pi-mono.runtime --expect-chat-text "pi-mono dry run" --with-fs-smoke`
  - Result: pass (`runtime`, `retention`, `/api/chat` SSE, and filesystem smoke checks)

**Why:** Close the remaining end-to-end validation gap by proving filesystem tools execute through the chat runtime loop with durable ledger artifacts and repeatable local verification.

**Agent impact:**
- Use `src/app/api/chat/pi-filesystem.route.integration.test.ts` as the canonical deterministic runtime-loop + ledger evidence test.
- `pnpm run eval:pi:fs:smoke` now validates both direct tool smoke and `/api/chat` filesystem-loop behavior.
- Use the checklist in `.claude/plans/pi-local-prototype-scope-v0.1.md` when manually verifying runtime tool execution in browser.

**Deprecated:** None

---

### 2026-02-11 - Local Prototype Filesystem Tooling + Eval Hardening

**What changed:**
- Added guarded local filesystem tool surface and env-based diagnostics:
  - `src/lib/pi-filesystem-tools.ts`
  - Tool surface: `list_dir`, `read_file`, `write_file`, `edit_file`
  - Optional `delete_file` behind `PI_FS_DELETE_ENABLED`
  - Env diagnostics accessor: `getPiFilesystemToolDiagnosticsFromEnv()`
- Wired filesystem tools into the existing phase-1 adapter tool path:
  - `src/lib/pi-phase1-adapter.ts`
  - Frontend toolset now merges with server-side filesystem tools (when enabled).
- Expanded runtime diagnostics to include filesystem tool config:
  - `src/lib/pi-runtime.ts`
  - `src/app/api/pi/runtime/route.ts`
  - `src/app/api/pi/runtime/route.test.ts`
- Added filesystem tool telemetry for start/result/error at source `tool.fs.<toolName>`.
- Added phased filesystem eval coverage:
  - `src/lib/pi-filesystem-tools.contract.test.ts`
  - `src/lib/pi-filesystem-tools.readonly.test.ts`
  - `src/lib/pi-filesystem-tools.mutation.test.ts`
  - `src/lib/pi-filesystem-tools.adversarial.test.ts`
  - `src/lib/pi-filesystem-tools.smoke.test.ts`
  - `scripts/run-pi-filesystem-evals.sh`
  - `scripts/run-pi-filesystem-smoke.sh`
  - `package.json` scripts: `eval:pi:fs:*`
- Extended phase-2 smoke script with optional local filesystem smoke execution:
  - `scripts/run-pi-phase2-smoke.sh --with-fs-smoke`

**Why:** Close the local-prototype safety/eval loop before broader runtime work: strict path guardrails, explicit diagnostics, and repeatable contract/read-only/mutation/adversarial/smoke checks.

**Agent impact:**
- Prefer `createPiFilesystemToolSet(...)` and env accessors in `src/lib/pi-filesystem-tools.ts` over bespoke file access logic.
- Use `pnpm run eval:pi:fs:all` for filesystem policy regression checks.
- Use `pnpm run eval:pi:fs:smoke` for local smoke flow (list/read/write/edit + traversal guard).
- Use `GET /api/pi/runtime` diagnostics to verify live filesystem tool settings (`toolsEnabled`, limits, root, delete gate).

**Deprecated:** None

---

### 2026-02-11 - Phase-1 Pi Runtime Seam + Morning Brief Integration

**What changed:** (commits `50ecd64`, `a0ffa1f`)
- Added explicit phase-1 integration spec for `pi` + `assistant-ui`:
  - `.claude/plans/pi-assistant-adapter-v0.1.md`
  - `.claude/plans/pi-capability-audit-v0.1.md`
- Added Morning Brief lifecycle spec and implementation surface:
  - `.claude/plans/morning-brief-lifecycle-v0.1.md`
  - `src/lib/morning-brief.ts`
  - `src/lib/morning-brief-triggers.ts`
  - `src/components/canvas/renderers/MorningBriefContent.tsx`
  - `src/lib/component-registry.ts` + tests updated for `system.morning-brief`
  - `src/app/api/briefing/route.ts` + tests expanded
  - `src/store/workspace-slice.ts` + `src/store/workspace-slice.morning-brief.test.ts`
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

**Why:** Land backend orchestration migration seam first (without breaking assistant-ui UX), while establishing a shared filesystem-first runtime direction with Morning Brief and keeping observability/ops hooks testable.

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
- Use `GET /api/pi/runtime` (when enabled) to verify which runtime engine actually loaded before debugging chat behavior.
- Use Morning Brief files (`src/lib/morning-brief.ts`, `src/lib/morning-brief-triggers.ts`, `src/components/canvas/renderers/MorningBriefContent.tsx`) as the canonical implementation, not just planning docs.

**Deprecated:** None

---

### 2026-02-08 - Spaces Stabilization + Legacy Alias Removal

**What changed:** (commits `51345f0`, `7191a02`, `a7d4ef7`, `6675a08`)
- Removed deprecated `view -> space` aliases across the runtime and docs-facing guidance.
- Cleaned dead code and stale hooks after the spaces migration.
- Fixed remaining type/build/test issues from the migration.
- Re-baselined `CLAUDE.md` instructions to match the stabilized architecture.

**Why:** Eliminate dual terminology and reduce migration residue that caused agent confusion and brittle changes.

**Agent impact:**
- Do not introduce new `view` commands/types/tools in product code.
- Treat `space`/`spaces` as canonical naming in store, route payloads, and tool contracts.
- Assume pre-stabilization compatibility shims are intentionally removed.

**Deprecated:**
- Any new code using view aliases (`create_view`, `switch_view`, etc.) in product/runtime paths.

---

### 2026-02-04 - Spaces Grid Navigation Becomes Primary Workflow

**What changed:** (commit `1b7a6ec`)
- Replaced tab-first view navigation with `/spaces` grid as the entry surface.
- Added dedicated space routing (`/spaces/[id]`) and card/menu interactions.
- Established pin/unpin lifecycle patterns for managed spaces.

**Why:** Improve task isolation, make context switching explicit, and support assistant-created workspaces as first-class entities.

**Agent impact:**
- New work should assume spaces-first routing and lifecycle.
- UX and orchestration flows should start from spaces state, not legacy view tabs.

**Deprecated:** Legacy view-tab-centric assumptions.

---

### 2026-02-03 - Template Engine + Space-Aware Undo Coverage

**What changed:** (commit 7f57636)
- Added template system (`src/lib/templates/*`) with selection, parameter resolution, state signals, and compilation
- Added toolbar menu and state debug panel for generation workflows
- Made workspace operations (at the time: `view` operations) fully undoable via state snapshots
- Improved undo semantics for data binding updates and added undo test coverage

**Why:** Provide state-aware, repeatable component generation and ensure undo/redo covers assistant-native workspace workflows end-to-end.

**Agent impact:**
- Use template APIs in `src/lib/templates/*` for generation; register defaults before selection
- Undo entries may include workspace state; undo/redo restores lists + active context
- Workspace operations now produce undo entries (no manual “undo missing” workarounds)
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

### 2026-02-01 - Assistant-Driven Workspace Management (Legacy Naming)

**What changed:** (committed with 6eda00a)
- Views have `pinned`, `createdBy`, `createdAt` fields
- Assistant can create views via `create_view` tool
- Assistant can navigate via `switch_view` tool
- Assistant can pin/unpin via `pin_view`, `unpin_view` tools
- Unpinned assistant-created views auto-cleanup after 7 days

**Why:** Ephemeral assistant-created workspaces improved task focus.

**Agent impact:**
- Historical context only: this was later migrated to spaces.
- Use modern space tools (`create_space`, `switch_space`, `pin_space`, `unpin_space`) in current code.
- Space context is included in modern chat/session payloads.

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
- Undo/redo preserves workspace context for cross-space navigation
- Removed `history-slice.ts`; modern implementation lives in `undo-slice.ts`

**Why:** Command-based approach was complex and error-prone.

**Agent impact:**
- Don't look for `history-slice.ts` - it no longer exists
- Undo/redo is in `undo-slice.ts`
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
- Historical context only; this model was superseded by spaces navigation.
- Do not add new dependencies on legacy `view` tab patterns.

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
| Use `history-slice.ts` | Undo/redo is in `undo-slice.ts` | 2026-01-31 |
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
| Introduce new `view`/`*_view` APIs | Use `space`/`*_space` naming and tooling | 2026-02-08 |

## Data Sources

| Source | Route | Components |
|--------|-------|------------|
| GitHub | `/api/github` | stat-tile, pr-list, issue-grid, activity-timeline, my-activity, commits, team-activity |
| PostHog | `/api/posthog` | site-health, property-breakdown, top-pages |
| Slack | `/api/slack` | channel-activity, mentions*, thread-watch |
| Vercel | `/api/vercel` | deployments, project-status |
| Integrations | `/api/integrations` | availability status (github, posthog, slack, vercel) |
| System Runtime | `/api/pi/runtime`, `/api/pi/retention` | runtime diagnostics, retention jobs |
| Morning Brief | `/api/briefing` | system-managed morning brief content |

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

1. **Completed:** Spaces-first navigation and stabilization cleanup (legacy view aliases removed).
2. **Completed:** Phase-1 `pi` runtime seam with pluggable external engine delegation.
3. **Completed:** Filesystem-first runtime artifacts + retention + diagnostics endpoints.
4. **In progress:** Morning Brief lifecycle hardening and mission/action flow integration.
5. **Next likely:** Promote dry-run pi-mono bridge to live provider defaults in target environments.
6. **Next likely:** Add scheduled retention execution (cron/endpoint orchestration) beyond in-traffic runs.

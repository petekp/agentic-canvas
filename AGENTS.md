# Agent Workflows & Commands

This file is for coding agents working in the Agentic Canvas repo. It captures the **current workflows** and the **tool/CLI commands** you should use.

## Start Here (Order Matters)

1. `AGENT_CHANGELOG.md` — recent decisions, deprecations, and new features.
2. `.claude/plans/primitives-spec-v0.1.md` — canonical types and command shapes.
3. `.claude/plans/component-schemas-v0.1.md` — component config and data schemas.
4. `.claude/plans/store-architecture-v0.1.md` — how Zustand slices compose.
5. `.claude/plans/template-primitives-v0.1.md` — template generation system.

## New Workflows (2026-02)

### 1) Space-first workflow (task isolation)

Use **spaces** as task-specific canvases. A space is the unit you create/switch/pin.

- `create_space` to start a focused workspace (optionally with components).
- `switch_space` to hop between tasks.
- `pin_space` to keep important spaces around.
- `unpin_space` to allow cleanup (unpinned spaces can be auto-cleaned after 7 days).

### 2) Template generation workflow

Use templates for multi-component layouts and repeated patterns.

- `generate_template` to create a layout from a registered template.
- Templates live in `src/lib/templates/*`.
- Template selection/params are inferred from state signals; prefer templates over ad-hoc multi-adds.

### 3) Filter + transform workflow

Filters and transforms enable targeted insights without custom UI work.

- `add_filtered_component` to add a component with per-source filters.
- `create_transform` to register a reusable JS transform:
  - Accepts `data` and **must return** transformed data.
  - Attach to component bindings to reshape API results.
- Use transforms for Slack mention filtering when search API isn’t available.

### 4) Slack lookup workflow

Slack mentions often need user IDs.

- `lookup_slack_user` to resolve display names/handles to Slack IDs.
- Mentions require **User OAuth token (xoxp-)**; bot tokens cannot use search.

### 5) Tool execution workflow (assistant-ui)

Tools execute via assistant-ui’s native tool system.

- Tool definitions live in `src/lib/canvas-tools.tsx`.
- Use `makeAssistantTool` + `frontendTools()`; do not add custom tool executors.

### 6) Shape Up workflow (planning & delivery)

Use Shape Up for significant changes and feature work. Keep artifacts in `.claude/`.

- Existing projects: start by mapping the CURRENT system (breadboard) before framing change.
- Flow: **Frame → Shape → Breadboard → Slice → Build**.
- Use `/shaping` for framing and requirements/shape fit checks; use `/breadboarding` for affordances, wiring, and slicing.
- `shaping.md` is the source of truth; spikes go in `spike-*.md`.
- Create per-slice plans as `V[N]-plan.md` and update `big-picture.md` after each slice.

### 7) Telemetry workflow (headless debugging)

Agents should use telemetry logs to understand system behavior without a browser.

- Logs are JSONL at `.claude/telemetry/agentic-canvas.log`
- Live tail: `tail -f .claude/telemetry/agentic-canvas.log`
- Filter: `rg "tool\\.add_component|api\\.chat" .claude/telemetry/agentic-canvas.log`
- Inspect last events: `curl "http://localhost:3000/api/telemetry?limit=200"`
- Override log path: set `TELEMETRY_LOG_PATH` in `.env.local`
- Standard filter helper: `./scripts/query-telemetry.sh --level error --limit 50`
- Event prefixes to grep:
  - `api.*` (API routes)
  - `tool.*` (assistant tool execution)
  - `store.data.*`, `store.rules.*` (data fetch + rules)
  - `store.canvas.*` (component mutations)
  - `store.undo.*` (undo/redo + batching)
  - `store.audit.*` (audit log append/persist)

Quick queries:

```bash
# Last 50 errors
tail -n 200 .claude/telemetry/agentic-canvas.log | rg "\"level\":\"error\"" | tail -n 50

# Tool calls for preference rules
rg "\"source\":\"tool\\.set_preference_rules\"" .claude/telemetry/agentic-canvas.log | tail -n 20

# Data fetch failures and cache misses
rg "\"source\":\"store\\.data\"" .claude/telemetry/agentic-canvas.log | rg "fetch_error|fetch_start" | tail -n 50
```

## Tool Commands (assistant-facing)

**Canvas edits**

- `add_component`
- `remove_component`
- `move_component`
- `resize_component`
- `update_component`
- `clear_canvas` (supports `preserve_pinned`)

**Spaces**

- `create_space`
- `switch_space`
- `pin_space`
- `unpin_space`

**Templates / filters / transforms**

- `generate_template`
- `add_filtered_component`
- `create_transform`

**Slack helpers**

- `lookup_slack_user`

## Dev Commands

Use `pnpm` (preferred; lockfile present).

```bash
pnpm install
pnpm dev
pnpm test     # vitest
pnpm lint
pnpm build
pnpm start
```

## Environment Variables

Copy `.env.example` → `.env.local` and fill what you need.

Required:
- `OPENAI_API_KEY`
- `SUPERMEMORY_API_KEY` (for memory + insights)

Optional (feature-specific):
- `GITHUB_TOKEN`
- `SLACK_BOT_TOKEN`
- `SLACK_USER_TOKEN` (needed for Slack mentions)
- `VERCEL_TOKEN`
- `VERCEL_PROJECT_ID`
- `VERCEL_TEAM_ID`

## Practical Reminders

- Prefer **spaces** for each task to keep context clean.
- Use templates and filters before custom tool logic.
- All tool work should route through `src/lib/canvas-tools.tsx`.

# Agent Changelog

> This file helps coding agents understand project evolution, key decisions,
> and deprecated patterns. Updated: 2026-02-01

## Current State Summary

Agentic Canvas is a **working v0.1 implementation** with canvas + chat interface, AI-powered component manipulation, saved views with tabs, and an assistant-driven view management system. The assistant can create, switch, and manage views on behalf of users. Views are ephemeral by default with user pinning for persistence.

## Stale Information Detected

| Location | States | Reality | Since |
|----------|--------|---------|-------|
| AGENT_CHANGELOG.md (previous) | "No code has been written yet" | Full implementation exists | 2026-01-30 |
| Trajectory section (previous) | "Next: Scaffold Next.js project" | Project fully scaffolded and functional | 2026-01-30 |

## Timeline

### 2026-02-01 - Assistant-Driven View Management (uncommitted)

**What changed:** Implemented ephemeral view system where:
- Views have `pinned`, `createdBy`, `createdAt` fields
- Assistant can create views via `create_view` tool
- Assistant can navigate via `switch_view` tool
- Assistant can pin/unpin via `pin_view`, `unpin_view` tools
- Unpinned assistant-created views auto-cleanup after 7 days
- UI shows pin indicator and AI-created indicator on tabs

**Why:** Canvas views should be ephemeral workspaces the assistant creates on demand. Users pin views they want to keep.

**Agent impact:**
- Use `create_view` to create focused, task-specific workspaces
- Proactively create views when starting new topics/tasks
- Views include current components in system prompt context
- Memory service stores insight feedback for learning

**Files modified:**
- `src/types/index.ts` - Extended View interface
- `src/store/workspace-slice.ts` - Added view management actions
- `src/app/api/chat/route.ts` - Added view tools
- `src/lib/tool-executor.ts` - Added view tool handlers
- `src/lib/ai-tools.ts` - Updated system prompt
- `src/components/canvas/ViewTabs.tsx` - Added pin indicators

**New file:**
- `src/app/api/memory/feedback/route.ts` - Server-side API for memory operations

---

### 2026-01-31 - Canvas-Aware AI Assistant

**What changed:** (commit 0b2c01c)
- Assistant receives full canvas context in system prompt
- Tool executor bridges AI tool calls to store actions
- AssistantProvider component wraps chat with canvas awareness

**Why:** Assistant needs to understand current canvas state to give relevant suggestions and manipulate components.

**Agent impact:**
- Canvas context automatically injected into prompts
- Tool executor handles all AI tool execution
- AssistantProvider manages chat state and tool execution

---

### 2026-01-31 - Snapshot-Based Undo/Redo System

**What changed:** (commits ac55486, c7e9341, 8b7dea2)
- Replaced command-based undo with snapshot-based system
- Undo/redo preserves view context for cross-view navigation
- Removed legacy history-slice, integrated into canvas-slice

**Why:** Command-based approach was complex and error-prone. Snapshots are simpler and more reliable.

**Agent impact:**
- Don't use `HistorySlice` - it no longer exists
- Undo/redo is integrated into `CanvasSlice`
- `UndoEntry` contains full canvas snapshots, not commands
- View context preserved - undo navigates to correct view

**Deprecated:**
- `history-slice.ts` - deleted
- `HistoryAction`, `UndoEntry` with commands - replaced with snapshots

---

### 2026-01-31 - Saved Views with Tabs UI

**What changed:** (commits 918e63f, 4199915)
- View tabs appear above canvas
- Click to switch, double-click to rename
- Right-click context menu for duplicate/delete
- Views persist across sessions via localStorage

**Why:** Users need to save and switch between different canvas configurations.

**Agent impact:**
- Use `useViews()` hook for view operations
- Views stored in `WorkspaceSlice`
- `loadView()`, `saveCurrentView()`, `deleteView()` available

---

### 2026-01-30 - Chat Interface with AI Tools

**What changed:** (commit 1f16a23)
- Chat panel with message history
- AI-powered component manipulation
- Tools: `add_component`, `move_component`, `resize_component`, `remove_component`, `update_component`

**Why:** Core feature - conversational interface for canvas manipulation.

**Agent impact:**
- Use Vercel AI SDK v6 patterns (see CLAUDE.md)
- Tools use snake_case naming
- Tool definitions in `src/lib/ai-tools.ts`

---

### 2026-01-30 - Initial Implementation

**What changed:** (commits f972776 through 9a8a878)
- Next.js 15 + React 19 + TypeScript scaffold
- Zustand store with canvas, workspace, data slices
- react-grid-layout for drag & drop
- Component renderers for all 4 GitHub components
- Mock data source

**Why:** Implement the v0.1 specifications.

**Agent impact:**
- Reference spec docs for detailed contracts
- All state through Zustand store
- Mock data, not real GitHub API

---

## Deprecated Patterns

| Don't | Do Instead | Since |
|-------|------------|-------|
| Use `history-slice.ts` | Undo/redo is in canvas-slice | 2026-01-31 |
| Use command-based undo | Use snapshot-based undo | 2026-01-31 |
| Use `ComponentState` | Use `DataLoadingState` | v0.1.1 |
| Store computed fields | Derive at render time | v0.1.0 |
| Create `list_components` tool | Inject via `CanvasContext` | v0.1.1 |
| Call memory service from client | Use `/api/memory/*` routes | 2026-02-01 |

## Key Documents

| Document | Purpose | Authority Level |
|----------|---------|-----------------|
| `CLAUDE.md` | Project setup, patterns, AI SDK notes | **Authoritative** for development |
| `.claude/plans/store-architecture-v0.1.md` | Zustand slices, hooks, middleware | Reference (partially implemented) |
| `.claude/plans/component-schemas-v0.1.md` | Component configs, data shapes | Reference |
| `.claude/plans/primitives-spec-v0.1.md` | Core types, commands, protocols | Reference |

## Trajectory

The project has a working v0.1 implementation. Next steps:

1. **Current:** Assistant-driven view management (in progress, uncommitted)
2. **Next:** Proactive insights system - assistant monitors data and surfaces notifications
3. **Then:** Real GitHub API integration (replacing mock data)
4. **Then:** User authentication and multi-user support
5. **Future:** Additional data sources beyond GitHub

# Agent Changelog

> This file helps coding agents understand project evolution, key decisions,
> and deprecated patterns. Updated: 2026-02-01

## Current State Summary

Agentic Canvas is a **working v0.1 implementation** with canvas + chat interface, AI-powered component manipulation, saved views with tabs, assistant-driven view management, and multi-source data integrations. Supports GitHub (stats, PRs, issues, activity, commits, team analysis), PostHog analytics, and Slack (channel activity, thread watch). The assistant creates ephemeral, task-focused views and provides proactive insights based on data patterns.

## Stale Information Detected

| Location | States | Reality | Since |
|----------|--------|---------|-------|
| `CLAUDE.md` file structure | Lists `history-slice.ts` | File deleted, undo/redo in canvas-slice | 2026-01-31 |
| `CLAUDE.md` file structure | Lists `mock-github.ts` | Real GitHub API via `/api/github` route | 2026-01-31 |

## Timeline

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
- Tool executor in `src/lib/tool-executor.ts`

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

## Data Sources

| Source | Route | Components |
|--------|-------|------------|
| GitHub | `/api/github` | stat-tile, pr-list, issue-grid, activity-timeline, my-activity, commits, team-activity |
| PostHog | `/api/posthog` | site-health, property-breakdown, top-pages |
| Slack | `/api/slack` | channel-activity, mentions*, thread-watch |

*mentions requires user token, not bot token

## Environment Variables

```bash
OPENAI_API_KEY=        # Required for AI
GITHUB_TOKEN=          # For GitHub API
GITHUB_REPO=           # owner/repo format
GITHUB_USERNAME=       # For personal filters
POSTHOG_API_KEY=       # For PostHog
POSTHOG_PROJECT_ID=    # PostHog project
SLACK_BOT_TOKEN=       # xoxb-... token
```

## Trajectory

Current trajectory based on recent commits:

1. **Completed:** Multi-source data (GitHub, PostHog, Slack)
2. **Completed:** Commit analysis and team activity insights
3. **Next likely:** Real-time updates / WebSocket support
4. **Future:** User authentication, multi-user support
5. **Future:** Additional data sources (Linear, Jira, etc.)

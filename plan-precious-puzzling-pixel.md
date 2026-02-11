# Morning Briefing Implementation Plan

## Context

The user wants to make Agentic Canvas indispensable for OSS maintainers by building a "Morning Briefing" — the first feature that proves the "AI chief of staff" thesis. When triggered, it guides the user through picking their repos, Slack channels, and Vercel projects, then creates a new space with 6 tiles showing PRs, issues, deploys, team activity, Slack mentions, and AI-generated recommendations. The brainstorm is at `.claude/brainstorms/2026-02-08-morning-briefing-brainstorm.md`.

---

## Phased Approach

### Phase 1 (MVP): `generate_briefing` tool + guided setup + new component

The goal is a working end-to-end flow: user says "set up my morning briefing" → guided picker UI in chat → new space with 6 tiles auto-populated with live data.

### Phase 2 (Enhancement): AI narrative + cross-source correlation

Add the `/api/briefing` aggregator that fetches all sources, generates an LLM-powered narrative, and powers the recommendations tile with real cross-source intelligence.

---

## Phase 1 Implementation Steps

### Step 0: Make the briefing tile renderable in MVP

**File:** `src/store/data-slice.ts`

Add a lightweight client-side `briefing` data source that returns a static `BriefingRecommendationsData` payload. Without this, `briefing.recommendations` stays in `idle` state and never renders. This is the Phase 1 bridge until `/api/briefing` ships in Phase 2.

### Step 1: Add `user_repos` query type to GitHub API

**File:** `src/app/api/github/route.ts`

Add a `user_repos` case in the query type switch that calls **POST** `/user/repos?per_page=50&sort=updated&type=all`. Returns `[{ fullName, description, isPrivate, updatedAt }]`. This powers the repo picker in the guided setup. If `GITHUB_TOKEN` is missing, return a clear error because `/user/repos` requires auth.

### Step 2: Add `project_list` query type to Vercel API

**File:** `src/app/api/vercel/route.ts`

Add a `project_list` case that calls **POST** `/v9/projects?limit=20` (include `teamId` when present). Returns `[{ id, name, framework }]`. Powers the Vercel project picker.

### Step 3: Create the `briefing.recommendations` component

**New file:** `src/components/canvas/renderers/BriefingRecommendationsContent.tsx`

A new renderer that displays a structured AI digest. For Phase 1 MVP, this shows a static welcome message with instructions ("Your briefing space is set up! Ask me to catch you up."). In Phase 2 it'll show the LLM-generated narrative.

Data shape (add to `src/components/canvas/renderers/types.ts`):

```typescript
export interface BriefingRecommendationsData {
  summary: string;
  sinceLabel: string;
  sections: Array<{
    title: string;
    items: Array<{
      icon: "pr" | "issue" | "deploy" | "slack" | "alert";
      text: string;
      priority: "high" | "medium" | "low";
      actionUrl?: string;
    }>;
  }>;
  generatedAt: number;
}
```

Follow the `TeamActivityContent.tsx` pattern: functional component, props `{ data, componentId }`, scrollable card with sections. If `data` is missing or incomplete, show a static fallback message so the MVP always renders.

### Step 4: Register the new component

**Files to modify:**

- `src/lib/component-registry.ts`:
  - Add to `CONTENT_RENDERERS`: `"briefing.recommendations": lazy(() => import("..."))`
  - Add new category to `CategoryConfig` union type and `CATEGORIES`: `{ id: "briefing", label: "Briefing", icon: Sparkles }`
  - Add to `COMPONENT_TYPES`: `{ typeId: "briefing.recommendations", label: "AI Recommendations", category: "briefing", config: {}, size: { cols: 6, rows: 4 }, queryType: "recommendations" }`

- `src/lib/canvas-defaults.ts`:
  - Add to `DEFAULT_SIZES`: `"briefing.recommendations": { cols: 6, rows: 4 }`
  - Add to `DEFAULT_BINDINGS`: `"briefing.recommendations": { source: "briefing", query: { type: "recommendations", params: {} }, refreshInterval: 300000 }`

- `src/lib/canvas-context.ts`:
  - Add `TYPE_METADATA` entry for `"briefing.recommendations"`
  - Add summarize/extract branches for the new type
  - Add to `getAvailableComponentTypes()` for system prompt completeness

- `src/lib/canvas-tools.tsx`:
  - Expand `CONFIG_TO_PARAMS_FIELDS` to include GitHub + Vercel keys so repo/project selections actually reach the API. (e.g., `github.pr-list` → `repo`, `state`, `filter`, `limit`; `vercel.deployments` → `projectId`, `teamId`, `limit`, `state`).

### Step 5: Create the `generate_briefing` tool with guided setup

**File:** `src/lib/canvas-tools.tsx`

This is the core implementation. The tool follows the `create_space` + `AddFilteredComponentToolUI` patterns.

**Tool definition (`generateBriefingToolDef`):**

```typescript
parameters: z.object({
  name: z.string().optional().describe("Space name (default: 'Morning Briefing')"),
})
```

The execute function always returns `{ success: true, needsSetup: true }` to trigger the guided UI — the actual space creation happens in the render component's confirmation handler (same pattern as `AddFilteredComponentToolUI`).

**Render component (`GenerateBriefingToolUI`):**

Multi-step wizard using `AsyncOptionList` with state machine:

```
Step 1: GitHubRepoPicker (multi-select)
  → POST /api/github { type: "user_repos" }
  → User picks repos
Step 2: SlackMentionsPicker (single-select, optional skip)
  → Uses SlackUserPicker (requires Slack user token)
  → If user token missing, skip Slack or offer fallback to channel-activity + transform
Step 3: VercelProjectPicker (single-select, optional skip)
  → POST /api/vercel { type: "project_list" }
  → User picks project or skips
Step 4: Confirmation handler creates the space
```

**Confirmation handler (after all steps):**

1. `store.startBatch(source, "AI: generate_briefing")`
2. `store.createEmptySpace({ name, createdBy: "assistant", switchTo: true })`
3. Add components with explicit positions on a 12-col grid (or via a briefing template), skipping optional tiles when integrations are missing:

```
Row 0: briefing.recommendations (col:0, 6x4) | vercel.deployments (col:6, 6x3)
Row 3:                                        | github.team-activity (col:6, 6x5)
Row 4: github.pr-list (col:0, 4x4)  | github.issue-grid (col:4, 4x4, if 2+ repos)
       OR github.pr-list (col:0, 6x4, if 1 repo)
Row 4:                                        | slack.mentions (col:8, 4x4, if Slack configured)
```

Each component gets config from the user's selections:
- `github.pr-list`: `{ repo: selectedRepos[0], state: "open", filter: "review_requested" }`
- `github.issue-grid`: `{ repo: selectedRepos[0], state: "open" }`
- `github.team-activity`: `{ repo: selectedRepos[0], timeWindow: "7d" }`
- `slack.mentions`: `{ userId: selectedSlackUserId, limit: 10 }` (only when Slack user token is present)
- `vercel.deployments`: `{ projectId: selectedProjectId, teamId?: selectedTeamId, limit: 10 }`
- `briefing.recommendations`: `{ repos: selectedRepos, slackUserId: selectedSlackUserId, vercelProjectId: selectedProjectId }`

4. `store.commitBatch()`

**Helper components to create:**
- `GitHubRepoPicker`: Uses `AsyncOptionList` fetching from `/api/github?type=user_repos`
- `VercelProjectPicker`: Uses `AsyncOptionList` fetching from `/api/vercel?type=project_list`
- Reuse existing `SlackUserPicker` (already in canvas-tools.tsx)
- Optional: reuse `SlackChannelPicker` for fallback channel-activity if Slack user token is unavailable

### Step 6: Register tool and update system prompt

**Files to modify:**

- `src/lib/canvas-tools.tsx`: Add `<GenerateBriefingTool />` to the `CanvasTools()` component
- `src/lib/ai-tools.ts`:
  - Add `generate_briefing` to `getToolDefinitions()` with schema
  - Add section to system prompt: "Use generate_briefing when the user asks for a morning briefing, daily digest, dashboard setup, or 'catch me up'. It guides them through selecting repos, channels, and projects."

---

## Phase 2 Implementation Steps (After Phase 1 ships)

### Step 7: Create `/api/briefing` aggregator route

**New file:** `src/app/api/briefing/route.ts`

Accepts `{ since, repos, slackChannels, vercelProject, generateNarrative }`. Fetches all sources in parallel via `Promise.allSettled`, aggregates results, optionally calls OpenAI to generate the `BriefingRecommendationsData` narrative.

### Step 8: Wire up temporal filtering

Use `Space.lastVisitedAt` (already tracked) as the `since` timestamp. On first visit, default to 24 hours ago. The briefing component stores `sinceTimestamp` in its config for data binding.

### Step 9: Store briefing config on Space

Add optional `briefingConfig` to the `Space` type in `src/types/index.ts`:
```typescript
briefingConfig?: { repos: string[]; slackChannels: Array<{id:string;name:string}>; vercelProject?: string }
```
This allows re-fetching on subsequent visits without re-running setup.

---

## File Summary

**New files (Phase 1):**
1. `src/components/canvas/renderers/BriefingRecommendationsContent.tsx` — AI recommendations renderer

**Modified files (Phase 1):**
2. `src/app/api/github/route.ts` — Add `user_repos` query type
3. `src/app/api/vercel/route.ts` — Add `project_list` query type
4. `src/components/canvas/renderers/types.ts` — Add `BriefingRecommendationsData`
5. `src/lib/component-registry.ts` — Register `briefing.recommendations` + new category
6. `src/lib/canvas-defaults.ts` — Add default size + binding
7. `src/lib/canvas-context.ts` — Add context metadata for new type
8. `src/lib/canvas-tools.tsx` — Add `generate_briefing` tool + `GitHubRepoPicker` + `VercelProjectPicker` + guided setup UI (largest change)
9. `src/lib/ai-tools.ts` — Add tool schema + system prompt update

**New files (Phase 2):**
10. `src/app/api/briefing/route.ts` — Aggregator API

**Modified files (Phase 2):**
11. `src/types/index.ts` — Add `briefingConfig` to Space

---

## Verification

1. **Unit tests:** add/adjust tests for the new `briefing` data source + `user_repos`/`project_list` helpers
2. **Build check:** `pnpm build` — no type errors
3. **Dev test:** `pnpm dev` → open app → type "Set up my morning briefing" in chat
4. **Guided flow:** Verify repo picker loads, Slack user picker loads (if Slack user token present), Vercel picker loads
5. **Space creation:** Confirm new space created with tiles, each fetching live data or showing fallback
6. **Component rendering:** Each tile shows data (or graceful loading/error states)
7. **Undo:** Ctrl+Z undoes the entire briefing creation as one batch

# Spaces Navigation

**Status:** Planning
**Version:** 0.2

## Summary

Replace the tab-based view navigation with a **Spaces grid** as the app's landing page. The grid itself is a "meta-dashboard" — surfacing key metrics from all spaces at a glance. Users manage their spaces (formerly "views") from this grid, clicking into individual spaces to work on their canvas.

## Key Decisions

| Decision | Choice |
|----------|--------|
| Space = View? | Yes, renamed. Same snapshot concept. |
| Default view | Conditional: new users → grid, returning users → last space |
| Space creation | Multiple methods: click '+' AND assistant-driven |
| Card content | Smart rollup of space contents (metrics, status). Malleable design for future enhancements. |
| Navigation | Hybrid: URL routing (`/spaces/:id`) with SPA transitions |
| Persistence | localStorage (device-specific, works offline) |
| Chat on grid | Same floating panel, with space-management commands |
| In-space nav | Remove tab bar. Icon button in header to return to grid. |
| Grid layout | Responsive: 2 columns mobile, 3 tablet, 4 desktop |
| Empty state | Assistant-driven onboarding: chat opens asking "What would you like to track?" |
| Migration | Clean slate. Clear localStorage, everyone starts fresh. |
| Delete UX | Confirmation modal. Deletion is undoable via undo/redo system. |
| Card data | Background refresh + cache: show cached immediately, update in background. |
| Cross-space insights | Yes. Assistant can aggregate data across all spaces on the grid. |
| Sort order | Most recently visited first (dynamic reordering). |

## Architecture Changes

### New Routes

```
/                    → Spaces grid (or redirect to last space)
/spaces              → Spaces grid (explicit)
/spaces/:id          → Individual space canvas
```

### State Changes

**Rename throughout codebase:**
- `View` → `Space`
- `ViewId` → `SpaceId`
- `views` → `spaces`
- `activeViewId` → `activeSpaceId`
- `ViewTabs` → removed (replaced by grid)

**New state fields:**
```typescript
interface SpacesSlice {
  spaces: Space[];
  activeSpaceId: SpaceId | null;
  lastVisitedSpaceId: SpaceId | null;  // For "return to last space"

  // Actions
  createSpace: (name?: string) => SpaceId;
  deleteSpace: (spaceId: SpaceId) => void;
  renameSpace: (spaceId: SpaceId, name: string) => void;
  duplicateSpace: (spaceId: SpaceId) => SpaceId;
  enterSpace: (spaceId: SpaceId) => void;
  exitSpace: () => void;
}
```

**Persistence config update:**
```typescript
partialize: (state) => ({
  spaces: state.spaces,
  lastVisitedSpaceId: state.lastVisitedSpaceId,
  // ... existing canvas persistence
})
```

### New Components

```
src/components/
├── spaces/
│   ├── SpacesGrid.tsx        # Grid of space cards
│   ├── SpaceCard.tsx         # Individual card with metrics preview
│   ├── CreateSpaceCard.tsx   # '+' button card
│   └── SpaceCardMenu.tsx     # Context menu (rename, duplicate, delete)
├── canvas/
│   ├── Canvas.tsx            # (modified) Remove ViewTabs, add back button
│   └── CanvasHeader.tsx      # New: space name + back button
```

### AI Tools Updates

**New tools for grid context:**
- `create_space` — Create a new space with optional name and initial components
- `delete_space` — Delete a space by ID
- `rename_space` — Rename a space
- `list_spaces` — List all spaces with summaries (for AI context)

**Context awareness:**
- System prompt should indicate whether user is on grid or in a space
- Canvas manipulation tools only available when inside a space
- Space management tools available everywhere

### Smart Defaults for Card Content

When a space has components with data bindings, show key metrics:

| Component Type | Default Metric |
|---------------|----------------|
| PR List | "X open PRs" |
| Issue Grid | "X open issues" |
| Stat Tile | The stat value itself |
| Site Health | "X visitors this week" |
| Generic | Component count |

Cards also show:
- Space name (editable inline)
- Last edited timestamp
- "AI" badge if created by assistant

## Implementation Phases

### Phase 1: Rename & Restructure
1. Rename `View` → `Space` throughout codebase
2. Update types, store slices, hooks
3. Keep existing functionality working

### Phase 2: Add Routing
1. Set up Next.js dynamic routes (`/spaces/[id]`)
2. Add `enterSpace` / `exitSpace` actions
3. Implement conditional redirect logic on `/`

### Phase 3: Build Spaces Grid
1. Create `SpacesGrid` component
2. Create `SpaceCard` with basic info
3. Create `CreateSpaceCard` with '+' button
4. Add context menu for space management

### Phase 4: Persistence
1. Update Zustand persist config to include spaces
2. Add `lastVisitedSpaceId` tracking
3. Test refresh behavior

### Phase 5: Card Metrics
1. Extract key metrics from space snapshots
2. Optionally fetch live data for previews (with caching)
3. Make card content configurable per space

### Phase 6: AI Integration
1. Add space management tools
2. Update system prompt with context awareness
3. Test assistant creating/managing spaces from grid

## Files to Modify

| File | Changes |
|------|---------|
| `src/types/index.ts` | Rename View → Space, add new fields |
| `src/store/workspace-slice.ts` | Rename to spaces-slice.ts, add new actions |
| `src/store/index.ts` | Update slice imports, persistence config |
| `src/hooks/index.ts` | `useViews` → `useSpaces`, add `useCurrentSpace` |
| `src/app/page.tsx` | Conditional render: grid or redirect |
| `src/app/spaces/[id]/page.tsx` | New: individual space page |
| `src/components/canvas/Canvas.tsx` | Remove ViewTabs, add header with back button |
| `src/lib/ai-tools.ts` | Add space management tools, context awareness |

## Files to Create

| File | Purpose |
|------|---------|
| `src/components/spaces/SpacesGrid.tsx` | Grid container |
| `src/components/spaces/SpaceCard.tsx` | Individual card |
| `src/components/spaces/CreateSpaceCard.tsx` | '+' creation card |
| `src/components/spaces/SpaceCardMenu.tsx` | Context menu |
| `src/components/canvas/CanvasHeader.tsx` | Space name + back button |
| `src/app/spaces/page.tsx` | Explicit grid route |
| `src/app/spaces/[id]/page.tsx` | Space canvas route |

## Files to Delete

| File | Reason |
|------|--------|
| `src/components/canvas/ViewTabs.tsx` | Replaced by SpacesGrid |

## Open Questions

1. **Space limits**: Should we limit number of spaces? (Performance with background refresh)
2. **Stale data indicator**: How to show when card metrics are stale vs fresh?
3. **Error states**: What happens if background refresh fails for a space card?

## UX Details

### Grid Layout
- **Responsive columns**: 2 on mobile (<640px), 3 on tablet (640-1024px), 4 on desktop (>1024px)
- **Card size**: Uniform height, width fills column
- **Gap**: 16px between cards (matches canvas grid gap)

### Empty State (New Users)
When no spaces exist:
1. Chat panel opens automatically
2. Assistant sends: "Welcome! What would you like to track? I can help you create a space for PRs, site analytics, team updates, or anything else."
3. Single "Create your first space" card shown as placeholder
4. User can respond to assistant OR click the card to create manually

### Back Navigation (In-Space)
- Icon button in top-left of canvas header (home/grid icon)
- Tooltip: "Back to Spaces"
- Keyboard shortcut: `Cmd+Shift+H` or `Escape` (when not in chat)

### Delete Confirmation
- Modal with: "Delete '{space name}'? This will remove all components in this space."
- Buttons: "Cancel" (secondary) | "Delete" (destructive)
- Deletion creates undo entry — user can undo immediately after

### Card Metrics (Meta-Dashboard)
Each card shows a "smart rollup" of its contents:
- **Primary metric**: Most important number from the space (e.g., "5 open PRs")
- **Secondary info**: Component count, last updated, or status indicator
- **Data freshness**: Subtle indicator if data is >5 min old

Data loading:
1. On grid mount, show cached metrics immediately
2. Kick off background refresh for all spaces
3. Update cards as fresh data arrives
4. Show loading shimmer only if no cached data exists

### Cross-Space Insights
When on grid, assistant has access to:
- List of all spaces with their names and component summaries
- Aggregated metrics across spaces (total open PRs, total visitors, etc.)
- Ability to suggest: "You have 12 PRs needing review across 3 spaces. Want me to show them all?"

### Sort Order
- Spaces ordered by `lastVisitedAt` timestamp (most recent first)
- "Create new space" card always appears last
- No manual reordering in v0.2

## Out of Scope (v0.2)

- Server-side persistence / cross-device sync
- Space sharing / collaboration
- Space templates
- Space folders / organization
- Space search / filtering
- Manual drag-to-reorder spaces
- Pinned spaces
- Visual thumbnail previews of canvas layout

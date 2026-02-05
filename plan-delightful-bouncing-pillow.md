# Spaces Navigation Implementation Plan

**Feature:** Replace tab-based view navigation with a Spaces grid landing page
**Status:** Ready for implementation

## Summary

Transform the current in-memory View system into a persistent Spaces system with:
- Grid-based landing page (meta-dashboard with live metrics)
- URL routing (`/spaces/:id`) with SPA transitions
- localStorage persistence
- Cross-space assistant insights

---

## Phase 1: Foundation - Rename + Persistence

**Goal:** Make spaces survive page refresh without breaking existing functionality.

### 1.1 Type Renames

**File:** `src/types/index.ts`

```typescript
// Rename ViewId → SpaceId (keep alias for transition)
export type SpaceId = string;
export type ViewId = SpaceId; // Deprecated alias

// Rename View → Space, add fields
export interface Space {
  id: SpaceId;
  name: string;
  description?: string;
  snapshot: Canvas;
  triggerIds: TriggerId[];
  pinned: boolean;
  createdBy: "user" | "assistant";
  createdAt: number;
  updatedAt: number;
  lastVisitedAt: number;  // NEW: for recency sorting
}

// Rename payloads
export interface SaveSpacePayload { ... }
export interface CreateSpaceOptions { ... }
```

### 1.2 Store Changes

**File:** `src/store/workspace-slice.ts`

Renames:
- `workspace.views[]` → `workspace.spaces[]`
- `activeViewId` → `activeSpaceId`
- All methods: `saveView` → `saveSpace`, `loadView` → `loadSpace`, etc.

New state:
```typescript
lastSpaceId: SpaceId | null;  // For conditional entry
```

Update `loadSpace()` to set `lastVisitedAt: Date.now()` on the space.

**File:** `src/store/index.ts`

Expand persist config:
```typescript
partialize: (state) => ({
  canvas: { grid: state.canvas.grid, components: state.canvas.components.map(...) },
  workspace: {
    spaces: state.workspace.spaces.map(s => ({
      ...s,
      snapshot: { ...s.snapshot, components: s.snapshot.components.map(c => ({ ...c, dataState: { status: "idle" } })) }
    })),
    settings: state.workspace.settings,
  },
  activeSpaceId: state.activeSpaceId,
  lastSpaceId: state.lastSpaceId,
}),
```

### 1.3 Hook Updates

**File:** `src/hooks/index.ts`

```typescript
// New hook (rename from useViews)
export function useSpaces() { ... }

// Keep old hook with deprecation warning
/** @deprecated Use useSpaces instead */
export function useViews() { return useSpaces(); }
```

### 1.4 Files to Modify
- `src/types/index.ts`
- `src/store/workspace-slice.ts`
- `src/store/index.ts`
- `src/hooks/index.ts`
- `src/components/canvas/ViewTabs.tsx` (update imports, will delete in Phase 2)

### 1.5 Verification
- Run `npm run dev`, add components, refresh page
- Components should persist
- Create a space, refresh, space should still exist

---

## Phase 2: URL Routing

**Goal:** Add `/spaces/:id` routes while keeping SPA feel.

### 2.1 Route Structure

```
src/app/
├── page.tsx              # Redirect logic (→ /spaces or /spaces/:lastId)
├── spaces/
│   ├── page.tsx          # Spaces grid
│   └── [id]/
│       └── page.tsx      # Space canvas
```

### 2.2 Entry Point Redirect

**File:** `src/app/page.tsx`

```typescript
"use client";
export default function Home() {
  const { spaces, lastSpaceId } = useSpaces();
  const router = useRouter();

  useEffect(() => {
    if (spaces.length === 0) {
      router.replace('/spaces');  // New user → grid with onboarding
    } else if (lastSpaceId) {
      router.replace(`/spaces/${lastSpaceId}`);  // Return user → last space
    } else {
      router.replace('/spaces');  // Has spaces but no last → grid
    }
  }, [spaces.length, lastSpaceId, router]);

  return <div className="h-screen flex items-center justify-center">Loading...</div>;
}
```

### 2.3 Spaces Grid Page

**New file:** `src/app/spaces/page.tsx`

```typescript
"use client";
export default function SpacesPage() {
  return (
    <main className="relative h-screen overflow-hidden">
      <SpacesGrid />
      <ChatPanel />
    </main>
  );
}
```

### 2.4 Space Canvas Page

**New file:** `src/app/spaces/[id]/page.tsx`

```typescript
"use client";
export default function SpacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { loadSpace, activeSpaceId } = useSpaces();

  useEffect(() => {
    if (id !== activeSpaceId) {
      loadSpace(id);
    }
  }, [id, activeSpaceId, loadSpace]);

  return (
    <main className="relative h-screen overflow-hidden">
      <Canvas />
      <ChatPanel />
    </main>
  );
}
```

### 2.5 Navigation Hook

**New file:** `src/hooks/useSpaceNavigation.ts`

```typescript
export function useSpaceNavigation() {
  const router = useRouter();
  const { loadSpace } = useSpaces();

  const navigateToSpace = useCallback((spaceId: string) => {
    loadSpace(spaceId);
    router.push(`/spaces/${spaceId}`);
  }, [loadSpace, router]);

  const navigateToGrid = useCallback(() => {
    router.push('/spaces');
  }, [router]);

  return { navigateToSpace, navigateToGrid };
}
```

### 2.6 Files to Create
- `src/app/spaces/page.tsx`
- `src/app/spaces/[id]/page.tsx`
- `src/hooks/useSpaceNavigation.ts`

### 2.7 Files to Modify
- `src/app/page.tsx` (rewrite as redirect)

### 2.8 Verification
- Navigate to `/spaces` → see grid (empty for now)
- Navigate to `/spaces/space_abc123` → see canvas
- Browser back/forward should work
- Refresh on `/spaces/:id` should reload that space

---

## Phase 3: Spaces Grid UI

**Goal:** Create the meta-dashboard with live metrics.

### 3.1 Component Structure

```
src/components/spaces/
├── SpacesGrid.tsx        # Grid container + empty state
├── SpaceCard.tsx         # Individual card with metrics
├── SpaceCardMenu.tsx     # Context menu (rename, duplicate, delete)
├── CreateSpaceCard.tsx   # '+' button card
├── DeleteSpaceDialog.tsx # Confirmation modal
└── SpaceMetrics.tsx      # Metrics display within card
```

### 3.2 SpacesGrid

```typescript
export function SpacesGrid() {
  const { spaces } = useSpaces();
  const sortedSpaces = useMemo(
    () => [...spaces].sort((a, b) => b.lastVisitedAt - a.lastVisitedAt),
    [spaces]
  );

  if (spaces.length === 0) {
    return <SpacesEmptyState />;
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-6">Spaces</h1>
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {sortedSpaces.map(space => (
          <SpaceCard key={space.id} space={space} />
        ))}
        <CreateSpaceCard />
      </div>
    </div>
  );
}
```

### 3.3 SpaceCard

Shows:
- Space name
- Component count
- Primary metric (e.g., "5 open PRs" for PR List components)
- Last visited timestamp
- Pinned indicator
- "AI" badge if `createdBy === "assistant"`

### 3.4 Empty State with Assistant Onboarding

When `spaces.length === 0`:
- Show centered prompt: "Welcome! Create your first space"
- Chat panel opens automatically with greeting
- Single large "Create Space" button

### 3.5 Delete Confirmation

Modal with:
- "Delete '{spaceName}'?"
- "This will remove all components in this space."
- Cancel / Delete buttons
- Deletion creates undo entry (undoable)

### 3.6 Files to Create
- `src/components/spaces/SpacesGrid.tsx`
- `src/components/spaces/SpaceCard.tsx`
- `src/components/spaces/SpaceCardMenu.tsx`
- `src/components/spaces/CreateSpaceCard.tsx`
- `src/components/spaces/DeleteSpaceDialog.tsx`
- `src/components/spaces/SpaceMetrics.tsx`
- `src/components/spaces/SpacesEmptyState.tsx`

### 3.7 Verification
- Grid shows 2/3/4 columns based on viewport
- Cards sorted by recency
- Click card → navigate to space
- Create new space → appears in grid
- Delete space → confirmation → removed from grid
- Undo after delete → space restored

---

## Phase 4: Canvas Header + Remove Tabs

**Goal:** Replace ViewTabs with simple header + back button.

### 4.1 Canvas Header

**New file:** `src/components/canvas/CanvasHeader.tsx`

```typescript
export function CanvasHeader() {
  const { navigateToGrid } = useSpaceNavigation();
  const { activeSpaceId, spaces, renameSpace } = useSpaces();
  const space = spaces.find(s => s.id === activeSpaceId);

  return (
    <header className="flex items-center gap-3 px-4 py-2 border-b bg-background">
      <Button variant="ghost" size="icon" onClick={navigateToGrid} title="Back to Spaces">
        <LayoutGrid className="h-4 w-4" />
      </Button>
      <EditableText
        value={space?.name ?? "Untitled"}
        onSave={(name) => activeSpaceId && renameSpace(activeSpaceId, name)}
      />
    </header>
  );
}
```

### 4.2 Update Canvas Component

**File:** `src/components/canvas/Canvas.tsx`

- Remove `<ViewTabs />` import and usage
- Add `<CanvasHeader />` at top
- Adjust grid container to account for header height

### 4.3 Files to Create
- `src/components/canvas/CanvasHeader.tsx`

### 4.4 Files to Modify
- `src/components/canvas/Canvas.tsx`

### 4.5 Files to Delete
- `src/components/canvas/ViewTabs.tsx`

### 4.6 Verification
- Inside a space: see header with back button + space name
- Click back → return to grid
- Double-click name → edit inline
- No tabs visible

---

## Phase 5: AI Integration

**Goal:** Update tools + enable cross-space insights.

### 5.1 Rename AI Tools

**File:** `src/lib/canvas-tools.tsx`

Rename tools:
- `create_view` → `create_space`
- `switch_view` → `switch_space`
- `pin_view` → `pin_space`
- `unpin_view` → `unpin_space`
- `save_view` → `save_space`
- `delete_view` → `delete_space`

Add new tool:
- `list_spaces` — Returns summary of all spaces (for grid context)

### 5.2 System Prompt Updates

**File:** `src/lib/ai-tools.ts`

Update `createSystemPrompt()`:
- Replace "view" with "space" throughout
- Add context awareness: is user on grid or in a space?
- When on grid: include cross-space summary
- When in space: include current space context only

### 5.3 Cross-Space Context

**File:** `src/lib/canvas-context.ts`

Add function:
```typescript
export function serializeSpacesContext(spaces: Space[]): string {
  // Returns: "You are on the Spaces grid. User has 3 spaces: ..."
  // Include metrics summary across all spaces
}
```

### 5.4 ChatPanel Updates

**File:** `src/components/chat/ChatPanel.tsx`

Pass `currentView: 'grid' | 'space'` to API based on current route.

### 5.5 API Route Updates

**File:** `src/app/api/chat/route.ts`

- Accept `currentView` in request body
- Adjust system prompt based on context

### 5.6 Verification
- On grid: ask "What spaces do I have?" → assistant lists all
- On grid: ask "Create a space for PR tracking" → creates space
- In space: ask "Switch to [other space]" → navigates
- In space: assistant doesn't see other spaces unless asked

---

## Phase 6: Polish

**Goal:** Clean slate migration, metrics, finishing touches.

### 6.1 Clean Slate Migration

On first load with new system:
- Clear old localStorage key if exists
- Start fresh with empty spaces

### 6.2 Background Metrics Refresh

- On grid load: show cached metrics immediately
- Kick off background fetch for each space's data
- Update cards as data arrives

### 6.3 Keyboard Shortcuts

- `Cmd+Shift+H` or `Escape` (when not in input): Return to grid
- Remove old view-switching shortcuts (`Cmd+1-9`)

---

## File Summary

### Files to Create
| File | Purpose |
|------|---------|
| `src/app/spaces/page.tsx` | Grid route |
| `src/app/spaces/[id]/page.tsx` | Space route |
| `src/hooks/useSpaceNavigation.ts` | Navigation hook |
| `src/components/spaces/SpacesGrid.tsx` | Grid container |
| `src/components/spaces/SpaceCard.tsx` | Card component |
| `src/components/spaces/SpaceCardMenu.tsx` | Context menu |
| `src/components/spaces/CreateSpaceCard.tsx` | Create button |
| `src/components/spaces/DeleteSpaceDialog.tsx` | Delete modal |
| `src/components/spaces/SpaceMetrics.tsx` | Metrics display |
| `src/components/spaces/SpacesEmptyState.tsx` | Empty state |
| `src/components/canvas/CanvasHeader.tsx` | Header with back |

### Files to Modify
| File | Changes |
|------|---------|
| `src/types/index.ts` | Rename View → Space |
| `src/store/workspace-slice.ts` | Rename methods, add persistence fields |
| `src/store/index.ts` | Expand persist config |
| `src/hooks/index.ts` | useViews → useSpaces |
| `src/app/page.tsx` | Rewrite as redirect |
| `src/components/canvas/Canvas.tsx` | Remove ViewTabs, add header |
| `src/lib/canvas-tools.tsx` | Rename AI tools |
| `src/lib/ai-tools.ts` | Update system prompt |
| `src/lib/canvas-context.ts` | Add spaces context |
| `src/components/chat/ChatPanel.tsx` | Pass currentView |
| `src/app/api/chat/route.ts` | Accept currentView |

### Files to Delete
| File | Reason |
|------|--------|
| `src/components/canvas/ViewTabs.tsx` | Replaced by grid |

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Breaking localStorage | Clean slate = intentional. Users start fresh. |
| Broken bookmarks to `/` | Root redirects intelligently, no 404s |
| Old tool names in chat history | Keep aliases during transition |
| Performance with many spaces | Defer: virtualize grid if needed |

---

## Verification Checklist

After each phase, verify:

- [ ] `npm run dev` starts without errors
- [ ] TypeScript compiles (`npm run typecheck`)
- [ ] Existing tests pass
- [ ] Manual smoke test of affected features

End-to-end test after all phases:
- [ ] New user: sees empty grid with onboarding
- [ ] Create space via assistant → appears in grid
- [ ] Click space → navigate to canvas
- [ ] Add components → persist on refresh
- [ ] Back to grid → see metrics
- [ ] Delete space → confirm → undo works
- [ ] Browser back/forward works
- [ ] Deep link to `/spaces/:id` works

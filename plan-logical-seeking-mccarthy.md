# Make the Assistant Canvas-Aware

## Summary

Enhance the AI assistant with full canvas awareness so it can reason about components, data, recent changes, and provide proactive insights.

## Current State

The codebase already has:
- `canvas-context.ts` with `serializeCanvasContext()` and `describeCanvas()` for metric extraction
- `ai-tools.ts` with `createSystemPrompt(canvas)` that includes canvas description
- `ChatPanel.tsx` passes canvas state in request body
- `undo-slice.ts` has `getUndoHistory(limit)` returning entries with source, description, timestamp
- `workspace-slice.ts` has views and `activeViewId`

## What's Missing

1. **Recent changes** not included in AI context
2. **View awareness** hardcoded in `createWorkspaceContext()`
3. **Proactive greeting** on first load
4. **Position quadrant** awareness for spatial context

## Implementation Plan

### Phase 1: Enhance Canvas Context (`src/lib/canvas-context.ts`)

Add new types and functions:

```typescript
// New exports
export interface RecentChange {
  description: string;
  source: "user" | "assistant" | "background" | "system";
  timeAgo: string;
}

export function formatRecentChanges(
  undoHistory: EnhancedUndoEntry[],
  limit?: number
): RecentChange[];

export function getPositionQuadrant(
  col: number,
  row: number,
  gridCols: number,
  gridRows: number
): "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center";
```

- Modify `summarizeComponent()` to include position quadrant in summary
- Modify `createWorkspaceContext()` to accept actual view info as params

### Phase 2: Enhance System Prompt (`src/lib/ai-tools.ts`)

Update `createSystemPrompt()` signature:

```typescript
interface SystemPromptContext {
  canvas: Canvas;
  activeViewName?: string;
  recentChanges?: RecentChange[];
}

export function createSystemPrompt(context: SystemPromptContext): string;
```

Add new sections to system prompt:
- **Active View** section showing current view name
- **Recent Activity** section with last 5 changes and who made them
- **Proactive Guidelines** encouraging the AI to notice patterns

### Phase 3: Create Proactive Greeting (`src/lib/ai/proactive-greeting.ts`)

New file with:

```typescript
export interface GreetingContent {
  greeting: string;
  insights: string[];
  suggestedActions?: string[];
}

export function generateGreeting(
  components: ComponentInstance[],
  recentChanges: RecentChange[]
): GreetingContent;

export function formatGreetingMessage(content: GreetingContent): string;
```

Logic:
- Time-based greeting (morning/afternoon/evening)
- Component-based insights (high PR count, traffic trends, pending reviews)
- Recent activity insights (AI made X changes)

### Phase 4: Integrate in ChatPanel (`src/components/chat/ChatPanel.tsx`)

Add:

```typescript
// Get undo history and view info
const undoHistory = useStore((s) => s.getUndoHistory(10));
const activeViewId = useStore((s) => s.activeViewId);
const views = useStore((s) => s.workspace.views);

// Format recent changes
const recentChanges = useMemo(
  () => formatRecentChanges(undoHistory, 5),
  [undoHistory]
);

// Get active view name
const activeViewName = useMemo(() => {
  const view = views.find((v) => v.id === activeViewId);
  return view?.name ?? null;
}, [views, activeViewId]);

// Pass enhanced context in body
const handleSend = useCallback(
  (content: string) => {
    sendMessage(
      { text: content },
      {
        body: { canvas, recentChanges, activeViewName },
      }
    );
  },
  [sendMessage, canvas, recentChanges, activeViewName]
);

// Proactive greeting on first load
const [hasGreeted, setHasGreeted] = useState(false);
useEffect(() => {
  if (!hasGreeted && canvas.components.length > 0) {
    const greeting = generateGreeting(canvas.components, recentChanges);
    // Display via initial assistant message or UI element
    setHasGreeted(true);
  }
}, [hasGreeted, canvas.components, recentChanges]);
```

### Phase 5: Update API Route (`src/app/api/chat/route.ts`)

Update `ChatRequest` interface:

```typescript
interface ChatRequest {
  messages: UIMessage[];
  canvas: Canvas;
  recentChanges?: RecentChange[];
  activeViewName?: string;
}
```

Update system prompt call:

```typescript
const systemPrompt = createSystemPrompt({
  canvas,
  activeViewName,
  recentChanges,
});
```

## Files to Modify

1. `src/lib/canvas-context.ts` - Add `formatRecentChanges()`, `getPositionQuadrant()`, update `createWorkspaceContext()`
2. `src/lib/ai-tools.ts` - Update `createSystemPrompt()` signature and add new sections
3. `src/components/chat/ChatPanel.tsx` - Get undo history, format changes, add greeting
4. `src/app/api/chat/route.ts` - Accept enhanced context, pass to system prompt

## Files to Create

1. `src/lib/ai/proactive-greeting.ts` - Greeting generation logic

## Verification

1. Run `npm run dev` and open the app
2. Add a few components to the canvas
3. Open chat - should see context-aware greeting
4. Ask "What's on my canvas?" - AI should describe components with metrics
5. Ask "Anything I should focus on?" - AI should provide insights based on data
6. Make some changes via AI, then ask "What changed recently?" - should show recent activity

## Example Interactions

After implementation:

**User:** "What's on my canvas?"
**AI:** "You have 5 components in your 'Daily Dashboard' view: My PRs (3 open) in the top-left, PRs to Review (2 waiting) next to it, Site Health showing 847 visitors this week in the center, and two stat tiles in the bottom area."

**User:** "What changed recently?"
**AI:** "In the last hour: I added a PR List and Site Health widget, you moved the stat tile to the bottom, and I resized the Issue Grid."

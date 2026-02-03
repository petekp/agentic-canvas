# Refactor: Use assistant-ui Native Tool Handling

## Problem

The app freezes when tools are called because of a custom `ToolExecutionHandler` that:
- Manually subscribes to assistant-ui state with O(n²) message scanning
- Fights against the framework's native tool handling
- Creates race conditions and synchronous mutations during microtask processing

## Solution

Use assistant-ui's native `makeAssistantTool` pattern which:
- Automatically executes tools when invoked by the AI
- Handles the complete tool lifecycle
- Eliminates the need for custom subscription code

## Implementation Plan

### Phase 1: Create canvas-tools.tsx

Create `/src/lib/canvas-tools.tsx` with all 10 tools using `makeAssistantTool`:

```typescript
import { makeAssistantTool } from "@assistant-ui/react";
import { useStore } from "@/store";
import { createAssistantSource } from "@/lib/undo/types";
// ... tool definitions with execute + render
```

Each tool will:
1. Access store via `useStore.getState()` (imperative, not reactive)
2. Wrap mutations in `startBatch/commitBatch` for undo attribution
3. Return success/error status
4. Render inline UI showing the action taken

### Phase 2: Update Server Route

Modify `/src/app/api/chat/route.ts`:

1. Import `frontendTools` from assistant-ui
2. Remove the 10 `execute` functions from tool definitions (keep only schema/description)
3. Pass tools through `frontendTools(tools)` to receive client definitions

```typescript
import { frontendTools } from "@assistant-ui/react-ai-sdk";

// Tool definitions become schema-only (no execute)
const toolDefinitions = {
  add_component: {
    description: "...",
    inputSchema: z.object({...}),
  },
  // ... other tools
};

// In streamText call:
tools: frontendTools(toolDefinitions),
```

### Phase 3: Update ChatPanel.tsx

1. Remove the entire `ToolExecutionHandler` component (~130 lines)
2. Import and mount tool components from canvas-tools.tsx
3. Keep `KeyboardShortcutHandler` and `PendingChatMessageHandler`

```typescript
import { CanvasTools } from "@/lib/canvas-tools";

export function ChatPanel() {
  return (
    <AssistantProvider>
      <CanvasTools />  {/* Tools execute themselves */}
      <KeyboardShortcutHandler />
      <PendingChatMessageHandler />
      {/* ... rest of UI */}
    </AssistantProvider>
  );
}
```

### Phase 4: Update AssistantThread.tsx

Remove `tools.by_name` from `MessagePrimitive.Parts` since tools now render themselves:

```typescript
<MessagePrimitive.Parts
  components={{
    Text: TextPart,
    // Remove: tools: { by_name: {...} }
  }}
/>
```

### Phase 5: Cleanup

Delete deprecated files:
- `/src/components/chat/tool-uis.tsx` - functionality moved to canvas-tools.tsx
- `/src/lib/tool-executor.ts` - functionality moved to canvas-tools.tsx

## Files Changed

| File | Action |
|------|--------|
| `/src/lib/canvas-tools.tsx` | CREATE - All tools with execute + render |
| `/src/app/api/chat/route.ts` | MODIFY - Use frontendTools, remove execute |
| `/src/components/chat/ChatPanel.tsx` | MODIFY - Remove ToolExecutionHandler, mount tools |
| `/src/components/chat/AssistantThread.tsx` | MODIFY - Remove tools.by_name |
| `/src/components/chat/tool-uis.tsx` | DELETE |
| `/src/lib/tool-executor.ts` | DELETE |

## Tools to Implement

1. `add_component` - Add component to canvas
2. `remove_component` - Remove component by ID
3. `move_component` - Move component to new position
4. `resize_component` - Resize component
5. `update_component` - Update config/label/pinned
6. `clear_canvas` - Clear all (optionally preserve pinned)
7. `create_view` - Create new view with components
8. `switch_view` - Switch to existing view
9. `pin_view` - Pin view to keep it
10. `unpin_view` - Unpin view

## Testing Strategy

1. Verify each tool executes correctly when AI calls it
2. Verify undo/redo still works (batch attribution)
3. Verify no app freezes during tool execution
4. Verify tool UIs render inline in messages

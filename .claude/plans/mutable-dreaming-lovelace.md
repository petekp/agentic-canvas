# Refactor: Use assistant-ui Native Tool Handling

## Problem

The app freezes when tools are called because of a custom `ToolExecutionHandler` in `ChatPanel.tsx` that:
- Manually subscribes to assistant-ui state with O(n²) message scanning
- Fights against the framework's native tool handling
- Creates race conditions and synchronous mutations during microtask processing

## Solution

Use assistant-ui's native `makeAssistantTool` pattern which:
- Automatically executes tools when invoked by the AI
- Handles the complete tool lifecycle
- Eliminates the need for custom subscription code

## Implementation Steps

### Step 1: Create /src/lib/canvas-tools.tsx

Create new file with all 10 tools using `makeAssistantTool`:

Each tool will:
1. Access store via `useStore.getState()` (imperative, not reactive)
2. Wrap mutations in `startBatch/commitBatch` for undo attribution
3. Return success/error status
4. Render inline UI showing the action taken

Tools to implement:
- `add_component`, `remove_component`, `move_component`, `resize_component`
- `update_component`, `clear_canvas`
- `create_view`, `switch_view`, `pin_view`, `unpin_view`

### Step 2: Update /src/app/api/chat/route.ts

1. Import `frontendTools` from `@assistant-ui/react-ai-sdk`
2. Remove the `execute` functions from tool definitions (keep only schema/description)
3. Pass tools through `frontendTools(tools)` to receive client definitions

### Step 3: Update /src/components/chat/ChatPanel.tsx

1. Remove the entire `ToolExecutionHandler` component (~130 lines)
2. Import and mount `CanvasTools` component from canvas-tools.tsx
3. Keep `KeyboardShortcutHandler` and `PendingChatMessageHandler`

### Step 4: Update /src/components/chat/AssistantThread.tsx

Remove `tools.by_name` from `MessagePrimitive.Parts` components config since tools now render themselves via `makeAssistantTool`.

### Step 5: Cleanup

Delete deprecated files:
- `/src/components/chat/tool-uis.tsx`
- `/src/lib/tool-executor.ts`

## Files Summary

| File | Action |
|------|--------|
| `/src/lib/canvas-tools.tsx` | CREATE |
| `/src/app/api/chat/route.ts` | MODIFY |
| `/src/components/chat/ChatPanel.tsx` | MODIFY |
| `/src/components/chat/AssistantThread.tsx` | MODIFY |
| `/src/components/chat/tool-uis.tsx` | DELETE |
| `/src/lib/tool-executor.ts` | DELETE |

## Verification

1. Start dev server: `npm run dev`
2. Open http://localhost:3000
3. Test: "Add a stat tile showing open PRs"
4. Verify: No app freeze, tool executes, component appears on canvas
5. Test: Undo with Cmd+Z - verify component is removed
6. Test: "Create a new view called Dashboard with some PR stats"
7. Verify: View created, no freeze

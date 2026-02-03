# Chat Interface Implementation Plan

## Overview
Add a chat sidebar where an AI assistant can manipulate canvas components through natural language.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         PAGE LAYOUT                          │
├─────────────────────────────────────────────┬───────────────┤
│           CANVAS (flex-[3])                 │ CHAT (w-80)   │
│   - Existing Canvas component               │ - ChatPanel   │
│   - react-grid-layout                       │ - MessageList │
│                                             │ - ChatInput   │
└─────────────────────────────────────────────┴───────────────┘
                              │                      │
                              └──────────┬───────────┘
                                         ▼
                              ┌─────────────────────┐
                              │    ZUSTAND STORE    │
                              │  + chat slice (NEW) │
                              └─────────────────────┘
                                         │
                                         ▼
                              ┌─────────────────────┐
                              │  /api/chat (stream) │
                              │  - Canvas context   │
                              │  - Tool definitions │
                              └─────────────────────┘
```

## Tech Stack
- **Vercel AI SDK** - Streaming, tool calling, multi-provider support
- **OpenAI GPT-4** (or Anthropic Claude) - AI provider
- **Zod** - Tool parameter validation

## Files to Create

| File | Purpose |
|------|---------|
| `src/store/chat-slice.ts` | Chat messages, loading state |
| `src/lib/ai-tools.ts` | Tool definitions + system prompt |
| `src/lib/canvas-context.ts` | Serialize canvas for AI |
| `src/lib/tool-executor.ts` | Execute tool calls client-side |
| `src/app/api/chat/route.ts` | Streaming API endpoint |
| `src/components/chat/ChatPanel.tsx` | Main chat component |
| `src/components/chat/ChatMessage.tsx` | Message display |
| `src/components/chat/ChatInput.tsx` | Input with Enter to send |

## Files to Modify

| File | Change |
|------|--------|
| `src/store/index.ts` | Add chat slice |
| `src/hooks/index.ts` | Add useChat hook |
| `src/app/page.tsx` | Split layout: canvas + sidebar |

## AI Tools (snake_case per project convention)

1. `add_component` - Add component to canvas
2. `remove_component` - Remove by ID
3. `move_component` - Reposition
4. `resize_component` - Change size
5. `update_component` - Modify config
6. `clear_canvas` - Clear all (optionally preserve pinned)

## Data Flow

1. User types message → Add to chat state
2. POST to `/api/chat` with messages + canvas state
3. AI streams response, may include tool calls
4. Client executes tool calls via store actions
5. Canvas updates, tool results sent back to AI
6. AI continues or completes response

## Implementation Order

### Phase 1: Dependencies + Store
1. Install: `ai @ai-sdk/openai zod`
2. Create chat-slice.ts
3. Add to combined store

### Phase 2: API Layer
4. Create canvas-context.ts
5. Create ai-tools.ts (tools + system prompt)
6. Create tool-executor.ts
7. Create api/chat/route.ts

### Phase 3: UI
8. Create ChatPanel, ChatMessage, ChatInput
9. Update page.tsx layout

### Phase 4: Integration
10. Wire up useChat hook with tool handling
11. Test end-to-end

## Verification

1. Start dev server: `npm run dev`
2. Open http://localhost:3002
3. Type "Add a stat tile showing open PRs" in chat
4. Verify component appears on canvas
5. Type "Move it to the right side"
6. Verify component moves
7. Test undo (Cmd+Z) still works after AI actions

## Environment

Requires `.env.local`:
```
OPENAI_API_KEY=sk-...
```

# Subsystem 2: Assistant Tool Execution

## Files
- `src/lib/canvas-tools.tsx`
- `src/lib/tool-config.ts`
- `src/store/chat-slice.ts`
- `src/components/chat/ChatPanel.tsx`

### [Tool Execution] Finding 1: Slack channel inference used an unused chat store

**Severity:** High
**Type:** Bug
**Location:** `src/lib/canvas-tools.tsx` → `resolveConfigFromChat(...)`, `src/lib/tool-config.ts`

**Problem:**
Tool execution attempted to infer Slack channels from `store.chat.messages`, but the live assistant conversation is managed by assistant-ui, not the Zustand chat slice. As a result, the tool never saw the user’s “#general” reply, failed validation, and repeatedly asked for the channel. This blocked component creation and created an infinite loop of missing-config errors.

**Evidence:**
- `resolveConfigFromChat` only examined `store.chat.messages`.
- The assistant UI uses assistant-ui’s runtime thread state; the Zustand chat slice is never populated during normal tool usage.

**Recommendation:**
Sync the last user message from assistant-ui into the store and use it for config inference. This was implemented by extracting the last user text via `useAssistantState` in `CanvasTools` and storing it in `lastUserMessage`, which is then passed into `resolveConfigFromChat`.

### [Tool Execution] Finding 2: Tool errors were injected as user messages

**Severity:** High
**Type:** Design flaw
**Location:** `src/lib/canvas-tools.tsx`, `src/store/notification-slice.ts`, `src/components/chat/ChatPanel.tsx`

**Problem:**
When tools failed, `queueChatMessage` was used to surface the error, but this mechanism sends messages as *user input* via `PendingChatMessageHandler`. The assistant therefore treated tool errors as user prompts, repeated the same error text verbatim, and re-ran failing tools without new information.

**Evidence:**
- `queueChatMessage` pushes `pendingChatMessage`, which `PendingChatMessageHandler` sends via the composer (user role).
- Error text like “Ask the user for a channel name…” appeared in transcripts as if it were a user message.

**Recommendation:**
Do not inject tool failures into the user input stream. Return `{ success: false }` tool outputs and let the assistant respond normally. The tool execution flow was updated to return structured failure outputs and to stop queuing pending chat messages.

### [Tool Execution] Finding 3: Missing config errors were worded as internal instructions

**Severity:** Medium
**Type:** Design flaw
**Location:** `src/lib/canvas-tools.tsx` (`COMPONENT_REQUIRED_CONFIG`)

**Problem:**
Validation errors included internal instructions (“Ask the user…”) that can surface verbatim when the assistant mishandles tool outputs. This creates confusing UX and violates the “no raw errors” requirement.

**Evidence:**
- `COMPONENT_REQUIRED_CONFIG` messages were phrased as directives to the assistant.

**Recommendation:**
Keep error messages short and user-readable, and include any guidance in a separate `action` field in tool output. Messages were updated to be user-safe.

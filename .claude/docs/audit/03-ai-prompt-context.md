# Subsystem 3: AI Prompt + Canvas Context

## Files
- `src/lib/ai-tools.ts`
- `src/lib/canvas-context.ts`
- `src/components/chat/AssistantProvider.tsx`
- `src/app/api/chat/route.ts`

### [Prompt Accuracy] Finding 1: Slack mentions token requirement was incorrect

**Severity:** High
**Type:** Bug
**Location:** `src/lib/ai-tools.ts` (Slack Components section), `src/lib/canvas-context.ts:getAvailableComponentTypes`

**Problem:**
The system prompt and component descriptions claimed Slack mentions only require a bot token. In reality, the Slack search API requires a user OAuth token (xoxp-). This caused the assistant to repeatedly choose `slack.mentions` and fail with a predictable token error.

**Evidence:**
- Prompt text stated “Slack Components (require SLACK_BOT_TOKEN)” and did not distinguish mentions.
- Component description for `slack.mentions` claimed it required a bot token.

**Recommendation:**
Update Slack guidance to state that mentions require a user token and direct the assistant to use channel-activity + a transform when only a bot token is available. This was updated in both the system prompt and component descriptions.

### [Context Visibility] Finding 2: Error details were not included in canvas context

**Severity:** Medium
**Type:** Bug
**Location:** `src/lib/canvas-context.ts:summarizeComponent` / `describeCanvas`

**Problem:**
Components in an error state were summarized only as “error loading data,” which removed the actionable error detail from the system prompt. The assistant had no reliable way to understand why the component failed.

**Evidence:**
- `describeCanvas` emits summary + highlights, but error messages were not added to highlights or details.

**Recommendation:**
Include a concise error message in component highlights so the system prompt exposes the failure reason. This was implemented by adding an error highlight when `dataState.status === "error"`.

### [Transforms] Finding 3: Available transforms were not passed to the system prompt

**Severity:** Medium
**Type:** Design flaw
**Location:** `src/components/chat/AssistantProvider.tsx` → `src/app/api/chat/route.ts`

**Problem:**
The prompt supports an “Available Transforms” section, but `transforms` were never included in the chat request body. The assistant could not reuse existing transforms or avoid duplicates.

**Evidence:**
- `createSystemPrompt` expects `transforms`, but the chat route only passed `canvas`, `recentChanges`, `activeSpaceName`, and `spaces`.

**Recommendation:**
Send transforms in the chat request body and pass them into `createSystemPrompt`. This was added by including `transforms: state.getTransforms()` in the client body and wiring it through the chat API.

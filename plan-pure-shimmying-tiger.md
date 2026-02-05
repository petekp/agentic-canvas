# Slack Integration Plan

## Overview
Add Slack as a data source for the Agentic Canvas, enabling channel activity, mentions, and thread watch components.

## Approach: Direct Slack Web API ✓
Matches existing GitHub/PostHog patterns. Serverless-compatible, simple HTTP calls.

---

## Implementation Plan

### Files to Create
1. `src/app/api/slack/route.ts` - Slack API adapter

### Files to Modify
1. `src/store/data-slice.ts` - Add slack source routing (line 179)
2. `src/lib/tool-executor.ts` - Add DEFAULT_SIZES and DEFAULT_BINDINGS (lines 41-97)
3. `src/lib/canvas-context.ts` - Add component types for AI
4. `src/components/canvas/ComponentContent.tsx` - Add Slack renderers
5. `src/components/canvas/Canvas.tsx` - Add to dropdown menu
6. `src/app/api/chat/route.ts` - Update system prompt
7. `.env.example` - Add SLACK_BOT_TOKEN, SLACK_TEAM_ID

---

### Phase 1: API Route (`src/app/api/slack/route.ts`)

Create POST handler following github/route.ts pattern:

```typescript
// Query types:
// - channel_activity: { channelId, limit? }
// - mentions: { userId?, limit? }
// - thread_watch: { channelId, threadTs }
```

Slack Web API endpoints to use:
- `conversations.history` - channel messages
- `search.messages` - find @mentions
- `conversations.replies` - thread replies
- `conversations.list` - list channels

### Phase 2: Data Slice (`src/store/data-slice.ts`)

Add to `fetchDataFromSource` switch (line 179):
```typescript
case "slack":
  return fetchSlackData(binding);
```

Add `fetchSlackData` function following `fetchPostHogData` pattern.

### Phase 3: Tool Executor (`src/lib/tool-executor.ts`)

Add to DEFAULT_SIZES (line 41):
```typescript
"slack.channel-activity": { cols: 4, rows: 4 },
"slack.mentions": { cols: 4, rows: 3 },
"slack.thread-watch": { cols: 3, rows: 4 },
```

Add to DEFAULT_BINDINGS (line 55):
```typescript
"slack.channel-activity": {
  source: "slack",
  query: { type: "channel_activity", params: { limit: 20 } },
  refreshInterval: 60000,
},
"slack.mentions": {
  source: "slack",
  query: { type: "mentions", params: { limit: 10 } },
  refreshInterval: 60000,
},
"slack.thread-watch": {
  source: "slack",
  query: { type: "thread_watch", params: {} },
  refreshInterval: 30000,
},
```

### Phase 4: Canvas Context (`src/lib/canvas-context.ts`)

Add to TYPE_METADATA and getAvailableComponentTypes():
- slack.channel-activity
- slack.mentions
- slack.thread-watch

### Phase 5: UI Components (`src/components/canvas/ComponentContent.tsx`)

Add data interfaces:
```typescript
interface SlackMessageData {
  ts: string;
  user: string;
  text: string;
  thread_ts?: string;
  reactions?: Array<{ name: string; count: number }>;
}
```

Add content renderers:
- ChannelActivityContent
- MentionsContent
- ThreadWatchContent

Add cases to DataContent switch.

### Phase 6: Dropdown Menu (`src/components/canvas/Canvas.tsx`)

Add Slack category to componentTypes array with 3 components.

### Phase 7: System Prompt (`src/app/api/chat/route.ts`)

Add Slack section to available component types documentation.

---

## Environment Variables

```bash
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_TEAM_ID=T01234567
```

### Slack App Setup
1. Create app at api.slack.com/apps
2. Add Bot Token Scopes: channels:history, channels:read, users:read
   Note: Slack mentions require a User OAuth token (xoxp-) with search:read. Bot tokens cannot use the search API.
3. Install to workspace
4. Copy Bot User OAuth Token

---

## Verification

1. Set up Slack app and configure tokens
2. Test: "Show me recent messages from #general"
3. Test: "Create a view with my PRs and the engineering Slack channel"
4. Verify cross-source correlation works

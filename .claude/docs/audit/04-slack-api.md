# Subsystem 4: Slack API Route

## Files
- `src/app/api/slack/route.ts`

### [Slack API] Finding 1: Mentions token failure surfaced as generic 500

**Severity:** Low
**Type:** Design flaw
**Location:** `src/app/api/slack/route.ts:fetchMentions`

**Problem:**
When the Slack search API rejects bot tokens (`not_allowed_token_type`), the route throws an error that is returned as HTTP 500. The client receives the message, but the status code is indistinguishable from server failures, which limits downstream error classification.

**Evidence:**
- `fetchMentions` throws a descriptive error string, which is caught by the route handler and returned with status 500 for any error.

**Recommendation:**
Return a 403 or 400 status for token-type errors so clients can map to `DataErrorCode.FORBIDDEN` and avoid retrying. This is optional if message-based handling is sufficient.

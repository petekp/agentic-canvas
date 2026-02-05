# Subsystem 1: Data Fetching + Cache + Transforms

## Files
- `src/store/data-slice.ts`

### [Data Fetching] Finding 1: Pending fetch dedupe returns early and hides errors

**Severity:** High
**Type:** Bug
**Location:** `src/store/data-slice.ts:fetchData`

**Problem:**
`fetchData` previously used a `Set` to track in-flight requests and returned immediately when a fetch was already pending. Tool callers awaited `fetchData`, assumed completion, then checked `dataState` before the real fetch finished. This meant errors (like Slack mentions token failures) were not observed and the assistant never reacted.

**Evidence:**
- `pendingFetches` was a `Set`, and the function returned early on `has(cacheKey)` without waiting for completion.
- Tool callers in `src/lib/canvas-tools.tsx` await `fetchData` and then check `dataState` for errors.

**Recommendation:**
Store pending fetches as promises and return the same promise for concurrent requests so callers wait for completion. This was implemented by converting `pendingFetches` to `Map<string, Promise<void>>` and returning the in-flight promise.

### [Transforms] Finding 2: Cache key ignores transform ID

**Severity:** Medium
**Type:** Bug
**Location:** `src/store/data-slice.ts:generateCacheKey`

**Problem:**
Cache keys only include `source`, `query.type`, and `query.params`. When two components share a binding but use different transforms, the first transform result is cached and reused for the second component. This produces incorrect transformed output and makes transforms non-deterministic across components.

**Evidence:**
- `generateCacheKey` does not include `binding.transformId`.
- Cached values store *transformed* data, not raw data.

**Recommendation:**
Include `transformId` in the cache key (e.g., `transformId ?? "none"`) or cache raw data and apply transforms per component. Either fix restores correctness when multiple transforms share the same source binding.

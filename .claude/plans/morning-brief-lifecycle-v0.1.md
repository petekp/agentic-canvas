# Your Morning Brief Lifecycle Spec

**Status:** Proposed for implementation
**Version:** 0.1
**Last Updated:** 2026-02-11

> **Implementation guidance update (2026-02-12):**
> For active rewrite work, treat `agentic-canvas-v2` artifacts and `.claude/docs/rewrite-onboarding-v1.md`
> as canonical execution guidance. This lifecycle document remains useful for product intent and state model,
> but it is no longer the primary implementation playbook for the v2 vertical loop.

## 1) Product intent

`Your Morning Brief` is a system-managed, pinned space that orients the user to the highest-leverage mission for the day, grounded in cross-source evidence (GitHub, Slack, PostHog, plus any enabled source).

Design principle:

- Orientation first, execution second.
- Morning Brief decides *what matters now*.
- Project/task spaces execute the work.

## 2) Spaces model integration

### 2.1 Space kinds

Add a space kind discriminator.

```ts
type SpaceKind =
  | "system.morning_brief"
  | "mission"
  | "project"
  | "ad_hoc";
```

### 2.2 Space metadata

```ts
interface SpaceMeta {
  kind: SpaceKind;
  pinned: boolean;
  systemManaged: boolean;
  createdBy: "assistant" | "user";
  createdAt: number;
  updatedAt: number;
  lastVisitedAt?: number;
}
```

### 2.3 Morning Brief placement rules

- Exactly one active `system.morning_brief` space per workspace.
- It is pinned by default and appears first in the spaces grid.
- First session of local day: route to Morning Brief unless user disabled auto-open.
- Morning Brief space is not deleted by cleanup jobs.

## 3) Component contract

Morning Brief should be represented by one first-class component type:

- `system.morning-brief`

```ts
type DataSource =
  | "github"
  | "slack"
  | "posthog"
  | "vercel"
  | "custom";

interface EvidenceItem {
  id: string;
  source: DataSource;
  entity: string;          // repo/channel/project/etc
  metric: string;          // e.g. "open_prs", "blocker_mentions"
  valueText: string;       // rendered value, e.g. "9"
  valueNumber?: number;
  observedAt: string;      // ISO8601
  freshnessMinutes: number;
  link?: string;
  confidence: "low" | "medium" | "high";
}

interface MissionStatement {
  id: string;
  title: string;           // e.g. "Stabilize release readiness for Project X"
  rationale: string;       // one concise paragraph
  owner: string;           // user or team
  horizon: "today" | "this_week";
  priorityScore: number;   // 0-100
}

interface Lever {
  id: string;
  label: string;           // e.g. "Reassign PR reviewers"
  actionType:
    | "notify"
    | "create_space"
    | "update_component"
    | "open_link"
    | "manual";
  actionPayload?: Record<string, unknown>;
  expectedImpact: string;  // plain language expected outcome
  impactScore: number;     // 0-100
  confidence: "low" | "medium" | "high";
}

interface Assumption {
  id: string;
  text: string;
  reason: "missing_data" | "stale_data" | "conflict" | "insufficient_sample";
  sourceScope: DataSource[];
}

interface MorningBriefVersion {
  version: number;
  generatedAt: string;
  generatedBy: "assistant";
  mission: MissionStatement;
  evidence: EvidenceItem[];
  levers: Lever[];
  assumptions: Assumption[];
  confidence: "low" | "medium" | "high";
  freshnessSummary: string;
}

interface MorningBriefComponentData {
  current: MorningBriefVersion;
  history: Pick<MorningBriefVersion, "version" | "generatedAt" | "mission" | "confidence">[];
  state: MorningBriefLifecycleState;
  userOverrides: MorningBriefOverride[];
}
```

## 4) Lifecycle state machine

```ts
type MorningBriefLifecycleState =
  | "drafted"              // assistant generated candidate
  | "presented"            // shown to user
  | "accepted"             // user accepted mission explicitly or via action
  | "activated"            // one or more levers executed/spawned
  | "monitoring"           // watching outcomes
  | "reframed"             // mission changed due to user or new evidence
  | "resolved"             // mission achieved or deprioritized
  | "archived";            // retained for history
```

Transition rules:

- `drafted -> presented`: component rendered in Morning Brief space.
- `presented -> accepted`: user clicks `Accept mission` or executes any lever.
- `presented -> reframed`: user disagrees or assistant detects strong evidence shift.
- `accepted -> activated`: first actionable lever executed.
- `activated -> monitoring`: actions complete and metrics tracked.
- `monitoring -> reframed`: delta evidence invalidates current mission.
- `monitoring -> resolved`: success criteria reached or user marks done.
- `resolved -> archived`: after retention period or new daily brief supersedes.

## 5) Proactive trigger policy

### 5.1 Trigger types

```ts
type MorningBriefTriggerType =
  | "schedule.morning"
  | "event.risk_spike"
  | "event.blocker"
  | "event.behavior_drop"
  | "staleness"
  | "user.request_refresh";
```

### 5.2 Trigger schema

```ts
interface MorningBriefTrigger {
  id: string;
  type: MorningBriefTriggerType;
  enabled: boolean;
  minIntervalMinutes: number;
  coolDownMinutes: number;
  lastFiredAt?: string;
  criteria: Record<string, unknown>;
}
```

### 5.3 Default trigger rules

- `schedule.morning`
  - fire at user local 08:00 (configurable)
  - once per day
- `event.risk_spike`
  - fire when composite risk increases >= 20 points within 2 hours
- `event.blocker`
  - fire when blocker signal count crosses threshold (default 3)
- `event.behavior_drop`
  - fire when primary product metric drops >= 10% day-over-day
- `staleness`
  - fire when current brief evidence age > 180 minutes
- `user.request_refresh`
  - always fire immediately

Guardrails:

- Do not auto-fire twice inside cooldown window.
- If user has snoozed, suppress all non-critical triggers until snooze expiry.
- If confidence remains `low` across 2 consecutive refreshes, switch to `suggest-only` mode.

## 6) Mission disagreement and override model

### 6.1 Override actions

```ts
type MorningBriefOverrideType =
  | "accept"
  | "reframe"
  | "deprioritize"
  | "not_my_responsibility"
  | "replace_objective"
  | "snooze";

interface MorningBriefOverride {
  id: string;
  type: MorningBriefOverrideType;
  createdAt: string;
  actor: "user";
  note?: string;
  payload?: Record<string, unknown>;
}
```

### 6.2 UI controls (must exist)

- `Accept mission`
- `Reframe mission`
- `Lower priority`
- `Not my responsibility`
- `Use different objective`
- `Snooze`

### 6.3 Behavior rules

- Any override is appended to `userOverrides` and applied on next brief generation.
- `not_my_responsibility` lowers ranking for matching mission class for 7 days.
- `replace_objective` sets hard constraint for next generation cycle.
- `snooze` suppresses proactive refresh events until expiry.

## 7) Mission-space creation policy

Morning Brief does **not** always create new spaces.

Create a new `mission` space only when all are true:

1. No existing `project`/`mission` space has match score >= 0.70.
2. Mission horizon is `today` or `this_week` and has >= 2 actionable levers.
3. At least one lever has `actionType` in `{create_space, update_component, notify}`.

Otherwise:

- Link and route user to highest-scoring existing space.

### 7.1 Matching function (v1)

```ts
interface SpaceMatchFeatures {
  nameSimilarity: number;      // 0..1
  tagOverlap: number;          // 0..1
  sourceOverlap: number;       // 0..1
  componentCoverage: number;   // 0..1
  recencyBoost: number;        // 0..1
}

// default weighted score
score =
  0.30 * nameSimilarity +
  0.20 * tagOverlap +
  0.25 * sourceOverlap +
  0.15 * componentCoverage +
  0.10 * recencyBoost
```

## 8) Rendering contract

The component renders exactly these sections:

1. `Today's Mission`
2. `Why It Matters Now`
3. `Top Levers`
4. `Expected Impact`
5. `Assumptions & Confidence`

Rules:

- Every claim in sections 1-4 must be backed by at least one `EvidenceItem`.
- Evidence references must be clickable when `link` is available.
- If any source used in rationale is stale (>180 minutes), add explicit stale marker.

## 9) Eval alignment (v0.3 targets)

Add eval fields after v0.2:

```json
{
  "required_levers": 2,
  "claim_evidence_alignment": true,
  "evidence_freshness_max_age_minutes": 180,
  "must_allow_override_actions": [
    "reframe",
    "deprioritize",
    "replace_objective",
    "snooze"
  ]
}
```

Minimum pass conditions for Morning Brief cases:

- includes all 5 required sections
- >=2 actionable levers
- explicit assumptions when data is missing/stale/conflicting
- every major recommendation grounded to evidence

## 10) Implementation slices

### Slice A: Types + store wiring

- Add `SpaceKind` + `SpaceMeta` extensions to space model.
- Add `MorningBriefComponentData` schema and runtime validator.
- Add lifecycle + override types.

### Slice B: Morning Brief generator

- Build generator that outputs `MorningBriefVersion` from cross-source inputs.
- Attach evidence links, freshness, confidence, and assumptions.

### Slice C: Triggers + scheduling

- Register default trigger set.
- Add cooldown/snooze enforcement.
- Fire generator to refresh current brief.

### Slice D: UI + actions

- Add `system.morning-brief` renderer with required sections.
- Add override controls and state transitions.
- Add route/entry behavior for first-open-of-day.

### Slice E: Eval coverage

- Extend eval schema for `required_levers`, `claim_evidence_alignment`, `evidence_freshness_max_age_minutes`.
- Add Morning Brief-specific edge cases.

## 11) Non-goals for this version

- Multi-user/shared brief ownership.
- Background autonomous execution of high-risk actions.
- Cross-device synchronized notification center.

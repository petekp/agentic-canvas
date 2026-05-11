# Morning Brief Output Schema v0.2

Last updated: 2026-02-12
Status: Proposed implementation contract

## Purpose

Define the target Morning Brief output contract for User 0:

- top 3 priorities max
- highest impact first
- hypothesis-first recommendations + explicit verification
- moderate evidence with progressive disclosure
- cross-source synthesis across GitHub, Slack, PostHog, and Vercel

This complements:

- `.claude/plans/morning-brief-lifecycle-v0.1.md` (state machine + lifecycle)
- `.claude/plans/user0-morning-brief-profile-v0.1.md` (personalized behavior requirements)

## Design Constraints

1. Orientation first, execution second.
2. Recommendations must be shareable with stakeholders.
3. Avoid single-source over-indexing.
4. Never hide uncertainty; show confidence + plain-language certainty.
5. Assistant proposes best hypotheses first, then asks for verification.

## Input Envelope (Source-Agnostic)

```ts
type MorningBriefSource = "github" | "slack" | "posthog" | "vercel" | "memory" | "custom";

interface SourceReadiness {
  source: MorningBriefSource;
  available: boolean;
  freshnessMinutes?: number;
  error?: string;
}

interface SourceSignal {
  id: string;
  source: MorningBriefSource;
  metric: string;
  entity: string;
  value: number | string | boolean;
  direction?: "up" | "down" | "flat";
  observedAt: string; // ISO8601
  confidence: number; // 0-1
  link?: string;
  tags?: string[];
}
```

## Output Contract (v0.2)

```ts
interface MorningBriefV2 {
  meta: {
    generatedAt: string; // ISO8601
    window: { todayStart: string; now: string; weekStart: string };
    profileId: "user0";
    rankingPolicy: "highest_impact_first";
    maxPriorities: 3;
  };

  mission: {
    title: string;
    whyNow: string;
    confidenceScore: number; // 0-100
    certainty: "low" | "medium" | "high";
  };

  priorities: PriorityItem[]; // length <= 3
  correlations: CorrelationStory[];
  actionDirectory: ActionDirectory;
  weeklyCheckin: WeeklyCheckinPrep;
  assumptions: AssumptionItem[];
  verification: VerificationPrompt[];
  evidence: EvidenceRecord[];
  sourceReadiness: SourceReadiness[];
}

interface PriorityItem {
  id: string;
  rank: 1 | 2 | 3;
  title: string;
  recommendation: string; // what to do
  approach: string; // how to do it
  whyHighestImpact: string;
  horizon: "today" | "this_week";
  scores: {
    impact: number; // 0-100
    urgency: number; // 0-100
    ownershipFit: number; // 0-100
    confidence: number; // 0-100
    composite: number; // 0-100
  };
  certainty: "low" | "medium" | "high";
  ownershipHypothesis: {
    likelyOwner: "me" | "team" | "shared" | "unknown";
    rationale: string;
    needsVerification: boolean;
  };
  relatedEvidenceIds: string[];
  primaryActions: BriefAction[]; // 1-3
}

interface CorrelationStory {
  id: string;
  headline: string;
  claim: string;
  sources: MorningBriefSource[];
  relatedEvidenceIds: string[];
  confidenceScore: number; // 0-100
  certainty: "low" | "medium" | "high";
}

interface BriefAction {
  id: string;
  label: string;
  app: "github" | "slack" | "posthog" | "vercel" | "workspace" | "custom";
  type:
    | "open_link"
    | "create_space"
    | "switch_space"
    | "send_message_draft"
    | "create_task"
    | "manual";
  payload?: Record<string, unknown>;
  expectedOutcome: string;
}

interface ActionDirectory {
  availableNow: Array<{
    app: string;
    actions: string[];
  }>;
  suggestedSetup: Array<{
    app: string;
    missingAction: string;
    value: string;
    setupHint: string;
  }>;
}

interface WeeklyCheckinPrep {
  ready: boolean;
  bullets: string[]; // stakeholder-shareable bullets
  gaps: string[];
}

interface VerificationPrompt {
  id: string;
  prompt: string;
  appliesToPriorityId?: string;
  reason: "ownership_uncertain" | "conflicting_signals" | "low_confidence" | "missing_context";
}

interface AssumptionItem {
  id: string;
  text: string;
  impact: "low" | "medium" | "high";
  relatedSource: MorningBriefSource;
}

interface EvidenceRecord {
  id: string;
  source: MorningBriefSource;
  entity: string;
  metric: string;
  valueText: string;
  observedAt: string;
  freshnessMinutes: number;
  confidenceScore: number; // 0-100
  link?: string;
}
```

## Progressive Disclosure Levels

Level 0 (default, one screen):

- mission
- top 3 priorities
- confidence/certainty
- one-line why now

Level 1 (expand priority):

- approach guidance
- ownership hypothesis
- primary actions
- related correlation stories

Level 2 (deep evidence):

- raw evidence list
- source freshness and assumptions
- verification prompts and unresolved conflicts

## Ranking Model (v0.2)

For each candidate priority:

```text
composite =
  0.45 * impact +
  0.20 * urgency +
  0.20 * ownershipFit +
  0.15 * confidence
```

### Impact Inputs (examples)

- GitHub: blocked review queue, critical PR/issue labels, alpha-critical checklist items
- Slack: blocker language, stakeholder urgency, repeated escalation threads
- PostHog: regressions/opportunities tied to active workstreams
- Vercel: deployment failures/risk concentration

### Ownership Fit Inputs

- Repo/app/workstream match to User 0 active areas
- Prior overrides (`not_my_responsibility`) lower score
- Unknown ownership cannot exceed 60 ownershipFit without verification

### Guardrails

1. Single-source candidates are capped at `composite <= 70` unless corroborated.
2. `certainty=high` requires:
   - at least 2 sources, and
   - no unresolved high-impact conflict.
3. If ownership is uncertain:
   - include verification prompt,
   - set `needsVerification=true`.

## Hypothesis-First Flow

For each priority:

1. Present best recommendation hypothesis.
2. Include why it likely belongs to User 0.
3. Ask one targeted verification question when uncertainty is material.

Example:

- Hypothesis: "Prioritize Tool UI installation path improvements this morning."
- Verification prompt: "Is reducing install friction still the top KPI for this week?"

## Friday Check-In Preparation Contract

`weeklyCheckin.bullets` must be concise, stakeholder-shareable, and rationale-backed.

Template:

1. What moved this week.
2. Why it mattered.
3. What is next.
4. What help/risk remains.

## Minimal Valid Response Rules

A valid Morning Brief v0.2 must include:

1. `mission`
2. `priorities` with length `1..3`
3. `evidence` with at least 3 records unless source readiness shows outages
4. `sourceReadiness`
5. `verification` when any priority has uncertain ownership or low confidence

## Mapping to Current Runtime

Current runtime `MorningBriefComponentData` can carry most of this shape but requires extension for:

- `actionDirectory`
- `weeklyCheckin`
- `verification`
- richer per-priority scoring breakdown
- structured `sourceReadiness`

Implementation can phase this in while preserving existing renderer compatibility by introducing optional fields first.

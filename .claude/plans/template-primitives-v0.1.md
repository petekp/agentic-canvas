# Agentic Canvas: Template Primitives & State Model

<!--
  template-primitives-v0.1.md

  Defines how the assistant generates new canvas components using
  template primitives driven by cognitive/perceptual state.

  Depends on:
  - primitives-spec-v0.1.md (ComponentInstance, CanvasCommand)
  - component-schemas-v0.1.md (registry + config schemas)

  Use this doc when:
  - Building a template registry
  - Designing the state model or intent selection
  - Implementing the generator pipeline
-->

**Version:** 0.1.0
**Status:** Draft
**Last Updated:** February 2026

---

## Overview

This spec introduces **template primitives** as a composable, declarative layer
between the assistant and the canvas. Templates describe intent, structure,
and constraints; a generator resolves them into concrete `ComponentInstance`s.

Key properties:
- **Deterministic by default** (seeded variation allowed)
- **State-aware** (cognitive + perceptual signals)
- **Explainable** (reason codes + parameter provenance)
- **Composable** (templates built from a small primitive set)

---

## 1. Core Concepts

### 1.1 Template Primitives

Primitives are the smallest renderable building blocks. They are not React
components; they are **data-driven nodes** rendered by a generic runtime.

**Primitive categories** (minimum viable set):
- **Layout**: `container`, `stack`, `grid`, `divider`, `spacer`
- **Text**: `text`, `label`, `heading`
- **Data display**: `metric`, `list`, `timeline`, `chart`
- **Media**: `icon`, `image`
- **Actions**: `button`, `link`
- **Slots**: `slot` (placeholders for composition)

### 1.2 Templates

A template is a **tree of primitives** plus parameters and constraints. It is
resolved at instantiation time based on state, context, and available data.

### 1.3 Template Instances

A template instance is the resolved, concrete output of a template:
- resolved parameters
- bound data sources
- rendered primitive tree
- mapped to one or more `ComponentInstance`s

---

## 2. State Model (Cognitive + Perceptual)

The system relies on a **minimal, stable state vector** that is:
- easy to compute from signals
- stable enough for deterministic output
- expressive enough to drive template choice and layout

### 2.1 State Snapshot

```typescript
type Normalized = number; // 0.0 - 1.0

interface StateSnapshot {
  timestamp: number;
  timezone: string;

  // Cognitive signals
  focus: Normalized;           // ability to sustain attention
  energy: Normalized;          // mental + physical energy
  stress: Normalized;          // anxiety/arousal level
  timePressure: Normalized;    // urgency / deadline proximity
  interruptibility: Normalized; // openness to interruptions

  // Perceptual environment
  ambientLight: "low" | "normal" | "bright";
  noiseLevel: "quiet" | "moderate" | "loud";
  motionContext: "still" | "moving";

  // Task mode (derived or explicit)
  mode: "execute" | "review" | "explore" | "recover" | "monitor";

  // Provenance (for explainability)
  signals: StateSignal[];
}

interface StateSignal {
  source: "calendar" | "device" | "interaction" | "self_report" | "inference";
  key: string;                // e.g. "sleep_quality", "keyboard_activity"
  value: number | string | boolean;
  confidence: Normalized;
  capturedAt: number;
}
```

**Design note:** most fields are normalized scalars to simplify heuristics and
allow deterministic mapping. Perceptual fields are coarse enums to avoid
fragile sensing.

---

## 3. Template Registry

Templates are registered alongside component definitions. A template can
compile to one or more canvas components.

```typescript
type TemplateId = string; // "focus/triage/v1"

type TemplateCategory =
  | "focus"
  | "review"
  | "explore"
  | "monitor"
  | "recover";

interface TemplateDefinition {
  id: TemplateId;
  version: string; // semantic version string
  name: string;
  description: string;
  category: TemplateCategory;

  // parameters are resolved at instantiation time
  parameters: TemplateParamDefinition[];

  // main structure
  root: TemplateNode;

  // optional: maps to multiple component instances
  output: TemplateOutput;

  // constraints and heuristics
  constraints: TemplateConstraints;

  // selection heuristics (data-driven, serializable)
  selection: TemplateSelection;
}

interface TemplateSelection {
  baseScore?: number;
  rules: TemplateScoreRule[];
}

interface TemplateScoreRule {
  when: ConditionExpression;
  weight: number;
  reason: string;
}
```

### 3.1 Parameters

```typescript
type TemplateParamType = "string" | "number" | "boolean" | "enum" | "json";

interface TemplateParamDefinition {
  key: string;
  type: TemplateParamType;
  default?: unknown;
  required?: boolean;
  enumValues?: string[];
  min?: number;
  max?: number;
  description?: string;

  // state-driven suggestion
  suggested?: (state: StateSnapshot, context: CanvasContext) => unknown;
}
```

### 3.2 Output Mapping

Templates can render into a single component or a composite set.

```typescript
interface TemplateOutput {
  // primary component type (optional if generating multiple)
  primaryTypeId?: TypeId;

  // additional component definitions to create
  components?: TemplateComponentOutput[];
}

interface TemplateComponentOutput {
  typeId: TypeId;
  config: Record<string, unknown>;
  dataBinding?: DataBinding;
  size?: Size;
  position?: Position;
  meta?: Partial<ComponentMeta>;
}
```

**Param interpolation:** any `string` value in `config`, `dataBinding`, or `meta` that starts
with `$` is treated as a parameter reference. Example: `{ repo: "$repo" }` pulls the
resolved `repo` param into the config.

### 3.3 Constraints

```typescript
interface TemplateConstraints {
  // layout and grid constraints
  minSize?: Size;
  maxSize?: Size;
  preferredAspect?: "square" | "wide" | "tall";

  // cognitive/perceptual constraints
  maxCognitiveLoad?: Normalized;
  maxVisualDensity?: Normalized;
  prefersLowMotion?: boolean;

  // content constraints
  maxItems?: number;
  maxTextLines?: number;
}
```

---

## 4. Template Primitives

### 4.1 Base Node

```typescript
type TemplateNodeId = string;

type TemplateNode =
  | ContainerNode
  | TextNode
  | MetricNode
  | ListNode
  | TimelineNode
  | ChartNode
  | MediaNode
  | ActionNode
  | DividerNode
  | SpacerNode
  | SlotNode;

interface TemplateNodeBase {
  id: TemplateNodeId;
  type: string;
  props?: Record<string, unknown>;
  children?: TemplateNode[];
  dataRef?: string; // binds to resolved data
  when?: ConditionExpression; // optional visibility rule
}
```

### 4.2 Common Nodes (Examples)

```typescript
interface ContainerNode extends TemplateNodeBase {
  type: "container" | "stack" | "grid";
  props?: {
    direction?: "row" | "column";
    gap?: number;
    padding?: number;
    align?: "start" | "center" | "end" | "stretch";
    distribution?: "start" | "center" | "space-between";
    background?: "none" | "subtle" | "emphasis";
  };
}

interface TextNode extends TemplateNodeBase {
  type: "text" | "label" | "heading";
  props?: {
    content?: string;
    maxLines?: number;
    tone?: "neutral" | "positive" | "warning" | "urgent";
  };
}

interface MetricNode extends TemplateNodeBase {
  type: "metric";
  props?: {
    label?: string;
    value?: string | number;
    delta?: string | number;
    trend?: "up" | "down" | "flat";
  };
}

interface ListNode extends TemplateNodeBase {
  type: "list";
  props?: {
    limit?: number;
    density?: "compact" | "normal" | "relaxed";
  };
  children?: TemplateNode[]; // item template
}

interface TimelineNode extends TemplateNodeBase {
  type: "timeline";
  props?: {
    limit?: number;
  };
  children?: TemplateNode[];
}

interface ChartNode extends TemplateNodeBase {
  type: "chart";
  props?: {
    kind?: "line" | "bar" | "spark";
    xKey?: string;
    yKey?: string;
  };
}

interface MediaNode extends TemplateNodeBase {
  type: "icon" | "image";
  props?: {
    src?: string;
    name?: string;
    size?: number;
  };
}

interface ActionNode extends TemplateNodeBase {
  type: "button" | "link";
  props?: {
    label?: string;
    actionId?: string;
  };
}

interface DividerNode extends TemplateNodeBase {
  type: "divider";
}

interface SpacerNode extends TemplateNodeBase {
  type: "spacer";
  props?: { size?: number };
}

interface SlotNode extends TemplateNodeBase {
  type: "slot";
  props?: { name: string };
}
```

### 4.3 Conditions

```typescript
type ConditionExpression =
  | { op: "gt" | "lt" | "eq"; left: string; right: number | string }
  | { op: "and" | "or"; conditions: ConditionExpression[] };
```

---

## 5. Intent Selection

Templates are selected via an intent layer that maps state + context to a
small set of candidate templates.

```typescript
interface GenerationIntent {
  id: string;
  label: string;
  category: TemplateCategory;
  priority: "low" | "medium" | "high";

  // data and layout hints
  focusArea?: "left" | "right" | "top" | "bottom" | "center";
  dataSources?: DataSourceId[];

  // derived from context
  reason: string; // explainable decision string
}
```

---

## 6. Generation Pipeline

1. **Ingest signals** → `StateSignal[]`
2. **Fuse signals** → `StateSnapshot`
3. **Select intent** → `GenerationIntent`
4. **Choose template** → top-K via `selection.rules`
5. **Resolve parameters** → deterministic, seeded
6. **Bind data** → map template `dataRef` → sources
7. **Layout solve** → respect grid + constraints
8. **Compile** → `CanvasCommand[]` batch
9. **Persist** → store template instance metadata (id, version, seed)

**Determinism:**
- Use a `seed` derived from `state + intent + templateId`
- All randomness must be seeded

---

## 7. Template Instance Metadata

Template provenance is stored in component metadata for explainability.

```typescript
interface TemplateInstanceMeta {
  templateId: TemplateId;
  templateVersion: string;
  seed: number;
  resolvedParams: Record<string, unknown>;
  intentId: string;
  generatedAt: number;
}
```

---

## 8. Minimal Example

```typescript
const focusTriageTemplate: TemplateDefinition = {
  id: "focus/triage/v1",
  version: "1.0.0",
  name: "Focus Triage",
  description: "Compact list of highest-priority items with a single metric.",
  category: "focus",
  parameters: [
    { key: "limit", type: "number", default: 5, min: 3, max: 10 },
  ],
  constraints: { maxCognitiveLoad: 0.4, maxVisualDensity: 0.5 },
  selection: {
    baseScore: 0.2,
    rules: [
      {
        when: { op: "and", conditions: [
          { op: "gt", left: "state.focus", right: 0.7 },
          { op: "gt", left: "state.timePressure", right: 0.6 },
        ]},
        weight: 0.7,
        reason: "High focus + high urgency favors triage",
      },
    ],
  },
  output: {
    primaryTypeId: "github.pr-list",
  },
  root: {
    id: "root",
    type: "stack",
    props: { direction: "column", gap: 8, padding: 12 },
    children: [
      { id: "title", type: "heading", props: { content: "Triage" } },
      { id: "metric", type: "metric", props: { label: "Open PRs" } },
      { id: "list", type: "list", props: { limit: 5 } },
    ],
  },
};
```

---

## 9. Implementation Notes

- Start with **single-component templates** that map to existing `typeId`s.
- Add a **generic renderer** for template primitives when ready.
- Keep template selection deterministic and debuggable (store `seed`).
- Provide an "explain" affordance (templateId + reason + state snapshot).

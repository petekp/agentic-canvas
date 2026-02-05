// types/index.ts
//
// Single source of truth for all TypeScript interfaces in the canvas system.
//
// ORGANIZATION:
// 1. Identifiers - Branded string types for type safety (ComponentId, ViewId, etc.)
// 2. Grid & Layout - Position, Size, GridConfig for spatial awareness
// 3. Workspace & Canvas - Top-level containers and views
// 4. Component Instance - The core data structure for canvas items
// 5. Canvas Commands - Intent-based mutations (user/AI actions)
// 6. History & Undo - Entries for the undo/redo system
// 7. Data Binding - Connecting components to data sources
// 8. Component Registry - Type definitions for the registry
// 9. Events - Pub/sub event types
// 10. Errors - Structured error responses
//
// DESIGN PRINCIPLES:
// - Prefer branded types (ComponentId vs string) for API boundaries
// - Use discriminated unions for state variants (DataLoadingState)
// - Commands describe intent, not mutation - they're what gets logged/displayed
// - All timestamps are milliseconds since epoch (Date.now())
//
// See: .claude/plans/primitives-spec-v0.1.md for design rationale

import type { JSONSchema7 } from "json-schema";

// ============================================================================
// 1. Identifiers
// ============================================================================

export type WorkspaceId = string;
export type ComponentId = string;
export type SpaceId = string;
/** @deprecated Use SpaceId instead */
export type ViewId = SpaceId;
export type TypeId = string;
export type DataSourceId = string;
export type UndoId = string;
export type TriggerId = string;
export type TransformId = string;

// ============================================================================
// 2. Grid & Layout
// ============================================================================

export interface GridConfig {
  columns: number;
  rows: number;
  gap: number;
  cellWidth: number;
  cellHeight: number;
}

export interface Position {
  col: number;
  row: number;
}

export interface Size {
  cols: number;
  rows: number;
}

export interface Bounds {
  position: Position;
  size: Size;
}

// ============================================================================
// 3. Workspace & Canvas
// ============================================================================

export interface Workspace {
  id: WorkspaceId;
  name: string;
  canvas: Canvas;
  threadId: string;
  spaces: Space[];
  /** @deprecated Use spaces instead */
  views?: Space[];
  triggers: ProactiveTrigger[];
  transforms: Map<TransformId, TransformDefinition>;
  settings: WorkspaceSettings;
  createdAt: number;
  updatedAt: number;
}

export interface WorkspaceSettings {
  theme: "light" | "dark" | "system";
  voiceEnabled: boolean;
  defaultRefreshInterval: number;
  grid: GridConfig;
  proactiveMode: "suggest" | "auto" | "off";
}

export interface Canvas {
  grid: GridConfig;
  components: ComponentInstance[];
}

export interface Space {
  id: SpaceId;
  name: string;
  description?: string;
  snapshot: Canvas;
  triggerIds: TriggerId[];
  pinned: boolean;
  createdBy: "user" | "assistant";
  createdAt: number;
  updatedAt: number;
  lastVisitedAt: number;
}

/** @deprecated Use Space instead */
export type View = Space;

// ============================================================================
// 4. Component Instance
// ============================================================================

export interface ComponentInstance {
  id: ComponentId;
  typeId: TypeId;
  position: Position;
  size: Size;
  config: Record<string, unknown>;
  dataBinding: DataBinding | null;
  dataState: DataLoadingState;
  meta: ComponentMeta;
}

export interface ComponentMeta {
  createdAt: number;
  createdBy: "user" | "assistant";
  pinned: boolean;
  label?: string;
  template?: TemplateInstanceMeta;
}

export type DataLoadingState =
  | { status: "idle" }
  | { status: "loading"; startedAt: number }
  | { status: "ready"; data: unknown; fetchedAt: number }
  | { status: "error"; error: DataError; attemptedAt: number }
  | { status: "stale"; data: unknown; fetchedAt: number };

// ============================================================================
// 5. Canvas Command Protocol
// ============================================================================

export type CanvasCommand =
  | { type: "component.create"; payload: CreateComponentPayload }
  | { type: "component.update"; payload: UpdateComponentPayload }
  | { type: "component.remove"; payload: RemoveComponentPayload }
  | { type: "component.move"; payload: MoveComponentPayload }
  | { type: "component.resize"; payload: ResizeComponentPayload }
  | { type: "space.save"; payload: SaveSpacePayload }
  | { type: "space.load"; payload: LoadSpacePayload }
  | { type: "space.delete"; payload: DeleteSpacePayload }
  /** @deprecated Use space.save instead */
  | { type: "view.save"; payload: SaveSpacePayload }
  /** @deprecated Use space.load instead */
  | { type: "view.load"; payload: LoadSpacePayload }
  /** @deprecated Use space.delete instead */
  | { type: "view.delete"; payload: DeleteSpacePayload }
  | { type: "canvas.clear"; payload: ClearCanvasPayload }
  | { type: "batch"; payload: BatchPayload };

export interface CreateComponentPayload {
  typeId: TypeId;
  config: Record<string, unknown>;
  dataBinding?: DataBinding;
  position?: Position;
  size?: Size;
  meta?: Partial<ComponentMeta>;
}

export interface UpdateComponentPayload {
  componentId: ComponentId;
  config?: Record<string, unknown>;
  dataBinding?: DataBinding | null;
  meta?: Partial<ComponentMeta>;
}

export interface RemoveComponentPayload {
  componentId: ComponentId;
}

export interface MoveComponentPayload {
  componentId: ComponentId;
  position: Position;
}

export interface ResizeComponentPayload {
  componentId: ComponentId;
  size: Size;
}

export interface SaveSpacePayload {
  name: string;
  description?: string;
  triggerIds?: TriggerId[];
}

/** @deprecated Use SaveSpacePayload instead */
export type SaveViewPayload = SaveSpacePayload;

export interface LoadSpacePayload {
  spaceId: SpaceId;
}

/** @deprecated Use LoadSpacePayload instead */
export type LoadViewPayload = LoadSpacePayload;

export interface DeleteSpacePayload {
  spaceId: SpaceId;
}

/** @deprecated Use DeleteSpacePayload instead */
export type DeleteViewPayload = DeleteSpacePayload;

export interface ClearCanvasPayload {
  preservePinned: boolean;
}

export interface BatchPayload {
  commands: CanvasCommand[];
  description: string;
}

// ============================================================================
// 6. Command Results
// ============================================================================

export interface CommandResult {
  success: boolean;
  undoId: UndoId;
  explanation: string;
  affectedComponentIds: ComponentId[];
  error?: CommandError;
}

export interface BatchCommandResult {
  success: boolean;
  undoId: UndoId;
  explanation: string;
  results: CommandResult[];
  error?: CommandError;
}

export interface CommandError {
  code: CommandErrorCode;
  message: string;
  componentId?: ComponentId;
}

export type CommandErrorCode =
  | "COMPONENT_NOT_FOUND"
  | "INVALID_POSITION"
  | "INVALID_SIZE"
  | "TYPE_NOT_FOUND"
  | "CONFIG_VALIDATION_FAILED"
  | "VIEW_NOT_FOUND"
  | "COLLISION_DETECTED";

// ============================================================================
// 7. History State (Undo/Redo)
// ============================================================================

export interface HistoryState {
  undoStack: UndoEntry[];
  redoStack: UndoEntry[];
  maxSize: number;
}

/** Deep copy of canvas components for undo/redo snapshots */
export interface CanvasSnapshot {
  components: ComponentInstance[];
}

export interface UndoEntry {
  id: UndoId;
  timestamp: number;
  source: "user" | "assistant";
  description: string;
  /** Canvas state before the action was performed */
  beforeSnapshot: CanvasSnapshot;
  /** Canvas state after the action was performed */
  afterSnapshot: CanvasSnapshot;
  /** Space context where this action was performed (for auto-navigation on undo) */
  spaceContext: SpaceId | null;
  /** @deprecated Use spaceContext instead */
  viewContext?: SpaceId | null;
}

export type HistoryAction =
  | { type: "history.undo" }
  | { type: "history.redo" }
  | { type: "history.clear" };

// ============================================================================
// 8. Auto-Placement
// ============================================================================

export interface PlacementResult {
  position: Position;
  reason: PlacementReason;
  adjustments?: PlacementAdjustment[];
}

export type PlacementReason =
  | "requested"
  | "auto_placed"
  | "shifted"
  | "best_effort";

export interface PlacementAdjustment {
  componentId: ComponentId;
  from: Position;
  to: Position;
  reason: string;
}

export interface PlacementHints {
  preferredPosition?: Position;
  nearComponentId?: ComponentId;
  region?: "top" | "bottom" | "left" | "right";
}

export interface LayoutEngine {
  findPlacement(size: Size, canvas: Canvas, hints?: PlacementHints): PlacementResult;
  detectCollisions(bounds: Bounds, canvas: Canvas, excludeId?: ComponentId): ComponentId[];
}

// ============================================================================
// 9. User Actions
// ============================================================================

export type UserAction =
  | { type: "user.move"; componentId: ComponentId; position: Position }
  | { type: "user.resize"; componentId: ComponentId; size: Size }
  | { type: "user.dismiss"; componentId: ComponentId }
  | { type: "user.pin"; componentId: ComponentId; pinned: boolean }
  | { type: "user.refresh"; componentId: ComponentId }
  | { type: "user.undo" }
  | { type: "user.redo" };

// ============================================================================
// 10. Data Binding
// ============================================================================

export interface DataBinding {
  source: DataSourceId;
  query: DataQuery;
  refreshInterval: number | null;
  transformId?: TransformId; // Reference to a stored transform
}

// ============================================================================
// 10a. Data Transforms
// ============================================================================

export interface TransformDefinition {
  id: TransformId;
  name: string;
  description: string;
  /**
   * The actual transform code - a function body that receives `data` and returns transformed data.
   * Example: "return data.filter(m => m.text.toLowerCase().includes('@pete'))"
   */
  code: string;
  /** What data sources/query types this transform is compatible with */
  compatibleWith: TransformCompatibility[];
  createdAt: number;
  createdBy: "user" | "assistant";
}

export interface TransformCompatibility {
  source: DataSourceId;
  queryType: string;
}

export interface DataQuery {
  type: string;
  params: Record<string, unknown>;
}

export interface DataSource {
  id: DataSourceId;
  name: string;
  description: string;
  queries: QueryDefinition[];
  execute(query: DataQuery): Promise<DataResult>;
  subscribe?(query: DataQuery, callback: (result: DataResult) => void): Unsubscribe;
}

export interface QueryDefinition {
  type: string;
  description: string;
  paramsSchema: JSONSchema7;
  resultSchema: JSONSchema7;
}

export type Unsubscribe = () => void;

export interface DataResult<T = unknown> {
  data: T;
  meta: DataMeta;
}

export interface DataMeta {
  fetchedAt: number;
  source: DataSourceId;
  query: DataQuery;
  pagination?: PaginationMeta;
  stale: boolean;
  ttl: number;
}

export interface PaginationMeta {
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

export interface DataError {
  code: DataErrorCode;
  message: string;
  source: DataSourceId;
  retryable: boolean;
  retryAfter?: number;
}

export type DataErrorCode =
  | "NOT_FOUND"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "RATE_LIMITED"
  | "NETWORK"
  | "TIMEOUT"
  | "INVALID_QUERY"
  | "SOURCE_UNAVAILABLE"
  | "UNKNOWN";

// ============================================================================
// 11. Component Registry
// ============================================================================

export type ComponentCategory = "data" | "metric" | "timeline" | "utility";

export type ComponentCapability =
  | "interactive"
  | "refreshable"
  | "expandable"
  | "filterable"
  | "sortable"
  | "exportable";

export interface ComponentDefinition<TConfig = Record<string, unknown>> {
  typeId: TypeId;
  name: string;
  description: string;
  category: ComponentCategory;
  configSchema: JSONSchema7;
  defaultConfig: Partial<TConfig>;
  defaultSize: Size;
  minSize: Size;
  maxSize: Size;
  dataBindingSchema?: JSONSchema7;
  capabilities: ComponentCapability[];
  actions: ComponentActionDefinition[];
  render: React.ComponentType<ComponentRenderProps<TConfig>>;
}

export interface ComponentActionDefinition {
  actionId: string;
  label: string;
  description: string;
  icon?: string;
  requiresSelection?: boolean;
  params?: JSONSchema7;
}

export interface ComponentRenderProps<TConfig> {
  instanceId: ComponentId;
  config: TConfig;
  size: Size;
  state: DataLoadingState;
  onAction: (actionId: string, params?: unknown) => void;
  onConfigChange: (config: Partial<TConfig>) => void;
  onSelect: (itemId: string, data: unknown) => void;
}

export interface ComponentRegistry {
  register(definition: ComponentDefinition): void;
  unregister(typeId: TypeId): void;
  get(typeId: TypeId): ComponentDefinition | undefined;
  getAll(): ComponentDefinition[];
  getByCategory(category: ComponentCategory): ComponentDefinition[];
  validateConfig(typeId: TypeId, config: unknown): ValidationResult;
  validateDataBinding(typeId: TypeId, binding: DataBinding): ValidationResult;
}

export interface ValidationResult {
  valid: boolean;
  errors?: ValidationError[];
}

export interface ValidationError {
  path: string;
  message: string;
  code: string;
}

// ============================================================================
// 12. Canvas Context (AI Awareness)
// ============================================================================

export interface CanvasContext {
  components: ComponentSummary[];
  temporal: TemporalContext;
  workspace: WorkspaceContext;
  budget: ContextBudget;
}

export interface ComponentSummary {
  id: ComponentId;
  typeId: TypeId;
  typeName: string;
  category: ComponentCategory;
  position: Position;
  size: Size;
  summary: string;
  highlights: string[];
  actions: string[];
  stateStatus: DataLoadingState["status"];
}

export interface TemporalContext {
  timestamp: string;
  timezone: string;
  dayOfWeek: DayOfWeek;
  timeOfDay: TimeOfDay;
  isWorkHours: boolean;
}

export type DayOfWeek =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export type TimeOfDay =
  | "early_morning"
  | "morning"
  | "mid_day"
  | "afternoon"
  | "evening"
  | "night";

export interface WorkspaceContext {
  id: WorkspaceId;
  name: string;
  activeSpaceId: SpaceId | null;
  /** @deprecated Use activeSpaceId instead */
  activeViewId?: SpaceId | null;
  savedSpaces: SpaceSummary[];
  /** @deprecated Use savedSpaces instead */
  savedViews?: SpaceSummary[];
  componentCount: number;
  gridUtilization: number;
}

export interface SpaceSummary {
  id: SpaceId;
  name: string;
  description?: string;
  componentCount: number;
  pinned: boolean;
  createdBy: "user" | "assistant";
  lastVisitedAt: number;
}

/** @deprecated Use SpaceSummary instead */
export type ViewSummary = SpaceSummary;

export interface ContextBudget {
  maxTokens: number;
  usedTokens: number;
  maxComponents: number;
  summarizationLevel: "full" | "condensed" | "minimal";
}

// ============================================================================
// 13. Template Primitives & State Model
// ============================================================================

export type TemplateId = string;
export type TemplateNodeId = string;

export type TemplateCategory = "focus" | "review" | "explore" | "monitor" | "recover";

export type TemplateParamType = "string" | "number" | "boolean" | "enum" | "json";

export interface TemplateParamDefinition {
  key: string;
  type: TemplateParamType;
  default?: unknown;
  required?: boolean;
  enumValues?: string[];
  min?: number;
  max?: number;
  description?: string;
  suggested?: (state: StateSnapshot, context: CanvasContext) => unknown;
}

export interface TemplateConstraints {
  minSize?: Size;
  maxSize?: Size;
  preferredAspect?: "square" | "wide" | "tall";
  maxCognitiveLoad?: Normalized;
  maxVisualDensity?: Normalized;
  prefersLowMotion?: boolean;
  maxItems?: number;
  maxTextLines?: number;
}

export interface TemplateOutput {
  primaryTypeId?: TypeId;
  components?: TemplateComponentOutput[];
}

export interface TemplateComponentOutput {
  typeId: TypeId;
  config: Record<string, unknown>;
  dataBinding?: DataBinding;
  size?: Size;
  position?: Position;
  meta?: Partial<ComponentMeta>;
}

export interface TemplateDefinition {
  id: TemplateId;
  version: string;
  name: string;
  description: string;
  category: TemplateCategory;
  parameters: TemplateParamDefinition[];
  root: TemplateNode;
  output: TemplateOutput;
  constraints: TemplateConstraints;
  selection: TemplateSelection;
}

export interface TemplateSelection {
  baseScore?: number;
  rules: TemplateScoreRule[];
}

export interface TemplateScoreRule {
  when: ConditionExpression;
  weight: number;
  reason: string;
}

export type Normalized = number; // 0.0 - 1.0

export interface StateSnapshot {
  timestamp: number;
  timezone: string;
  focus: Normalized;
  energy: Normalized;
  stress: Normalized;
  timePressure: Normalized;
  interruptibility: Normalized;
  ambientLight: "low" | "normal" | "bright";
  noiseLevel: "quiet" | "moderate" | "loud";
  motionContext: "still" | "moving";
  mode: "execute" | "review" | "explore" | "recover" | "monitor";
  signals: StateSignal[];
}

export interface StateSignal {
  source: "calendar" | "device" | "interaction" | "self_report" | "inference";
  key: string;
  value: number | string | boolean;
  confidence: Normalized;
  capturedAt: number;
}

export interface GenerationIntent {
  id: string;
  label: string;
  category: TemplateCategory;
  priority: "low" | "medium" | "high";
  focusArea?: "left" | "right" | "top" | "bottom" | "center";
  dataSources?: DataSourceId[];
  reason: string;
}

export interface TemplateInstanceMeta {
  templateId: TemplateId;
  templateVersion: string;
  seed: number;
  resolvedParams: Record<string, unknown>;
  intentId: string;
  generatedAt: number;
}

export type TemplateNode =
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

export interface TemplateNodeBase {
  id: TemplateNodeId;
  type: string;
  props?: Record<string, unknown>;
  children?: TemplateNode[];
  dataRef?: string;
  when?: ConditionExpression;
}

export interface ContainerNode extends TemplateNodeBase {
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

export interface TextNode extends TemplateNodeBase {
  type: "text" | "label" | "heading";
  props?: {
    content?: string;
    maxLines?: number;
    tone?: "neutral" | "positive" | "warning" | "urgent";
  };
}

export interface MetricNode extends TemplateNodeBase {
  type: "metric";
  props?: {
    label?: string;
    value?: string | number;
    delta?: string | number;
    trend?: "up" | "down" | "flat";
  };
}

export interface ListNode extends TemplateNodeBase {
  type: "list";
  props?: {
    limit?: number | string;
    density?: "compact" | "normal" | "relaxed";
  };
  children?: TemplateNode[];
}

export interface TimelineNode extends TemplateNodeBase {
  type: "timeline";
  props?: {
    limit?: number | string;
  };
  children?: TemplateNode[];
}

export interface ChartNode extends TemplateNodeBase {
  type: "chart";
  props?: {
    kind?: "line" | "bar" | "spark";
    xKey?: string;
    yKey?: string;
  };
}

export interface MediaNode extends TemplateNodeBase {
  type: "icon" | "image";
  props?: {
    src?: string;
    name?: string;
    size?: number;
  };
}

export interface ActionNode extends TemplateNodeBase {
  type: "button" | "link";
  props?: {
    label?: string;
    actionId?: string;
  };
}

export interface DividerNode extends TemplateNodeBase {
  type: "divider";
}

export interface SpacerNode extends TemplateNodeBase {
  type: "spacer";
  props?: {
    size?: number;
  };
}

export interface SlotNode extends TemplateNodeBase {
  type: "slot";
  props?: {
    name: string;
  };
}

export type ConditionExpression =
  | { op: "gt" | "lt" | "eq"; left: string; right: number | string }
  | { op: "and" | "or"; conditions: ConditionExpression[] };

// ============================================================================
// 14. Canvas Events
// ============================================================================

export type CanvasEvent =
  | { type: "component.clicked"; payload: ComponentClickPayload }
  | { type: "component.action"; payload: ComponentActionPayload }
  | { type: "component.selected"; payload: ComponentSelectionPayload }
  | { type: "component.error"; payload: ComponentErrorPayload }
  | { type: "component.ready"; payload: ComponentReadyPayload }
  | { type: "layout.changed"; payload: LayoutChangePayload }
  | { type: "space.loaded"; payload: SpaceLoadedPayload }
  /** @deprecated Use space.loaded instead */
  | { type: "view.loaded"; payload: SpaceLoadedPayload }
  | { type: "trigger.activated"; payload: TriggerActivatedPayload };

export interface ComponentClickPayload {
  componentId: ComponentId;
  elementId?: string;
  data?: unknown;
}

export interface ComponentActionPayload {
  componentId: ComponentId;
  actionId: string;
  params?: unknown;
  context?: unknown;
}

export interface ComponentSelectionPayload {
  componentId: ComponentId;
  selectedItems: SelectedItem[];
}

export interface SelectedItem {
  itemId: string;
  data: unknown;
}

export interface ComponentErrorPayload {
  componentId: ComponentId;
  error: DataError;
}

export interface ComponentReadyPayload {
  componentId: ComponentId;
  summary: string;
  highlights: string[];
}

export interface LayoutChangePayload {
  componentId: ComponentId;
  changeType: "moved" | "resized" | "pinned" | "unpinned";
  newBounds: Bounds;
}

export interface SpaceLoadedPayload {
  spaceId: SpaceId;
  spaceName: string;
}

/** @deprecated Use SpaceLoadedPayload instead */
export type ViewLoadedPayload = SpaceLoadedPayload;

export interface TriggerActivatedPayload {
  triggerId: TriggerId;
  triggerName: string;
  suggestedSpaceId?: SpaceId;
  /** @deprecated Use suggestedSpaceId instead */
  suggestedViewId?: SpaceId;
}

// ============================================================================
// 15. Proactive Triggers
// ============================================================================

export interface ProactiveTrigger {
  id: TriggerId;
  name: string;
  description?: string;
  enabled: boolean;
  type: TriggerType;
  spaceId?: SpaceId;
  /** @deprecated Use spaceId instead */
  viewId?: SpaceId;
  message?: string;
}

export type TriggerType = "session_start" | "time_based";

export interface SimulatedTimeTrigger extends ProactiveTrigger {
  type: "time_based";
  simulatedTime: string;
}

// ============================================================================
// 16. Errors
// ============================================================================

export interface AgenticCanvasError {
  code: string;
  message: string;
  timestamp: number;
  requestId?: string;
}

export interface CommandExecutionError extends AgenticCanvasError {
  code: CommandErrorCode;
  command: CanvasCommand;
  componentId?: ComponentId;
}

export interface DataFetchError extends AgenticCanvasError {
  code: DataErrorCode;
  source: DataSourceId;
  query: DataQuery;
  retryable: boolean;
}

export interface ValidationFailedError extends AgenticCanvasError {
  code: "VALIDATION_FAILED";
  errors: ValidationError[];
}

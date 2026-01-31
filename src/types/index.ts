// Core Primitives - copied from primitives-spec-v0.1.md
// This is the single source of truth for all TypeScript types

import type { JSONSchema7 } from "json-schema";

// ============================================================================
// 1. Identifiers
// ============================================================================

export type WorkspaceId = string;
export type ComponentId = string;
export type ViewId = string;
export type TypeId = string;
export type DataSourceId = string;
export type UndoId = string;
export type TriggerId = string;

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
  views: View[];
  triggers: ProactiveTrigger[];
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

export interface View {
  id: ViewId;
  name: string;
  description?: string;
  snapshot: Canvas;
  triggerIds: TriggerId[];
  createdAt: number;
  updatedAt: number;
}

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
  | { type: "view.save"; payload: SaveViewPayload }
  | { type: "view.load"; payload: LoadViewPayload }
  | { type: "view.delete"; payload: DeleteViewPayload }
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

export interface SaveViewPayload {
  name: string;
  description?: string;
  triggerIds?: TriggerId[];
}

export interface LoadViewPayload {
  viewId: ViewId;
}

export interface DeleteViewPayload {
  viewId: ViewId;
}

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
  /** View context where this action was performed (for auto-navigation on undo) */
  viewContext: ViewId | null;
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
  activeViewId: ViewId | null;
  savedViews: ViewSummary[];
  componentCount: number;
  gridUtilization: number;
}

export interface ViewSummary {
  id: ViewId;
  name: string;
  description?: string;
  componentCount: number;
}

export interface ContextBudget {
  maxTokens: number;
  usedTokens: number;
  maxComponents: number;
  summarizationLevel: "full" | "condensed" | "minimal";
}

// ============================================================================
// 13. Canvas Events
// ============================================================================

export type CanvasEvent =
  | { type: "component.clicked"; payload: ComponentClickPayload }
  | { type: "component.action"; payload: ComponentActionPayload }
  | { type: "component.selected"; payload: ComponentSelectionPayload }
  | { type: "component.error"; payload: ComponentErrorPayload }
  | { type: "component.ready"; payload: ComponentReadyPayload }
  | { type: "layout.changed"; payload: LayoutChangePayload }
  | { type: "view.loaded"; payload: ViewLoadedPayload }
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

export interface ViewLoadedPayload {
  viewId: ViewId;
  viewName: string;
}

export interface TriggerActivatedPayload {
  triggerId: TriggerId;
  triggerName: string;
  suggestedViewId?: ViewId;
}

// ============================================================================
// 14. Proactive Triggers
// ============================================================================

export interface ProactiveTrigger {
  id: TriggerId;
  name: string;
  description?: string;
  enabled: boolean;
  type: TriggerType;
  viewId?: ViewId;
  message?: string;
}

export type TriggerType = "session_start" | "time_based";

export interface SimulatedTimeTrigger extends ProactiveTrigger {
  type: "time_based";
  simulatedTime: string;
}

// ============================================================================
// 15. Errors
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

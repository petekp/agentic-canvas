// Stats Display - rich stat tiles with formatting, diffs, and sparklines
// Ported from @assistant-ui/tool-ui

export { StatsDisplay, StatsDisplayProgress } from "./stats-display";
export type { StatsDisplayProps } from "./schema";
export {
  StatItemSchema,
  StatFormatSchema,
  StatDiffSchema,
  StatSparklineSchema,
  SerializableStatsDisplaySchema,
  parseSerializableStatsDisplay,
  type StatItem,
  type StatFormat,
  type StatDiff,
  type StatSparkline,
  type SerializableStatsDisplay,
} from "./schema";

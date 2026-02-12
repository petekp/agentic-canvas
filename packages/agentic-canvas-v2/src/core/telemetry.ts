import type { MorningBriefV02 } from "../contracts/brief-v0.2";
import type { MorningBriefViewV1 } from "../contracts/view-v1";
import type { BriefValidationIssue } from "./validate";

export type ReasoningMode = "llm" | "fallback";
export type FallbackReason = "llm_error" | "validation_failed";

export interface BriefReasonerTelemetry {
  reasoning_mode: ReasoningMode;
  schema_version: "v0.2";
  attempt: 1 | 2;
  validation_fail: boolean;
  repair_used: boolean;
  fallback_reason?: FallbackReason;
  duration_ms: number;
}

export interface BriefReasonerResult {
  brief: MorningBriefV02;
  view: MorningBriefViewV1;
  telemetry: BriefReasonerTelemetry;
  issues: BriefValidationIssue[];
}

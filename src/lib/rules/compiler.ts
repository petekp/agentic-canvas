import { validatePreferencePatch } from "./validate";
import type { Rule } from "./types";

export interface PreferencePatch {
  target: Rule["target"];
  rules: Rule[];
  summary?: string;
}

export interface PreferencePatchResult {
  patch: PreferencePatch | null;
  errors?: string[];
}

/**
 * Parse a preference patch produced by an LLM.
 * This does not perform any natural language matching.
 */
export function compilePreference(input: unknown): PreferencePatchResult {
  if (!input) return { patch: null, errors: ["Missing preference payload."] };

  let payload: unknown = input;
  if (typeof input === "string") {
    try {
      payload = JSON.parse(input);
    } catch {
      return { patch: null, errors: ["Invalid JSON payload."] };
    }
  }

  if (!payload || typeof payload !== "object") {
    return { patch: null, errors: ["Preference payload must be an object."] };
  }

  const validation = validatePreferencePatch(payload);
  if (!validation.valid) {
    return { patch: null, errors: validation.errors ?? ["Invalid preference patch."] };
  }

  const record = payload as Record<string, unknown>;
  const target = record.target as Rule["target"];
  const rules = record.rules as Rule[];
  const summary = typeof record.summary === "string" ? record.summary : undefined;

  const mismatched = rules.filter((rule) => rule.target !== target);
  if (mismatched.length > 0) {
    return {
      patch: null,
      errors: [
        `All rules must target "${target}".`,
      ],
    };
  }

  return { patch: { target, rules, summary } };
}

// data-slice.ts
//
// Manages data fetching, caching, and component data state.
//
// CACHE STRATEGY:
// Each unique DataBinding configuration gets a cache key. Multiple components
// can share the same cached data if they have identical bindings (e.g., two
// PR lists for the same repo). Cache entries have a TTL from the API response.
//
// FETCH DEDUPLICATION:
// pendingFetches tracks in-flight requests. If a fetch is already in progress
// for a cache key, additional requests await the same promise. This prevents
// thundering herd when multiple components mount simultaneously.
//
// COMPONENT DATA STATE:
// Components have a dataState field with discriminated union variants:
// - idle: No fetch attempted yet
// - loading: Fetch in progress
// - ready: Data loaded successfully
// - error: Fetch failed
// - stale: Data is old but still shown while refreshing
//
// REHYDRATION:
// After page reload (zustand persist rehydration), initializeData() re-fetches
// all components with bindings. Cached data is stale across sessions.
//
// See: .claude/plans/store-architecture-v0.1.md

import { StateCreator } from "zustand";
import type { AgenticCanvasStore } from "./index";
import type { ComponentId, DataBinding, DataError } from "@/types";
import type { Rule, RuleContext } from "@/lib/rules";
import {
  applyRulesToItems,
  getRulesForTarget,
  resolveRuleTargetForBinding,
} from "@/lib/rules";
import { trackClientTelemetry } from "@/lib/telemetry-client";

// Cached data entry
interface CachedData {
  data: unknown;
  fetchedAt: number;
  ttl: number;
  binding: DataBinding;
}

// Slice interface
export interface DataSlice {
  dataCache: Map<string, CachedData>;
  pendingFetches: Map<string, Promise<void>>;
  fetchData: (componentId: ComponentId, binding: DataBinding) => Promise<void>;
  refreshComponent: (componentId: ComponentId) => Promise<void>;
  initializeData: () => void;
}

// Slice creator
export const createDataSlice: StateCreator<
  AgenticCanvasStore,
  [["zustand/immer", never]],
  [],
  DataSlice
> = (set, get) => ({
  dataCache: new Map(),
  pendingFetches: new Map(),

  fetchData: async (componentId, binding) => {
    const cacheKey = generateCacheKey(binding);
    const bindingInfo = {
      source: binding.source,
      type: binding.query.type,
      params: binding.query.params ?? {},
    };

    const setLoadingForMatchingComponents = (state: AgenticCanvasStore, startedAt: number) => {
      for (const comp of state.canvas.components) {
        const bindingKey = comp.dataBinding ? generateCacheKey(comp.dataBinding) : null;
        if (comp.id === componentId || bindingKey === cacheKey) {
          if (comp.dataState.status === "ready" || comp.dataState.status === "stale") {
            comp.dataState = {
              status: "stale",
              data: comp.dataState.data,
              fetchedAt: comp.dataState.fetchedAt,
            };
          } else if (comp.dataState.status !== "loading") {
            comp.dataState = { status: "loading", startedAt };
          }
        }
      }
    };

    // Check cache
    const cached = get().dataCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < cached.ttl) {
      void trackClientTelemetry({
        source: "store.data",
        event: "cache_hit",
        data: {
          componentId,
          cacheKey,
          ageMs: Date.now() - cached.fetchedAt,
          ttl: cached.ttl,
          binding: bindingInfo,
        },
      });
      set((state) => {
        for (const comp of state.canvas.components) {
          const bindingKey = comp.dataBinding ? generateCacheKey(comp.dataBinding) : null;
          if (comp.id === componentId || bindingKey === cacheKey) {
            comp.dataState = {
              status: "ready",
              data: cached.data,
              fetchedAt: cached.fetchedAt,
            };
          }
        }
      });
      return;
    }

    // Check if already fetching
    const existingFetch = get().pendingFetches.get(cacheKey);
    if (existingFetch) {
      void trackClientTelemetry({
        source: "store.data",
        event: "fetch_dedupe",
        data: { componentId, cacheKey, binding: bindingInfo },
      });
      const startedAt = Date.now();
      set((state) => {
        setLoadingForMatchingComponents(state, startedAt);
      });
      return existingFetch;
    }

    const startedAt = Date.now();
    void trackClientTelemetry({
      source: "store.data",
      event: "fetch_start",
      data: {
        componentId,
        cacheKey,
        binding: bindingInfo,
        hasTransform: Boolean(binding.transformId),
        refreshInterval: binding.refreshInterval ?? null,
      },
    });
    const fetchPromise = (async () => {
      try {
        // Fetch from appropriate API based on source
        const result = await fetchDataFromSource(binding, get);

        // Apply transform if one is specified
        let transformedData = result.data;
        if (binding.transformId) {
          const transform = get().workspace.transforms.get(binding.transformId);
          if (transform) {
            if (transform.createdBy !== "assistant") {
              throw new Error(
                `Transform ${binding.transformId} is not trusted for execution (createdBy=${transform.createdBy})`
              );
            }
            try {
              transformedData = applyTransform(result.data, transform.code);
            } catch (err) {
              console.error(`Transform ${binding.transformId} failed:`, err);
              void trackClientTelemetry({
                source: "store.data",
                event: "transform_error",
                level: "error",
                data: {
                  componentId,
                  cacheKey,
                  transformId: binding.transformId,
                  error: err instanceof Error ? err.message : "Unknown error",
                },
              });
              // Fall back to untransformed data
            }
          }
        }

        const ruleTarget = resolveRuleTargetForBinding(binding);
        if (ruleTarget && Array.isArray(transformedData)) {
          const rules = getRulesForTarget(get().workspace.rules, ruleTarget);
          if (rules.length > 0) {
            const llmRule = pickLlmClassifierRule(rules);
            let itemsForRules = transformedData;
            let llmScores: Record<string, number> | undefined;

            if (llmRule) {
              const prepared = prepareItemsForLlmScoring(transformedData);
              itemsForRules = prepared.items;
              void trackClientTelemetry({
                source: "store.rules",
                event: "llm_score_request",
                data: {
                  componentId,
                  target: ruleTarget,
                  ruleId: llmRule.id ?? null,
                  itemCount: prepared.scoringItems.length,
                },
              });
              llmScores = await requestLlmScores(llmRule, prepared.scoringItems);
              void trackClientTelemetry({
                source: "store.rules",
                event: "llm_score_response",
                data: {
                  componentId,
                  target: ruleTarget,
                  ruleId: llmRule.id ?? null,
                  scoreCount: llmScores ? Object.keys(llmScores).length : 0,
                },
              });
            }

            const ruleContext: RuleContext = {
              userId: "local",
              now: Date.now(),
              scope: "component",
              signals: llmScores ? { llmScores } : undefined,
            };
            const result = applyRulesToItems(itemsForRules, rules, ruleTarget, ruleContext);
            void trackClientTelemetry({
              source: "store.rules",
              event: "apply",
              data: {
                componentId,
                target: ruleTarget,
                ruleCount: rules.length,
                appliedRuleCount: result.appliedRuleIds.length,
                itemCountBefore: Array.isArray(itemsForRules) ? itemsForRules.length : undefined,
                itemCountAfter: Array.isArray(result.items) ? result.items.length : undefined,
              },
            });
            transformedData = result.items;
          }
        }

        // Update cache and component
        const fetchedAt = Date.now();
        set((state) => {
          state.dataCache.set(cacheKey, {
            data: transformedData,
            fetchedAt,
            ttl: result.ttl,
            binding,
          });

          for (const comp of state.canvas.components) {
            const bindingKey = comp.dataBinding ? generateCacheKey(comp.dataBinding) : null;
            if (comp.id === componentId || bindingKey === cacheKey) {
              comp.dataState = { status: "ready", data: transformedData, fetchedAt };
            }
          }
        });

        void trackClientTelemetry({
          source: "store.data",
          event: "fetch_success",
          data: {
            componentId,
            cacheKey,
            durationMs: Date.now() - startedAt,
            ttl: result.ttl,
            itemCount: Array.isArray(transformedData) ? transformedData.length : undefined,
          },
        });

        // Schedule refresh if interval set
        if (binding.refreshInterval && binding.refreshInterval > 0) {
          setTimeout(() => {
            const currentComp = get().canvas.components.find((c) => c.id === componentId);
            if (currentComp && currentComp.dataBinding === binding) {
              get().fetchData(componentId, binding);
            }
          }, binding.refreshInterval);
        }
      } catch (error) {
        const dataError: DataError = {
          code: "UNKNOWN",
          message: error instanceof Error ? error.message : "Unknown error",
          source: binding.source,
          retryable: true,
        };

        const attemptedAt = Date.now();
        set((state) => {
          for (const comp of state.canvas.components) {
            const bindingKey = comp.dataBinding ? generateCacheKey(comp.dataBinding) : null;
            if (comp.id === componentId || bindingKey === cacheKey) {
              comp.dataState = { status: "error", error: dataError, attemptedAt };
            }
          }
        });

        void trackClientTelemetry({
          source: "store.data",
          event: "fetch_error",
          level: "error",
          data: {
            componentId,
            cacheKey,
            durationMs: Date.now() - startedAt,
            error: dataError.message,
          },
        });
      } finally {
        set((state) => {
          state.pendingFetches.delete(cacheKey);
        });
      }
    })();

    // Set loading state and mark as pending
    set((state) => {
      state.pendingFetches.set(cacheKey, fetchPromise);
      setLoadingForMatchingComponents(state, startedAt);
    });

    return fetchPromise;
  },

  refreshComponent: async (componentId) => {
    const component = get().canvas.components.find((c) => c.id === componentId);
    if (!component?.dataBinding) {
      return;
    }

    // Invalidate cache for this binding
    const cacheKey = generateCacheKey(component.dataBinding);
    set((state) => {
      state.dataCache.delete(cacheKey);
    });
    void trackClientTelemetry({
      source: "store.data",
      event: "cache_invalidate",
      data: { componentId, cacheKey },
    });

    // Re-fetch
    await get().fetchData(componentId, component.dataBinding);
  },

  initializeData: () => {
    // Fetch data for all components with data bindings
    // Called after rehydration from localStorage
    const components = get().canvas.components;
    void trackClientTelemetry({
      source: "store.data",
      event: "initialize",
      data: { componentCount: components.length },
    });
    for (const component of components) {
      if (component.dataBinding) {
        get().fetchData(component.id, component.dataBinding);
      }
    }
  },

});

// Generate cache key from binding
function generateCacheKey(binding: DataBinding): string {
  return `${binding.source}:${binding.query.type}:${JSON.stringify(binding.query.params)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}

function extractText(value: unknown): string {
  if (!isRecord(value)) return "";
  const candidates = [
    value.text,
    value.title,
    value.message,
    value.content,
    value.body,
    value.summary,
  ];
  for (const entry of candidates) {
    if (typeof entry === "string") return entry;
  }
  return "";
}

const MAX_LLM_SCORE_TEXT_CHARS = 500;

function deriveItemKey(value: unknown, index: number): string {
  if (isRecord(value)) {
    const candidates = [
      value.id,
      value.ts,
      value.timestamp,
      value.createdAt,
      value.updatedAt,
      value.url,
    ];
    for (const entry of candidates) {
      if (typeof entry === "string" || typeof entry === "number") {
        return String(entry);
      }
    }
  }
  return `idx:${index}`;
}

function pickLlmClassifierRule(rules: Rule[]): Rule | undefined {
  const candidates = rules.filter((rule) => rule.type === "score.llm_classifier");
  if (candidates.length === 0) return undefined;
  return candidates.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))[0];
}

function prepareItemsForLlmScoring(items: unknown[]): {
  items: unknown[];
  scoringItems: Array<{ key: string; text: string }>;
} {
  const scoringItems: Array<{ key: string; text: string }> = [];
  const prepared = items.map((item, index) => {
    const key = deriveItemKey(item, index);
    const text = extractText(item).trim().slice(0, MAX_LLM_SCORE_TEXT_CHARS);
    if (text) {
      scoringItems.push({ key, text });
    }
    if (isRecord(item)) {
      return { ...item, _llmKey: key };
    }
    return item;
  });

  return { items: prepared, scoringItems };
}

async function requestLlmScores(
  rule: Rule,
  scoringItems: Array<{ key: string; text: string }>
): Promise<Record<string, number> | undefined> {
  if (!rule.params || typeof rule.params !== "object") return undefined;
  const instruction =
    typeof rule.params.instruction === "string"
      ? rule.params.instruction.trim()
      : "";
  if (!instruction) return undefined;

  const maxItemsRaw = rule.params.maxItems;
  const maxItems =
    typeof maxItemsRaw === "number" && Number.isFinite(maxItemsRaw)
      ? Math.max(1, Math.min(200, Math.floor(maxItemsRaw)))
      : 50;

  const payloadItems = scoringItems.slice(0, maxItems);
  if (payloadItems.length === 0) return undefined;

  try {
    const response = await fetch("/api/rules/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instruction, items: payloadItems }),
    });

    if (!response.ok) {
      return undefined;
    }

    const payload = (await response.json()) as { scores?: Array<{ key: string; score: number }> };
    const scores = Array.isArray(payload?.scores) ? payload.scores : [];
    const map: Record<string, number> = {};
    for (const entry of scores) {
      if (!entry || typeof entry.key !== "string") continue;
      if (typeof entry.score !== "number" || !Number.isFinite(entry.score)) continue;
      map[entry.key] = entry.score;
    }
    return Object.keys(map).length > 0 ? map : undefined;
  } catch (error) {
    console.error("Failed to fetch LLM scores:", error);
    return undefined;
  }
}

// Route to appropriate data source
async function fetchDataFromSource(
  binding: DataBinding,
  getState: () => AgenticCanvasStore
): Promise<{ data: unknown; ttl: number }> {
  switch (binding.source) {
    case "briefing":
      return fetchBriefingData(binding, getState);
    case "posthog":
      return fetchPostHogData(binding);
    case "slack":
      return fetchSlackData(binding);
    case "vercel":
      return fetchVercelData(binding);
    case "mock-github":
    default:
      return fetchGitHubData(binding);
  }
}

// Fetch data for briefing recommendations (Phase 2: aggregator API)
async function fetchBriefingData(
  binding: DataBinding,
  getState: () => AgenticCanvasStore
): Promise<{ data: unknown; ttl: number }> {
  const state = getState();
  const params = binding.query.params ?? {};
  const activeSpace = state.workspace.spaces.find((s) => s.id === state.activeSpaceId);

  const now = Date.now();
  const fallbackSince = now - 24 * 60 * 60 * 1000;
  const since =
    (typeof params.since === "number" ? params.since : undefined) ??
    activeSpace?.briefingConfig?.sinceTimestamp ??
    (activeSpace?.lastVisitedAt && activeSpace?.createdAt
      ? Math.abs(activeSpace.lastVisitedAt - activeSpace.createdAt) < 60_000
        ? fallbackSince
        : activeSpace.lastVisitedAt
      : undefined) ??
    fallbackSince;

  const normalizeParam = (value: unknown) =>
    typeof value === "string" && value.startsWith("$") ? undefined : value;

  const requestBody = {
    since,
    repos: params.repos ?? activeSpace?.briefingConfig?.repos ?? [],
    slackUserId:
      normalizeParam(params.slackUserId) ??
      activeSpace?.briefingConfig?.slackUserId,
    slackChannels: params.slackChannels ?? activeSpace?.briefingConfig?.slackChannels,
    vercelProjectId:
      normalizeParam(params.vercelProjectId) ??
      activeSpace?.briefingConfig?.vercelProjectId,
    vercelTeamId:
      normalizeParam(params.vercelTeamId) ??
      activeSpace?.briefingConfig?.vercelTeamId,
    generateNarrative: params.generateNarrative ?? true,
  };

  try {
    const response = await fetch("/api/briefing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error ?? `API error: ${response.status}`);
    }

    return response.json();
  } catch {
    const repos = Array.isArray(requestBody.repos) ? requestBody.repos : [];
    const repoLabel = repos.length > 0 ? repos.join(", ") : "your repos";
    return {
      data: {
        summary: "Your briefing space is set up. Ask me to catch you up when you're ready.",
        sinceLabel: "Since your last visit",
        sections: [
          {
            title: "Setup",
            items: [
              {
                icon: "alert",
                text: `Tracking ${repoLabel}. I'll surface anything that needs your attention.`,
                priority: "low",
              },
            ],
          },
        ],
        generatedAt: now,
      },
      ttl: 300000,
    };
  }
}

// Fetch data from GitHub API route
async function fetchGitHubData(binding: DataBinding): Promise<{ data: unknown; ttl: number }> {
  const { query } = binding;

  const response = await fetch("/api/github", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: query.type,
      params: query.params,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error ?? `API error: ${response.status}`);
  }

  return response.json();
}

// Fetch data from PostHog API route
async function fetchPostHogData(binding: DataBinding): Promise<{ data: unknown; ttl: number }> {
  const { query } = binding;

  const response = await fetch("/api/posthog", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: query.type,
      params: query.params,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error ?? `API error: ${response.status}`);
  }

  return response.json();
}

// Fetch data from Slack API route
async function fetchSlackData(binding: DataBinding): Promise<{ data: unknown; ttl: number }> {
  const { query } = binding;

  const response = await fetch("/api/slack", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: query.type,
      params: query.params,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error ?? `API error: ${response.status}`);
  }

  return response.json();
}

// Fetch data from Vercel API route
async function fetchVercelData(binding: DataBinding): Promise<{ data: unknown; ttl: number }> {
  const { query } = binding;
  const params = { ...(query.params ?? {}) } as Record<string, unknown>;
  const isPlaceholder = (value: unknown) =>
    typeof value === "string" && value.startsWith("$");
  if (isPlaceholder(params.projectId)) delete params.projectId;
  if (isPlaceholder(params.teamId)) delete params.teamId;

  const response = await fetch("/api/vercel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: query.type,
      params,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error ?? `API error: ${response.status}`);
  }

  return response.json();
}

/**
 * Apply a transform to data.
 * The code should be a JavaScript function body that receives `data` and returns the transformed result.
 * Example code: "return data.filter(m => m.mentions?.some(u => u.username === 'pete'))"
 *
 * NOTE: This intentionally uses new Function() to execute LLM-generated JavaScript.
 * Transforms run client-side in the user's browser where they already have full access
 * to their own data. The transform code is generated deterministically by the LLM
 * and stored by the user.
 */
function applyTransform(data: unknown, code: string): unknown {
  // Create a function from the code string
  // The code should be the function BODY, receiving `data` as input
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const fn = new Function("data", code);
  return fn(data);
}

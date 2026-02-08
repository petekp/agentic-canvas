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
import type { ComponentId, DataBinding, DataLoadingState, DataError } from "@/types";

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
  invalidateCache: (pattern?: string) => void;
  initializeData: () => void;
  _setCacheEntry: (key: string, data: CachedData) => void;
  _setComponentDataState: (componentId: ComponentId, state: DataLoadingState) => void;
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
      const startedAt = Date.now();
      set((state) => {
        setLoadingForMatchingComponents(state, startedAt);
      });
      return existingFetch;
    }

    const startedAt = Date.now();
    const fetchPromise = (async () => {
      try {
        // Fetch from appropriate API based on source
        const result = await fetchDataFromSource(binding);

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
              // Fall back to untransformed data
            }
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

    // Re-fetch
    await get().fetchData(componentId, component.dataBinding);
  },

  invalidateCache: (pattern) => {
    set((state) => {
      if (!pattern) {
        state.dataCache.clear();
      } else {
        const regex = new RegExp(pattern);
        for (const key of state.dataCache.keys()) {
          if (regex.test(key)) {
            state.dataCache.delete(key);
          }
        }
      }
    });
  },

  initializeData: () => {
    // Fetch data for all components with data bindings
    // Called after rehydration from localStorage
    const components = get().canvas.components;
    for (const component of components) {
      if (component.dataBinding) {
        get().fetchData(component.id, component.dataBinding);
      }
    }
  },

  _setCacheEntry: (key, data) => {
    set((state) => {
      state.dataCache.set(key, data);
    });
  },

  _setComponentDataState: (componentId, dataState) => {
    set((state) => {
      const comp = state.canvas.components.find((c) => c.id === componentId);
      if (comp) {
        comp.dataState = dataState;
      }
    });
  },
});

// Generate cache key from binding
function generateCacheKey(binding: DataBinding): string {
  return `${binding.source}:${binding.query.type}:${JSON.stringify(binding.query.params)}`;
}

// Route to appropriate data source
async function fetchDataFromSource(binding: DataBinding): Promise<{ data: unknown; ttl: number }> {
  switch (binding.source) {
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

  const response = await fetch("/api/vercel", {
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

// Data Slice - manages data fetching and caching
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
  pendingFetches: Set<string>;
  fetchData: (componentId: ComponentId, binding: DataBinding) => Promise<void>;
  refreshComponent: (componentId: ComponentId) => Promise<void>;
  invalidateCache: (pattern?: string) => void;
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
  pendingFetches: new Set(),

  fetchData: async (componentId, binding) => {
    const cacheKey = generateCacheKey(binding);

    // Check cache
    const cached = get().dataCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < cached.ttl) {
      set((state) => {
        const comp = state.canvas.components.find((c) => c.id === componentId);
        if (comp) {
          comp.dataState = { status: "ready", data: cached.data, fetchedAt: cached.fetchedAt };
        }
      });
      return;
    }

    // Check if already fetching
    if (get().pendingFetches.has(cacheKey)) {
      return;
    }

    // Set loading state
    set((state) => {
      state.pendingFetches.add(cacheKey);
      const comp = state.canvas.components.find((c) => c.id === componentId);
      if (comp) {
        comp.dataState = { status: "loading", startedAt: Date.now() };
      }
    });

    try {
      // Fetch from GitHub API
      const result = await fetchGitHubData(binding);

      // Update cache and component
      set((state) => {
        state.dataCache.set(cacheKey, {
          data: result.data,
          fetchedAt: Date.now(),
          ttl: result.ttl,
          binding,
        });
        state.pendingFetches.delete(cacheKey);

        const comp = state.canvas.components.find((c) => c.id === componentId);
        if (comp) {
          comp.dataState = { status: "ready", data: result.data, fetchedAt: Date.now() };
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

      set((state) => {
        state.pendingFetches.delete(cacheKey);
        const comp = state.canvas.components.find((c) => c.id === componentId);
        if (comp) {
          comp.dataState = { status: "error", error: dataError, attemptedAt: Date.now() };
        }
      });
    }
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

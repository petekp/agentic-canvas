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
      // v0.1: Use mock data source
      const result = await fetchMockData(binding);

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

// Mock data fetcher (v0.1)
async function fetchMockData(binding: DataBinding): Promise<{ data: unknown; ttl: number }> {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 500));

  const { query } = binding;

  // Return mock data based on query type
  switch (query.type) {
    case "pull_requests":
      return {
        data: generateMockPRs(query.params as { repo?: string; limit?: number }),
        ttl: 60000,
      };
    case "issues":
      return {
        data: generateMockIssues(query.params as { repo?: string; limit?: number }),
        ttl: 60000,
      };
    case "stats":
      return {
        data: generateMockStats(query.params as { repo?: string; metric?: string }),
        ttl: 30000,
      };
    case "activity":
      return {
        data: generateMockActivity(query.params as { repo?: string; limit?: number }),
        ttl: 30000,
      };
    default:
      return { data: null, ttl: 60000 };
  }
}

// Mock data generators
function generateMockPRs(params: { repo?: string; limit?: number }) {
  const limit = params.limit ?? 5;
  return Array.from({ length: limit }, (_, i) => ({
    id: `pr_${i + 1}`,
    number: 100 + i,
    title: `Feature: Add ${["authentication", "caching", "logging", "metrics", "validation"][i % 5]}`,
    author: ["alice", "bob", "charlie", "diana", "eve"][i % 5],
    state: i === 0 ? "open" : i % 3 === 0 ? "merged" : "open",
    createdAt: Date.now() - i * 86400000,
    updatedAt: Date.now() - i * 3600000,
    labels: i % 2 === 0 ? ["enhancement"] : ["bug"],
  }));
}

function generateMockIssues(params: { repo?: string; limit?: number }) {
  const limit = params.limit ?? 10;
  return Array.from({ length: limit }, (_, i) => ({
    id: `issue_${i + 1}`,
    number: 50 + i,
    title: `Issue: ${["Fix crash", "Add feature", "Update docs", "Improve perf", "Refactor"][i % 5]}`,
    author: ["user1", "user2", "user3"][i % 3],
    state: i % 4 === 0 ? "closed" : "open",
    labels: [["bug", "high-priority"], ["enhancement"], ["documentation"], ["performance"], ["refactor"]][i % 5],
    createdAt: Date.now() - i * 172800000,
  }));
}

function generateMockStats(params: { repo?: string; metric?: string }) {
  const metrics: Record<string, { value: number; trend: number }> = {
    open_prs: { value: 12, trend: 2 },
    open_issues: { value: 34, trend: -5 },
    stars: { value: 1250, trend: 15 },
    forks: { value: 89, trend: 3 },
    contributors: { value: 24, trend: 1 },
  };
  return metrics[params.metric ?? "open_prs"] ?? { value: 0, trend: 0 };
}

function generateMockActivity(params: { repo?: string; limit?: number }) {
  const limit = params.limit ?? 10;
  const types = ["push", "pr", "issue", "comment", "release"];
  return Array.from({ length: limit }, (_, i) => ({
    id: `activity_${i + 1}`,
    type: types[i % types.length],
    actor: ["alice", "bob", "charlie"][i % 3],
    message: `${types[i % types.length]} activity #${i + 1}`,
    timestamp: Date.now() - i * 1800000,
  }));
}

// Memory types for Supermemory integration

export type MemoryType =
  | "canvas_snapshot"
  | "insight_generated"
  | "insight_feedback"
  | "learned_pattern"
  | "user_preference";

export interface MemoryMetadata {
  type: MemoryType;
  projectId?: string;
  insightId?: string;
  action?: "dismissed" | "acted_on" | "followed_up";
  timestamp: number;
}

export interface StoredMemory {
  id: string;
  content: string;
  metadata: MemoryMetadata;
  createdAt: string;
}

export interface UserProfile {
  preferences: Record<string, string>;
  patterns: string[];
  recentTopics: string[];
}

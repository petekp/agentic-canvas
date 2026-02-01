// Insight types for the proactive insight loop

export interface GeneratedInsight {
  id: string;
  title: string;
  message: string;
  priority: "low" | "medium" | "high";
  category: "correlation" | "anomaly" | "opportunity" | "risk" | "celebration";
  suggestedAction?: {
    label: string;
    type: "send_chat" | "open_url";
    payload: string;
  };
}

export interface InsightContext {
  canvasComponents: Array<{
    id: string;
    typeId: string;
    label?: string;
    data: unknown;
  }>;
  recentChanges: Array<{
    type: string;
    title: string;
    message: string;
    timestamp: number;
  }>;
  gitStatus?: {
    branch: string;
    uncommittedChanges: number;
    stagedChanges: number;
  };
}

"use client";

import { ActivityFeedItem } from "./shared";
import type { ActivityData } from "./types";

interface ActivityTimelineContentProps {
  data: ActivityData[];
}

export function ActivityTimelineContent({ data }: ActivityTimelineContentProps) {
  if (!Array.isArray(data) || data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No activity matches the current filter.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {data.map((activity) => (
        <ActivityFeedItem
          key={activity.id}
          id={activity.id}
          type={activity.type}
          message={activity.message}
          subtitle={activity.actor}
          timestamp={activity.timestamp}
        />
      ))}
    </ul>
  );
}

export default ActivityTimelineContent;

"use client";

import { ActivityFeedItem } from "./shared";
import type { ActivityData } from "./types";

interface ActivityTimelineContentProps {
  data: ActivityData[];
}

export function ActivityTimelineContent({ data }: ActivityTimelineContentProps) {
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

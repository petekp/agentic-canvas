"use client";

import type { PropertyBreakdownData } from "./types";

interface PropertyBreakdownContentProps {
  data: PropertyBreakdownData;
}

export function PropertyBreakdownContent({ data }: PropertyBreakdownContentProps) {
  const { properties, total } = data;
  const maxValue = properties[0]?.value ?? 1;

  return (
    <div className="flex flex-col gap-2 h-full overflow-auto">
      <div className="text-xs text-muted-foreground">
        {total.toLocaleString()} total
      </div>
      <div className="flex flex-col gap-1.5">
        {properties.map((prop) => {
          const widthPercent = (prop.value / maxValue) * 100;
          return (
            <div key={prop.name} className="flex flex-col gap-0.5">
              <div className="flex justify-between text-sm">
                <span className="truncate">{prop.name}</span>
                <span className="text-muted-foreground shrink-0 ml-2">
                  {prop.value.toLocaleString()}
                </span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary/60 rounded-full transition-all"
                  style={{ width: `${widthPercent}%` }}
                />
              </div>
            </div>
          );
        })}
        {properties.length === 0 && (
          <div className="text-muted-foreground text-sm text-center py-4">
            No data available
          </div>
        )}
      </div>
    </div>
  );
}

export default PropertyBreakdownContent;

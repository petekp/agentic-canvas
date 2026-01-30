"use client";

// Grid background visualization
// Shows the underlying grid structure for component placement

import type { GridConfig } from "@/types";

interface CanvasGridProps {
  grid: GridConfig;
}

export function CanvasGrid({ grid }: CanvasGridProps) {
  const { columns, rows, gap, cellWidth, cellHeight } = grid;

  // Don't render until dimensions are calculated
  if (cellWidth === 0 || cellHeight === 0) {
    return null;
  }

  // Generate grid cells
  const cells = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const x = col * (cellWidth + gap);
      const y = row * (cellHeight + gap);

      cells.push(
        <div
          key={`${col}-${row}`}
          className="absolute rounded-md border border-[var(--grid-color)] bg-[var(--grid-color)]/30"
          style={{
            left: x,
            top: y,
            width: cellWidth,
            height: cellHeight,
          }}
        />
      );
    }
  }

  return (
    <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
      {cells}
    </div>
  );
}

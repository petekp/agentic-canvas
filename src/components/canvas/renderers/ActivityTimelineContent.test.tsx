// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ActivityTimelineContent } from "@/components/canvas/renderers/ActivityTimelineContent";

describe("ActivityTimelineContent", () => {
  it("shows an explicit empty state when there are no items", () => {
    render(<ActivityTimelineContent data={[]} />);

    expect(
      screen.getByText("No activity matches the current filter.")
    ).toBeTruthy();
  });
});


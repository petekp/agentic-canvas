// API route for storing insight feedback
// Memory operations must be server-side to access environment variables

import { createMemoryService } from "@/lib/memory";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { userId, insightId, action } = await req.json();

    if (!insightId || !action) {
      return NextResponse.json(
        { error: "Missing required fields: insightId and action" },
        { status: 400 }
      );
    }

    // Validate action type
    if (!["dismissed", "acted_on", "followed_up"].includes(action)) {
      return NextResponse.json(
        { error: "Invalid action. Must be one of: dismissed, acted_on, followed_up" },
        { status: 400 }
      );
    }

    const memoryService = createMemoryService(userId || "default_user");
    await memoryService.storeInsightFeedback(insightId, action);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to store insight feedback:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to store feedback" },
      { status: 500 }
    );
  }
}

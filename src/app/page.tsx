"use client";

// Root Page - redirects to appropriate location
// See: .claude/plans/spaces-navigation-v0.2.md

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSpaces } from "@/hooks/useSpaces";

export default function Home() {
  const router = useRouter();
  const { spaces, lastSpaceId } = useSpaces();

  useEffect(() => {
    if (spaces.length === 0) {
      // New user - show grid with onboarding
      router.replace("/spaces");
    } else if (lastSpaceId && spaces.some((s) => s.id === lastSpaceId)) {
      // Returning user - go to last visited space
      router.replace(`/spaces/${lastSpaceId}`);
    } else {
      // Has spaces but no valid last - show grid
      router.replace("/spaces");
    }
  }, [spaces, lastSpaceId, router]);

  // Show loading while redirecting
  return (
    <div className="h-screen flex items-center justify-center">
      <div className="text-muted-foreground">Loading...</div>
    </div>
  );
}

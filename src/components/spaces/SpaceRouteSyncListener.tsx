"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSpaces } from "@/hooks/useSpaces";
import { SPACE_NAVIGATE_EVENT } from "@/lib/space-route-sync";

export function SpaceRouteSyncListener() {
  const router = useRouter();
  const { loadSpace, activeSpaceId } = useSpaces();

  useEffect(() => {
    const handleNavigate = (event: Event) => {
      const customEvent = event as CustomEvent<{ spaceId?: string }>;
      const spaceId = customEvent.detail?.spaceId;
      if (!spaceId) return;

      if (spaceId !== activeSpaceId) {
        loadSpace(spaceId);
      }
      router.push(`/spaces/${spaceId}`);
    };

    window.addEventListener(SPACE_NAVIGATE_EVENT, handleNavigate as EventListener);
    return () => {
      window.removeEventListener(
        SPACE_NAVIGATE_EVENT,
        handleNavigate as EventListener
      );
    };
  }, [activeSpaceId, loadSpace, router]);

  return null;
}

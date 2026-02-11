"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSpaces } from "@/hooks/useSpaces";
import { SPACE_NAVIGATE_EVENT } from "@/lib/space-route-sync";

function isSameLocalDay(leftIso: string | undefined, now: Date): boolean {
  if (!leftIso) return false;
  const left = new Date(leftIso);
  return (
    left.getFullYear() === now.getFullYear() &&
    left.getMonth() === now.getMonth() &&
    left.getDate() === now.getDate()
  );
}

export function SpaceRouteSyncListener() {
  const router = useRouter();
  const pathname = usePathname();
  const {
    spaces,
    workspaceSettings,
    morningBriefRuntime,
    loadSpace,
    activeSpaceId,
    markMorningBriefAutoOpened,
  } = useSpaces();

  useEffect(() => {
    if (pathname !== "/spaces") {
      return;
    }

    if (!workspaceSettings.autoOpenMorningBrief) {
      return;
    }

    const morningBriefSpace = spaces.find((space) => space.kind === "system.morning_brief");
    if (!morningBriefSpace) {
      return;
    }

    if (isSameLocalDay(morningBriefRuntime.lastAutoOpenedAt, new Date())) {
      return;
    }

    if (morningBriefSpace.id !== activeSpaceId) {
      loadSpace(morningBriefSpace.id);
    }
    markMorningBriefAutoOpened();
    router.replace(`/spaces/${morningBriefSpace.id}`);
  }, [
    pathname,
    spaces,
    workspaceSettings.autoOpenMorningBrief,
    morningBriefRuntime.lastAutoOpenedAt,
    activeSpaceId,
    loadSpace,
    markMorningBriefAutoOpened,
    router,
  ]);

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

export const SPACE_NAVIGATE_EVENT = "agentic-canvas:navigate-space";

export function syncSpaceRoute(spaceId: string): void {
  if (typeof window === "undefined") return;

  const currentPath = window.location.pathname;
  const isSpacesRoute =
    currentPath === "/spaces" || currentPath.startsWith("/spaces/");
  if (!isSpacesRoute) return;

  const targetPath = `/spaces/${spaceId}`;
  if (currentPath === targetPath) return;

  window.dispatchEvent(
    new CustomEvent<{ spaceId: string }>(SPACE_NAVIGATE_EVENT, {
      detail: { spaceId },
    })
  );
}

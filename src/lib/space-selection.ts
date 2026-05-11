import type { Space } from "@/types";

function isSystemManaged(space: Space): boolean {
  return space.meta?.systemManaged ?? false;
}

function rankSpaceRecency(space: Space): number {
  if (typeof space.updatedAt === "number") return space.updatedAt;
  if (typeof space.lastVisitedAt === "number") return space.lastVisitedAt;
  if (typeof space.createdAt === "number") return space.createdAt;
  return 0;
}

function compareSpacePreference(
  a: Space,
  b: Space,
  activeSpaceId: string | null | undefined
): number {
  const aIsActive = activeSpaceId ? a.id === activeSpaceId : false;
  const bIsActive = activeSpaceId ? b.id === activeSpaceId : false;
  if (aIsActive !== bIsActive) {
    return aIsActive ? -1 : 1;
  }

  const aSystemManaged = isSystemManaged(a);
  const bSystemManaged = isSystemManaged(b);
  if (aSystemManaged !== bSystemManaged) {
    return aSystemManaged ? 1 : -1;
  }

  const recencyDiff = rankSpaceRecency(b) - rankSpaceRecency(a);
  if (recencyDiff !== 0) {
    return recencyDiff;
  }

  return a.id.localeCompare(b.id);
}

export function resolveSpaceIdentifier(
  spaces: Space[],
  identifier: string,
  activeSpaceId?: string | null
): Space | undefined {
  const byId = spaces.find((space) => space.id === identifier);
  if (byId) return byId;

  const exactNameMatches = spaces.filter((space) => space.name === identifier);
  if (exactNameMatches.length === 1) return exactNameMatches[0];
  if (exactNameMatches.length > 1) {
    return exactNameMatches
      .slice()
      .sort((a, b) => compareSpacePreference(a, b, activeSpaceId))[0];
  }

  const normalizedIdentifier = identifier.trim().toLowerCase();
  if (!normalizedIdentifier) return undefined;
  const caseInsensitiveMatches = spaces.filter(
    (space) => space.name.trim().toLowerCase() === normalizedIdentifier
  );
  if (caseInsensitiveMatches.length === 0) return undefined;
  if (caseInsensitiveMatches.length === 1) return caseInsensitiveMatches[0];
  return caseInsensitiveMatches
    .slice()
    .sort((a, b) => compareSpacePreference(a, b, activeSpaceId))[0];
}

export function ensureUniqueSpaceName(
  spaces: Space[],
  desiredName: string
): string {
  const normalizedDesired = desiredName.trim();
  if (!normalizedDesired) {
    return "Untitled Space";
  }

  const existingNames = new Set(
    spaces.map((space) => space.name.trim().toLowerCase()).filter(Boolean)
  );
  if (!existingNames.has(normalizedDesired.toLowerCase())) {
    return normalizedDesired;
  }

  let index = 2;
  let candidate = `${normalizedDesired} (${index})`;
  while (existingNames.has(candidate.toLowerCase())) {
    index += 1;
    candidate = `${normalizedDesired} (${index})`;
  }

  return candidate;
}

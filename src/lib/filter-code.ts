function escapeJsString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function extractActorLoginTarget(filterCode: string): string | null {
  const directMatch = filterCode.match(
    /actor\??\.login\s*===\s*['"]([^'"]+)['"]/i
  );
  if (directMatch?.[1]) return directMatch[1];

  const fallback = filterCode.match(/['"]([a-zA-Z0-9_-]{2,})['"]/);
  return fallback?.[1] ?? null;
}

export function normalizeFilterCodeForType(
  typeId: string,
  filterCode: string
): string {
  if (typeId !== "github.activity-timeline") {
    return filterCode;
  }

  if (!/actor\??\.login/i.test(filterCode)) {
    return filterCode;
  }

  const target = extractActorLoginTarget(filterCode);
  if (!target) {
    return filterCode;
  }

  const escapedTarget = escapeJsString(target.toLowerCase());
  return [
    `const __target = '${escapedTarget}';`,
    "const __items = Array.isArray(data)",
    "  ? data",
    "  : (Array.isArray(data?.items) ? data.items : []);",
    "const __filtered = __items.filter((activity) => {",
    "  const __actor = typeof activity?.actor === 'string'",
    "    ? activity.actor",
    "    : activity?.actor?.login;",
    "  return typeof __actor === 'string' && __actor.toLowerCase() === __target;",
    "});",
    "if (Array.isArray(data?.items)) return { ...data, items: __filtered };",
    "return __filtered;",
  ].join("\n");
}


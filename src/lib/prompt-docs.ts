import { readFileSync } from "node:fs";
import { join } from "node:path";

const promptDocCache = new Map<string, string>();
const warnedPaths = new Set<string>();

function normalizePromptDocContent(content: string): string {
  return content.replace(/\r\n/g, "\n").trim();
}

export function loadPromptDoc(relativePath: string, fallback: string): string {
  const cached = promptDocCache.get(relativePath);
  if (cached) {
    return cached;
  }

  const fullPath = join(process.cwd(), relativePath);

  try {
    const fileContent = readFileSync(fullPath, "utf8");
    const normalized = normalizePromptDocContent(fileContent);
    promptDocCache.set(relativePath, normalized);
    return normalized;
  } catch (error) {
    if (!warnedPaths.has(relativePath)) {
      warnedPaths.add(relativePath);
      const details = error instanceof Error ? error.message : String(error);
      console.warn(`Prompt doc missing at ${relativePath}; using fallback.`, details);
    }
    const normalizedFallback = normalizePromptDocContent(fallback);
    promptDocCache.set(relativePath, normalizedFallback);
    return normalizedFallback;
  }
}

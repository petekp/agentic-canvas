// Supermemory client singleton
// Returns null if SUPERMEMORY_API_KEY is not configured (optional feature)

import Supermemory from "supermemory";

// Singleton client instance
let client: Supermemory | null = null;
let initialized = false;

/**
 * Get the Supermemory client, or null if not configured.
 * Supermemory is an optional feature - the app works without it.
 */
export function getSupermemoryClient(): Supermemory | null {
  if (!initialized) {
    initialized = true;
    const apiKey = process.env.SUPERMEMORY_API_KEY;
    if (apiKey) {
      client = new Supermemory({ apiKey });
    }
  }
  return client;
}

/**
 * Check if Supermemory is configured and available.
 */
export function isSupermemoryConfigured(): boolean {
  return getSupermemoryClient() !== null;
}

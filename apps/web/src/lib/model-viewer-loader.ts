"use client";

let loadPromise: Promise<void> | null = null;

// `/learn/*` and the modelview surface lazy-load the model-viewer bundle via a
// dynamic import. On a freshly redeployed static export a client that still
// holds stale HTML can request a chunk hash that no longer exists, surfacing a
// transient `TypeError: Failed to fetch` in the console (observed in QA v5).
// A few spaced retries let that self-heal, and clearing `loadPromise` on final
// failure lets a later component remount try again from scratch.
const DEFAULT_RETRIES = 3;
const BASE_DELAY_MS = 400;

export function ensureModelViewerLoaded(retries = DEFAULT_RETRIES): Promise<void> {
  if (typeof window !== "undefined" && window.customElements?.get("model-viewer")) {
    return Promise.resolve();
  }

  if (!loadPromise) {
    loadPromise = loadWithRetry(retries);
  }

  return loadPromise;
}

async function loadWithRetry(retries: number): Promise<void> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      await import("@google/model-viewer");
      if (typeof window !== "undefined" && window.customElements?.get("model-viewer")) {
        return;
      }
      throw new Error("model-viewer custom element was not registered");
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await delay(BASE_DELAY_MS * 2 ** attempt);
      }
    }
  }

  loadPromise = null;
  throw lastError instanceof Error
    ? lastError
    : new Error("model-viewer failed to load");
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

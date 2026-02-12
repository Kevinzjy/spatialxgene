/**
 * Debug logging: only outputs when debug mode is enabled (--debug from CLI, /api/config).
 * Use for troubleshooting without affecting production console.
 */

let debugEnabled = false;

export function setDebugMode(enabled: boolean): void {
  debugEnabled = enabled;
}

/** Log to console only when debug mode is on. Prefix: [spatialxgene] */
export function debugLog(...args: unknown[]): void {
  if (debugEnabled) {
    console.log("[spatialxgene]", ...args);
  }
}

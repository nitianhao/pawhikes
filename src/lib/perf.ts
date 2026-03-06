const PERF_ENABLED = process.env.PERF_LOG === "1";

function now(): number {
  if (typeof globalThis !== "undefined" && typeof (globalThis as any).performance?.now === "function") {
    return (globalThis as any).performance.now();
  }
  return Date.now();
}

/**
 * Runs an async function and logs duration when PERF_LOG=1.
 * When PERF_LOG !== "1", just runs fn() without timing or logging.
 */
export async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  if (!PERF_ENABLED) return fn();
  const start = now();
  const result = await fn();
  const elapsed = now() - start;
  const ms = typeof elapsed === "number" && Number.isFinite(elapsed) ? elapsed : 0;
  console.log(`[perf] ${label} ${ms.toFixed(1)}ms`);
  return result;
}

/**
 * Rough size in KB of a value when JSON-serialized (UTF-8).
 * Returns 0 on error (e.g. circular refs).
 */
export function roughSizeKB(value: unknown): number {
  try {
    const str = JSON.stringify(value);
    return Buffer.byteLength(str, "utf8") / 1024;
  } catch {
    return 0;
  }
}

/** Log payload size only when PERF_LOG=1 (avoids expensive serialization when off). */
export function logPayloadIfEnabled(label: string, data: unknown): void {
  if (!PERF_ENABLED) return;
  console.log(`[perf] payload ${label} ~${roughSizeKB(data).toFixed(1)}kb`);
}

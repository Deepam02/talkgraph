/**
 * Fixed-window in-memory rate limiter. Per serverless instance, so it is a
 * speed bump rather than a hard quota; put a shared store behind it for that.
 */
const windows = new Map<string, { count: number; reset: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const w = windows.get(key);
  if (!w || w.reset <= now) {
    windows.set(key, { count: 1, reset: now + windowMs });
    if (windows.size > 5000) for (const [k, v] of windows) if (v.reset <= now) windows.delete(k);
    return true;
  }
  if (w.count >= limit) return false;
  w.count++;
  return true;
}

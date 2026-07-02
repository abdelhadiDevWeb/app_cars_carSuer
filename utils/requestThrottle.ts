/**
 * Lightweight in-memory throttle for identical async work (e.g. notification refresh).
 */
export function createAsyncThrottle(minIntervalMs: number) {
  let lastRunAt = 0;
  let inFlight: Promise<void> | null = null;

  return async function runThrottled(task: () => Promise<void>): Promise<void> {
    const now = Date.now();
    if (inFlight) {
      return inFlight;
    }
    if (now - lastRunAt < minIntervalMs) {
      return;
    }

    lastRunAt = now;
    inFlight = task()
      .catch(() => {
        /* caller logs errors */
      })
      .finally(() => {
        inFlight = null;
      });

    return inFlight;
  };
}

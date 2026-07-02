/** Short-lived cache so reopening the same car details does not refetch immediately. */

const CACHE_TTL_MS = 60_000;
const MIN_REFETCH_MS = 8_000;

type CarDetailsCacheEntry = {
  car: unknown;
  appointments: unknown[];
  fetchedAt: number;
};

const cache = new Map<string, CarDetailsCacheEntry>();
const lastFetchAt = new Map<string, number>();

export function getCarDetailsCache(carId: string): CarDetailsCacheEntry | null {
  const entry = cache.get(carId);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) {
    cache.delete(carId);
    return null;
  }
  return entry;
}

export function setCarDetailsCache(
  carId: string,
  car: unknown,
  appointments: unknown[],
): void {
  const now = Date.now();
  cache.set(carId, { car, appointments, fetchedAt: now });
  lastFetchAt.set(carId, now);
}

export function shouldSkipCarDetailsFetch(carId: string, force: boolean): boolean {
  if (force) return false;
  const last = lastFetchAt.get(carId);
  if (!last) return false;
  return Date.now() - last < MIN_REFETCH_MS;
}

export function touchCarDetailsFetch(carId: string): void {
  lastFetchAt.set(carId, Date.now());
}

export function clearCarDetailsCache(carId?: string): void {
  if (carId) {
    cache.delete(carId);
    lastFetchAt.delete(carId);
    return;
  }
  cache.clear();
  lastFetchAt.clear();
}

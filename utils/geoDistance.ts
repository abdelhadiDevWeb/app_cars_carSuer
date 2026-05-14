const DEG2RAD = Math.PI / 180;

/**
 * Haversine distance between two lat/lng points in kilometres.
 */
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLat = (lat2 - lat1) * DEG2RAD;
  const dLng = (lng2 - lng1) * DEG2RAD;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG2RAD) * Math.cos(lat2 * DEG2RAD) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Normalise an Algerian wilaya / region string for fuzzy matching.
 * Strips diacritics, lowercases, collapses whitespace.
 * Returns `null` for empty/null inputs so callers can short-circuit.
 */
export function normalizeRegion(region: string | null | undefined): string | null {
  if (!region) return null;
  return region
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF]/g, " ")
    .replace(/\s+/g, " ")
    .trim() || null;
}

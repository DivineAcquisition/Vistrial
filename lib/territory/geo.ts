/**
 * Pure geometry helpers for exclusivity. No network, no database.
 */

const EARTH_RADIUS_MILES = 3958.7613;

export type LatLng = { lat: number; lng: number };

/** Great-circle distance in miles (haversine). */
export function distanceMiles(a: LatLng, b: LatLng): number {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Two radius territories overlap when centers are closer than the sum of radii. */
export function radiiOverlap(
  a: LatLng & { radiusMiles: number },
  b: LatLng & { radiusMiles: number }
): boolean {
  return distanceMiles(a, b) < a.radiusMiles + b.radiusMiles;
}

/** True when any normalized postal code appears in both lists. */
export function postalCodesOverlap(a: string[], b: string[]): boolean {
  const set = new Set(a.map(normalizePostal));
  return b.some((code) => set.has(normalizePostal(code)));
}

export function normalizePostal(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

export function normalizeRegion(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Named regions overlap when any normalized name appears in both lists. */
export function regionsOverlap(a: string[], b: string[]): boolean {
  const set = new Set(a.map(normalizeRegion));
  return b.some((name) => set.has(normalizeRegion(name)));
}

/**
 * Whether two radius territories are "nearby" for the volume-drop signal:
 * centers within the larger radius plus a small buffer, even if they do not
 * formally overlap. Used only as a symptom check, not for exclusivity blocking.
 */
export function radiiNearby(
  a: LatLng & { radiusMiles: number },
  b: LatLng & { radiusMiles: number },
  bufferMiles = 25
): boolean {
  return distanceMiles(a, b) < Math.max(a.radiusMiles, b.radiusMiles) + bufferMiles;
}

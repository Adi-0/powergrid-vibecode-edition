/**
 * Geography for the synthetic California network.
 *
 * Sites are placed at the real coordinates of the places they are named after,
 * so that the map reads as California and a user can recognise where they are.
 * The ELECTRICAL network connecting them is synthetic — see docs/model.md. The
 * names are real; the circuits between them are a plausible reconstruction,
 * not a copy of any utility's actual system.
 */

/** Projection origin: roughly the centre of the state. */
export const PROJECTION_ORIGIN = { lat: 37.0, lon: -119.5 };

const KM_PER_DEG_LAT = 110.574;
const KM_PER_DEG_LON_AT = (lat: number) => 111.320 * Math.cos((lat * Math.PI) / 180);

/**
 * Equirectangular projection to kilometres east/north of the origin. At the
 * scale of one state the distortion is small and the arithmetic stays
 * inspectable, which matters more here than cartographic rigour.
 */
export function project(lat: number, lon: number): { x: number; y: number } {
  return {
    x: (lon - PROJECTION_ORIGIN.lon) * KM_PER_DEG_LON_AT(PROJECTION_ORIGIN.lat),
    y: (lat - PROJECTION_ORIGIN.lat) * KM_PER_DEG_LAT,
  };
}

/** Great-circle distance between two points, kilometres. */
export function haversineKm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number }
): number {
  const R = 6371.0088;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Transmission lines do not run straight: they follow ridgelines, right-of-way
 * and land ownership. A circuity factor of 1.15 on the great-circle distance is
 * the usual planning approximation and is applied to every route length here.
 */
export const ROUTE_CIRCUITY = 1.15;

export const routeLengthKm = (
  a: { lat: number; lon: number },
  b: { lat: number; lon: number }
): number => haversineKm(a, b) * ROUTE_CIRCUITY;

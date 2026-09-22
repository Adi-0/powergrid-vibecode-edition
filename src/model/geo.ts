/**
 * Geography for the system frame: latitude/longitude → kilometres east and south
 * of a fixed origin in the middle of the state (equirectangular, scaled at the
 * origin's latitude). Accurate to a few percent across California, which is all a
 * schematic network drawing needs; the state outline uses the same projection.
 */
export const GEO_ORIGIN = { lat: 37.0, lon: -119.5 };
const KM_PER_DEG_LAT = 110.574;
const KM_PER_DEG_LON = 111.32 * Math.cos((GEO_ORIGIN.lat * Math.PI) / 180);

/**
 * The system frame is the map turned 45° so geographic north points up the screen in
 * the isometric view (the camera looks along the frame's (1, 0, −1) diagonal).
 * North maps to (1, 0, −1)/√2 and east to (1, 0, 1)/√2. See decision 0005.
 */
const R = Math.SQRT1_2;

/** [x, z] in km in the system frame. */
export function project(lat: number, lon: number): [number, number] {
  const e = (lon - GEO_ORIGIN.lon) * KM_PER_DEG_LON;
  const n = (lat - GEO_ORIGIN.lat) * KM_PER_DEG_LAT;
  return [(e + n) * R, (e - n) * R];
}

export function unproject(x: number, z: number): [number, number] {
  const e = (x + z) * R;
  const n = (x - z) * R;
  return [GEO_ORIGIN.lat + n / KM_PER_DEG_LAT, GEO_ORIGIN.lon + e / KM_PER_DEG_LON];
}

/** Geographic east and north (unit vectors) in the system frame, [x, z]. */
export const EAST: [number, number] = [R, R];
export const NORTH: [number, number] = [R, -R];

/** Great-circle distance, km (haversine, mean Earth radius). */
export function greatCircleKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371.0;
  const r = Math.PI / 180;
  const dLat = (lat2 - lat1) * r;
  const dLon = (lon2 - lon1) * r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

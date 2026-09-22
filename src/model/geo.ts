/**
 * Geography for the system frame: latitude/longitude → kilometres east and south
 * of a fixed origin in the middle of the state (equirectangular, scaled at the
 * origin's latitude). Accurate to a few percent across California, which is all a
 * schematic network drawing needs; the state outline uses the same projection.
 */
export const GEO_ORIGIN = { lat: 37.0, lon: -119.5 };
const KM_PER_DEG_LAT = 110.574;
const KM_PER_DEG_LON = 111.32 * Math.cos((GEO_ORIGIN.lat * Math.PI) / 180);

/** [x east, z south] in km. */
export function project(lat: number, lon: number): [number, number] {
  return [(lon - GEO_ORIGIN.lon) * KM_PER_DEG_LON, (GEO_ORIGIN.lat - lat) * KM_PER_DEG_LAT];
}

export function unproject(x: number, z: number): [number, number] {
  return [GEO_ORIGIN.lat - z / KM_PER_DEG_LAT, GEO_ORIGIN.lon + x / KM_PER_DEG_LON];
}

/** Great-circle distance, km (haversine, mean Earth radius). */
export function greatCircleKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371.0;
  const r = Math.PI / 180;
  const dLat = (lat2 - lat1) * r;
  const dLon = (lon2 - lon1) * r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

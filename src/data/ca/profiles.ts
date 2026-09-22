import type { RegionId } from './network';
import type { SourceId } from '../sources';

/**
 * The modelled day: a hot late-summer weekday. Shapes are of the class seen in
 * CAISO's public daily data (the magnitudes are this model's own); every value
 * here is an estimate of shape, marked as such.
 */
export const DAY = {
  label: 'A hot late-summer weekday',
  /** Day of year (15 August) and the clock's UTC offset (Pacific Daylight Time). */
  doy: 227,
  tzHours: -7,
  /** Interval length for the quasi-static sequence, minutes (the 15-minute market interval). */
  intervalMin: 15,
  /** Gross demand at the day's peak as a fraction of the network's reference peak loads. */
  peakScale: 0.93,
  src: 'caiso' as SourceId,
};

/**
 * Gross demand shape, fraction of the day's peak, at the start of each hour
 * 00:00 … 23:00 (clock time). Air conditioning drives the late-afternoon peak.
 */
export const LOAD_SHAPE: readonly number[] = [
  0.66, 0.62, 0.595, 0.58, 0.58, 0.6, 0.64, 0.69, 0.73, 0.77, 0.81, 0.85, 0.885, 0.915, 0.945, 0.97, 0.99, 1.0, 0.995, 0.97,
  0.93, 0.87, 0.79, 0.72,
];

/** Wind capacity-factor shapes by resource area (summer: the passes blow in the evening). */
export const WIND_SHAPE: Record<'tehachapi' | 'solano' | 'altamont' | 'gorgonio', readonly number[]> = {
  tehachapi: [
    0.52, 0.5, 0.47, 0.44, 0.41, 0.37, 0.32, 0.26, 0.2, 0.16, 0.14, 0.14, 0.16, 0.19, 0.24, 0.31, 0.39, 0.47, 0.55, 0.61,
    0.64, 0.63, 0.6, 0.56,
  ],
  solano: [
    0.45, 0.42, 0.38, 0.34, 0.3, 0.26, 0.22, 0.18, 0.14, 0.13, 0.14, 0.18, 0.24, 0.32, 0.41, 0.49, 0.56, 0.61, 0.63, 0.62,
    0.59, 0.55, 0.51, 0.48,
  ],
  altamont: [
    0.48, 0.45, 0.41, 0.37, 0.33, 0.29, 0.25, 0.2, 0.16, 0.15, 0.16, 0.2, 0.27, 0.35, 0.44, 0.52, 0.59, 0.64, 0.66, 0.65,
    0.62, 0.58, 0.54, 0.51,
  ],
  gorgonio: [
    0.42, 0.4, 0.37, 0.34, 0.31, 0.28, 0.24, 0.2, 0.17, 0.16, 0.17, 0.2, 0.25, 0.31, 0.38, 0.45, 0.51, 0.55, 0.57, 0.56,
    0.53, 0.5, 0.47, 0.44,
  ],
};

/** Daily minimum and maximum air temperature by region, °C (for PV cell temperature). */
export const TEMPERATURE: Record<RegionId, { min: number; max: number }> = {
  north: { min: 18, max: 38 },
  bay: { min: 15, max: 29 },
  central: { min: 22, max: 40 },
  coast: { min: 15, max: 25 },
  la: { min: 20, max: 33 },
  inland: { min: 26, max: 43 },
  sd: { min: 19, max: 29 },
  tie: { min: 24, max: 40 },
};

/** Air temperature at a clock hour: minimum near 05:00, maximum near 15:00. */
export function airTemperature(region: RegionId, hour: number): number {
  const t = TEMPERATURE[region];
  // cosine between the 05:00 minimum and the 15:00 maximum, then back down overnight
  const h = ((hour % 24) + 24) % 24;
  let f: number;
  if (h >= 5 && h <= 15) f = 0.5 - 0.5 * Math.cos((Math.PI * (h - 5)) / 10);
  else {
    const d = h > 15 ? h - 15 : h + 9; // hours since 15:00
    f = 0.5 + 0.5 * Math.cos((Math.PI * d) / 14);
  }
  return t.min + (t.max - t.min) * f;
}

/** Linear interpolation of an hourly shape at a fractional clock hour (wraps at midnight). */
export function hourly(shape: readonly number[], hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  const i = Math.floor(h);
  const f = h - i;
  return shape[i]! * (1 - f) + shape[(i + 1) % 24]! * f;
}

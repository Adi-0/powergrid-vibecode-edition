/**
 * Daily shapes for demand and for weather-driven generation.
 *
 * These are the only *inputs* to the time dimension of the model. Everything
 * else a user sees change over the day — the duck curve, the evening ramp, the
 * marginal price, which plant is setting it, the flows on Path 15 — is computed
 * from these three shapes plus the network, never drawn.
 *
 * Values are hourly and interpolated with a monotone cubic so that the scrubber
 * moves smoothly without overshooting into impossible values (a negative solar
 * output, or a demand above the daily peak).
 *
 * Shapes are normalised: demand to its own daily peak, solar and wind to
 * installed capacity, so the numbers are capacity factors.
 */

export interface DailyShape {
  id: string;
  name: string;
  /** 24 hourly values, hour 0 = midnight local. */
  hourly: number[];
  source: string;
}

/**
 * Summer weekday demand. The shape a beginner should recognise: a trough in the
 * small hours, a climb through the morning, and a sharp peak in the early
 * evening as people come home and air conditioning is still running.
 */
export const DEMAND_SUMMER: DailyShape = {
  id: 'demand-summer',
  name: 'Demand — summer weekday',
  hourly: [
    0.62, 0.59, 0.57, 0.56, 0.57, 0.60, 0.64, 0.68,
    0.71, 0.74, 0.77, 0.80, 0.83, 0.86, 0.90, 0.94,
    0.97, 0.99, 1.00, 0.98, 0.94, 0.87, 0.78, 0.69,
  ],
  source:
    'Shape typical of a hot-weather weekday in a summer-peaking system, ' +
    'normalised to the daily maximum. Trough-to-peak ratio of about 0.56 is ' +
    'characteristic of a large mixed system.',
};

/**
 * Winter demand, for contrast: a lower peak, and two of them — morning and
 * evening — because the driver is lighting and heating rather than cooling.
 */
export const DEMAND_WINTER: DailyShape = {
  id: 'demand-winter',
  name: 'Demand — winter weekday',
  hourly: [
    0.61, 0.59, 0.58, 0.58, 0.60, 0.66, 0.75, 0.82,
    0.83, 0.81, 0.78, 0.76, 0.75, 0.74, 0.75, 0.79,
    0.88, 0.96, 1.00, 0.98, 0.94, 0.88, 0.79, 0.69,
  ],
  source: 'Shape typical of a mild-winter weekday, with a morning and an evening peak.',
};

/**
 * Solar photovoltaic output as a fraction of installed capacity, clear summer
 * day. Zero before sunrise and after sunset; the flat top near midday is the
 * combination of high sun angle and inverters running at their rated limit.
 */
export const SOLAR_SUMMER: DailyShape = {
  id: 'solar-summer',
  name: 'Solar output — clear summer day',
  hourly: [
    0, 0, 0, 0, 0, 0.02, 0.12, 0.30,
    0.50, 0.66, 0.78, 0.85, 0.88, 0.88, 0.84, 0.76,
    0.63, 0.45, 0.24, 0.06, 0, 0, 0, 0,
  ],
  source:
    'Clear-sky output for fixed-tilt and single-axis-tracking photovoltaics at ' +
    'California latitudes in summer. Peak capacity factor of about 0.88 rather ' +
    'than 1.0 because panels are rated at 25 °C and run hotter than that in ' +
    'the field, which lowers their output.',
};

export const SOLAR_WINTER: DailyShape = {
  id: 'solar-winter',
  name: 'Solar output — clear winter day',
  hourly: [
    0, 0, 0, 0, 0, 0, 0.02, 0.14,
    0.34, 0.52, 0.64, 0.70, 0.72, 0.69, 0.60, 0.44,
    0.22, 0.04, 0, 0, 0, 0, 0, 0,
  ],
  source: 'Shorter day and lower sun angle; peak output roughly 80 % of summer.',
};

/**
 * Wind output in the California mountain passes. It peaks in the late
 * afternoon and evening, when hot air rising off the Central Valley and the
 * deserts pulls marine air through the gaps in the coast ranges. This is why
 * California wind partly — but only partly — covers the evening ramp that solar
 * leaves behind.
 */
export const WIND_TYPICAL: DailyShape = {
  id: 'wind-typical',
  name: 'Wind output — typical day',
  hourly: [
    0.35, 0.33, 0.30, 0.28, 0.26, 0.24, 0.22, 0.20,
    0.19, 0.20, 0.23, 0.28, 0.35, 0.43, 0.52, 0.60,
    0.66, 0.70, 0.71, 0.68, 0.62, 0.55, 0.47, 0.40,
  ],
  source:
    'Diurnal pattern for pass-and-ridge wind resources driven by inland ' +
    'heating, which is the dominant wind regime in California.',
};

/**
 * Hydro availability, as a fraction of installed capacity. Not a weather shape:
 * it is the operator choosing when to spend a limited amount of water. Holding
 * water back through the middle of the day and releasing it into the evening
 * peak is worth more, so that is what the shape does.
 */
export const HYDRO_AVAILABILITY: DailyShape = {
  id: 'hydro-availability',
  name: 'Hydro availability — operator schedule',
  hourly: [
    0.25, 0.22, 0.20, 0.20, 0.20, 0.22, 0.28, 0.35,
    0.40, 0.42, 0.42, 0.42, 0.45, 0.50, 0.58, 0.68,
    0.80, 0.92, 1.00, 0.98, 0.88, 0.70, 0.50, 0.35,
  ],
  source:
    'A reservoir holds a fixed amount of energy, so the operator spends it when ' +
    'it displaces the most expensive alternative. Shape chosen so the daily ' +
    'energy is about 45 % of what running flat out would give.',
};

/**
 * Monotone cubic interpolation (Fritsch–Carlson) over a wrapped 24-hour shape.
 *
 * Monotone matters: a plain cubic spline through the solar shape overshoots
 * below zero just after sunset, which would display a solar farm producing
 * negative power. Preserving monotonicity between samples prevents that without
 * the visible corners of linear interpolation.
 */
export function sampleShape(shape: DailyShape, hour: number): number {
  const y = shape.hourly;
  const n = y.length;
  const h = ((hour % n) + n) % n;
  const i = Math.floor(h);
  const t = h - i;
  if (t === 0) return y[i];

  const idx = (k: number) => y[((k % n) + n) % n];
  // Secant slopes either side of each sample.
  const dPrev = idx(i) - idx(i - 1);
  const d0 = idx(i + 1) - idx(i);
  const dNext = idx(i + 2) - idx(i + 1);

  const tangent = (a: number, b: number): number => {
    if (a * b <= 0) return 0; // a local extremum: flatten, do not overshoot
    const m = (a + b) / 2;
    // Fritsch–Carlson limiter.
    return Math.sign(m) * Math.min(Math.abs(m), 3 * Math.min(Math.abs(a), Math.abs(b)));
  };
  const m0 = tangent(dPrev, d0);
  const m1 = tangent(d0, dNext);

  const t2 = t * t;
  const t3 = t2 * t;
  return (
    (2 * t3 - 3 * t2 + 1) * idx(i) +
    (t3 - 2 * t2 + t) * m0 +
    (-2 * t3 + 3 * t2) * idx(i + 1) +
    (t3 - t2) * m1
  );
}

/**
 * Spring demand. The important season, and the one the duck curve was named
 * for: mild weather means little heating and no air conditioning, so demand is
 * at its lowest of the year — while the days are already long and the panels
 * are cool and efficient. Renewable output at its best against demand at its
 * worst is when a system finds out what oversupply feels like.
 */
export const DEMAND_SPRING: DailyShape = {
  id: 'demand-spring',
  name: 'Demand — spring weekday',
  hourly: [
    0.64, 0.61, 0.59, 0.58, 0.59, 0.63, 0.70, 0.76,
    0.78, 0.77, 0.75, 0.73, 0.72, 0.72, 0.73, 0.76,
    0.82, 0.90, 0.98, 1.00, 0.96, 0.88, 0.78, 0.69,
  ],
  source: 'Mild-weather weekday: no cooling load, a modest evening lighting peak.',
};

export const SOLAR_SPRING: DailyShape = {
  id: 'solar-spring',
  name: 'Solar output — clear spring day',
  hourly: [
    0, 0, 0, 0, 0, 0.01, 0.10, 0.30,
    0.52, 0.70, 0.83, 0.91, 0.94, 0.93, 0.87, 0.77,
    0.62, 0.42, 0.20, 0.03, 0, 0, 0, 0,
  ],
  source:
    'The best solar day of the year. Long enough for a high sun angle, cool ' +
    'enough that the panels are not derating — spring output peaks ABOVE ' +
    'midsummer output for exactly that reason.',
};

export type Season = 'summer' | 'winter' | 'spring';

export interface DayProfile {
  season: Season;
  demand: DailyShape;
  solar: DailyShape;
  wind: DailyShape;
  hydro: DailyShape;
  /**
   * The day's own peak as a fraction of the system's annual peak.
   *
   * The demand SHAPE is normalised to its own maximum, so without this every
   * day of the year would peak at the same megawatts, which is the opposite of
   * true. The annual peak happens on a hot summer evening; a spring day never
   * comes close.
   */
  peakScale: number;
  /** One line explaining what is characteristic about this day. */
  blurb: string;
}

export const SUMMER_DAY: DayProfile = {
  season: 'summer', demand: DEMAND_SUMMER, solar: SOLAR_SUMMER,
  wind: WIND_TYPICAL, hydro: HYDRO_AVAILABILITY, peakScale: 1.0,
  blurb:
    'The hardest day of the year. Demand peaks in the early evening just as ' +
    'the solar goes away, and everything else has to climb to cover it.',
};

export const WINTER_DAY: DayProfile = {
  season: 'winter', demand: DEMAND_WINTER, solar: SOLAR_WINTER,
  wind: WIND_TYPICAL, hydro: HYDRO_AVAILABILITY, peakScale: 0.86,
  blurb:
    'Two peaks instead of one, morning and evening, because the driver is ' +
    'lighting and heating rather than cooling. A shorter day of weaker sun.',
};

export const SPRING_DAY: DayProfile = {
  season: 'spring', demand: DEMAND_SPRING, solar: SOLAR_SPRING,
  // 0.62 of the annual peak, not 0.72.
  //
  // California's annual peak is a little over 50 GW and its spring minimum is
  // around 15 — a ratio closer to 0.3 at the trough of the day, with the
  // daytime peak of a mild April day landing near 0.62 of the summer peak. The
  // earlier 0.72 left the system just long enough to absorb its own midday
  // solar by backing gas down and exporting, so no curtailment ever appeared,
  // which is the opposite of what this day is famous for.
  wind: WIND_TYPICAL, hydro: HYDRO_AVAILABILITY, peakScale: 0.62,
  blurb:
    'The lowest demand of the year meeting the best solar of the year. This ' +
    'is where oversupply, curtailment and near-zero prices actually happen.',
};

export const DAY_PROFILES: Record<Season, DayProfile> = {
  summer: SUMMER_DAY,
  winter: WINTER_DAY,
  spring: SPRING_DAY,
};

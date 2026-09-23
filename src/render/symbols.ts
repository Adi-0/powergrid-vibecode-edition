/**
 * One-line diagram symbols as pixel polylines (y up), after IEC 60617 / IEEE 315:
 * the AC generator (a circle with a sine), the converter (a square with a diagonal —
 * used here for inverter-based plants: solar, wind, batteries, DC links), the
 * substation (a square), the transformer (two overlapping circles), a busbar, and an
 * arrow for power arriving over an intertie. Each symbol is a list of polylines.
 */
export type Poly = Array<[number, number]>;
export type Symbol = { polys: Poly[]; closed: boolean[] };

export function circle(r: number, cx = 0, cy = 0, n = 24): Poly {
  const p: Poly = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    p.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return p;
}

export function sine(w: number, h: number, cx = 0, cy = 0, n = 16): Poly {
  const p: Poly = [];
  for (let i = 0; i <= n; i++) {
    const x = -w / 2 + (w * i) / n;
    p.push([cx + x, cy + (h / 2) * Math.sin((i / n) * Math.PI * 2)]);
  }
  return p;
}

export function rect(w: number, h: number, cx = 0, cy = 0): Poly {
  return [
    [cx - w / 2, cy - h / 2],
    [cx + w / 2, cy - h / 2],
    [cx + w / 2, cy + h / 2],
    [cx - w / 2, cy + h / 2],
  ];
}

/** AC generator: circle with a sine. */
export function generatorSymbol(r = 6, cx = 0, cy = 0): Symbol {
  return { polys: [circle(r, cx, cy), sine(r * 1.1, r * 0.6, cx, cy)], closed: [true, false] };
}

/** Converter (inverter-based resource): square with a diagonal, "=" above it and "~" below. */
export function converterSymbol(s = 11, cx = 0, cy = 0): Symbol {
  const h = s / 2;
  return {
    polys: [
      rect(s, s, cx, cy),
      [
        [cx - h, cy - h],
        [cx + h, cy + h],
      ],
      // DC (two short lines) in the upper-left, AC (small sine) in the lower-right
      [
        [cx - h + 1.8, cy + h - 2.2],
        [cx - 0.6, cy + h - 2.2],
      ],
      [
        [cx - h + 1.8, cy + h - 3.8],
        [cx - 0.6, cy + h - 3.8],
      ],
      sine(h * 0.9, 1.8, cx + h * 0.45, cy - h + 2.6, 8),
    ],
    closed: [true, false, false, false, false],
  };
}

/** Substation: a square (heavier strokes for the 500 kV class are applied by the caller). */
export function substationSymbol(s = 7, cx = 0, cy = 0): Symbol {
  return { polys: [rect(s, s, cx, cy)], closed: [true] };
}

/** Transformer: two overlapping circles. */
export function transformerSymbol(r = 4, cx = 0, cy = 0): Symbol {
  return { polys: [circle(r, cx - r * 0.55, cy), circle(r, cx + r * 0.55, cy)], closed: [true, true] };
}

/** Arrowhead pointing along +x, tip at (cx, cy). */
export function arrowSymbol(len = 12, w = 8, cx = 0, cy = 0, angle = 0): Symbol {
  const pts: Poly = [
    [-len, w / 2],
    [0, 0],
    [-len, -w / 2],
  ];
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const rot = pts.map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c] as [number, number]);
  const shaft: Poly = [
    [cx - len * 2 * c, cy - len * 2 * s],
    [cx, cy],
  ];
  return { polys: [rot, shaft], closed: [false, false] };
}

/** Warning mark (an open triangle with a bar): paired with the signal colour. */
export function warningSymbol(s = 12, cx = 0, cy = 0): Symbol {
  const h = (s * Math.sqrt(3)) / 2;
  return {
    polys: [
      [
        [cx - s / 2, cy - h / 3],
        [cx + s / 2, cy - h / 3],
        [cx, cy + (2 * h) / 3],
      ],
      [
        [cx, cy + h / 3],
        [cx, cy - h / 12],
      ],
    ],
    closed: [true, false],
  };
}

/** A cross (✕): marks something out of service or tripped. */
export function crossSymbol(s = 8, cx = 0, cy = 0): Symbol {
  return {
    polys: [
      [
        [cx - s / 2, cy - s / 2],
        [cx + s / 2, cy + s / 2],
      ],
      [
        [cx - s / 2, cy + s / 2],
        [cx + s / 2, cy - s / 2],
      ],
    ],
    closed: [false, false],
  };
}

/** A fault: the one-line diagram's lightning arrow, striking down to the point. Paired with the signal colour. */
export function faultSymbol(s = 16, cx = 0, cy = 0): Symbol {
  const k = s / 16;
  const P = (x: number, y: number): [number, number] => [cx + x * k, cy + y * k];
  return {
    polys: [
      [P(-3, 16), P(3, 8), P(-2, 7), P(3, 0)],
      [P(-1.2, 3.2), P(3, 0), P(2.6, 4.6)],
    ],
    closed: [false, false],
  };
}

/**
 * The visual language, as enforceable rules.
 *
 * The brief's visual direction is not decoration, and these are the parts of it
 * that can be checked mechanically rather than by eye. The parts that cannot —
 * whether a view reads as technical drawing or as a generic dashboard — are
 * checked by screenshotting and critiquing, which is what tools/screenshot.mjs
 * is for.
 */

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import {
  VOLTAGE_CLASSES, voltageClass, INK, SIGNAL, SELECTION, ISOMETRIC, FLOW, ZOOM,
  levelForScale, LevelId,
} from '../src/render/style.js';
import {
  LEGEND_SYMBOLS, MACHINE_MARKS, symbolToSVG, placeSymbol, SYM_GENERATOR,
} from '../src/render/symbols.js';
import { layerHeightPx, layerSeparationPx, circuitOffsetPx } from '../src/render/world.js';

describe('voltage classes are encoded by weight, never by hue', () => {
  it('gets lighter as the voltage falls, with a legible step between classes', () => {
    for (let i = 1; i < VOLTAGE_CLASSES.length; i++) {
      const heavier = VOLTAGE_CLASSES[i - 1];
      const lighter = VOLTAGE_CLASSES[i];
      expect(lighter.kV, `${lighter.label} vs ${heavier.label}`).toBeLessThan(heavier.kV);
      expect(lighter.weightPx).toBeLessThan(heavier.weightPx);
      // Below about 0.75 the two stop reading as different weights side by side.
      const ratio = lighter.weightPx / heavier.weightPx;
      expect(ratio, `${heavier.label} → ${lighter.label}`).toBeLessThan(0.85);
    }
  });

  it('assigns no colour of its own to any voltage class', () => {
    // The class definitions carry weight and dash and nothing else. If a colour
    // field ever appears here, the encoding has been broken.
    for (const c of VOLTAGE_CLASSES) {
      expect(Object.keys(c).sort()).toEqual(
        ['blurb', 'dashPx', 'kV', 'label', 'weightPx'].sort()
      );
    }
  });

  it('reserves the dash for circuits that run along a street', () => {
    // The dash does not mean "low voltage". It means DISTRIBUTION: the wires
    // on the poles outside, and the drop from the pole to a building. Voltage
    // was a usable proxy for that until the generator bus was drawn, which is
    // 18 kV and is three metres of enclosed busbar inside a power station —
    // dashing it would have said "this is the wire along your street", which
    // is the one thing the visual code exists to say, and it would have been
    // false.
    const DASHED = new Set([12.47, 0.24]);
    for (const c of VOLTAGE_CLASSES) {
      if (DASHED.has(c.kV)) {
        expect(c.dashPx.length, `${c.label} should be dashed`).toBe(2);
      } else {
        expect(c.dashPx, `${c.label} should be solid`).toEqual([]);
      }
    }
  });

  it('keeps line weight monotonic in voltage, which is the whole claim', () => {
    // The legend says heavier means higher voltage. If the table ever stopped
    // being sorted, the legend would be lying in the most basic way available
    // to it.
    for (let i = 1; i < VOLTAGE_CLASSES.length; i++) {
      const above = VOLTAGE_CLASSES[i - 1];
      const below = VOLTAGE_CLASSES[i];
      expect(below.kV, `${below.label} after ${above.label}`)
        .toBeLessThan(above.kV);
      expect(below.weightPx, `${below.label} lighter than ${above.label}`)
        .toBeLessThan(above.weightPx);
    }
  });

  it('maps a nominal voltage to the nearest class on a logarithmic scale', () => {
    expect(voltageClass(500).kV).toBe(500);
    expect(voltageClass(230).kV).toBe(230);
    expect(voltageClass(115).kV).toBe(115);
    expect(voltageClass(12.47).kV).toBe(12.47);
    expect(voltageClass(0.24).kV).toBe(0.24);
    // Off-nominal values still land somewhere sensible.
    expect(voltageClass(345).kV).toBeGreaterThanOrEqual(230);
    expect(voltageClass(69).kV).toBeLessThanOrEqual(115);
  });
});

describe('saturated colour means exactly one thing', () => {
  it('keeps every ink and ground value near-neutral', () => {
    // Measured as CHROMA — the spread between the strongest and weakest
    // channel — not as HSL saturation, which blows up near white and would
    // call a warm off-white "saturated" when it plainly is not.
    //
    // The rule itself matters: if any structural colour has real chroma, the
    // alarm colour stops being the only saturated thing on the page, and
    // therefore stops meaning anything.
    for (const [name, hex] of Object.entries(INK)) {
      expect(chroma(hex), `INK.${name} = ${hex}`).toBeLessThan(0.10);
    }
  });

  it('gives the alarm colour real chroma, so it is unmissable', () => {
    expect(chroma(SIGNAL.alarm)).toBeGreaterThan(0.5);
    // And it must stand well clear of everything structural.
    const loudestStructural = Math.max(...Object.values(INK).map(chroma));
    expect(chroma(SIGNAL.alarm)).toBeGreaterThan(loudestStructural * 5);
  });

  it('keeps the selection colour far from the alarm colour in hue', () => {
    // A selection highlight is the cursor, not a claim about the power system.
    // It must never be mistakable for an alarm.
    const a = hexToHsl(SIGNAL.alarm).h;
    const b = hexToHsl(SELECTION.stroke).h;
    const apart = Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
    expect(apart).toBeGreaterThan(90);
  });

  it('uses one alarm colour, not a family of them', () => {
    expect(SIGNAL.warn).toBe(SIGNAL.alarm);
    expect(SIGNAL.alarmWash).toContain('196, 52, 27');
  });
});

describe('the isometric projection', () => {
  it('uses the true isometric angle, so a cube looks like a cube', () => {
    // Equally inclined to all three axes: azimuth 45°, elevation arctan(1/√2).
    expect(ISOMETRIC.azimuthDeg).toBe(45);
    expect(ISOMETRIC.elevationDeg).toBeCloseTo(35.264389682, 6);
  });

  it('separates the voltage layers by more than a halo is wide', () => {
    // If the layers sit closer than this, hidden-line removal does its job
    // correctly and the upper circuit erases the lower one for its whole
    // length wherever they share a corridor — which they usually do.
    expect(layerSeparationPx(500, 230)).toBeGreaterThan(12);
    expect(layerSeparationPx(230, 115)).toBeGreaterThan(8);
    expect(layerHeightPx(500)).toBeGreaterThan(layerHeightPx(230));
    expect(layerHeightPx(230)).toBeGreaterThan(layerHeightPx(115));
  });

  it('spreads parallel circuits symmetrically about the route', () => {
    expect(circuitOffsetPx(0, 1)).toBe(0);
    const three = [0, 1, 2].map((i) => circuitOffsetPx(i, 3));
    expect(three[1]).toBeCloseTo(0, 9);
    expect(three[0]).toBeCloseTo(-three[2], 9);
    expect(three[0]).toBeLessThan(0);
  });
});

describe('motion carries information, and only information', () => {
  it('ties flow speed to loading, not to anything decorative', () => {
    expect(FLOW.minSpeedPxPerSec).toBeLessThan(FLOW.maxSpeedPxPerSec);
    expect(FLOW.minLoadingToAnimate).toBeGreaterThan(0);
  });

  it('keeps the travelling mark inside the conductor', () => {
    // The mark is narrower than the line it runs along, so the conductor keeps
    // a hairline of ink either side and still reads as its own weight.
    const thinnest = Math.min(...VOLTAGE_CLASSES.map((c) => c.weightPx));
    expect(FLOW.coreInsetPx).toBeGreaterThan(0);
    expect(FLOW.coreInsetPx).toBeLessThan(thinnest + 1);
  });
});

describe('zoom levels', () => {
  it('orders the levels from the whole state down to one service', () => {
    const order: LevelId[] = ['system', 'region', 'feeder', 'substation', 'service'];
    const scales = [ZOOM.system, ZOOM.region, ZOOM.feeder, ZOOM.substation, ZOOM.service];
    for (let i = 1; i < scales.length; i++) {
      expect(scales[i], order[i]).toBeLessThan(scales[i - 1]);
    }
  });

  it('resolves a scale to the level it belongs to', () => {
    expect(levelForScale(ZOOM.system)).toBe('system');
    expect(levelForScale(ZOOM.region)).toBe('region');
    expect(levelForScale(ZOOM.service)).toBe('service');
  });

  it('keeps every named level inside the camera limits', () => {
    for (const s of [ZOOM.system, ZOOM.region, ZOOM.substation, ZOOM.feeder, ZOOM.service]) {
      expect(s).toBeGreaterThanOrEqual(ZOOM.min);
      expect(s).toBeLessThanOrEqual(ZOOM.max);
    }
  });
});

describe('symbology', () => {
  it('gives every legend symbol a name, a plain-language note and a path', () => {
    for (const s of LEGEND_SYMBOLS) {
      expect(s.name.length, s.id).toBeGreaterThan(2);
      expect(s.blurb.length, s.id).toBeGreaterThan(30);
      expect(s.path.length, s.id).toBeGreaterThan(0);
      for (const poly of s.path) expect(poly.length, s.id).toBeGreaterThanOrEqual(2);
    }
  });

  it('declares which symbols are standard and which are this app’s own', () => {
    // Every symbol in the legend proper is a real one-line diagram symbol.
    for (const s of LEGEND_SYMBOLS) expect(s.provenance, s.id).toBe('standard');
  });

  it('keeps every symbol inside its normalised box, so sizing is predictable', () => {
    const all = [...LEGEND_SYMBOLS.map((s) => s.path), ...Object.values(MACHINE_MARKS).map((m) => m.path)];
    for (const path of all) {
      for (const poly of path) {
        for (const [x, y] of poly) {
          expect(Math.abs(x)).toBeLessThanOrEqual(1.001);
          expect(Math.abs(y)).toBeLessThanOrEqual(1.001);
        }
      }
    }
  });

  it('renders to SVG for the legend from the same paths the drawing uses', () => {
    const svg = symbolToSVG(SYM_GENERATOR.path);
    expect(svg).toContain('<svg');
    expect(svg).toContain('polyline');
    expect(svg).toContain('stroke="#14161A"');
    expect(svg).not.toContain('fill="#');   // line art: strokes only, never fills
  });

  it('places a symbol as a circle on screen, not a foreshortened ellipse', () => {
    // The ground-plane basis is the inverse of the projection restricted to the
    // ground, so a circle built with it projects back to an exact circle. A
    // naive placement would draw an ellipse and the drawing would stop being
    // measurable.
    const basis = { rightX: 1, rightZ: 0, downX: 0, downZ: 1 };
    const out: import('../src/render/line-batch.js').LineSegment[] = [];
    placeSymbol(SYM_GENERATOR.path, {
      x: 0, y: 0, z: 0, sizePx: 10, widthPx: 1, color: '#000',
    }, basis, out);
    expect(out.length).toBeGreaterThan(20);
    // The outer circle has radius 0.78 of the half-size.
    const radii = out.map((s) => Math.hypot(s.a[0], s.a[2]));
    const outer = Math.max(...radii);
    expect(outer).toBeCloseTo(7.8, 1);
  });
});

/** Chroma: how far a colour is from grey, regardless of how light it is. */
function chroma(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
}

/** Minimal hex → HSL, used only for the hue comparison below. */
function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return { h: 0, s: 0, l: 0 };
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return { h, s, l };
}

// ---------------------------------------------------------------------------
// The one signal colour stays one signal
// ---------------------------------------------------------------------------

describe('saturated colour means exactly one thing', () => {
  const css = readFileSync(
    new URL('../src/app/styles.css', import.meta.url), 'utf8');

  /**
   * Every rule allowed to spend the alarm colour, and why.
   *
   * The visual direction reserves saturated colour for one meaning: something
   * is wrong. That rule decays quietly — a severity label here, a "this one
   * fired first" there — and each borrowing is individually reasonable while
   * together they cost the palette its only signal. Three had crept in before
   * this test existed: a honesty-panel severity tag, the device that operates
   * first in a coordination study (which is the system WORKING), and a
   * reliability index moving the wrong way under a trade-off the reader chose.
   */
  const ALLOWED = [
    ".map-label[data-tone='alarm']",   // a bus outside its limits
    '.stat--alarm',                    // the violation counts in the header
    '.kv dd.is-alarm',                 // a quantity in violation
    '.inspect__alarm',                 // the inspector's alarm box
    '.tcc__bad',                       // protection that does not coordinate
  ];

  it('is used only where something is actually wrong', () => {
    const offenders: string[] = [];
    // Walk rule by rule: selector text up to the brace, body after it.
    const rules = css.split('}');
    for (const rule of rules) {
      const brace = rule.indexOf('{');
      if (brace < 0) continue;
      const selector = rule.slice(0, brace).replace(/\/\*[\s\S]*?\*\//g, '').trim();
      const body = rule.slice(brace + 1);
      if (!/var\(--alarm\b/.test(body)) continue;
      if (ALLOWED.some((a) => selector.includes(a))) continue;
      // The palette definition itself, and the class that IS the definition.
      if (selector === ':root') continue;
      offenders.push(selector.replace(/\s+/g, ' '));
    }
    expect(offenders, 'these spend the alarm colour on something else').toEqual([]);
  });

  it('keeps the allowlist honest by actually matching something', () => {
    for (const a of ALLOWED) {
      expect(css.includes(a), `${a} is no longer in the stylesheet`).toBe(true);
    }
  });
});

/**
 * The framing code has to know how wide the capability-curve panel is BEFORE
 * it opens, because it frames the machine around the space that panel will
 * take. That makes one number live in two files, which is exactly the kind of
 * pair that drifts silently: the panel gets wider, the drawing goes back to
 * being framed for the old width, and nothing fails.
 */
describe('the machine panel width the camera assumes', () => {
  const css = readFileSync(
    new URL('../src/app/styles.css', import.meta.url), 'utf8');
  const main = readFileSync(
    new URL('../src/app/main.ts', import.meta.url), 'utf8');

  it('matches the stylesheet', () => {
    const rule = css.split('.panel--machine {')[1];
    expect(rule, '.panel--machine is gone from the stylesheet').toBeTruthy();
    const width = Number(/width:\s*(\d+)px/.exec(rule.split('}')[0])?.[1]);
    expect(Number.isFinite(width)).toBe(true);
    const assumed = Number(/MACHINE_PANEL_PX = (\d+)/.exec(main)?.[1]);
    expect(assumed, 'main.ts no longer states the width it assumes').toBeTruthy();
    expect(assumed).toBe(width);
  });
});

/**
 * The system view: all of California, drawn from a solved power flow.
 *
 * Everything here is derived from `SolvedCase`. There is no decorative
 * geometry, no illustrative flow, no drawn-in duck curve. If a line is moving
 * on screen, it is moving because the solver says power is flowing through it,
 * at a speed proportional to how heavily it is loaded, in the direction the
 * solution says. If something is red, the solver says it is over a limit.
 *
 * The drawing is assembled in layers, back to front:
 *
 *   1. The coastline, faintest, for orientation only.
 *   2. Drop lines from each site's symbol on the ground up to the circuits.
 *   3. The conductors themselves, at a height set by voltage class.
 *   4. Flow marks travelling along the conductors.
 *   5. Site symbols on the ground.
 *   6. Labels, in screen space, placed by the collision layout.
 *
 * Steps 2-4 each get a ground-coloured halo pass first, which is what performs
 * the hidden-line removal.
 */

import { Vector2, Vector3 } from 'three';
import { SolvedCase, BranchFlow } from '../core/results.js';
import { Branch } from '../core/network.js';
import { SITES, Site } from '../data/california/sites.js';
import { PEAK_LOAD_MW } from '../data/california/network.js';
import { CALIFORNIA_OUTLINE } from '../data/california/outline.js';
import { project } from '../data/california/geography.js';
import { LineSegment } from './line-batch.js';
import { LabelSpec } from './labels.js';
import { IsoCamera } from './iso.js';
import {
  INK, SIGNAL, SELECTION, FLOW, LAYOUT, voltageClass, TextDetail,
} from './style.js';
import { toWorld, layerHeightPx, circuitOffsetPx } from './world.js';
import {
  SYM_GENERATOR, SYM_LOAD, SYM_BATTERY, MACHINE_MARKS, MachineMark,
  placeSymbol, SymbolPath,
} from './symbols.js';
import { GenKind } from '../core/network.js';

// ---------------------------------------------------------------------------
// Static geometry, computed once
// ---------------------------------------------------------------------------

export interface SiteNode {
  site: Site;
  /** Ground position, world metres. */
  ground: Vector3;
  /** Bus ids at this site, by nominal voltage. */
  buses: { id: string; kV: number }[];
  /** Generation at this site, MW of capacity by kind. */
  generation: { kind: GenKind; capacityMW: number }[];
  /**
   * Load at this site at the hour being drawn, MW — what the solver was given.
   */
  loadMW: number;
  /**
   * Load at this site at ANNUAL PEAK, MW — a property of the place, not of the
   * hour. Anything whose size should hold still while the clock runs uses this.
   */
  peakLoadMW: number;
}

/** One drawable circuit: a branch plus where it sits in a parallel group. */
export interface CircuitGeometry {
  branch: Branch;
  fromSite: Site;
  toSite: Site;
  kV: number;
  /** Index within its parallel group, and the size of that group. */
  index: number;
  total: number;
  /** Route length on screen, used to space flow marks. */
  a: Vector3;
  b: Vector3;
}

export interface SystemGeometry {
  sites: Map<string, SiteNode>;
  circuits: CircuitGeometry[];
  /** Transformers are drawn as a mark at the site, not as a route. */
  transformerSites: Set<string>;
  outline: Vector3[];
  /**
   * Extent of the NETWORK, not of the coastline. The state outline reaches a
   * long way east into country with no grid in it; framing on that leaves the
   * subject of the drawing crammed into one corner while half the page shows
   * empty desert.
   */
  bounds: { min: { x: number; z: number }; max: { x: number; z: number } };
  /** Extent of the coastline, for the rare case something needs it. */
  outlineBounds: { min: { x: number; z: number }; max: { x: number; z: number } };
}

/**
 * The voltage classes this drawing puts on the page.
 *
 * Declared beside the code that draws them, so the legend can be a key to what
 * is visible rather than a catalogue of everything the renderer knows how to
 * draw — at the whole-state scale it was listing the wire along a street and
 * the drop into a house, neither of which is within four orders of magnitude
 * of being on screen. A test checks that the scenes between them account for
 * every class in the palette, so none can quietly become legend-only.
 */
export const SYSTEM_KV_DRAWN = [500, 230, 115];

const siteOfBus = (busId: string): string => busId.split('_')[0].toLowerCase();

/** Build the static geometry of the system view. Independent of any solution. */
export function buildSystemGeometry(solved: SolvedCase): SystemGeometry {
  const sites = new Map<string, SiteNode>();

  const ensure = (siteId: string): SiteNode | null => {
    const site = SITES[siteId];
    if (!site) return null;
    let node = sites.get(siteId);
    if (!node) {
      node = {
        site,
        ground: toWorld(project(site.lat, site.lon), 0),
        buses: [],
        generation: [],
        loadMW: 0,
        peakLoadMW: 0,
      };
      sites.set(siteId, node);
    }
    return node;
  };

  for (const b of solved.net.buses) {
    const node = ensure(siteOfBus(b.id));
    if (!node) continue;
    node.buses.push({ id: b.id, kV: b.baseKV });
    node.peakLoadMW += PEAK_LOAD_MW.get(b.id) ?? 0;
  }
  for (const g of solved.net.generators) {
    const node = sites.get(siteOfBus(g.bus));
    if (node && g.inService) node.generation.push({ kind: g.kind, capacityMW: g.pMaxMW });
  }
  for (const l of solved.net.loads) {
    const node = sites.get(siteOfBus(l.bus));
    if (node) node.loadMW += l.pMW;
  }

  // Group parallel circuits so they can be drawn side by side.
  const groups = new Map<string, Branch[]>();
  const transformerSites = new Set<string>();
  for (const br of solved.net.branches) {
    if (br.kind === 'transformer') {
      transformerSites.add(siteOfBus(br.from));
      continue;
    }
    const key = `${br.from}|${br.to}`;
    const list = groups.get(key);
    if (list) list.push(br);
    else groups.set(key, [br]);
  }

  const circuits: CircuitGeometry[] = [];
  for (const list of groups.values()) {
    const fromSite = SITES[siteOfBus(list[0].from)];
    const toSite = SITES[siteOfBus(list[0].to)];
    if (!fromSite || !toSite) continue;
    const kV = solved.net.buses.find((b) => b.id === list[0].from)?.baseKV ?? 230;
    const a = toWorld(project(fromSite.lat, fromSite.lon), 0);
    const b = toWorld(project(toSite.lat, toSite.lon), 0);
    list.forEach((branch, i) => {
      circuits.push({ branch, fromSite, toSite, kV, index: i, total: list.length, a, b });
    });
  }

  const outline = CALIFORNIA_OUTLINE.map(([lon, lat]) => toWorld(project(lat, lon), 0));

  const extent = (points: Iterable<Vector3>) => {
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (const p of points) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    }
    return { min: { x: minX, z: minZ }, max: { x: maxX, z: maxZ } };
  };

  return {
    sites, circuits, transformerSites, outline,
    bounds: extent([...sites.values()].map((n) => n.ground)),
    outlineBounds: extent(outline),
  };
}

// ---------------------------------------------------------------------------
// Which mark goes with which kind of machine
// ---------------------------------------------------------------------------

const KIND_MARK: Record<GenKind, MachineMark> = {
  'gas-cc': 'steam', 'gas-ct': 'steam', 'solar-pv': 'solar', wind: 'wind',
  hydro: 'hydro', geothermal: 'geothermal', battery: 'none',
  nuclear: 'nuclear', import: 'import',
};

/** The dominant technology at a site, by installed capacity. */
function dominantKind(node: SiteNode): GenKind | null {
  let best: GenKind | null = null;
  let bestMW = 0;
  const byKind = new Map<GenKind, number>();
  for (const g of node.generation) {
    byKind.set(g.kind, (byKind.get(g.kind) ?? 0) + g.capacityMW);
  }
  for (const [kind, mw] of byKind) {
    if (mw > bestMW) { bestMW = mw; best = kind; }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

export interface SystemDrawOptions {
  /** Currently selected element id, if any. */
  selectedId?: string | null;
  /** Element under the cursor, if any. */
  hoveredId?: string | null;
  /** Show flow marks. Off while dragging, to keep panning smooth. */
  showFlow?: boolean;
  /** Fraction 0..1 of how far the level transition to the region view has gone. */
  regionBlend?: number;
  /**
   * How strongly to draw the whole view, 0 to 1. Used by the level
   * compositor to cross-fade this drawing against the one below it as the
   * camera descends; at 1 it costs nothing.
   */
  opacity?: number;
  /**
   * The ground rectangle the camera can see, for culling.
   *
   * Zoomed in, most of the state is off the page, and drawing it anyway cost
   * two and a half thousand line segments per frame and put labels on sites
   * nobody can see. A circuit that does not come near the window is not drawn.
   */
  view?: { min: { x: number; z: number }; max: { x: number; z: number } } | null;
  /** Debug: draw only this voltage class. */
  /**
   * One voltage class the reader has asked to see.
   *
   * IT RECEDES THE REST, IT DOES NOT DELETE THEM. Hiding the other classes
   * answers "where does the 500 kV network go" and destroys the question worth
   * asking, which is where it goes RELATIVE TO everything else — the whole
   * point of a backbone is what it is the backbone OF. Kept at a tenth of its
   * weight, the rest of the network stays as the ground the chosen class is
   * read against.
   */
  onlyKV?: number | null;
  /** How much type to carry. See TextDetail. */
  detail?: TextDetail;
  /** Debug: extra width added to every halo, px. */
  haloPad?: number;
}

export interface SystemDrawResult {
  /**
   * Every stroke in the drawing, already in painter's order: farthest first,
   * each line's ground-coloured halo immediately before its own ink so that a
   * nearer line breaks the ones behind it and nothing else.
   */
  segments: LineSegment[];
  labels: LabelSpec[];
  /** Screen-space picking targets. */
  picks: PickTarget[];
}

/**
 * One thing to draw, with the information needed to order it.
 *
 * `depth` is the distance from the camera along the view axis: larger is
 * further away. `haloPx` asks for a ground-coloured backing of that much extra
 * width, laid down immediately before the stroke itself.
 */
interface Mark {
  seg: LineSegment;
  depth: number;
  haloPx?: number;
}

export interface PickTarget {
  id: string;
  kind: 'site' | 'circuit';
  world: Vector3;
  /** For circuits, the other end, so picking can test distance to the segment. */
  worldB?: Vector3;
  radiusPx: number;
  /**
   * What to say when the cursor rests on this.
   *
   * SUPPLIED BY THE SCENE THAT DREW IT, because the scene is the only thing
   * that knows both what the object is called and what the solver says it is
   * doing — and because a lookup table in the app would be a second copy of
   * that knowledge, wrong by the third time somebody added a device.
   *
   * This is what makes it safe for the drawing to carry less type: a name that
   * is not printed is still one hover away, so quiet is not the same as
   * hidden.
   */
  hover?: { text: string; value?: string; alarm?: boolean };
}

/** How heavily loaded a branch is, clamped and softened for display. */
/**
 * How much paper shows either side of a conductor where it crosses another.
 * Deliberately small: the gap has to read as "this one passes in front", not as
 * a white highlight drawn along every line.
 */
const HALO_PAD_PX = 1.3;

const loadingOf = (f: BranchFlow | undefined): number =>
  f && f.inService ? Math.min(f.loading, 1.6) : 0;

export function drawSystem(
  geometry: SystemGeometry,
  solved: SolvedCase,
  camera: IsoCamera,
  options: SystemDrawOptions = {}
): SystemDrawResult {
  const mpp = camera.metresPerPixel;
  const detail: TextDetail = options.detail ?? 'normal';
  const basis = camera.groundBasis();
  const screenA = new Vector2();
  const screenB = new Vector2();
  const marks: Mark[] = [];
  const labels: LabelSpec[] = [];
  const picks: PickTarget[] = [];

  // Distance from the camera along the view axis. The camera looks down the
  // negative of its own offset direction, so a larger dot product with that
  // direction means closer; negate it so that larger means further.
  const dir = camera.direction;
  const depthOf = (x: number, y: number, z: number): number =>
    -(x * dir.x + y * dir.y + z * dir.z);

  /** Queue a stroke, optionally with a ground-coloured backing. */
  const mark = (seg: LineSegment, haloPx?: number): void => {
    const d = depthOf(
      (seg.a[0] + seg.b[0]) / 2, (seg.a[1] + seg.b[1]) / 2, (seg.a[2] + seg.b[2]) / 2
    );
    marks.push(haloPx !== undefined ? { seg, depth: d, haloPx } : { seg, depth: d });
  };
  /** Scratch buffer for symbol builders, which emit many segments at once. */
  const scratch: LineSegment[] = [];

  const showFlow = options.showFlow ?? true;
  const selected = options.selectedId ?? null;
  const hovered = options.hoveredId ?? null;

  // Distance from the window's centre to the circuit, against the window's own
  // reach plus a margin.
  //
  // A bounding-box test is not good enough here: a four-hundred-kilometre
  // diagonal circuit from Oregon to Sacramento has a bounding box covering half
  // the state, so it survives a box test over a window in San Jose that it does
  // not come within a hundred kilometres of. The closest-approach test rejects
  // it, and that is the difference between two thousand stray line segments and
  // none.
  const cull = options.view ? (() => {
    const cx = (options.view.min.x + options.view.max.x) / 2;
    const cz = (options.view.min.z + options.view.max.z) / 2;
    const reach = 0.5 * Math.hypot(
      options.view.max.x - options.view.min.x,
      options.view.max.z - options.view.min.z) + 1500;
    return { cx, cz, reach };
  })() : null;

  const offScreen = (a: Vector3, b: Vector3): boolean => {
    if (!cull) return false;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len2 = dx * dx + dz * dz;
    const t = len2 > 0
      ? Math.max(0, Math.min(1, ((cull.cx - a.x) * dx + (cull.cz - a.z) * dz) / len2))
      : 0;
    return Math.hypot(a.x + t * dx - cull.cx, a.z + t * dz - cull.cz) > cull.reach;
  };


  // --- 1. Coastline ---------------------------------------------------------
  // Pushed with an artificially large depth so it always sits behind
  // everything: it is a margin note, not part of the structure.
  for (let i = 0; i + 1 < geometry.outline.length; i++) {
    const a = geometry.outline[i];
    const b = geometry.outline[i + 1];
    if (offScreen(a, b)) continue;
    marks.push({
      seg: { a: [a.x, 0, a.z], b: [b.x, 0, b.z], widthPx: 0.9, color: INK.inkGhost },
      depth: Number.MAX_SAFE_INTEGER,
    });
  }

  // --- 2 & 3. Circuits, and the drops that hang them off the ground ---------
  const heightCache = new Map<number, number>();
  const heightFor = (kV: number): number => {
    let h = heightCache.get(kV);
    if (h === undefined) {
      h = layerHeightPx(kV) * mpp;
      heightCache.set(kV, h);
    }
    return h;
  };

  const haloPad = options.haloPad ?? HALO_PAD_PX;

  // A DRAWING THAT IS FADING SHOULD THIN, NOT ONLY PALE.
  //
  // Halfway through the hand-over to the feeder the transmission lines were
  // still at full width, so a 500 kV pair came out as two forty-pixel grey
  // bands crossing a page whose subject was three kilometres of street. Pale
  // wide bands read as damage. Narrowing them as they go — and collapsing the
  // gap between parallel circuits at the same time — makes the transition read
  // as one drawing dissolving into another, which is what it is.
  const fadeWeight = 0.35 + 0.65 * (options.opacity ?? 1);
  const picked = options.onlyKV ?? null;
  for (const c of geometry.circuits) {
    if (offScreen(c.a, c.b)) continue;
    const recessive = picked != null && Math.abs(c.kV - picked) > 1;
    const flowData = solved.branchById.get(c.branch.id);
    const cls = voltageClass(c.kV);
    const h = heightFor(c.kV);

    // Spread parallel circuits apart, by a constant distance ON SCREEN.
    //
    // The perpendicular has to be taken in SCREEN space, not in the ground
    // plane: the isometric projection foreshortens the two ground axes by
    // different amounts, so a vector perpendicular to the route in the world is
    // not perpendicular to it on the page, and the circuits fan out instead of
    // running parallel. Project the route, take the perpendicular there, then
    // map that screen offset back to the ground through the camera basis.
    const offPx = circuitOffsetPx(c.index, c.total) * fadeWeight;
    let ox = 0;
    let oz = 0;
    if (offPx !== 0) {
      camera.worldToScreen(c.a, screenA);
      camera.worldToScreen(c.b, screenB);
      const sdx = screenB.x - screenA.x;
      const sdy = screenB.y - screenA.y;
      const slen = Math.hypot(sdx, sdy) || 1;
      const nx = (-sdy / slen) * offPx;
      const ny = (sdx / slen) * offPx;
      ox = basis.rightX * nx + basis.downX * ny;
      oz = basis.rightZ * nx + basis.downZ * ny;
    }

    const a: [number, number, number] = [c.a.x + ox, h, c.a.z + oz];
    const b: [number, number, number] = [c.b.x + ox, h, c.b.z + oz];

    const isOut = !c.branch.inService;
    const over = flowData ? flowData.loading > 1 : false;
    const isSelected = selected === c.branch.id;
    const isHovered = hovered === c.branch.id;

    const color = recessive ? INK.inkGhost
      : over || isOut ? SIGNAL.alarm : isSelected ? SELECTION.stroke : INK.ink;
    const width = cls.weightPx * fadeWeight
      * (isSelected || isHovered ? 1.7 : 1) * (recessive ? 0.7 : 1);
    // An out-of-service circuit is drawn as a fine dotted line: still there,
    // plainly not carrying anything.
    const dash: [number, number] | undefined =
      isOut ? [1.5, 3] : cls.dashPx.length === 2 ? [cls.dashPx[0], cls.dashPx[1]] : undefined;

    const seg: LineSegment = {
      a, b, widthPx: width, color,
      ...(dash ? { dash } : {}),
      ...(isOut ? { opacity: 0.75 } : recessive ? { opacity: 0.5 } : {}),
    };
    // The halo is the paper showing through where one conductor passes in front
    // of another. Just wide enough to leave a visible break; much wider and the
    // drawing turns into white ribbons with ink along their edges.
    mark(seg, haloPad);

    // The drop from the conductor down to the site symbol on the ground. This
    // is what makes the layering read as structure rather than as a floating
    // diagram: every circuit visibly lands somewhere.
    if (c.index === 0) {
      for (const end of [a, b]) {
        mark({
          a: [end[0], 0, end[2]], b: [end[0], h, end[2]],
          widthPx: 0.85, color: recessive ? INK.inkGhost : INK.inkFaint,
          opacity: recessive ? 0.4 : 0.9,
        }, haloPad * 0.6);
      }
    }

    // --- 4. Flow marks ----------------------------------------------------
    if (showFlow && flowData && flowData.inService && !recessive) {
      const loading = loadingOf(flowData);
      if (loading > FLOW.minLoadingToAnimate) {
        const speed =
          FLOW.minSpeedPxPerSec +
          (FLOW.maxSpeedPxPerSec - FLOW.minSpeedPxPerSec) * Math.min(loading, 1);
        const direction = flowData.pFromMW >= 0 ? 1 : -1;
        // HOW FLOW IS DRAWN.
        //
        // Marks in the colour of the paper travel along the CORE of the
        // conductor, leaving a hairline of ink on each side. The conductor
        // stays continuous and keeps its weight — which is already saying what
        // voltage class it is — while a light bead runs along inside it in the
        // direction real power is going, at a speed set by loading.
        //
        // Drawing the marks in ink instead would be invisible: ink on ink. And
        // making the whole line dashed would collide with the dash patterns
        // that distinguish the distribution classes. This reads as neither.
        marks.push({ depth: depthOf(
            (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2) - 1e-3,
          seg: {
          a, b,
          widthPx: Math.max(
            0.55, Math.min(width - FLOW.coreInsetPx, width * FLOW.maxCoreFraction)),
          color: INK.occluder,
          opacity: FLOW.opacity,
          dash: [
            FLOW.markSpacingPx * FLOW.markLengthFraction,
            FLOW.markSpacingPx * (1 - FLOW.markLengthFraction),
          ],
          dashPhase: (c.index * 5) % FLOW.markSpacingPx,
          dashSpeed: -direction * speed,
        } });
      }
    }

    if (c.index === 0) {
      picks.push({
        id: c.branch.id, kind: 'circuit',
        world: new Vector3(a[0], a[1], a[2]),
        worldB: new Vector3(b[0], b[1], b[2]),
        radiusPx: LAYOUT.pickRadiusPx,
        hover: {
          text: c.branch.name,
          value: isOut ? 'out of service'
            : flowData
              ? `${formatMW(Math.abs(flowData.pFromMW))} · ` +
                `${(Math.abs(flowData.loading) * 100).toFixed(0)} % of rating`
              : undefined,
          alarm: over || isOut,
        },
      });
    }
  }

  // --- 5. Site symbols ------------------------------------------------------
  for (const node of geometry.sites.values()) {
    if (offScreen(node.ground, node.ground)) continue;
    const kind = dominantKind(node);
    const anyAlarm = node.buses.some(
      (b) => solved.busById.get(b.id)?.voltageViolation != null
    );
    const isSelected = selected === node.site.id;
    const isHovered = hovered === node.site.id;
    const color = anyAlarm ? SIGNAL.alarm : isSelected ? SELECTION.stroke : INK.ink;
    const emphasis = isSelected || isHovered ? 1.35 : 1;

    // SIZE IS HOW MUCH MACHINE IS THERE; WEIGHT IS VOLTAGE.
    //
    // Size used to be the highest voltage present, in three buckets, which
    // meant Diablo Canyon at 2.26 GW and an empty 500 kV switchyard were drawn
    // identically. At a glance the most useful thing about a site is how big
    // it is, and the model already knows: installed capacity where there are
    // machines, peak demand where there is load.
    //
    // Square-rooted, so a four-gigawatt station is about six times the area of
    // a hundred-megawatt one rather than forty times it and off the page.
    // Voltage keeps the stroke weight, which is the encoding the legend
    // promises and the one that must not move.
    const topKV = Math.max(...node.buses.map((b) => b.kV));
    const capacityMW = node.generation.reduce((a, g) => a + g.capacityMW, 0);
    const scaleFor = (mw: number, floor: number, span: number): number =>
      Math.max(floor, Math.min(1.9, floor + span * Math.sqrt(Math.max(0, mw) / 3000)));
    const magnitude = capacityMW > 0 ? scaleFor(capacityMW, 0.62, 0.95)
      : node.peakLoadMW > 0 ? scaleFor(node.peakLoadMW, 0.58, 0.85)
      : 0.72;
    const size = magnitude * LAYOUT.siteSymbolPx * emphasis;
    const strokeW = (topKV >= 500 ? 1.5 : 1.2) * (isSelected ? 1.5 : 1);

    const place = {
      x: node.ground.x, y: 0, z: node.ground.z,
      sizePx: size, widthPx: strokeW, color,
    };

    // Site symbols sit on the ground but must not be scribbled through by the
    // circuits passing overhead, so they are queued NEARER than anything else
    // and preceded by a ground-coloured disc that clears the paper for them.
    const symbolDepth = depthOf(node.ground.x, 0, node.ground.z) - 1e7;

    if (node.generation.length > 0 && kind) {
      const isBatteryOnly = node.generation.every((g) => g.kind === 'battery');
      const path: SymbolPath = isBatteryOnly ? SYM_BATTERY.path : SYM_GENERATOR.path;
      discOccluder(place, size * 2.0, symbolDepth, marks);
      placeSymbol(path, place, basis, scratch);
      if (!isBatteryOnly) {
        const m = MACHINE_MARKS[KIND_MARK[kind]];
        if (m.path.length > 0) {
          placeSymbol(m.path, { ...place, widthPx: strokeW * 0.85 }, basis, scratch);
        }
      }
    } else if (node.peakLoadMW > 0) {
      discOccluder(place, size * 1.8, symbolDepth, marks);
      placeSymbol(SYM_LOAD.path, place, basis, scratch);
    } else {
      // A switchyard with neither generation nor load: draw the bus bar.
      discOccluder(place, size * 1.6, symbolDepth, marks);
      placeSymbol(
        [[[-0.9, 0], [0.9, 0]], [[0, -0.55], [0, 0.55]]],
        { ...place, widthPx: strokeW * 1.7 }, basis, scratch
      );
    }
    for (const seg of scratch) marks.push({ seg, depth: symbolDepth - 1 });
    scratch.length = 0;

    const readout = siteReadout(node, solved);
    picks.push({
      id: node.site.id, kind: 'site',
      world: node.ground.clone(),
      radiusPx: LAYOUT.pickRadiusPx * (topKV >= 500 ? 1.3 : 1),
      hover: {
        text: node.site.name,
        ...(readout ? { value: readout } : {}),
        alarm: anyAlarm,
      },
    });

    // --- 6. Labels --------------------------------------------------------
    //
    // A NUMBER UNDER EVERY NAME IS NOT MORE INFORMATION, IT IS LESS.
    //
    // Forty-three sites each captioned with a name AND a live megawatt figure
    // put eighty-six lines of type over a drawing of a state, and the type won:
    // the map read as a list with some wires behind it. At the whole-state
    // scale the reader is asking where things are and which ones are big, and
    // the symbol already answers the second question by its size. So only the
    // gigawatt sites — the ones whose names anybody would recognise from a
    // news story about the grid — carry their number that far out, along with
    // whatever the reader has pointed at.
    //
    // Come closer and the threshold drops to nothing: by the time a region
    // fills the page there is room for every number, and that is exactly the
    // detail-on-approach rule the rest of the drawing follows.
    const throughputMW = Math.max(capacityMW, node.loadMW);
    const showValue = detail !== 'minimal' && (
      detail === 'all' || isSelected || isHovered
      || mpp < 600 || throughputMW >= 1000);
    const value = showValue ? siteReadout(node, solved) : undefined;
    labels.push({
      id: `site:${node.site.id}`,
      world: node.ground,
      text: node.site.name,
      ...(value ? { value } : {}),
      priority: labelPriority(node, topKV),
      tone: anyAlarm ? 'alarm' : isSelected ? 'selected' : 'normal',
    });
  }

  // Back to front, then flatten each mark into its halo and its ink.
  //
  // The halo is faded along with the ink. That is deliberate: a halo at full
  // strength behind a half-faded stroke would punch a solid hole in whatever
  // drawing is showing through, and the cross-fade would look like an erasure
  // rather than a dissolve.
  const alpha = options.opacity ?? 1;
  marks.sort((a, b) => b.depth - a.depth);
  const segments: LineSegment[] = [];
  for (const m of marks) {
    const seg = alpha >= 1 ? m.seg : { ...m.seg, opacity: (m.seg.opacity ?? 1) * alpha };
    if (m.haloPx !== undefined && m.haloPx > 0) {
      segments.push({
        a: m.seg.a, b: m.seg.b,
        widthPx: m.seg.widthPx + m.haloPx,
        color: INK.occluder,
        ...(m.seg.dash ? { dash: m.seg.dash } : {}),
        ...(m.seg.dashPhase !== undefined ? { dashPhase: m.seg.dashPhase } : {}),
        ...(m.seg.dashSpeed !== undefined ? { dashSpeed: m.seg.dashSpeed } : {}),
        ...(alpha < 1 ? { opacity: alpha } : {}),
      });
    }
    segments.push(seg);
  }

  return { segments, labels, picks };
}

/**
 * A filled disc.
 *
 * The line shader evaluates a capsule signed distance, so a segment of zero
 * length and width D draws as a disc of diameter D exactly. No extra geometry,
 * no second material, and it occludes properly because it is in the same batch.
 */
function discOccluder(
  place: { x: number; y: number; z: number },
  diameterPx: number,
  depth: number,
  out: Mark[]
): void {
  out.push({
    seg: {
      a: [place.x, place.y, place.z],
      b: [place.x, place.y, place.z],
      widthPx: diameterPx,
      color: INK.occluder,
    },
    depth,
  });
}

/** What a site is doing right now, in one short string. */
function siteReadout(node: SiteNode, solved: SolvedCase): string | undefined {
  let genMW = 0;
  let loadMW = 0;
  for (const b of node.buses) {
    const r = solved.busById.get(b.id);
    if (!r) continue;
    genMW += r.pGenMW;
    loadMW += r.pLoadMW;
  }
  if (genMW > 0.5) return `${formatMW(genMW)} out`;
  if (loadMW > 0.5) return `${formatMW(loadMW)} in`;
  return undefined;
}

export function formatMW(mw: number): string {
  const a = Math.abs(mw);
  if (a >= 1000) return `${(mw / 1000).toFixed(a >= 10000 ? 1 : 2)} GW`;
  return `${mw.toFixed(a >= 100 ? 0 : 1)} MW`;
}

/**
 * Which labels get placed first when they compete for space.
 *
 * A reader scanning the whole state needs the 500 kV hubs and the big plants
 * before they need a 115 kV tap. Ranking by voltage class and by how much power
 * moves through a site puts the important names down first and drops the rest,
 * which is what makes a crowded map readable rather than what makes it complete.
 */
function labelPriority(node: SiteNode, topKV: number): number {
  const capacity = node.generation.reduce((s, g) => s + g.capacityMW, 0);
  const throughput = Math.max(capacity, node.peakLoadMW);
  const classScore = topKV >= 500 ? 3000 : topKV >= 230 ? 1200 : 300;
  return classScore + throughput;
}

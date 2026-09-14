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
import { CALIFORNIA_OUTLINE } from '../data/california/outline.js';
import { project } from '../data/california/geography.js';
import { LineSegment } from './line-batch.js';
import { LabelSpec } from './labels.js';
import { IsoCamera } from './iso.js';
import { INK, SIGNAL, SELECTION, FLOW, LAYOUT, voltageClass } from './style.js';
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
  /** Peak load at this site, MW. */
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
        peakLoadMW: 0,
      };
      sites.set(siteId, node);
    }
    return node;
  };

  for (const b of solved.net.buses) {
    const node = ensure(siteOfBus(b.id));
    if (node) node.buses.push({ id: b.id, kV: b.baseKV });
  }
  for (const g of solved.net.generators) {
    const node = sites.get(siteOfBus(g.bus));
    if (node && g.inService) node.generation.push({ kind: g.kind, capacityMW: g.pMaxMW });
  }
  for (const l of solved.net.loads) {
    const node = sites.get(siteOfBus(l.bus));
    if (node) node.peakLoadMW += l.pMW;
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
  /** Debug: draw only this voltage class. */
  onlyKV?: number | null;
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

  // --- 1. Coastline ---------------------------------------------------------
  // Pushed with an artificially large depth so it always sits behind
  // everything: it is a margin note, not part of the structure.
  for (let i = 0; i + 1 < geometry.outline.length; i++) {
    const a = geometry.outline[i];
    const b = geometry.outline[i + 1];
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
  for (const c of geometry.circuits) {
    if (options.onlyKV != null && Math.abs(c.kV - options.onlyKV) > 1) continue;
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
    const offPx = circuitOffsetPx(c.index, c.total);
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

    const color = over || isOut ? SIGNAL.alarm : isSelected ? SELECTION.stroke : INK.ink;
    const width = cls.weightPx * (isSelected || isHovered ? 1.7 : 1);
    // An out-of-service circuit is drawn as a fine dotted line: still there,
    // plainly not carrying anything.
    const dash: [number, number] | undefined =
      isOut ? [1.5, 3] : cls.dashPx.length === 2 ? [cls.dashPx[0], cls.dashPx[1]] : undefined;

    const seg: LineSegment = {
      a, b, widthPx: width, color,
      ...(dash ? { dash } : {}),
      ...(isOut ? { opacity: 0.75 } : {}),
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
          widthPx: 0.85, color: INK.inkFaint, opacity: 0.9,
        }, haloPad * 0.6);
      }
    }

    // --- 4. Flow marks ----------------------------------------------------
    if (showFlow && flowData && flowData.inService) {
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
          widthPx: Math.max(0.8, width - FLOW.coreInsetPx),
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
      });
    }
  }

  // --- 5. Site symbols ------------------------------------------------------
  for (const node of geometry.sites.values()) {
    const kind = dominantKind(node);
    const anyAlarm = node.buses.some(
      (b) => solved.busById.get(b.id)?.voltageViolation != null
    );
    const isSelected = selected === node.site.id;
    const isHovered = hovered === node.site.id;
    const color = anyAlarm ? SIGNAL.alarm : isSelected ? SELECTION.stroke : INK.ink;
    const emphasis = isSelected || isHovered ? 1.35 : 1;

    // Size communicates importance: the highest voltage present at the site.
    const topKV = Math.max(...node.buses.map((b) => b.kV));
    const size = (topKV >= 500 ? 1.25 : topKV >= 230 ? 1.0 : 0.78) *
      LAYOUT.siteSymbolPx * emphasis;
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

    picks.push({
      id: node.site.id, kind: 'site',
      world: node.ground.clone(),
      radiusPx: LAYOUT.pickRadiusPx * (topKV >= 500 ? 1.3 : 1),
    });

    // --- 6. Labels --------------------------------------------------------
    const value = siteReadout(node, solved);
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
  marks.sort((a, b) => b.depth - a.depth);
  const segments: LineSegment[] = [];
  for (const m of marks) {
    if (m.haloPx !== undefined && m.haloPx > 0) {
      segments.push({
        a: m.seg.a, b: m.seg.b,
        widthPx: m.seg.widthPx + m.haloPx,
        color: INK.occluder,
        ...(m.seg.dash ? { dash: m.seg.dash } : {}),
        ...(m.seg.dashPhase !== undefined ? { dashPhase: m.seg.dashPhase } : {}),
        ...(m.seg.dashSpeed !== undefined ? { dashSpeed: m.seg.dashSpeed } : {}),
      });
    }
    segments.push(m.seg);
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

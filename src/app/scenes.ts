/**
 * Compositing the levels, and travelling between them.
 *
 * THE CENTRAL DESIGN IDEA OF THE PROJECT LIVES IN THIS FILE.
 *
 * The brief's requirement is that the transitions are the lesson: a thing at
 * one level has to visibly become its constituent parts at the next, so that
 * abstraction is shown rather than asserted. The way to get that is to refuse
 * to have separate levels at all.
 *
 * Every view in this app is drawn in ONE continuous world space, in metres. The
 * California transmission network, the Eden Vale yard, the poles along Cherry
 * Lane and the socket in the kitchen are all at their true coordinates relative
 * to one another. There is no per-level camera, no reload, no cut. Travelling
 * from the whole state to a wall outlet is a single continuous zoom of about
 * sixty thousand to one, and the only thing that changes along the way is which
 * drawings are worth rendering at the current scale.
 *
 * So each scene declares the range of scales at which it is legible, with a
 * fade at each end. In the overlap both are drawn, and the reader watches a
 * site symbol dissolve into a fenced yard, or a pole line resolve out of a
 * single 12.47 kV branch. That overlap is the transition, and it is real: the
 * same solved case feeds both drawings at once, so the numbers agree because
 * they are the same numbers.
 *
 * WHERE THE SPATIAL AND ELECTRICAL HIERARCHIES DISAGREE. The zoom tree in the
 * brief — system, region, substation, feeder, service — is the ELECTRICAL
 * order. Spatially it is not monotonic: a substation yard is ninety metres
 * across and the feeder leaving it is three kilometres long, so by scale alone
 * the feeder sits above the substation. Both facts are true and the app uses
 * each where it belongs: scale decides what is drawn, and the named
 * destinations below present the electrical order, which is the order a reader
 * should travel in. Walking out of the substation gate and down the street is
 * exactly a zoom out followed by a zoom in, and the drawing simply does that.
 */

import { Vector3 } from 'three';
import { SolvedCase } from '../core/results.js';
import { IsoCamera } from '../render/iso.js';
import { LineSegment } from '../render/line-batch.js';
import { LabelSpec } from '../render/labels.js';
import { PickTarget, SystemGeometry, drawSystem } from '../render/scene-system.js';
import { drawSubstation, substationBounds } from '../render/scene-substation.js';
import { FeederGeometry, drawFeeder } from '../render/scene-feeder.js';
import { drawService, serviceBounds } from '../render/scene-service.js';
import { drawGround, groundBounds } from '../render/scene-ground.js';
import { drawTerrain, drawDemandDots } from '../render/scene-terrain.js';
import { drawPlant, plantBounds } from '../render/scene-plant.js';
import { drawMachine, machineBounds } from '../render/scene-machine.js';
import { Generator } from '../core/network.js';
import { ServiceSolution } from '../data/california/service.js';
import { SITES } from '../data/california/sites.js';
import { project } from '../data/california/geography.js';
import { toWorld } from '../render/world.js';
import { ZOOM, LevelId } from '../render/style.js';

export type SceneId =
  | 'system' | 'ground' | 'feeder' | 'substation' | 'service' | 'plant' | 'machine';

/**
 * Where each scene is legible, in metres per pixel.
 *
 * Read as [gone below, full below, full above, gone above] with scale
 * increasing left to right: the scene is invisible outside the outer pair,
 * fully drawn between the inner pair, and cross-fading in the two gaps.
 *
 * The numbers come from asking what the subject measures and how many pixels
 * that is. The Eden Vale yard is 86 m: at 0.30 m/px it is 287 px across, which
 * is the smallest it can be and still be read as a yard rather than a blob. At
 * 0.045 m/px it is 1,900 px and has outgrown the window. Cherry Lane 1201 is
 * 2.9 km: legible from about 26 m/px (111 px) down to 0.55 m/px (5,300 px,
 * by which point you are looking at three poles).
 */
const ENVELOPE: Record<SceneId, [number, number, number, number]> = {
  system:     [14, 40, Infinity, Infinity],
  // The neighbourhood the feeder runs through. It appears a little before the
  // feeder does and stays after it, because the ground is what a reader orients
  // on: arriving at a street and then seeing the wires along it is the right
  // order, and the reverse — wires in a void that later acquire a street — is
  // the one that felt broken.
  // The near edge is not "as close as you can get" but "as close as a STREET
  // still means anything": inside a substation fence the block grid is one
  // faint diamond wider than the page, which reads as a stray construction
  // line across the drawing rather than as a neighbourhood. The yard draws its
  // own ground — gravel, fence, access road — and does not want this one.
  ground:     [0.30, 0.55, 26, 55],
  feeder:     [0.22, 0.55, 20, 45],
  substation: [0.030, 0.050, 0.30, 0.75],
  service:    [0, 0, 0.055, 0.10],
  // The generation branch. These overlap the distribution ones in SCALE but
  // never on the page, because they are three hundred kilometres away and the
  // compositor culls a scene whose bounds the camera cannot see.
  plant:      [0.045, 0.09, 0.70, 1.6],
  machine:    [0, 0, 0.055, 0.12],
};

/**
 * The scale at which a scene has faded to a quarter — as far in as it is worth
 * going before it is gone altogether.
 */
function quarterAlphaScale(scene: SceneId): number {
  const [gone0, full0] = ENVELOPE[scene];
  return gone0 + 0.25 * (full0 - gone0);
}

/** How strongly a scene is drawn at a given scale: 0 hidden, 1 full. */
export function sceneAlpha(scene: SceneId, metresPerPixel: number): number {
  const [gone0, full0, full1, gone1] = ENVELOPE[scene];
  const m = metresPerPixel;
  if (m <= gone0 || m >= gone1) return 0;
  if (m < full0) return (m - gone0) / (full0 - gone0);
  if (m > full1) return (gone1 - m) / (gone1 - full1);
  return 1;
}

/** The ground-plane rectangle the camera can currently see. */
function visibleGround(camera: IsoCamera, w: number, h: number): {
  min: { x: number; z: number }; max: { x: number; z: number };
} | null {
  const corners = [
    camera.screenToGround(0, 0), camera.screenToGround(w, 0),
    camera.screenToGround(0, h), camera.screenToGround(w, h),
  ].filter((c): c is Vector3 => c !== null);
  if (corners.length < 4) return null;
  return {
    min: {
      x: Math.min(...corners.map((c) => c.x)),
      z: Math.min(...corners.map((c) => c.z)),
    },
    max: {
      x: Math.max(...corners.map((c) => c.x)),
      z: Math.max(...corners.map((c) => c.z)),
    },
  };
}

type Box = {
  min: { x: number; z: number; y?: number };
  max: { x: number; z: number; y?: number };
};

const overlaps = (a: Box, b: Box): boolean =>
  a.min.x <= b.max.x && a.max.x >= b.min.x && a.min.z <= b.max.z && a.max.z >= b.min.z;

/**
 * How well a scene fits the window: 1 when it exactly fills it, falling off
 * when it is much smaller OR much larger.
 *
 * This is the answer to "what is the reader actually looking at", which is not
 * the same question as "what is drawn at full opacity". A drawing the size of a
 * postage stamp in the middle of the window is not what you are looking at even
 * if every one of its lines is at full strength; neither is one whose edges are
 * a hundred screens away.
 */
function screenFit(bounds: Box | null, view: Box | null): number {
  if (!bounds || !view) return 1;
  const span = (b: Box) => Math.max(b.max.x - b.min.x, b.max.z - b.min.z);
  const scene = span(bounds);
  const window = span(view);
  if (scene <= 0 || window <= 0) return 0;
  return Math.min(scene, window) / Math.max(scene, window);
}

export interface ComposeInput {
  solved: SolvedCase;
  service: ServiceSolution;
  systemGeometry: SystemGeometry;
  feederGeometry: FeederGeometry;
  camera: IsoCamera;
  viewport: { width: number; height: number };
  selectedId: string | null;
  hoveredId: string | null;
  /** 0 = single-line diagram, 1 = the physical yard. */
  substationMorph: number;
  showProtection: boolean;
  showFlow: boolean;
  /** A bus the reader has put a fault on, if any. */
  faultBusId?: string | null;
  motor?: { busId: string; state: string; label: string } | null;
  onlyKV?: number | null;
}

export interface ComposeResult {
  segments: LineSegment[];
  labels: LabelSpec[];
  picks: PickTarget[];
  /**
   * Which scenes contributed, how strongly they are drawn, and how much of the
   * screen each one actually occupies.
   *
   * `alpha` and `fit` answer two different questions and conflating them was a
   * real bug: at 0.5 m/px the substation fills the window while the feeder is a
   * line running off both edges, and both are drawn at full strength. Opacity
   * cannot tell those apart. `fit` can, because it compares the scene's
   * on-screen size against the window.
   */
  active: { scene: SceneId; alpha: number; fit: number }[];
  /** The machine the machine view drew, if it drew one, for the panels. */
  machine?: Generator | undefined;
  /**
   * The finest scale worth showing at this camera position, metres per pixel.
   *
   * There is a floor to how far in it is worth going, and it is not the same
   * everywhere: over Cherry Lane it is the kitchen socket, over the Eden Vale
   * yard it is the yard, and over empty desert it is a few kilometres up. Past
   * that floor every scene has faded out and the reader gets a blank page —
   * which is what used to happen, and reads as the app breaking rather than as
   * the model ending.
   */
  floorScale: number;
}

/**
 * Build one frame out of every scene that is legible at the current scale.
 *
 * Order matters: scenes are drawn coarsest-first, so that where two overlap the
 * finer drawing lands on top of the coarser one and the halos of the finer
 * drawing erase the coarser lines running behind it. That is the same
 * painter's-order compositing the system view uses internally, applied one
 * level up.
 */
export function composeFrame(input: ComposeInput): ComposeResult {
  const mpp = input.camera.metresPerPixel;
  const view = visibleGround(input.camera, input.viewport.width, input.viewport.height);
  const segments: LineSegment[] = [];
  const labels: LabelSpec[] = [];
  const picks: PickTarget[] = [];
  const active: { scene: SceneId; alpha: number; fit: number }[] = [];

  // How far in it is worth zooming HERE: the deepest scene whose subject is
  // actually under the camera. Accumulated as the scenes are considered, so it
  // follows the same bounds tests the drawing does.
  let floorScale = Infinity;

  /**
   * Take a scene's labels at the scene's own strength.
   *
   * Below a third they are dropped outright: a caption at ten per cent is not
   * a faint caption, it is unreadable grey text sitting on top of the drawing
   * that replaced it.
   */
  const addLabels = (from: LabelSpec[], alpha: number): void => {
    if (alpha >= 0.999) { labels.push(...from); return; }
    if (alpha < 0.34) return;
    const o = (alpha - 0.34) / 0.66;
    for (const l of from) labels.push({ ...l, opacity: o * o * (3 - 2 * o) });
  };

  const include = (scene: SceneId, bounds: Box | null): number => {
    const near = !bounds || !view || overlaps(bounds, view);
    // Stop a little ABOVE where the scene vanishes, not exactly at it: the last
    // sliver of a fade is a drawing so faint it reads as a blank page.
    if (near) floorScale = Math.min(floorScale, quarterAlphaScale(scene));
    const alpha = sceneAlpha(scene, mpp);
    if (alpha <= 0.004) return 0;
    if (!near) return 0;
    active.push({ scene, alpha, fit: screenFit(bounds, view) });
    return alpha;
  };

  // --- the coast, behind everything ------------------------------------------
  // Not a scene with a panel and a name: it is the paper the state is drawn on.
  // Visible wherever the transmission drawing is, and gone once the window is
  // small enough that the nearest coastline is a hundred kilometres away.
  if (mpp > 12) {
    const near = Math.min(1, (mpp - 12) / 40);
    segments.push(...drawTerrain(near, view).segments);

    // Where the demand is, as a dot-density map. It answers the question the
    // transmission drawing raises and cannot answer on its own: why the network
    // is shaped the way it is.
    //
    // Each site decides for itself whether it is close enough to be worth
    // drawing — a scatter narrower than about forty pixels is a smudge, not a
    // map — so approaching the Bay Area the cities bloom one after another,
    // biggest first, instead of the whole state speckling at once.
    segments.push(...drawDemandDots(
      [...input.systemGeometry.sites.values()].map((n) => ({
        id: n.site.id, ground: n.ground,
        loadMW: n.loadMW, peakLoadMW: n.peakLoadMW,
      })),
      near * 0.62,
      view,
      mpp
    ));
  }

  // --- the ground, before anything electrical -------------------------------
  const aGround = include('ground', groundBounds());
  if (aGround > 0) {
    const r = drawGround({ opacity: aGround, camera: input.camera, view });
    segments.push(...r.segments);
  }

  // --- coarsest first -------------------------------------------------------
  // The system scene is measured against the extent of the NETWORK, not left
  // unbounded: once the window is a few kilometres across, a drawing of the
  // whole state is no longer what anybody is looking at even though its lines
  // are still crossing the page.
  const aSystem = include('system', input.systemGeometry.bounds);
  if (aSystem > 0) {
    const r = drawSystem(input.systemGeometry, input.solved, input.camera, {
      selectedId: input.selectedId,
      hoveredId: input.hoveredId,
      showFlow: input.showFlow,
      opacity: aSystem,
      view,
      onlyKV: input.onlyKV ?? null,
    });
    segments.push(...r.segments);
    addLabels(r.labels, aSystem);
    picks.push(...r.picks);
  }

  // Worked out before the feeder is drawn, because the feeder needs to know
  // whether the substation is drawing itself.
  const subBounds = substationBounds(input.substationMorph);
  const aSub = include('substation', subBounds);

  const aFeeder = include('feeder', input.feederGeometry.bounds);
  if (aFeeder > 0) {
    const r = drawFeeder(input.feederGeometry, input.solved, input.camera, {
      selectedId: input.selectedId,
      hoveredId: input.hoveredId,
      showFlow: input.showFlow,
      opacity: aFeeder,
      showSubstation: aSub <= 0,
      faultBusId: input.faultBusId ?? null,
      motor: input.motor ?? null,
    });
    segments.push(...r.segments);
    addLabels(r.labels, aFeeder);
    picks.push(...r.picks);
  }

  if (aSub > 0) {
    const r = drawSubstation(input.solved, input.camera, {
      morph: input.substationMorph,
      selectedId: input.selectedId,
      hoveredId: input.hoveredId,
      showProtection: input.showProtection,
      opacity: aSub,
    });
    segments.push(...r.segments);
    addLabels(r.labels, aSub);
    picks.push(...r.picks);
  }

  const aService = include('service', serviceBounds());
  if (aService > 0) {
    const r = drawService(input.solved, input.service, input.camera, {
      selectedId: input.selectedId,
      hoveredId: input.hoveredId,
      opacity: aService,
    });
    segments.push(...r.segments);
    addLabels(r.labels, aService);
    picks.push(...r.picks);
  }

  // --- the generation branch ------------------------------------------------
  const aPlant = include('plant', plantBounds());
  if (aPlant > 0) {
    const r = drawPlant(input.solved, input.camera, {
      selectedId: input.selectedId,
      hoveredId: input.hoveredId,
      opacity: aPlant,
    });
    segments.push(...r.segments);
    addLabels(r.labels, aPlant);
    picks.push(...r.picks);
  }

  let machine: Generator | undefined;
  const aMachine = include('machine', machineBounds());
  if (aMachine > 0) {
    const r = drawMachine(input.solved, input.camera, {
      selectedId: input.selectedId,
      hoveredId: input.hoveredId,
      opacity: aMachine,
    });
    segments.push(...r.segments);
    addLabels(r.labels, aMachine);
    picks.push(...r.picks);
    machine = r.generator;
  }

  // Nothing modelled under the camera at all — over open country, say. The
  // floor is then the scale at which the transmission drawing itself gives up,
  // because that is genuinely as close as this model goes out there.
  if (!Number.isFinite(floorScale)) floorScale = ENVELOPE.system[0];

  return { segments, labels, picks, active, machine, floorScale };
}

// ---------------------------------------------------------------------------
// Destinations
// ---------------------------------------------------------------------------

export interface Destination {
  id: LevelId;
  name: string;
  /**
   * Which branch of the zoom tree this is on. The distribution branch runs
   * system → region → substation → feeder → service; the generation branch runs
   * plant → machine, and joins the first at the system view.
   */
  branch?: 'generation';
  /** One line explaining what the reader will be looking at. */
  blurb: string;
  /** Where to put the camera. Either a box to frame or a point and a scale. */
  frame?: () => Box;
  at?: () => { target: Vector3; metresPerPixel: number };
  /**
   * Whether framing should keep clear of the panels on the RIGHT as well as the
   * permanent ones on the left.
   *
   * On the map levels it should not: shrinking the whole state by half because
   * a panel happens to be open trades a permanent loss for a temporary gain.
   * Inside a substation or a power station it should, because those drawings
   * are small enough that a panel over one end hides a third of the subject.
   */
  tight?: boolean;
}

/**
 * The electrical hierarchy, as places a reader can go.
 *
 * These are presented in the order of the brief's zoom tree, which is the order
 * the power takes, not the order of increasing magnification.
 */
export function destinations(
  systemGeometry: SystemGeometry,
  feederBounds: () => Box
): Destination[] {
  const bayBox = (): Box => {
    // The Bay Area, taken from the sites that are actually in it rather than
    // from a hand-drawn rectangle, so it follows the network if the network
    // changes.
    const pts = Object.values(SITES)
      .filter((s) => s.region === 'bay')
      .map((s) => toWorld(project(s.lat, s.lon), 0));
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (const p of pts) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    }
    const pad = 22000;
    return {
      min: { x: minX - pad, z: minZ - pad },
      max: { x: maxX + pad, z: maxZ + pad },
    };
  };

  return [
    {
      id: 'system', name: 'System',
      blurb: 'All of California at once: the backbone, what is generating, what is flowing.',
      frame: () => systemGeometry.bounds,
    },
    {
      id: 'region', name: 'Region',
      blurb: 'The Bay Area — a dense load centre supplied almost entirely from outside itself.',
      frame: bayBox,
    },
    {
      // FRAMED, NOT PLACED AT A FIXED SCALE.
      //
      // A magic metres-per-pixel is a guess at how big the subject is, and it
      // was wrong: the yard came out filling less than half the width of an
      // otherwise empty page, sitting in the top right of it. Framing the box —
      // now that the box knows how tall the yard stands — puts the subject on
      // the page at the size the page allows, and keeps doing so if the yard,
      // the window or the panels ever change.
      id: 'substation', name: 'Substation',
      blurb: 'Inside the fence at Eden Vale: two incoming circuits, two transformers, four feeders.',
      frame: () => substationBounds(1),
      tight: true,
    },
    {
      id: 'feeder', name: 'Feeder',
      blurb: 'Cherry Lane 1201: three kilometres of street, pole by pole, out of Eden Vale.',
      at: () => {
        // The middle of the feeder's own extent, not the middle of the line
        // from the substation to the modelled house: the feeder carries on
        // past that house for another kilometre.
        const b = feederBounds();
        return {
          target: new Vector3((b.min.x + b.max.x) / 2, 0, (b.min.z + b.max.z) / 2),
          metresPerPixel: ZOOM.feeder,
        };
      },
    },
    {
      id: 'service', name: 'Service',
      blurb: '14 Cherry Lane: the transformer on the verge, the meter, the panel, one socket.',
      frame: () => serviceBounds(),
      tight: true,
    },
    {
      id: 'plant', name: 'Plant',
      blurb: 'Metcalf Energy Center: where the gas goes in, and where all of it comes out.',
      branch: 'generation',
      frame: () => plantBounds(),
      tight: true,
    },
    {
      id: 'machine', name: 'Machine',
      blurb: 'One generator in cross-section: three windings, a rotating field, and the load angle.',
      branch: 'generation',
      at: () => {
        const b = machineBounds();
        return {
          target: new Vector3((b.min.x + b.max.x) / 2, 0, (b.min.z + b.max.z) / 2),
          metresPerPixel: ZOOM.machine,
        };
      },
    },
  ];
}

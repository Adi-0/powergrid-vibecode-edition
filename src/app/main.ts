/**
 * Entry point. Wires the state, the drawing surface and the panels together.
 *
 * The shape of the thing: `AppState` owns the network and re-solves it whenever
 * anything changes; the `Viewport` draws whatever `composeFrame` makes of the
 * latest solution at the camera's current scale; every panel reads from the
 * same snapshot. There is no second copy of any number anywhere.
 *
 * Levels are not modes. There is one world, in metres, holding everything from
 * the Oregon border to a socket in a kitchen, and one camera that travels
 * through it. `src/app/scenes.ts` explains why, and does the compositing.
 */

import './styles.css';
import { Vector3 } from 'three';
import { AppState, AppSnapshot } from './state.js';
import { Viewport, FrameContent } from './viewport.js';
import { Legend } from './legend.js';
import { Inspector } from './inspector.js';
import { Scrubber } from './scrubber.js';
import { SidePanel } from './honesty.js';
import { LevelBar } from './levelbar.js';
import { VoltageProfile } from './profile.js';
import { MathPanel } from './mathpanel.js';
import { MachinePanel } from './machine-panel.js';
import { TccPanel } from './tcc-panel.js';
import { SolverPanel } from './solver-panel.js';
import { ReliabilityPanel } from './reliability-panel.js';
import { Guide } from './guide.js';
import { cherryLaneProtection } from '../data/california/protection-scheme.js';
import { feederFaultLevels } from '../sim/faults.js';
import { derivationsFor } from '../math/for-selection.js';
import { deriveMotorStart, deriveFactors } from '../math/derive.js';
import { Tooltip, term } from './tooltip.js';
import {
  composeFrame, destinations, SceneId, Destination, ComposeResult,
} from './scenes.js';
import {
  buildSystemGeometry, formatMW, SystemGeometry,
} from '../render/scene-system.js';
import { buildFeederGeometry, FeederGeometry } from '../render/scene-feeder.js';
import { LevelId, levelForScale, ZOOM } from '../render/style.js';
import { ScopeId } from '../data/simplifications.js';

const stage = document.getElementById('stage') as HTMLElement;
const statsEl = document.getElementById('stats') as HTMLElement;
const crumbEl = document.getElementById('breadcrumb') as HTMLElement;
const footerEl = document.getElementById('footer') as HTMLElement;

/** Render toggles, for visual debugging from the console or a screenshot script. */
const debug: { onlyKV: number | null; haloPad: number | undefined } =
  { onlyKV: null, haloPad: undefined };

const state = new AppState();
let geometry: SystemGeometry = buildSystemGeometry(state.current.solved);
const feederGeometry: FeederGeometry = buildFeederGeometry();

/** View state: things that change what is drawn but not what is solved. */
const view = { substationMorph: 0, showProtection: false };

const tooltip = new Tooltip();

/** The last frame's composition, so the panels know what is actually on screen. */
let lastFrame: ComposeResult | null = null;

const viewport: Viewport = new Viewport(stage, {
  build: (): FrameContent => {
    const snap = state.current;
    const r = composeFrame({
      solved: snap.solved,
      service: snap.service,
      systemGeometry: geometry,
      feederGeometry,
      camera: viewport.camera,
      viewport: viewport.size,
      selectedId: snap.selection.id,
      hoveredId: snap.hovered,
      substationMorph: view.substationMorph,
      showProtection: view.showProtection,
      showFlow: true,
      faultBusId: snap.faultAt?.busId ?? null,
      motor: snap.motor
        ? {
          busId: snap.motor.site.busId,
          state: snap.motor.state,
          label: snap.motor.state === 'starting'
            ? `${snap.motor.demand.sKVA.toFixed(0)} kVA · dip ${snap.motor.dipPercent.toFixed(2)} %`
            : `${snap.motor.demand.pKW.toFixed(0)} kW · pf ${snap.motor.demand.powerFactor.toFixed(2)}`,
        }
        : null,
      onlyKV: debug.onlyKV,
    });
    lastFrame = r;
    // How far in it is worth going HERE. Set every frame, because it depends
    // on what the camera is over, not on a global constant.
    viewport.camera.floorScale = r.floorScale;
    return { segments: r.segments, labels: r.labels, picks: r.picks };
  },
  onPick: (id, kind) => state.select(kind ?? 'none', id),
  onHover: (id) => state.hover(id),
  onCameraChange: (mpp, level) => onCamera(mpp, level),
  // The contextual panels ask "what is on screen", which only the frame that
  // was just built can answer.
  onContent: () => refreshForScene(),
});

// --- panels ---------------------------------------------------------------

const legend = new Legend({
  onExplain: (name, text, el) =>
    tooltip.show(`<div class="tooltip__term">${name}</div>` +
      `<div class="tooltip__short">${text}</div>`, el),
  onDismiss: () => tooltip.hide(),
});
stage.appendChild(legend.element);

const inspector = new Inspector({
  onClose: () => state.select('none', null),
  onTrip: (id) => state.toggleTrip(id),
  onSelect: (kind, id) => state.select(kind, id),
  onShowMath: (kind, id) => openMath(kind, id),
});
stage.appendChild(inspector.element);

const math = new MathPanel({
  onClose: () => stage.classList.remove('has-math'),
});
stage.appendChild(math.element);

/** Open the working for one selected object. */
function openMath(kind: Parameters<typeof derivationsFor>[0], id: string): void {
  const snap = state.current;
  const derivations = derivationsFor(
    kind, id, snap.solved, snap.service, snap.fault?.result ?? null);
  if (derivations.length === 0) return;
  mathTarget = { kind, id };
  stage.classList.add('has-math');
  math.show(derivations);
}

/**
 * What the math panel is currently showing, so it can be re-derived when the
 * network is re-solved. A derivation is a photograph of one solution; leaving
 * one on screen beside a drawing of a different solution would be the worst
 * thing this app could do.
 */
let mathTarget: { kind: Parameters<typeof derivationsFor>[0]; id: string } | null = null;

const side = new SidePanel(() => side.close());
stage.appendChild(side.element);
tooltip.onOpenGlossary = (id) => side.openGlossary(id);

const levelBar = new LevelBar({
  onMorph: (t) => { view.substationMorph = t; viewport.invalidate(); },
  onProtection: (on) => { view.showProtection = on; viewport.invalidate(); },
  onAppliance: (id) => state.setAppliance(id),
  onStorage: (on) => state.setStorageInService(on),
  onFault: (busId, kind) => state.setFault(busId, kind),
  onMotor: (motorState, method, site) => state.setMotor(motorState, method, site),
  onRestoreAll: () => state.restoreAll(),
  onFactorsWorking: () => {
    const snap = state.current;
    // The example is the unit whose capacity factor is most worth explaining:
    // the one setting the price, if there is one, and otherwise the largest.
    const f = snap.factors;
    const marginal = snap.dispatch.marginalUnit;
    const example = f.capacity.find((g) => g.id === marginal)
      ?? f.capacity.find((g) => g.capacityFactor > 0.1 && g.capacityFactor < 0.9)
      ?? f.capacity[0] ?? null;
    stage.classList.add('has-math');
    math.show([deriveFactors(f, example)]);
    mathTarget = null;
  },
  onMotorWorking: () => {
    const study = state.current.motor;
    if (!study) return;
    stage.classList.add('has-math');
    math.show([deriveMotorStart(study)]);
    mathTarget = null;
  },
});
stage.appendChild(levelBar.element);

const profile = new VoltageProfile({
  onSelect: (nodeId) => state.select('site', nodeId),
});
stage.appendChild(profile.element);

const machinePanel = new MachinePanel({
  onClose: () => stage.classList.remove('has-machine'),
});
stage.appendChild(machinePanel.element);

const solver = new SolverPanel({
  onClose: () => stage.classList.remove('has-solver'),
});
stage.appendChild(solver.element);

const reliabilityPanel = new ReliabilityPanel({
  onClose: () => stage.classList.remove('has-reliability'),
});
stage.appendChild(reliabilityPanel.element);

const tcc = new TccPanel({
  onClose: () => { stage.classList.remove('has-tcc'); state.setFault(null); },
});
stage.appendChild(tcc.element);

/**
 * The guided path.
 *
 * It drives the same public controls a reader would use by hand — there is no
 * private back door into the state — so anything it does can be undone by
 * touching the control it touched, and leaving the path leaves the app exactly
 * where the path got to.
 */
const guide = new Guide({
  goTo: (id) => goTo(id),
  setHour: (hour) => { state.setHour(hour); },
  setSeason: (season) => { state.setSeason(season); scrubber.setSeason(season); },
  setStorage: (on) => { state.setStorageInService(on); levelBar.setStorage(on); },
  setAppliance: (id) => state.setAppliance(id),
  setMotor: (motorState, method, site) => state.setMotor(motorState, method, site),
  setFault: (busId, kind) => { state.setFault(busId, kind); levelBar.setFault(busId, kind); },
  openPanel: (id) => {
    side.close();
    solver.setVisible(false);
    stage.classList.remove('has-solver');
    reliabilityPanel.setVisible(false);
    stage.classList.remove('has-reliability');
    if (id === 'solver') {
      solver.setVisible(true);
      stage.classList.add('has-solver');
      solver.render(state.current.solved);
    } else if (id === 'reliability') {
      reliabilityPanel.setVisible(true);
      stage.classList.add('has-reliability');
      reliabilityPanel.render();
    } else if (id === 'honesty') side.openHonesty(viewport.level as ScopeId);
    else if (id === 'glossary') side.openGlossary();
  },
  onLeave: () => {
    stage.classList.remove('has-guide');
    (controls.querySelector('[data-action="guide"]') as HTMLElement)
      ?.setAttribute('aria-pressed', 'false');
  },
});
stage.appendChild(guide.element);

const scrubber = new Scrubber({
  onChange: (hour) => state.setHour(hour),
  onSeasonChange: (season) => state.setSeason(season),
});
footerEl.appendChild(scrubber.element);

const controls = document.createElement('div');
controls.className = 'footer__controls';
controls.innerHTML =
  `<button class="btn btn--quiet" data-action="guide" aria-pressed="false">Show me around</button>` +
  `<button class="btn btn--quiet" data-panel="glossary">Glossary</button>` +
  `<button class="btn btn--quiet" data-panel="honesty">What this leaves out</button>` +
  `<button class="btn btn--quiet" data-panel="solver">How it was solved</button>` +
  `<button class="btn btn--quiet" data-panel="reliability">How often it goes out</button>` +
  `<button class="btn btn--quiet" data-action="restore" style="display:none">Restore all circuits</button>` +
  `<button class="btn btn--quiet" data-action="frame">Whole state</button>`;
footerEl.appendChild(controls);
controls.addEventListener('click', (e) => {
  const t = (e.target as HTMLElement).closest('button') as HTMLElement | null;
  if (!t) return;
  if (t.dataset.panel === 'glossary') side.openGlossary();
  else if (t.dataset.panel === 'honesty') side.openHonesty(viewport.level as ScopeId);
  else if (t.dataset.panel === 'solver') {
    solver.toggle();
    stage.classList.toggle('has-solver', solver.isOpen);
    solver.render(state.current.solved);
  }
  else if (t.dataset.panel === 'reliability') {
    reliabilityPanel.toggle();
    stage.classList.toggle('has-reliability', reliabilityPanel.isOpen);
  }
  else if (t.dataset.action === 'guide') {
    guide.toggle();
    stage.classList.toggle('has-guide', guide.isOpen);
    t.setAttribute('aria-pressed', String(guide.isOpen));
  }
  else if (t.dataset.action === 'restore') state.restoreAll();
  else if (t.dataset.action === 'frame') frameAll();
});

// --- travelling between levels --------------------------------------------

const PLACES: Destination[] = destinations(geometry, () => feederGeometry.bounds);

/**
 * Fly to a named level.
 *
 * The flight is deliberately slow — nine hundred milliseconds — because the
 * transition is the part of the interface that shows what a model IS, by making
 * one level visibly collapse into its place in the level above. A cut would
 * save time and destroy the only thing worth watching.
 */
function goTo(id: LevelId): void {
  const dest = PLACES.find((d) => d.id === id);
  if (!dest) return;
  if (dest.frame) {
    const box = dest.frame();
    // Frame by computing the camera the box wants, then fly to it, so that the
    // motion is one continuous move rather than a jump followed by a settle.
    const before = { target: viewport.camera.target.clone(), mpp: viewport.camera.metresPerPixel };
    // The left inset is the controls and the legend, which are always there.
    // The right-hand panels are deliberately NOT counted here: framing the
    // whole state is about the map, and shrinking the map by half because a
    // transient panel is open trades a permanent loss for a temporary gain.
    // The point-and-scale path below still pans for them, which is the part
    // that matters — it keeps what you flew to out from under the panel.
    const inset = insetsOnArrival(id);
    viewport.camera.frame(box.min, box.max, 56, {
      left: 300, bottom: inset.bottom,
      ...(dest.tight ? { right: inset.right } : {}),
    });
    const after = { target: viewport.camera.target.clone(), mpp: viewport.camera.metresPerPixel };
    viewport.camera.target.copy(before.target);
    viewport.camera.setZoom(before.mpp);
    viewport.flyTo(after.target, after.mpp, 900, afterTravel);
  } else if (dest.at) {
    const { target, metresPerPixel } = dest.at();
    // Shift the destination so the drawing lands in the space that is actually
    // visible rather than behind the panels sitting over the canvas.
    viewport.flyTo(
      offsetForPanels(target, metresPerPixel, insetsOnArrival(id)),
      metresPerPixel, 900, afterTravel
    );
  }
}

/**
 * Move a camera target sideways and upwards by the panel insets.
 *
 * The ground-plane vectors that correspond to one screen pixel come from the
 * camera itself, so this works at any zoom and under the isometric shear
 * without a fudge factor.
 */
function offsetForPanels(
  target: Vector3, mpp: number,
  insets?: { bottom: number; right: number }
): Vector3 {
  const before = viewport.camera.metresPerPixel;
  viewport.camera.setZoom(mpp);
  const b = viewport.camera.groundBasis();
  viewport.camera.setZoom(before);
  const left = 300;                    // the level controls and the legend
  // Whatever is open on the right — the inspector, the coordination curves,
  // the solver, the capability curve. Travelling to a fault only to park it
  // underneath the panel explaining the fault is the kind of thing that makes
  // an app feel like it is not paying attention.
  const right = insets?.right ?? rightPanelInsetPx();
  const bottom = insets?.bottom ?? profileInsetPx();
  const dxPx = -(left - right) / 2;
  const dyPx = bottom / 2;
  return target.clone().add(new Vector3(
    b.rightX * dxPx + b.downX * dyPx, 0, b.rightZ * dxPx + b.downZ * dyPx
  ));
}

function afterTravel(): void {
  onCamera(viewport.camera.metresPerPixel, viewport.level);
}

/**
 * Bring the contextual panels into line with whatever was just drawn.
 *
 * Kept separate from `onCamera` because it is driven by the render loop rather
 * than by a camera event, and because it must be cheap: it runs on every frame
 * that rebuilds content.
 */
let lastScene: SceneId | null | undefined;
function refreshForScene(): void {
  const scene = dominantScene();
  if (scene === lastScene) {
    if (scene === 'machine') machinePanel.render(state.current.solved, lastFrame?.machine);
    return;
  }
  lastScene = scene;
  onCamera(viewport.camera.metresPerPixel, viewport.level);
}

/**
 * How much of the right-hand side is covered by a panel, in pixels.
 *
 * The panels are all anchored to the same edge and overlap each other, so the
 * inset is the widest one that is actually on screen, not their sum.
 */
function rightPanelInsetPx(): number {
  let widest = 0;
  for (const el of document.querySelectorAll<HTMLElement>(
    '.panel--inspect, .panel--tcc, .panel--solver, .panel--reliability, ' +
    '.panel--machine, .panel--math'
  )) {
    if (el.style.display === 'none' || el.offsetParent === null) continue;
    widest = Math.max(widest, el.getBoundingClientRect().width);
  }
  return widest > 0 ? widest + 18 : 0;
}

/** How much of the bottom of the stage the profile plot is covering. */
const profileInsetPx = (): number =>
  profile.element.style.display === 'none' ? 0 : 186;

/**
 * Width of the capability-curve panel, which opens by itself at the machine.
 * Matches `.panel--machine` in the stylesheet; a test keeps the two together.
 */
const MACHINE_PANEL_PX = 430 + 18;

/**
 * The insets the destination will have ONCE IT HAS ARRIVED.
 *
 * Framing has to answer "how much page will there be when I get there", not
 * "how much is there now". Asking the second question meant that flying from
 * the service back up to the substation framed the yard around a voltage-profile
 * plot that was about to close, so the same journey landed at two different
 * sizes depending on where it started — the kind of inconsistency that makes an
 * interface feel unreliable without ever being obviously wrong.
 */
function insetsOnArrival(id: LevelId): { bottom: number; right: number } {
  return {
    bottom: id === 'feeder' || id === 'service' ? 186 : 0,
    right: id === 'machine'
      ? MACHINE_PANEL_PX
      // Panels that belong to a selection, not to a level, stay where they are.
      : rightPanelInsetPx(),
  };
}

// --- state plumbing -------------------------------------------------------

state.subscribe((snap) => {
  geometry = buildSystemGeometry(snap.solved);
  renderStats();
  inspector.render(snap, geometry);
  profile.render(snap.solved, snap.selection.id, snap.motor?.before ?? null);
  if (machinePanel.isOpen) machinePanel.render(snap.solved, lastFrame?.machine);
  if (solver.isOpen) solver.render(snap.solved);
  if (reliabilityPanel.isOpen) reliabilityPanel.render();
  levelBar.setMotor(snap.motor);
  levelBar.setFactors(snap.factors);
  levelBar.setTripped(snap.tripped.size);
  renderTcc(snap);
  if (math.isOpen && mathTarget) {
    math.update(derivationsFor(
      mathTarget.kind, mathTarget.id, snap.solved, snap.service,
      snap.fault?.result ?? null));
  } else if (math.isOpen && snap.motor) {
    // The motor derivation is not bound to a selection: it belongs to the
    // perturbation itself, and it has to follow the re-solve like any other.
    math.update([deriveMotorStart(snap.motor)]);
  }
  scrubber.update(state.dispatchDayResults, snap.hour, snap.dispatch);
  (controls.querySelector('[data-action="restore"]') as HTMLElement).style.display =
    snap.tripped.size > 0 ? '' : 'none';
  viewport.invalidate();
});

/**
 * Everything that depends on where the camera is.
 *
 * `levelForScale` answers "how much detail is legible here", which is what the
 * legend and the honesty panel need. `dominantScene` answers "what is the
 * reader actually looking at", which is what the contextual controls need, and
 * it is decided by which drawing is being rendered most strongly — not by a
 * mode flag, because there isn't one.
 */
function onCamera(mpp: number, level: LevelId): void {
  legend.update(mpp);
  // On the generation branch the scene decides; on the distribution branch the
  // scale does, because there the two agree.
  const scene = dominantScene();
  const here: LevelId =
    scene === 'plant' || scene === 'machine' ? scene : level;
  renderBreadcrumb(here);
  side.setScope(here as ScopeId);

  levelBar.setScene(scene, here);

  renderTcc(state.current);

  // The capability curve belongs to the machine and to nothing else.
  const wantMachine = scene === 'machine';
  if (machinePanel.isOpen !== wantMachine) {
    machinePanel.setVisible(wantMachine);
    stage.classList.toggle('has-machine', wantMachine);
  }
  if (wantMachine) machinePanel.render(state.current.solved, lastFrame?.machine);

  // The voltage profile belongs to the feeder and to the service at the end of
  // it — the two places where "how far along the wire" is a meaningful axis.
  const wantProfile = scene === 'feeder' || scene === 'service';
  if ((profile.element.style.display === 'none') === wantProfile) {
    profile.setVisible(wantProfile);
    if (wantProfile) profile.render(state.current.solved, state.current.selection.id,
      state.current.motor?.before ?? null);
  }

  // Arriving at the substation with the diagram flat is the right place to
  // start: the reader sees the abstraction first, then watches it stand up.
  if (scene === 'substation') levelBar.setMorph(view.substationMorph);
}

/**
 * Which drawing the reader is actually looking at.
 *
 * Taken from the last composed frame rather than from scale alone, because the
 * plant and the substation are legible at overlapping scales and are three
 * hundred kilometres apart. The compositor has already culled whichever one the
 * camera cannot see, so its own account of what it drew is the only honest
 * answer.
 */
/**
 * The coordination plot appears when there is a fault to study, and nowhere
 * else. It is not a permanent readout: it is the answer to a question the
 * reader asked by putting a fault somewhere.
 */
function renderTcc(snap: AppSnapshot): void {
  const want = snap.fault !== null;
  if (tcc.isOpen !== want) {
    tcc.setVisible(want);
    stage.classList.toggle('has-tcc', want);
  }
  if (want) {
    tcc.render(snap.fault, cherryLaneProtection(feederFaultLevels(snap.solved)));
  }
}

/**
 * What the reader is actually looking at.
 *
 * Not "which scene is drawn most strongly" — that was the old rule and it was
 * wrong in both directions. Zoomed into the Eden Vale yard, the feeder is still
 * at full opacity because its own scale band is wide, so the panels offered
 * feeder controls over a picture of a substation. Zoomed out, ties went to the
 * coarsest scene because it happened to be drawn first.
 *
 * The rule now is opacity TIMES how much of the window the scene occupies, so
 * the drawing that fills the screen wins and a drawing running off both edges
 * loses to the one sitting inside them.
 */
function dominantScene(): SceneId | null {
  if (!lastFrame) return null;
  let best: SceneId | null = null;
  let bestScore = 0.02;
  for (const a of lastFrame.active) {
    // The ground is context for whatever is standing on it, never the subject.
    if (a.scene === 'ground') continue;
    // Ties and near-ties go to the FINER scene, because the scenes are listed
    // coarsest-first and in a hand-over the reader is on their way in. The old
    // rule left a dead band mid-transition where nothing was named at all.
    const score = a.alpha * a.fit;
    if (score >= bestScore * 0.92) { bestScore = Math.max(bestScore, score); best = a.scene; }
  }
  return best === 'system' ? null : best;
}

function renderStats(): void {
  const s = state.current;
  const sys = s.solved.system;
  const rows: { label: string; value: string; alarm?: boolean; termId?: string }[] = [
    { label: 'Demand', value: formatMW(sys.pLoadMW), termId: 'real-power' },
    { label: 'Losses', value: `${formatMW(sys.pLossMW)} · ${sys.lossPercent.toFixed(2)}%` },
    { label: 'Price', value: `$${s.dispatch.marginalCostPerMWh}/MWh`, termId: 'marginal-cost' },
    {
      label: 'Overloads', value: String(sys.overloadedBranches.length),
      alarm: sys.overloadedBranches.length > 0, termId: 'thermal-limit',
    },
    {
      label: 'Voltage', value: String(sys.voltageViolations.length),
      alarm: sys.voltageViolations.length > 0, termId: 'voltage',
    },
  ];
  statsEl.innerHTML = rows
    .map((r) =>
      `<div class="stat${r.alarm ? ' stat--alarm' : ''}">` +
      `<span class="stat__label">${r.termId ? term(r.termId, r.label) : r.label}</span>` +
      `<span class="stat__value num">${r.value}</span></div>`)
    .join('');
}

/**
 * The breadcrumb, which is also the navigation.
 *
 * It lists the ELECTRICAL hierarchy, in the order power takes, and every entry
 * is a place the reader can travel to. That order is not the order of
 * increasing magnification — the feeder leaving Eden Vale is thirty times
 * longer than the yard it leaves — and pretending otherwise would teach the
 * wrong thing about what contains what.
 */
function renderBreadcrumb(level: LevelId): void {
  const distribution = PLACES.filter((d) => d.branch === undefined);
  const generation = PLACES.filter((d) => d.branch === 'generation');
  const idx = distribution.findIndex((d) => d.id === level);

  const crumb = (d: Destination, state: string): string =>
    `<button class="crumb ${state}" data-go="${d.id}" title="${escapeAttr(d.blurb)}">` +
    `${state === 'is-here' ? `<b>${d.name}</b>` : d.name}</button>`;

  const main = distribution
    .map((d, i) => crumb(d, i === idx ? 'is-here' : i < idx && idx >= 0 ? 'is-past' : ''))
    .join('<span class="header__sep">›</span>');

  // The generation branch is set off rather than appended: power comes OUT of
  // a machine into the system, so putting it after "Service" would draw a line
  // that does not exist.
  const branch = generation
    .map((d) => crumb(d, d.id === level ? 'is-here' : ''))
    .join('<span class="header__sep">›</span>');

  crumbEl.innerHTML =
    `${main}<span class="header__branch">·</span>${branch}`;
}

crumbEl.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('[data-go]') as HTMLElement | null;
  if (b?.dataset.go) goTo(b.dataset.go as LevelId);
});

const escapeAttr = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** Open on the whole state, leaving room for the legend. */
function frameAll(): void {
  viewport.camera.frame(geometry.bounds.min, geometry.bounds.max, 56, { left: 252 });
  onCamera(viewport.camera.metresPerPixel, viewport.level);
  viewport.invalidate();
}

frameAll();
renderStats();
scrubber.update(state.dispatchDayResults, state.current.hour, state.current.dispatch);
viewport.start();

// Exposed for debugging and for the screenshot harness.
(window as unknown as Record<string, unknown>).gridAtlas = {
  state, viewport, debug, frameAll, side, inspector, goTo, view, levelBar,
  levelForScale, ZOOM, math, openMath, machinePanel, solver, tcc,
  get lastFrame() { return lastFrame; },
  get geometry() { return geometry; },
};

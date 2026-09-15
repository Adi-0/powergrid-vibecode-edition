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
import { AppState } from './state.js';
import { Viewport, FrameContent } from './viewport.js';
import { Legend } from './legend.js';
import { Inspector } from './inspector.js';
import { Scrubber } from './scrubber.js';
import { SidePanel } from './honesty.js';
import { LevelBar } from './levelbar.js';
import { VoltageProfile } from './profile.js';
import { MathPanel } from './mathpanel.js';
import { derivationsFor } from '../math/for-selection.js';
import { Tooltip, term } from './tooltip.js';
import { composeFrame, destinations, sceneAlpha, SceneId, Destination } from './scenes.js';
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
      onlyKV: debug.onlyKV,
    });
    return { segments: r.segments, labels: r.labels, picks: r.picks };
  },
  onPick: (id, kind) => state.select(kind ?? 'none', id),
  onHover: (id) => state.hover(id),
  onCameraChange: (mpp, level) => onCamera(mpp, level),
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
  const derivations = derivationsFor(kind, id, snap.solved, snap.service);
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
});
stage.appendChild(levelBar.element);

const profile = new VoltageProfile({
  onSelect: (nodeId) => state.select('site', nodeId),
});
stage.appendChild(profile.element);

const scrubber = new Scrubber({
  onChange: (hour) => state.setHour(hour),
  onSeasonChange: (season) => state.setSeason(season),
});
footerEl.appendChild(scrubber.element);

const controls = document.createElement('div');
controls.className = 'footer__controls';
controls.innerHTML =
  `<button class="btn btn--quiet" data-panel="glossary">Glossary</button>` +
  `<button class="btn btn--quiet" data-panel="honesty">What this leaves out</button>` +
  `<button class="btn btn--quiet" data-action="restore" style="display:none">Restore all circuits</button>` +
  `<button class="btn btn--quiet" data-action="frame">Whole state</button>`;
footerEl.appendChild(controls);
controls.addEventListener('click', (e) => {
  const t = (e.target as HTMLElement).closest('button') as HTMLElement | null;
  if (!t) return;
  if (t.dataset.panel === 'glossary') side.openGlossary();
  else if (t.dataset.panel === 'honesty') side.openHonesty(viewport.level as ScopeId);
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
    viewport.camera.frame(box.min, box.max, 56, { left: 252, bottom: profileInsetPx() });
    const after = { target: viewport.camera.target.clone(), mpp: viewport.camera.metresPerPixel };
    viewport.camera.target.copy(before.target);
    viewport.camera.setZoom(before.mpp);
    viewport.flyTo(after.target, after.mpp, 900, afterTravel);
  } else if (dest.at) {
    const { target, metresPerPixel } = dest.at();
    // Shift the destination so the drawing lands in the space that is actually
    // visible rather than behind the panels sitting over the canvas.
    viewport.flyTo(
      offsetForPanels(target, metresPerPixel), metresPerPixel, 900, afterTravel
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
function offsetForPanels(target: Vector3, mpp: number): Vector3 {
  const before = viewport.camera.metresPerPixel;
  viewport.camera.setZoom(mpp);
  const b = viewport.camera.groundBasis();
  viewport.camera.setZoom(before);
  const left = 300;                    // the level controls and the legend
  const right = 0;
  const bottom = profileInsetPx();
  const dxPx = -(left - right) / 2;
  const dyPx = bottom / 2;
  return target.clone().add(new Vector3(
    b.rightX * dxPx + b.downX * dyPx, 0, b.rightZ * dxPx + b.downZ * dyPx
  ));
}

function afterTravel(): void {
  onCamera(viewport.camera.metresPerPixel, viewport.level);
}

/** How much of the bottom of the stage the profile plot is covering. */
const profileInsetPx = (): number =>
  profile.element.style.display === 'none' ? 0 : 186;

// --- state plumbing -------------------------------------------------------

state.subscribe((snap) => {
  geometry = buildSystemGeometry(snap.solved);
  renderStats();
  inspector.render(snap, geometry);
  profile.render(snap.solved, snap.selection.id);
  if (math.isOpen && mathTarget) {
    math.update(derivationsFor(mathTarget.kind, mathTarget.id, snap.solved, snap.service));
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
  renderBreadcrumb(level);
  side.setScope(level as ScopeId);

  const scene = dominantScene(mpp);
  levelBar.setScene(scene);

  // The voltage profile belongs to the feeder and to the service at the end of
  // it — the two places where "how far along the wire" is a meaningful axis.
  const wantProfile = scene === 'feeder' || scene === 'service';
  if ((profile.element.style.display === 'none') === wantProfile) {
    profile.setVisible(wantProfile);
    if (wantProfile) profile.render(state.current.solved, state.current.selection.id);
  }

  // Arriving at the substation with the diagram flat is the right place to
  // start: the reader sees the abstraction first, then watches it stand up.
  if (scene === 'substation') levelBar.setMorph(view.substationMorph);
}

function dominantScene(mpp: number): SceneId | null {
  const candidates: SceneId[] = ['system', 'feeder', 'substation', 'service'];
  let best: SceneId | null = null;
  let bestAlpha = 0.35;
  for (const c of candidates) {
    const a = sceneAlpha(c, mpp);
    if (a > bestAlpha) { bestAlpha = a; best = c; }
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
  const order: LevelId[] = ['system', 'region', 'substation', 'feeder', 'service'];
  const idx = order.indexOf(level);
  crumbEl.innerHTML = PLACES
    .map((d, i) => {
      const cls = i === idx ? 'is-here' : i < idx ? 'is-past' : '';
      return `<button class="crumb ${cls}" data-go="${d.id}" title="${escapeAttr(d.blurb)}">` +
        `${i === idx ? `<b>${d.name}</b>` : d.name}</button>`;
    })
    .join('<span class="header__sep">›</span>');
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
  levelForScale, ZOOM, math, openMath,
  get geometry() { return geometry; },
};

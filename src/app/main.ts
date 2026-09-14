/**
 * Entry point. Wires the state, the drawing surface and the panels together.
 *
 * The shape of the thing: `AppState` owns the network and re-solves it whenever
 * anything changes; the `Viewport` draws whatever the scene builder makes of the
 * latest solution; every panel reads from the same snapshot. There is no second
 * copy of any number anywhere.
 */

import './styles.css';
import { AppState } from './state.js';
import { Viewport, FrameContent } from './viewport.js';
import { Legend } from './legend.js';
import { Inspector } from './inspector.js';
import { Scrubber } from './scrubber.js';
import { SidePanel } from './honesty.js';
import { Tooltip, term } from './tooltip.js';
import {
  buildSystemGeometry, drawSystem, formatMW, SystemGeometry,
} from '../render/scene-system.js';
import { LevelId } from '../render/style.js';
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

const tooltip = new Tooltip();

const viewport: Viewport = new Viewport(stage, {
  build: (): FrameContent => {
    const snap = state.current;
    return drawSystem(geometry, snap.solved, viewport.camera, {
      selectedId: snap.selection.id,
      hoveredId: snap.hovered,
      onlyKV: debug.onlyKV,
      ...(debug.haloPad !== undefined ? { haloPad: debug.haloPad } : {}),
    });
  },
  onPick: (id, kind) => state.select(kind ?? 'none', id),
  onHover: (id) => state.hover(id),
  onCameraChange: (mpp, level) => {
    legend.update(mpp);
    renderBreadcrumb(level);
    side.setScope(level as ScopeId);
  },
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
  onShowMath: () => {
    // The math panel arrives in phase 5. Until then, say so plainly rather
    // than silently doing nothing.
    window.alert(
      'The full worked derivation panel is the next phase of this build. ' +
      'Every number you can see already comes from the solver — the panel ' +
      'will show the arithmetic that produced it.'
    );
  },
});
stage.appendChild(inspector.element);

const side = new SidePanel(() => side.close());
stage.appendChild(side.element);
tooltip.onOpenGlossary = (id) => side.openGlossary(id);

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

// --- state plumbing -------------------------------------------------------

state.subscribe((snap) => {
  geometry = buildSystemGeometry(snap.solved);
  renderStats();
  inspector.render(snap, geometry);
  scrubber.update(state.dispatchDayResults, snap.hour, snap.dispatch);
  (controls.querySelector('[data-action="restore"]') as HTMLElement).style.display =
    snap.tripped.size > 0 ? '' : 'none';
  viewport.invalidate();
});

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

function renderBreadcrumb(level: LevelId): void {
  const names: Record<LevelId, string> = {
    system: 'System', region: 'Region', substation: 'Substation',
    feeder: 'Feeder', service: 'Service',
  };
  const order: LevelId[] = ['system', 'region', 'substation', 'feeder', 'service'];
  const idx = order.indexOf(level);
  crumbEl.innerHTML = order
    .map((l, i) =>
      i === idx ? `<b>${names[l]}</b>`
        : `<span class="${i < idx ? 'is-past' : ''}">${names[l]}</span>`)
    .join('<span class="header__sep">›</span>');
}

/** Open on the whole state, leaving room for the legend. */
function frameAll(): void {
  viewport.camera.frame(geometry.bounds.min, geometry.bounds.max, 56, { left: 252 });
  legend.update(viewport.camera.metresPerPixel);
  renderBreadcrumb(viewport.level);
  viewport.invalidate();
}

frameAll();
renderStats();
scrubber.update(state.dispatchDayResults, state.current.hour, state.current.dispatch);
viewport.start();

// Exposed for debugging and for the screenshot harness.
(window as unknown as Record<string, unknown>).gridAtlas = {
  state, viewport, debug, frameAll, side, inspector,
  get geometry() { return geometry; },
};

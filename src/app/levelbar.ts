/**
 * The controls that belong to one level and to no other.
 *
 * Most of the interface is the same everywhere. A few things are not, because
 * they only mean something at one scale: you can only morph a single-line
 * diagram into a yard where there is a yard, and you can only switch a kettle
 * on where there is a kitchen. Those controls live here and appear when the
 * camera arrives at the level they belong to.
 *
 * They are also the PERTURBATION controls for their level, which the brief asks
 * for at every level of the tree: something the reader can change, with a real
 * re-solve behind it.
 */

import { APPLIANCES } from '../data/california/service.js';
import { FaultKind } from '../core/fault.js';
import { feederBusId } from '../data/california/feeder.js';
import { SceneId } from './scenes.js';
import { LevelId } from '../render/style.js';
import {
  MotorState, MotorStudy, MOTOR_SITES, CHERRY_LANE_MOTOR, LOAD_BREAKAWAY_TORQUE_PU,
  fullLoadAmps, lockedRotorAmps,
} from '../sim/motor-start.js';
import { StartMethod, START_METHODS } from '../core/motor.js';
import { FactorSet } from '../sim/factors.js';
import { term } from './tooltip.js';

export interface LevelBarHost {
  onMorph: (t: number) => void;
  onProtection: (on: boolean) => void;
  onAppliance: (id: string | null) => void;
  onStorage: (inService: boolean) => void;
  onFault: (busId: string | null, kind: FaultKind) => void;
  onMotor: (state: MotorState, method: StartMethod, site: string) => void;
  onMotorWorking?: () => void;
  onFactorsWorking?: () => void;
  onRestoreAll?: () => void;
  onExplain?: (title: string, text: string, el: HTMLElement) => void;
  onDismiss?: () => void;
}

export class LevelBar {
  readonly element: HTMLElement;
  private readonly host: LevelBarHost;
  private scene: SceneId | null = null;
  private level: LevelId = 'system';
  private morph = 0;
  private protection = false;
  private appliance: string | null = null;
  /** Which of the "there is more here" paragraphs the reader has opened. */
  private readonly opened = new Set<string>();
  private storage = true;
  private faultBus: string | null = null;
  private faultKind: FaultKind = 'single-line-to-ground';
  private motorState: MotorState = 'off';
  private motorMethod: StartMethod = 'across-the-line';
  private motorSite = MOTOR_SITES[0].id;
  private motor: MotorStudy | null = null;
  private factors: FactorSet | null = null;
  private tripped = 0;

  constructor(host: LevelBarHost) {
    this.host = host;
    this.element = document.createElement('section');
    this.element.className = 'panel panel--level';
    this.element.style.display = 'none';
    this.element.innerHTML =
      `<div class="panel__head">` +
      `<span class="panel__title" data-role="title"></span>` +
      `<span class="panel__sub" data-role="sub"></span>` +
      `</div><div class="panel__body"></div>`;

    this.element.addEventListener('input', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.dataset.role === 'morph') {
        this.morph = Number(t.value) / 100;
        this.host.onMorph(this.morph);
        this.updateMorphReadout();
      }
    });
    this.element.addEventListener('toggle', (e) => {
      const d = e.target as HTMLDetailsElement;
      const key = d.dataset?.more;
      if (!key) return;
      if (d.open) this.opened.add(key);
      else this.opened.delete(key);
    }, true);

    this.element.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button') as HTMLElement | null;
      if (!b) return;
      if (b.dataset.role === 'protection') {
        this.protection = !this.protection;
        b.setAttribute('aria-pressed', String(this.protection));
        this.host.onProtection(this.protection);
      } else if (b.dataset.role === 'morph-end') {
        this.setMorph(b.dataset.value === '1' ? 1 : 0);
        this.host.onMorph(this.morph);
      } else if (b.dataset.role === 'storage') {
        this.storage = !this.storage;
        this.host.onStorage(this.storage);
        this.render();
      } else if (b.dataset.faultAt !== undefined) {
        const at = b.dataset.faultAt || null;
        this.faultBus = this.faultBus === at ? null : at;
        this.host.onFault(this.faultBus, this.faultKind);
        this.render();
      } else if (b.dataset.faultKind) {
        this.faultKind = b.dataset.faultKind as FaultKind;
        if (this.faultBus) this.host.onFault(this.faultBus, this.faultKind);
        this.render();
      } else if (b.dataset.motorState) {
        const next = b.dataset.motorState as MotorState;
        this.motorState = this.motorState === next ? 'off' : next;
        this.host.onMotor(this.motorState, this.motorMethod, this.motorSite);
      } else if (b.dataset.motorMethod) {
        this.motorMethod = b.dataset.motorMethod as StartMethod;
        this.host.onMotor(this.motorState, this.motorMethod, this.motorSite);
      } else if (b.dataset.motorSite) {
        this.motorSite = b.dataset.motorSite;
        this.host.onMotor(this.motorState, this.motorMethod, this.motorSite);
      } else if (b.dataset.role === 'motor-working') {
        this.host.onMotorWorking?.();
      } else if (b.dataset.role === 'factors-working') {
        this.host.onFactorsWorking?.();
      } else if (b.dataset.role === 'restore') {
        this.host.onRestoreAll?.();
      } else if (b.dataset.appliance !== undefined) {
        const id = b.dataset.appliance || null;
        this.appliance = this.appliance === id ? null : id;
        this.host.onAppliance(this.appliance);
        this.render();
      }
    });
  }

  setMorph(t: number): void {
    this.morph = Math.max(0, Math.min(1, t));
    const slider = this.element.querySelector('[data-role="morph"]') as HTMLInputElement | null;
    if (slider) slider.value = String(Math.round(this.morph * 100));
    this.updateMorphReadout();
  }

  get morphValue(): number {
    return this.morph;
  }

  /**
   * Show the controls for whichever scene is dominant.
   *
   * `level` is passed as well because the two answer different questions.
   * Between the whole state and one feeder there is no scene of its own — the
   * transmission drawing carries both — but the reader is somewhere quite
   * different at 1,200 m/px and at 140, and the panel has to say so.
   */
  setScene(scene: SceneId | null, level: LevelId = 'system'): void {
    if (scene === this.scene && level === this.level) return;
    this.scene = scene;
    this.level = level;
    this.render();
  }

  /**
   * Which appliance is on, from the state rather than from the last click.
   *
   * The guided path switches everything off on its way past, and without this
   * the buttons went on showing whatever was last pressed — a control saying
   * the car charger is on beside a drawing of a house drawing nothing. Same
   * rule as the motor below: the controls follow the state, never the reverse.
   */
  setAppliance(id: string | null): void {
    if (this.appliance === id) return;
    this.appliance = id;
    if (this.scene === 'service') this.render();
  }

  /**
   * Take the motor study from the state, so the readout is solver output and
   * not something this panel worked out for itself.
   */
  setMotor(study: MotorStudy | null): void {
    this.motor = study;
    // The controls follow the state, not the other way round: the guided path
    // starts the motor without anybody pressing a button, and a button that
    // showed the wrong thing afterwards would be worse than no button.
    this.motorState = study?.state ?? 'off';
    if (study) {
      this.motorMethod = study.method.id;
      this.motorSite = study.site.id;
    }
    if (this.scene === 'feeder') this.render();
  }

  /**
   * Put the fault controls where the state actually is — the guided path moves
   * them without anybody pressing a button.
   */
  setFault(busId: string | null, kind: FaultKind): void {
    this.faultBus = busId;
    this.faultKind = kind;
    if (this.scene === 'feeder' || this.scene === 'substation') this.render();
  }

  /** How many circuits the reader has taken out, for the region panel. */
  setTripped(n: number): void {
    if (n === this.tripped) return;
    this.tripped = n;
    if (this.scene === null) this.render();
  }

  /** The planning factors for the day, computed by the state. */
  setFactors(f: FactorSet): void {
    const changed = this.factors === null ||
      Math.abs(f.loadFactor - this.factors.loadFactor) > 1e-9;
    this.factors = f;
    if (changed && this.scene === null) this.render();
  }

  /**
   * The four ratios a system is planned with.
   *
   * They live at the system level because that is where the shape of the day
   * is on screen — the scrubber below is the load factor, drawn.
   */
  /**
   * A paragraph the reader can ask for.
   *
   * INFORMATION IS NOT FREE BECAUSE IT IS TRUE. Every level opened with
   * everything it had to say, so arriving anywhere meant reading three
   * paragraphs before looking at the drawing — and the drawing is the thing
   * that was supposed to be doing the explaining. The first line stays; the
   * rest is one click away, phrased as the question it answers so the click is
   * worth making.
   */
  private more(summary: string, body: string): string {
    // OPEN STAYS OPEN. This panel re-renders whenever the solution changes —
    // every hour of the scrubber, every switching operation — and a disclosure
    // the reader has opened snapping shut underneath them because the clock
    // moved is the kind of thing that makes an interface feel hostile.
    const open = this.opened.has(summary) ? ' open' : '';
    return (
      `<details class="more" data-more="${escapeAttr(summary)}"${open}>` +
      `<summary>${summary}</summary>` +
      `<div class="more__body">${body}</div></details>`
    );
  }

  private factorsSection(): string {
    const f = this.factors;
    if (!f) return '';
    const cell = (label: string, value: string, note: string) =>
      `<div class="level__factor"><span class="level__factor-label">${label}</span>` +
      `<span class="level__factor-value num">${value}</span>` +
      `<span class="level__factor-note">${note}</span></div>`;
    return this.more(
      'The four ratios a system is planned with',
      `<div class="level__factors">` +
      `<div class="level__factor-grid">` +
      // Both numbers of each ratio, in one line rather than two: the division
      // has to stay visible — it is the whole point of showing a ratio — but
      // the words around it were costing four lines of a panel that shares its
      // column with the legend.
      cell(term('load-factor', 'Load factor'), f.loadFactor.toFixed(3),
        `${f.averageDemandGW.toFixed(1)} of ${f.peakDemandGW.toFixed(1)} GW peak`) +
      cell(term('capacity-factor', 'Capacity factor'), f.fleetCapacityFactor.toFixed(3),
        'the fleet, over this day') +
      cell(term('demand-factor', 'Demand factor'), f.demandFactor.toFixed(3),
        `${(f.feederPeakKW / 1000).toFixed(1)} of ` +
        `${(f.connectedKW / 1000).toFixed(1)} MW connected`) +
      cell(term('coincidence-factor', 'Coincidence'), f.coincidenceFactor.toFixed(3),
        `${f.customers.toLocaleString()} customers, D = ` +
        `${f.diversityFactor.toFixed(2)}`) +
      `</div>` +
      `<p class="note">All four say how far apart the worst moment and the ` +
      `ordinary hour are.</p>` +
      `<div class="inspect__actions">` +
      `<button class="btn btn--quiet" data-role="factors-working">Show the working</button>` +
      `</div></div>`
    );
  }

  /** Keep the storage control in step with the state that owns the truth. */
  setStorage(inService: boolean): void {
    this.storage = inService;
    if (this.scene === null) this.render();
  }

  /**
   * Where to put a fault, and what kind.
   *
   * Four places along one feeder, chosen because they are the four that teach
   * different things: a fault on a lateral should take out one street, a fault
   * on the main should take out the feeder, and a fault on the busbar should be
   * caught by something far faster than the overcurrent chain.
   */
  private faultControls(): string {
    const places: [string, string][] = [
      [feederBusId('L3B'), 'On a lateral'],
      [feederBusId('F06'), 'On the main'],
      [feederBusId('F01'), 'Close to the substation'],
      ['EDENVALE_12', 'On the 12.47 kV busbar'],
    ];
    const kinds: [FaultKind, string][] = [
      ['single-line-to-ground', 'One phase to earth'],
      ['line-to-line', 'Phase to phase'],
      ['three-phase', 'All three'],
      ['double-line-to-ground', 'Two phases to earth'],
    ];
    return (
      `<div class="level__fault">` +
      `<h4 class="inspect__heading">Put a ${term('fault', 'fault')} somewhere</h4>` +
      `<div class="level__appliances">` +
      places.map(([id, label]) =>
        `<button class="btn btn--quiet" data-fault-at="${id}" ` +
        `aria-pressed="${this.faultBus === id}">${label}</button>`).join('') +
      `</div>` +
      `<div class="level__appliances">` +
      kinds.map(([k, label]) =>
        `<button class="btn btn--quiet" data-fault-kind="${k}" ` +
        `aria-pressed="${this.faultKind === k}">${label}</button>`).join('') +
      `</div>` +
      (this.faultBus
        ? `<div class="inspect__actions">` +
          `<button class="btn btn--quiet" data-fault-at="">Clear the fault</button></div>`
        : '') +
      `</div>`
    );
  }

  /**
   * The largest ordinary disturbance on a distribution feeder.
   *
   * Three controls, because there are three separate ideas and mixing them
   * would teach none of them: WHETHER the motor is starting or running, HOW it
   * is started, and WHERE it is. The third is the one that carries the lesson,
   * because the same nameplate produces two different answers depending only on
   * how strong the bus is.
   */
  private motorControls(): string {
    const m = CHERRY_LANE_MOTOR;
    const states: [MotorState, string][] = [
      ['starting', 'Starting — the first half-second'],
      ['running', 'Running, up to speed'],
    ];
    return (
      `<div class="level__motor">` +
      `<h4 class="inspect__heading">Start the ` +
      `${term('induction-motor', '200 hp motor')}</h4>` +
      `<p class="note"><span class="num">${fullLoadAmps(m).toFixed(0)} A</span> running, ` +
      `<span class="num">${lockedRotorAmps(m).toFixed(0)} A</span> at the instant ` +
      `it starts, at power factor <span class="num">${m.startingPF.toFixed(2)}</span>.</p>` +
      `<div class="level__appliances">` +
      states.map(([id, label]) =>
        `<button class="btn btn--quiet" data-motor-state="${id}" ` +
        `aria-pressed="${this.motorState === id}">${label}</button>`).join('') +
      `</div>` +
      `<div class="level__appliances">` +
      MOTOR_SITES.map((site) =>
        `<button class="btn btn--quiet" data-motor-site="${site.id}" ` +
        `aria-pressed="${this.motorSite === site.id}" ` +
        `title="${escapeAttr(site.note)}">${site.name}</button>`).join('') +
      `</div>` +
      (this.motorState === 'starting'
        ? `<div class="level__appliances">` +
          START_METHODS.map((sm) =>
            `<button class="btn btn--quiet" data-motor-method="${sm.id}" ` +
            `aria-pressed="${this.motorMethod === sm.id}" ` +
            `title="${escapeAttr(sm.note)}">${sm.name}</button>`).join('') +
          `</div>`
        : '') +
      this.motorReadout() +
      `</div>`
    );
  }

  private motorReadout(): string {
    const s = this.motor;
    if (!s) {
      return `<p class="note">Pick a state above.</p>`;
    }
    if (s.state === 'running') {
      return (
        `<div class="level__readout">` +
        `<span class="num">${s.demand.pKW.toFixed(0)} kW</span> and ` +
        `<span class="num">${s.demand.qKVAr.toFixed(0)} kVAr</span> at ` +
        `power factor <span class="num">${s.demand.powerFactor.toFixed(2)}</span>, ` +
        `drawing <span class="num">${s.demand.amps.toFixed(0)} A</span>.` +
        `</div>` +
        `<p class="note">Voltage at its bus ` +
        `<span class="num">${s.beforePU.toFixed(4)}</span> → ` +
        `<span class="num">${s.duringPU.toFixed(4)} pu</span>. It may have risen: ` +
        `over a minute the regulator has time to respond. During the start it does not.</p>` +
        this.workingButton()
      );
    }
    const short = s.dipPercent < 1;
    return (
      `<div class="level__readout">` +
      `<span class="num">${s.demand.sKVA.toFixed(0)} kVA</span> drawn · voltage ` +
      `<span class="num">${s.beforePU.toFixed(4)}</span> → ` +
      `<span class="num">${s.duringPU.toFixed(4)} pu</span> · dip ` +
      `<span class="num">${s.dipPercent.toFixed(2)} %</span>` +
      `</div>` +
      `<p class="note">Bus stiffness ` +
      `<span class="num">${s.shortCircuitMVA.toFixed(0)} MVA</span>. The ` +
      `${term('short-circuit-capacity', 'rule of thumb')} predicts ` +
      `<span class="num">${s.estimatedDipPercent.toFixed(2)} %</span>; the solve says ` +
      `<span class="num">${s.dipPercent.toFixed(2)} %</span>. ${short
        ? 'Barely visible in a filament lamp.'
        : 'Visible in a filament lamp.'}</p>` +
      `<p class="note">Torque <span class="num">${s.torquePU.toFixed(2)} pu</span> ` +
      `against <span class="num">${LOAD_BREAKAWAY_TORQUE_PU.toFixed(2)} pu</span> needed. ` +
      `${s.torqueAdequate ? 'It accelerates.' : 'It stalls.'}</p>` +
      this.workingButton()
    );
  }

  private workingButton(): string {
    return `<div class="inspect__actions">` +
      `<button class="btn btn--quiet" data-role="motor-working">Show the working</button>` +
      `<button class="btn btn--quiet" data-motor-state="${this.motorState}">Stop it</button>` +
      `</div>`;
  }

  private updateMorphReadout(): void {
    const el = this.element.querySelector('[data-role="morph-readout"]');
    if (!el) return;
    const pct = Math.round(this.morph * 100);
    el.textContent = pct === 0 ? 'single-line diagram'
      : pct === 100 ? 'the yard, at true heights'
      : `${pct}% of the way up`;
  }

  private render(): void {
    const body = this.element.querySelector('.panel__body') as HTMLElement;
    const title = this.element.querySelector('[data-role="title"]') as HTMLElement;
    const sub = this.element.querySelector('[data-role="sub"]') as HTMLElement;

    if (this.scene === 'service') {
      this.element.style.display = '';
      title.textContent = '14 Cherry Lane';
      sub.textContent = 'switch something on';
      body.innerHTML =
        `<p class="note">Switch one on. The whole state re-solves.</p>` +
        `<div class="level__appliances">` +
        APPLIANCES.map((a) =>
          `<button class="btn btn--quiet" data-appliance="${a.id}" ` +
          `aria-pressed="${this.appliance === a.id}" title="${escapeAttr(a.note)}">` +
          `${a.name} <span class="num">${a.watts >= 1000 ? `${(a.watts / 1000).toFixed(1)} kW` : `${a.watts} W`}</span>` +
          `</button>`).join('') +
        `</div>` +
        `<div class="inspect__actions">` +
        `<button class="btn btn--quiet" data-appliance="" aria-pressed="${this.appliance === null}">Everything off</button>` +
        `</div>`;
      return;
    }

    if (this.scene === 'feeder' || this.scene === 'substation') {
      this.element.style.display = '';
      title.textContent = 'Cherry Lane 1201';
      sub.textContent = 'one distribution feeder, pole by pole';
      const isFeeder = this.scene === 'feeder';
      title.textContent = isFeeder ? 'Cherry Lane 1201' : 'Eden Vale';
      sub.textContent = isFeeder ? 'one distribution feeder' : 'inside the fence';
      body.innerHTML =
        (isFeeder
          ? `<p class="note">Three kilometres of street. The plot below is ` +
            `voltage against distance along it.</p>` +
            this.motorControls()
          : `<p class="note">The same station, drawn two ways. Slide between them.</p>` +
            `<div class="level__slider">` +
            `<button class="btn btn--quiet" data-role="morph-end" data-value="0">Diagram</button>` +
            `<input type="range" min="0" max="100" step="1" value="${Math.round(this.morph * 100)}" ` +
            `data-role="morph" aria-label="Diagram to yard">` +
            `<button class="btn btn--quiet" data-role="morph-end" data-value="1">Yard</button>` +
            `</div>` +
            `<div class="level__readout num" data-role="morph-readout"></div>` +
            `<div class="inspect__actions">` +
            `<button class="btn btn--quiet" data-role="protection" ` +
            `aria-pressed="${this.protection}">Show ` +
            `${term('device-number', 'device numbers')}</button></div>`) +
        this.faultControls();
      if (!isFeeder) this.updateMorphReadout();
      return;
    }

    if (this.scene === 'plant') {
      this.element.style.display = '';
      title.textContent = 'Metcalf Energy Center';
      sub.textContent = 'a combined-cycle power station';
      body.innerHTML =
        `<p class="note">Gas burns in a turbine. Its exhaust is still hot ` +
        `enough to boil water, so a second turbine runs on the steam. Together ` +
        `they get about half the energy in the fuel out as electricity.</p>` +
        this.more('How to read the streams',
          `<p class="note">Stream widths are the energy in them. The widest ` +
          `is the fuel going in. Follow it: most comes back out as the two ` +
          `exhaust streams, and what the steam turbine cannot use leaves ` +
          `through the condenser. That last one is the half no engine can ` +
          `keep — and half is as good as burning anything gets.</p>` +
          `<p class="note">Point at any piece of it for what it is doing; ` +
          `select it for the working.</p>`);
      return;
    }

    if (this.scene === 'machine') {
      this.element.style.display = '';
      title.textContent = 'One generator';
      sub.textContent = 'in cross-section';
      body.innerHTML =
        `<p class="note">Three windings 120° apart in the stator, and a rotor ` +
        `turning inside them at 3,600 rev/min — two poles at 60 Hz, so the ` +
        `rotor IS the frequency.</p>` +
        this.more('Why the rotor is drawn on a slant',
          `<p class="note">It is at the ` +
          `${term('load-angle', 'load angle')} it is actually running at: how ` +
          `far the torque on its shaft has dragged it ahead of the voltage at ` +
          `its terminals. Open the fuel valve and that angle grows.</p>`);
      return;
    }

    if (this.scene === null && this.level === 'region') {
      this.element.style.display = '';
      title.textContent = 'The Bay Area';
      sub.textContent = 'one corner of the network';
      body.innerHTML =
        `<p class="note">Closer in, the network stops being a shape and becomes ` +
        `circuits between places. Each line here is a real circuit.</p>` +
        this.more('What you can do to it',
          `<p class="note">Parallel circuits are drawn side by side because ` +
          `that is how they are built and how they share the load. Click any ` +
          `one to see what it is carrying, and to take it out of service: the ` +
          `flows redistribute through what is left, by an actual re-solve.</p>`) +
        (this.tripped > 0
          ? `<div class="inspect__actions">` +
            `<button class="btn" data-role="restore">Put ` +
            `${this.tripped === 1 ? 'it' : 'them'} back</button></div>`
          : '');
      return;
    }

    if (this.scene === null) {
      // The system level. Its perturbation is the one that explains the last
      // decade of grid investment.
      this.element.style.display = '';
      title.textContent = 'The whole system';
      sub.textContent = 'what absorbs the midday surplus';
      body.innerHTML =
        `<p class="note">On a spring afternoon the sun makes more than the ` +
        `state uses. The surplus goes into batteries. Take them out and watch ` +
        `the ${term('duck-curve', 'price')} for the day change shape.</p>` +
        // The one instruction a reader arriving cold needs, and the level that
        // was not giving it: everything on the drawing answers when asked.
        `<p class="note">Click any circuit or any site to see what it is ` +
        `doing, and the working behind it.</p>` +
        `<div class="inspect__actions">` +
        `<button class="btn" data-role="storage" aria-pressed="${!this.storage}">` +
        `${this.storage ? 'Take the batteries out of service' : 'Put the batteries back'}` +
        `</button></div>` +
        this.factorsSection();
      return;
    }

    this.element.style.display = 'none';
  }
}

const escapeAttr = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

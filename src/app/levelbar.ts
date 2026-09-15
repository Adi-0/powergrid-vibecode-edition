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
  onExplain?: (title: string, text: string, el: HTMLElement) => void;
  onDismiss?: () => void;
}

export class LevelBar {
  readonly element: HTMLElement;
  private readonly host: LevelBarHost;
  private scene: SceneId | null = null;
  private morph = 0;
  private protection = false;
  private appliance: string | null = null;
  private storage = true;
  private faultBus: string | null = null;
  private faultKind: FaultKind = 'single-line-to-ground';
  private motorState: MotorState = 'off';
  private motorMethod: StartMethod = 'across-the-line';
  private motorSite = MOTOR_SITES[0].id;
  private motor: MotorStudy | null = null;
  private factors: FactorSet | null = null;

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

  /** Show the controls for whichever scene is dominant, or nothing. */
  setScene(scene: SceneId | null): void {
    if (scene === this.scene) return;
    this.scene = scene;
    this.render();
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
  private factorsSection(): string {
    const f = this.factors;
    if (!f) return '';
    const cell = (label: string, value: string, note: string) =>
      `<div class="level__factor"><span class="level__factor-label">${label}</span>` +
      `<span class="level__factor-value num">${value}</span>` +
      `<span class="level__factor-note">${note}</span></div>`;
    return (
      `<div class="level__factors">` +
      `<h4 class="inspect__heading">The four ratios it is planned with</h4>` +
      `<div class="level__factor-grid">` +
      cell(term('load-factor', 'Load factor'), f.loadFactor.toFixed(3),
        `${f.averageDemandGW.toFixed(1)} GW average against ` +
        `${f.peakDemandGW.toFixed(1)} GW peak`) +
      cell(term('capacity-factor', 'Capacity factor'), f.fleetCapacityFactor.toFixed(3),
        'the whole fleet, over this day') +
      cell(term('demand-factor', 'Demand factor'), f.demandFactor.toFixed(3),
        `${(f.feederPeakKW / 1000).toFixed(1)} MW peak against ` +
        `${(f.connectedKW / 1000).toFixed(1)} MW connected, on the feeder`) +
      cell(term('coincidence-factor', 'Coincidence'), f.coincidenceFactor.toFixed(3),
        `${f.customers.toLocaleString()} customers; diversity factor ` +
        `${f.diversityFactor.toFixed(2)}`) +
      `</div>` +
      `<p class="note">Every one of them is a way of saying how far apart a ` +
      `system’s worst moment and its ordinary hour are. The coincidence ` +
      `factor is the one that pays for everything: it is why a 50 kVA ` +
      `transformer serves twelve houses whose services could each pass 24 kW.</p>` +
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
      `<p class="note">At standstill an induction motor is a short-circuited ` +
      `transformer: no rotation means no back-emf, and only the leakage ` +
      `reactance limits the current. This one draws ` +
      `<span class="num">${fullLoadAmps(m).toFixed(0)} A</span> running and ` +
      `<span class="num">${lockedRotorAmps(m).toFixed(0)} A</span> at the ` +
      `instant the contactor closes — at a power factor of ` +
      `<span class="num">${m.startingPF.toFixed(2)}</span>, which is what ` +
      `actually moves the voltage.</p>` +
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
      return `<p class="note">Nothing is running. Pick a state above and the ` +
        `whole feeder is solved again with the motor in it.</p>`;
    }
    if (s.state === 'running') {
      return (
        `<div class="level__readout">` +
        `<span class="num">${s.demand.pKW.toFixed(0)} kW</span> and ` +
        `<span class="num">${s.demand.qKVAr.toFixed(0)} kVAr</span> at ` +
        `power factor <span class="num">${s.demand.powerFactor.toFixed(2)}</span>, ` +
        `drawing <span class="num">${s.demand.amps.toFixed(0)} A</span>.` +
        `</div>` +
        `<p class="note">Up to speed it is an ordinary load, and a modest one. ` +
        `The voltage at its bus is <span class="num">${s.duringPU.toFixed(4)} pu</span> ` +
        `against <span class="num">${s.beforePU.toFixed(4)} pu</span> before it ` +
        `was switched on — and it may have gone UP, because over a minute the ` +
        `regulator and the capacitor bank have had time to respond, which ` +
        `during the start they had not.</p>` +
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
      `<p class="note">The bus is ` +
      `<span class="num">${s.shortCircuitMVA.toFixed(0)} MVA</span> stiff, so the ` +
      `rule of thumb — starting kVA over ` +
      `${term('short-circuit-capacity', 'short-circuit capacity')} — predicts ` +
      `<span class="num">${s.estimatedDipPercent.toFixed(2)} %</span> against the ` +
      `<span class="num">${s.dipPercent.toFixed(2)} %</span> the power flow ` +
      `actually produced. ${short
        ? 'A dip this small is at the edge of what an eye can see in a filament lamp.'
        : 'A dip of this size is visible in a filament lamp and audible in another motor.'}</p>` +
      `<p class="note">Torque goes as the square of the voltage the motor gets, ` +
      `so it develops <span class="num">${s.torquePU.toFixed(2)} pu</span> against ` +
      `the <span class="num">${LOAD_BREAKAWAY_TORQUE_PU.toFixed(2)} pu</span> the ` +
      `compressor needs to break away. ${s.torqueAdequate
        ? 'It accelerates.'
        : 'It does not accelerate: it sits at zero speed drawing locked-rotor ' +
          'current until something opens.'}</p>` +
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
        `<p class="note">These are real loads in the real case. Switching one on ` +
        `re-dispatches the whole state and re-solves the ${term('power-flow', 'power flow')} — ` +
        `the voltage at this socket, at the substation and at the generator that ` +
        `ends up covering it all move, by the amount the physics says and not more.</p>` +
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
          ? `<p class="note">Three kilometres of street at the height the wires ` +
            `actually hang. The three-phase main runs the length of it; the ` +
            `single-phase laterals branch into the side streets, each behind its ` +
            `own fuse. The plot below is voltage against distance, which is the ` +
            `shape everything on this feeder exists to manage.</p>` +
            this.motorControls()
          : `<p class="note">A substation is drawn two ways, and the relationship ` +
            `between them is the thing that is hard to learn. Slide between them ` +
            `below, or put a fault somewhere and watch which device clears it.</p>` +
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

    if (this.scene === null) {
      // The system level. Its perturbation is the one that explains the last
      // decade of grid investment.
      this.element.style.display = '';
      title.textContent = 'The whole system';
      sub.textContent = 'what absorbs the midday surplus';
      body.innerHTML =
        `<p class="note">On a mild spring afternoon the sun produces more than ` +
        `the state consumes. Every fuel-burning unit backs down to its minimum, ` +
        `the export ties fill up, and what is left has to go somewhere — into ` +
        `several gigawatts of batteries, charging. Take them out and the price ` +
        `stops being flat: it collapses towards nothing at midday and spikes in ` +
        `the evening, because the energy that covered the evening peak was ` +
        `stored at noon and is no longer there. That gap is what a battery ` +
        `fleet is paid for, and what it does to ${term('curtailment', 'curtailment')} ` +
        `and to the ${term('duck-curve', 'duck curve')} follows from it.</p>` +
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

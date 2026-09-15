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
import { term } from './tooltip.js';

export interface LevelBarHost {
  onMorph: (t: number) => void;
  onProtection: (on: boolean) => void;
  onAppliance: (id: string | null) => void;
  onStorage: (inService: boolean) => void;
  onFault: (busId: string | null, kind: FaultKind) => void;
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
            `shape everything on this feeder exists to manage.</p>`
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
        `</button></div>`;
      return;
    }

    this.element.style.display = 'none';
  }
}

const escapeAttr = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

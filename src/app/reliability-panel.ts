/**
 * How often the lights go out — with the levers that decide it.
 *
 * SAIFI, SAIDI and CAIDI are quoted everywhere and explained almost nowhere,
 * and the reason they are worth putting in front of somebody is that they are
 * not weather. They are the arithmetic consequence of three decisions, and this
 * panel puts all three in the reader's hands:
 *
 *   - a RECLOSER part-way down the feeder, so that a fault at the far end does
 *     not take out the near end;
 *   - FUSE SAVING, which trades everybody's blink against one street's outage;
 *   - a TIE to the next feeder, so the far end can be back-fed while the
 *     damage is repaired.
 *
 * Each switch re-runs the whole calculation, and the panel says what it did to
 * every index — including the ones that got worse, because every one of these
 * choices makes something worse. That is the lesson: reliability engineering is
 * not a search for the option with no downside, it is a decision about which
 * customers wait and for how long.
 */

import {
  reliability, ReliabilityOptions, ReliabilityResult, DEFAULT_RELIABILITY_OPTIONS,
  RELIABILITY_DATA,
} from '../sim/reliability.js';
import { deriveReliability } from '../math/derive.js';
import { derivationHTML } from './mathpanel.js';
import { term, escapeHtml } from './tooltip.js';

export interface ReliabilityPanelHost {
  onClose: () => void;
}

export class ReliabilityPanel {
  readonly element: HTMLElement;
  private readonly body: HTMLElement;
  private readonly sub: HTMLElement;
  private readonly host: ReliabilityPanelHost;
  private options: ReliabilityOptions = { ...DEFAULT_RELIABILITY_OPTIONS };
  private showWorking = false;

  constructor(host: ReliabilityPanelHost) {
    this.host = host;
    this.element = document.createElement('aside');
    this.element.className = 'panel panel--reliability';
    this.element.style.display = 'none';
    this.element.innerHTML =
      `<div class="panel__head">` +
      `<span class="panel__title">How often the lights go out</span>` +
      `<span class="panel__sub"></span>` +
      `<button class="panel__close" title="Close">×</button>` +
      `</div><div class="panel__body"></div>`;
    this.sub = this.element.querySelector('.panel__sub') as HTMLElement;
    this.body = this.element.querySelector('.panel__body') as HTMLElement;
    (this.element.querySelector('.panel__close') as HTMLElement)
      .addEventListener('click', () => { this.setVisible(false); this.host.onClose(); });

    this.body.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button') as HTMLElement | null;
      if (!b) return;
      const role = b.dataset.role;
      if (role === 'recloser') {
        this.options = { ...this.options, recloserInService: !this.options.recloserInService };
      } else if (role === 'fuse-saving') {
        this.options = { ...this.options, fuseSaving: !this.options.fuseSaving };
      } else if (role === 'tie') {
        this.options = { ...this.options, tieAvailable: !this.options.tieAvailable };
      } else if (role === 'working') {
        this.showWorking = !this.showWorking;
      } else return;
      this.render();
    });
  }

  setVisible(on: boolean): void { this.element.style.display = on ? '' : 'none'; }
  get isOpen(): boolean { return this.element.style.display !== 'none'; }
  toggle(): void {
    this.setVisible(!this.isOpen);
    if (this.isOpen) this.render(); else this.host.onClose();
  }

  render(): void {
    if (!this.isOpen) return;
    const r = reliability(this.options);
    this.sub.textContent =
      `Cherry Lane 1201 · ${r.totalCustomers.toLocaleString()} customers`;
    this.body.innerHTML =
      indices(r) +
      switches(this.options, r) +
      contributions(r) +
      working(r, this.showWorking) +
      caveat();
  }
}

// ---------------------------------------------------------------------------
// The indices
// ---------------------------------------------------------------------------

function indices(r: ReliabilityResult): string {
  return (
    `<section class="rel__section">` +
    `<p class="note">These four numbers are how a distribution utility is ` +
    `judged, and none of them is measured here: each one is computed from how ` +
    `much wire is in the air, where the devices that can isolate a piece of it ` +
    `are, and how long a crew takes to get there.</p>` +
    `<div class="rel__grid">` +
    cell(term('saifi', 'SAIFI'), r.saifi.toFixed(2), 'interruptions',
      'per customer per year') +
    cell(term('saidi', 'SAIDI'), r.saidiMinutes.toFixed(0), 'minutes',
      'without supply, per customer per year') +
    cell(term('caidi', 'CAIDI'), r.caidiMinutes.toFixed(0), 'minutes',
      'the average length of one interruption') +
    cell(term('maifi', 'MAIFI'), r.maifi.toFixed(2), 'blinks',
      'under five minutes — not counted in SAIFI') +
    `</div>` +
    `<p class="note">Availability, ${term('asai', 'ASAI')}: ` +
    `<span class="num">${(r.asai * 100).toFixed(4)} %</span> of the year — which ` +
    `sounds like nothing is ever wrong, and is exactly why the minutes above are ` +
    `the number people actually argue about.</p>` +
    `</section>`
  );
}

const cell = (label: string, value: string, unit: string, note: string): string =>
  `<div class="rel__cell"><span class="rel__label">${label}</span>` +
  `<span class="rel__value num">${value}<span class="rel__unit">${unit}</span></span>` +
  `<span class="rel__note">${note}</span></div>`;

// ---------------------------------------------------------------------------
// The three decisions
// ---------------------------------------------------------------------------

/** What every index would become with one option flipped. */
function delta(now: ReliabilityResult, changed: Partial<ReliabilityOptions>): string {
  const then = reliability({ ...now.options, ...changed });
  const line = (
    name: string, a: number, b: number, d: number, better: 'up' | 'down'
  ): string => {
    if (Math.abs(a - b) < 0.5 * Math.pow(10, -d)) return '';
    const worse = better === 'down' ? b > a : b < a;
    return `<span class="rel__delta">${name} ` +
      `<span class="num">${a.toFixed(d)}</span> → ` +
      `<span class="num${worse ? ' rel__worse' : ''}">${b.toFixed(d)}</span></span>`;
  };
  return (
    line('SAIFI', now.saifi, then.saifi, 2, 'down') +
    line('SAIDI', now.saidiMinutes, then.saidiMinutes, 0, 'down') +
    line('MAIFI', now.maifi, then.maifi, 2, 'down')
  );
}

function switches(o: ReliabilityOptions, r: ReliabilityResult): string {
  const sw = (
    role: string, on: boolean, label: string, explain: string,
    changed: Partial<ReliabilityOptions>
  ): string =>
    `<div class="rel__switch">` +
    `<button class="btn" data-role="${role}" aria-pressed="${on}">${label}</button>` +
    `<p class="note">${explain}</p>` +
    `<div class="rel__deltas">${delta(r, changed)}</div>` +
    `</div>`;

  return (
    `<section class="rel__section">` +
    `<h4 class="inspect__heading">The three decisions behind them</h4>` +
    sw('recloser', o.recloserInService,
      o.recloserInService ? 'Recloser R1 in service' : 'Recloser R1 out of service',
      `A ${term('recloser', 'recloser')} half-way down the feeder means a fault ` +
      `beyond it is cleared by it rather than by the breaker at the substation, ` +
      `so the near half of the feeder never notices. Take it out and every ` +
      `fault becomes the breaker's.`,
      { recloserInService: !o.recloserInService }) +
    sw('fuse-saving', o.fuseSaving,
      o.fuseSaving ? 'Fuse saving on' : 'Fuse saving off (fuse blowing)',
      `A ${term('fuse', 'fuse')} cannot tell a branch touching the wire from a ` +
      `pole that has been hit by a car. With fuse saving the recloser trips on ` +
      `a fast curve first, so a temporary fault on one street becomes a blink ` +
      `for the whole feeder instead of an outage for that street. Turn it off ` +
      `and the trade runs the other way.`,
      { fuseSaving: !o.fuseSaving }) +
    sw('tie', o.tieAvailable,
      o.tieAvailable ? 'Tie to the next feeder available' : 'No tie — radial to the end',
      `The normally-open switch at the far end can be closed to feed the end of ` +
      `this feeder from the next one, so the customers beyond the damage wait ` +
      `about an hour instead of waiting for the repair.`,
      { tieAvailable: !o.tieAvailable }) +
    `<p class="note">Every one of these makes something worse. Fuse saving ` +
    `trades outages for blinks; a recloser adds a device that can itself fail; ` +
    `a tie is a second circuit that has to be built and kept clear. There is no ` +
    `option here without a cost, which is what makes it engineering rather than ` +
    `arithmetic.</p>` +
    `</section>`
  );
}

// ---------------------------------------------------------------------------
// Where it comes from
// ---------------------------------------------------------------------------

function contributions(r: ReliabilityResult): string {
  const rows = r.sections.slice(0, 8).map((s) =>
    `<div class="rel__row">` +
    `<span>${escapeHtml(s.label)}</span>` +
    `<span>${escapeHtml(s.clearedBy)}</span>` +
    `<span class="num">${s.customersInterrupted}</span>` +
    `<span class="num">${s.customerHoursPerYear.toFixed(0)}</span>` +
    `</div>`).join('');
  const total = r.customerHoursPerYear;
  const top = r.sections.slice(0, 8)
    .reduce((a, s) => a + s.customerHoursPerYear, 0);
  return (
    `<section class="rel__section">` +
    `<h4 class="inspect__heading">Where the minutes come from</h4>` +
    `<div class="rel__row rel__row--head"><span>section</span>` +
    `<span>cleared by</span><span>customers</span><span>cust·h/yr</span></div>` +
    rows +
    `<p class="note">The eight worst sections account for ` +
    `<span class="num">${((top / total) * 100).toFixed(0)} %</span> of the ` +
    `customer-hours. The substation's 12.47 kV bus is usually near the top of ` +
    `this list despite almost never failing, because when it does it takes the ` +
    `whole feeder with it for ${RELIABILITY_DATA.busRepairHours.toFixed(0)} hours — ` +
    `which is what a rate times a consequence means, and why counting faults is ` +
    `not the same as counting outages.</p>` +
    `</section>`
  );
}

function working(r: ReliabilityResult, open: boolean): string {
  return (
    `<section class="rel__section">` +
    `<div class="inspect__actions">` +
    `<button class="btn" data-role="working" aria-pressed="${open}">` +
    `${open ? 'Hide the working' : 'Show the working'}</button></div>` +
    (open ? `<div class="rel__working">${derivationHTML(deriveReliability(r))}</div>` : '') +
    `</section>`
  );
}

function caveat(): string {
  return (
    `<p class="note rel__caveat">This feeder is short, dense and urban, and it ` +
    `has both a recloser and a tie, so its indices come out better than a ` +
    `national average — which is dominated by long rural circuits. The failure ` +
    `rates are canonical planning values, not measurements, and major event ` +
    `days are excluded, as they are from most published figures. What this ` +
    `leaves out is in the honesty panel.</p>`
  );
}

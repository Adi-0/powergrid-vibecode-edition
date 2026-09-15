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
    `<p class="note">None of these is measured. Each follows from the length ` +
    `of wire, the placement of the switches, and how fast a crew arrives.</p>` +
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
    `<p class="note">${term('asai', 'ASAI')} ` +
    `<span class="num">${(r.asai * 100).toFixed(4)} %</span> of the year, which ` +
    `is why nobody argues about ASAI.</p>` +
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
      `A ${term('recloser', 'recloser')} half-way down clears faults beyond ` +
      `it, so the near half never notices. Out of service, every fault is the ` +
      `substation breaker's.`,
      { recloserInService: !o.recloserInService }) +
    sw('fuse-saving', o.fuseSaving,
      o.fuseSaving ? 'Fuse saving on' : 'Fuse saving off (fuse blowing)',
      `A ${term('fuse', 'fuse')} cannot tell a branch on the wire from a pole ` +
      `hit by a car. Fuse saving turns one street's outage into everyone's ` +
      `blink. Off, the trade runs the other way.`,
      { fuseSaving: !o.fuseSaving }) +
    sw('tie', o.tieAvailable,
      o.tieAvailable ? 'Tie to the next feeder available' : 'No tie — radial to the end',
      `Close the switch at the far end and the next feeder picks up ` +
      `everything past the damage. An hour, instead of a repair.`,
      { tieAvailable: !o.tieAvailable }) +
    `<p class="note">Every one of them makes something else worse. That is ` +
    `the job.</p>` +
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
    `<p class="note">These eight are ` +
    `<span class="num">${((top / total) * 100).toFixed(0)} %</span> of the ` +
    `customer-hours. The 12.47 kV bus is near the top despite almost never ` +
    `failing: when it does, it takes the whole feeder for ` +
    `${RELIABILITY_DATA.busRepairHours.toFixed(0)} hours.</p>` +
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
    `<p class="note rel__caveat">Short, dense, urban, with a recloser and a ` +
    `tie: better than a national average, which is dominated by long rural ` +
    `circuits. Planning rates, not measurements. Storms excluded.</p>`
  );
}

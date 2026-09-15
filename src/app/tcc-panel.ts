/**
 * The time–current characteristic plot.
 *
 * Every protection engineer's working drawing, and it is a log–log plot for a
 * reason that is worth stating: both axes span four decades. Fault currents run
 * from a few hundred amperes at the end of a feeder to tens of thousands at the
 * substation bus, and operating times from three cycles to tens of seconds.
 * On linear axes the interesting region is a smear in one corner.
 *
 * WHAT TO LOOK FOR. Each curve is one device. Coordination is the statement
 * that at every current, the curve of the device nearer the fault lies BELOW
 * the curve of the one behind it, by at least the coordinating interval. Curves
 * that cross are a protection scheme that will one day take out a substation
 * because a branch fell on one street.
 *
 * The vertical rules are the fault currents the network can actually produce at
 * each point on the feeder, from the same sequence-impedance calculation as
 * everything else. They are what turns the plot from a set of curves into a
 * study: coordination only has to hold over the currents that can actually
 * happen, and those lines are where they are.
 */

import { ProtectiveDevice, operatingTime, CURVE_SHAPES } from '../core/protection.js';
import { FaultStudy } from '../sim/faults.js';
import { term, escapeHtml } from './tooltip.js';

const W = 460;
const H = 330;
const PAD = { left: 46, right: 14, top: 14, bottom: 34 };

/** The decades the plot spans. Fixed, so the shape is comparable across faults. */
const I_MIN = 50;
const I_MAX = 60000;
const T_MIN = 0.01;
const T_MAX = 100;

export interface TccPanelHost {
  onClose: () => void;
}

export class TccPanel {
  readonly element: HTMLElement;
  private readonly body: HTMLElement;
  private readonly sub: HTMLElement;
  private readonly host: TccPanelHost;

  constructor(host: TccPanelHost) {
    this.host = host;
    this.element = document.createElement('aside');
    this.element.className = 'panel panel--tcc';
    this.element.style.display = 'none';
    this.element.innerHTML =
      `<div class="panel__head">` +
      `<span class="panel__title">Coordination</span>` +
      `<span class="panel__sub"></span>` +
      `<button class="panel__close" title="Close">×</button>` +
      `</div><div class="panel__body"></div>`;
    this.sub = this.element.querySelector('.panel__sub') as HTMLElement;
    this.body = this.element.querySelector('.panel__body') as HTMLElement;
    (this.element.querySelector('.panel__close') as HTMLElement)
      .addEventListener('click', () => { this.setVisible(false); this.host.onClose(); });
  }

  setVisible(on: boolean): void {
    this.element.style.display = on ? '' : 'none';
  }

  get isOpen(): boolean {
    return this.element.style.display !== 'none';
  }

  render(study: FaultStudy | null, allDevices: ProtectiveDevice[]): void {
    if (!this.isOpen) return;
    this.sub.textContent = study
      ? `${study.result.maxAmps.toFixed(0)} A at the fault`
      : 'Cherry Lane 1201';
    this.body.innerHTML = plotSVG(allDevices, study) + explain(study, allDevices);
  }
}

// ---------------------------------------------------------------------------
// The plot
// ---------------------------------------------------------------------------

const lx = (a: number): number =>
  PAD.left + (Math.log10(a / I_MIN) / Math.log10(I_MAX / I_MIN)) *
    (W - PAD.left - PAD.right);
const ly = (t: number): number =>
  PAD.top + (Math.log10(T_MAX / t) / Math.log10(T_MAX / T_MIN)) *
    (H - PAD.top - PAD.bottom);

/**
 * Line weight here carries the same thing it carries everywhere else in the
 * app: position in a hierarchy. The device nearest the customer is the
 * lightest; the transformer relay behind everything is the heaviest. It is not
 * voltage class, because every device on this plot is at the same voltage — but
 * it is the same idea, and it lets the chain be read in order without a legend.
 */
const weightFor = (position: number): number => 1.0 + position * 0.45;

function plotSVG(devices: ProtectiveDevice[], study: FaultStudy | null): string {
  const svg: string[] = [];
  svg.push(`<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" ` +
    `aria-label="Time-current coordination">`);

  // --- decade grid ----------------------------------------------------------
  for (let d = 2; d <= 4; d++) {
    for (const m of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      const a = m * Math.pow(10, d);
      if (a < I_MIN || a > I_MAX) continue;
      svg.push(
        `<line x1="${lx(a).toFixed(1)}" y1="${PAD.top}" x2="${lx(a).toFixed(1)}" ` +
        `y2="${H - PAD.bottom}" stroke="${m === 1 ? '#C8C4BA' : '#E5E1D7'}" stroke-width="1"/>`
      );
      if (m === 1) {
        svg.push(
          `<text x="${lx(a).toFixed(1)}" y="${H - PAD.bottom + 12}" text-anchor="middle" ` +
          `font-size="8.5" fill="#5C5953" font-variant-numeric="tabular-nums">` +
          `${a >= 1000 ? `${a / 1000}k` : a}</text>`
        );
      }
    }
  }
  for (let e = -2; e <= 2; e++) {
    for (const m of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      const t = m * Math.pow(10, e);
      if (t < T_MIN || t > T_MAX) continue;
      svg.push(
        `<line x1="${PAD.left}" y1="${ly(t).toFixed(1)}" x2="${W - PAD.right}" ` +
        `y2="${ly(t).toFixed(1)}" stroke="${m === 1 ? '#C8C4BA' : '#E5E1D7'}" stroke-width="1"/>`
      );
      if (m === 1) {
        svg.push(
          `<text x="${PAD.left - 5}" y="${(ly(t) + 3).toFixed(1)}" text-anchor="end" ` +
          `font-size="8.5" fill="#5C5953" font-variant-numeric="tabular-nums">` +
          `${t >= 1 ? t : t.toFixed(2)}</text>`
        );
      }
    }
  }
  svg.push(
    `<rect x="${PAD.left}" y="${PAD.top}" width="${W - PAD.left - PAD.right}" ` +
    `height="${H - PAD.top - PAD.bottom}" fill="none" stroke="#14161A" stroke-width="1"/>`,
    `<text x="${W - PAD.right}" y="${H - 6}" text-anchor="end" font-size="8.5" ` +
    `fill="#5C5953" letter-spacing="0.04em">current, amperes</text>`,
    `<text x="10" y="${H - PAD.bottom + 24}" font-size="8.5" fill="#5C5953" ` +
    `letter-spacing="0.04em">seconds</text>`
  );

  // --- the fault currents the network can actually produce ------------------
  if (study) {
    const marks: [number, string][] = [
      [study.levels.atFarEndA, 'far end'],
      [study.levels.atRecloserA, 'recloser'],
      [study.levels.atBusA, 'bus'],
    ];
    for (const [a, label] of marks) {
      if (a < I_MIN || a > I_MAX) continue;
      svg.push(
        `<line x1="${lx(a).toFixed(1)}" y1="${PAD.top}" x2="${lx(a).toFixed(1)}" ` +
        `y2="${H - PAD.bottom}" stroke="#8E8B84" stroke-width="1" stroke-dasharray="1 3"/>`,
        `<text x="${(lx(a) + 3).toFixed(1)}" y="${PAD.top + 9}" font-size="7.5" ` +
        `fill="#8E8B84">${label}</text>`
      );
    }
  }

  // --- the curves -----------------------------------------------------------
  for (const d of [...devices].sort((a, b) => b.position - a.position)) {
    svg.push(curvePath(d));
  }

  // --- this fault -----------------------------------------------------------
  if (study) {
    const a = study.result.maxAmps;
    if (a >= I_MIN && a <= I_MAX) {
      svg.push(
        `<line x1="${lx(a).toFixed(1)}" y1="${PAD.top}" x2="${lx(a).toFixed(1)}" ` +
        `y2="${H - PAD.bottom}" stroke="#C4341B" stroke-width="1.4"/>`
      );
      for (const r of study.responses) {
        if (r.seconds === null || r.seconds > T_MAX || r.seconds < T_MIN) continue;
        const cleared = study.clearedBy?.device.id === r.device.id;
        svg.push(
          `<circle cx="${lx(a).toFixed(1)}" cy="${ly(r.seconds).toFixed(1)}" ` +
          `r="${cleared ? 4 : 2.4}" fill="${cleared ? '#C4341B' : '#EFECE4'}" ` +
          `stroke="#C4341B" stroke-width="1.3"/>`
        );
      }
    }
  }

  svg.push('</svg>');
  return svg.join('');
}

/** One device's characteristic, sampled across the plot. */
function curvePath(d: ProtectiveDevice): string {
  const pts: string[] = [];
  const steps = 160;
  for (let i = 0; i <= steps; i++) {
    const a = I_MIN * Math.pow(I_MAX / I_MIN, i / steps);
    const t = operatingTime(d, a);
    if (t === null || t > T_MAX) { continue; }
    const y = ly(Math.max(T_MIN, t));
    pts.push(`${pts.length === 0 ? 'M' : 'L'}${lx(a).toFixed(1)},${y.toFixed(1)}`);
  }
  if (pts.length === 0) return '';
  const label = escapeHtml(d.name);
  return (
    `<path d="${pts.join(' ')}" fill="none" stroke="#14161A" ` +
    `stroke-width="${weightFor(d.position).toFixed(2)}"` +
    `${d.kind === 'fuse' ? ' stroke-dasharray="6 3"' : ''}>` +
    `<title>${label}</title></path>`
  );
}

// ---------------------------------------------------------------------------
// What the plot says
// ---------------------------------------------------------------------------

function explain(study: FaultStudy | null, devices: ProtectiveDevice[]): string {
  const rows = devices
    .sort((a, b) => a.position - b.position)
    .map((d) => {
      const r = study?.responses.find((x) => x.device.id === d.id);
      const t = r?.seconds;
      const inChain = study?.chain.some((x) => x.id === d.id) ?? true;
      return (
        `<div class="tcc__row${study?.clearedBy?.device.id === d.id ? ' tcc__row--first' : ''}">` +
        `<span class="tcc__weight" style="border-top-width:${weightFor(d.position).toFixed(2)}px"></span>` +
        `<span class="tcc__name">${escapeHtml(d.name)}` +
        `<span class="tcc__device num">${escapeHtml(d.device)}</span></span>` +
        `<span class="tcc__pickup num">${d.pickupA} A</span>` +
        `<span class="tcc__time num">${
          !inChain ? 'not in series'
            : t === undefined || t === null ? 'does not see it'
              : `${t.toFixed(3)} s`
        }</span></div>`
      );
    })
    .join('');

  const verdict = study
    ? study.clearedBy
      ? `<p class="note"><b>${escapeHtml(study.clearedBy.device.name)}</b> clears it in ` +
        `${study.clearedBy.seconds.toFixed(3)} seconds — ` +
        `${(study.clearedBy.seconds * 60).toFixed(1)} cycles. ` +
        `Everything upstream of it stays closed, so the interruption stops there.</p>`
      : `<p class="note">None of this feeder's protection is in series with that ` +
        `fault, so none of it would operate. The current is still real; it is ` +
        `just somebody else's to clear.</p>`
    : `<p class="note">Place a fault to see which device responds and when.</p>`;

  const primary = study?.primary
    ? `<p class="note"><b>${escapeHtml(study.primary.device)} ` +
      `${escapeHtml(study.primary.name)}</b> would clear it in ` +
      `${study.primary.seconds.toFixed(2)} s, long before the overcurrent relay. ` +
      `${escapeHtml(study.primary.why)}</p>`
    : '';

  const coordination = study
    ? study.miscoordinations.length === 0
      ? `<p class="note tcc__ok">Coordinated at every fault current this feeder ` +
        `can produce: ${study.coordination.length} checks, no crossings.</p>`
      : `<p class="note tcc__bad">${study.miscoordinations.length} of ` +
        `${study.coordination.length} checks fail. Two curves cross, and a fault ` +
        `at that current would take out more than it should.</p>`
    : '';

  return (
    `<div class="tcc__rows">${rows}</div>` +
    verdict + primary + coordination +
    `<p class="note">${term('coordination', 'Coordination')} is the arrangement ` +
    `that at every current, the device nearer the fault is faster than the one ` +
    `behind it by at least a quarter of a second — long enough for it to clear ` +
    `and for the one behind to notice it has. Curves that cross are a scheme ` +
    `that will one day take out a substation because a branch fell on one street.</p>` +
    `<p class="note">${escapeHtml(CURVE_SHAPES.very.use)}</p>`
  );
}

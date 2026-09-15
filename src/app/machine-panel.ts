/**
 * The capability curve and the phasor diagram.
 *
 * Two plots that between them contain most of what there is to know about
 * running a synchronous generator, drawn from the same solved case as
 * everything else.
 *
 * THE CAPABILITY CURVE is the D-shaped figure every control room has pinned to
 * the wall: the region of the P–Q plane a machine may be operated in. Its three
 * boundaries are three different things getting too hot, and the operating
 * point moves around inside it as the dispatch changes.
 *
 * THE PHASOR DIAGRAM is the equation E = V + jX_d·I drawn as a triangle. It is
 * where the load angle physically comes from, and it is the picture that makes
 * "real power follows the angle, reactive power follows the field" stop being
 * two slogans and start being one diagram.
 */

import {
  CapabilityCurve, MachineOperatingPoint, capabilityCurve, operatingPoint,
  fieldLimitQ, armatureLimitQ, swingState, rocof, hasRotor, solvedOutput,
} from '../core/machine.js';
import { SolvedCase } from '../core/results.js';
import { Generator } from '../core/network.js';
import { term, escapeHtml } from './tooltip.js';

const W = 420;
const H = 300;
const PAD = { left: 46, right: 16, top: 16, bottom: 30 };

export interface MachinePanelHost {
  onClose: () => void;
}

export class MachinePanel {
  readonly element: HTMLElement;
  private readonly body: HTMLElement;
  private readonly sub: HTMLElement;
  private readonly host: MachinePanelHost;

  constructor(host: MachinePanelHost) {
    this.host = host;
    this.element = document.createElement('aside');
    this.element.className = 'panel panel--machine';
    this.element.style.display = 'none';
    this.element.innerHTML =
      `<div class="panel__head">` +
      `<span class="panel__title">Capability</span>` +
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

  render(solved: SolvedCase, g: Generator | undefined): void {
    if (!this.isOpen || !g) return;
    const bus = solved.busById.get(g.bus);
    const vPU = bus?.vpu ?? 1;
    const out = solvedOutput(
      g, bus, solved.net.generators.filter((x) => x.bus === g.bus));
    const op = operatingPoint(g, vPU, out.pMW, out.qMVAr);
    const curve = capabilityCurve(g, vPU);
    const swing = swingState(g, out.pMW, out.pMW);
    const loss = rocof(solved.net.generators, g.pMW);

    this.sub.textContent = `${g.name} — ${g.mBaseMVA.toFixed(0)} MVA`;
    this.body.innerHTML =
      capabilitySVG(curve, op) +
      phasorSVG(op, curve) +
      readouts(op, curve, swing, loss, solved);
  }
}

// ---------------------------------------------------------------------------
// The capability curve
// ---------------------------------------------------------------------------

function capabilitySVG(c: CapabilityCurve, op: MachineOperatingPoint): string {
  const qSpan = Math.max(
    c.sRatedMVA * 1.05,
    Math.abs(c.fieldCentreMVAr) * 1.1,
    Math.abs(c.qMinMVAr) * 1.4
  );
  const pSpan = c.sRatedMVA * 1.08;

  const x = (q: number) =>
    PAD.left + ((q + qSpan) / (2 * qSpan)) * (W - PAD.left - PAD.right);
  const y = (p: number) =>
    H - PAD.bottom - (p / pSpan) * (H - PAD.top - PAD.bottom);

  const svg: string[] = [];
  svg.push(
    `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" ` +
    `aria-label="Capability curve">`
  );

  // Axes. Q on the horizontal is the convention on every capability curve
  // printed, because the shape is then the D it is named for.
  svg.push(
    `<line x1="${PAD.left}" y1="${H - PAD.bottom}" x2="${W - PAD.right}" ` +
    `y2="${H - PAD.bottom}" stroke="#14161A" stroke-width="1"/>`,
    `<line x1="${x(0).toFixed(1)}" y1="${PAD.top}" x2="${x(0).toFixed(1)}" ` +
    `y2="${H - PAD.bottom}" stroke="#C8C4BA" stroke-width="1"/>`
  );
  for (let q = -Math.floor(qSpan / 250) * 250; q <= qSpan; q += 250) {
    if (Math.abs(q) > qSpan) continue;
    svg.push(
      `<text x="${x(q).toFixed(1)}" y="${H - PAD.bottom + 12}" text-anchor="middle" ` +
      `font-size="8.5" fill="#5C5953" font-variant-numeric="tabular-nums">${q}</text>`
    );
  }
  for (let p = 0; p <= pSpan; p += 250) {
    svg.push(
      `<text x="${PAD.left - 6}" y="${(y(p) + 3).toFixed(1)}" text-anchor="end" ` +
      `font-size="8.5" fill="#5C5953" font-variant-numeric="tabular-nums">${p}</text>`
    );
  }
  svg.push(
    `<text x="${W - PAD.right}" y="${H - 6}" text-anchor="end" font-size="8.5" ` +
    `fill="#5C5953" letter-spacing="0.04em">Q, MVAr — absorbing ← → producing</text>`,
    `<text x="10" y="${PAD.top + 4}" font-size="8.5" fill="#5C5953" ` +
    `letter-spacing="0.04em">P, MW</text>`
  );

  // The armature circle: a limit on total current, so a circle about the origin.
  svg.push(limitPath(
    (p) => armatureLimitQ(c, p), c, x, y, pSpan,
    '#14161A', '1.4', ''
  ));
  // The field circle: a limit on rotor heating, so a circle about −V²/Xd.
  svg.push(limitPath(
    (p) => fieldLimitQ(c, p), c, x, y, pSpan,
    '#14161A', '1.4', '5 3'
  ));

  // The practical limits actually in force, from the case.
  svg.push(
    `<rect x="${x(c.qMinMVAr).toFixed(1)}" y="${y(c.pMaxMW).toFixed(1)}" ` +
    `width="${(x(c.qMaxMVAr) - x(c.qMinMVAr)).toFixed(1)}" ` +
    `height="${(y(c.pMinMW) - y(c.pMaxMW)).toFixed(1)}" ` +
    `fill="none" stroke="#8E8B84" stroke-width="1" stroke-dasharray="2 2.5"/>`
  );

  // The steady-state stability limit: δ = 90°, the vertical through the centre
  // of the field circle. Past it the machine cannot hold synchronism at all.
  svg.push(
    `<line x1="${x(c.stabilityLimitMVAr).toFixed(1)}" y1="${PAD.top}" ` +
    `x2="${x(c.stabilityLimitMVAr).toFixed(1)}" y2="${H - PAD.bottom}" ` +
    `stroke="#8E8B84" stroke-width="1" stroke-dasharray="1 3"/>`,
    `<text x="${(x(c.stabilityLimitMVAr) + 4).toFixed(1)}" y="${PAD.top + 9}" ` +
    `font-size="8" fill="#5C5953">δ = 90°</text>`
  );

  // The operating point.
  const px = x(op.qMVAr);
  const py = y(op.pMW);
  svg.push(
    `<line x1="${px.toFixed(1)}" y1="${(py - 9).toFixed(1)}" x2="${px.toFixed(1)}" ` +
    `y2="${(py + 9).toFixed(1)}" stroke="#1B4E8C" stroke-width="1.4"/>`,
    `<line x1="${(px - 9).toFixed(1)}" y1="${py.toFixed(1)}" x2="${(px + 9).toFixed(1)}" ` +
    `y2="${py.toFixed(1)}" stroke="#1B4E8C" stroke-width="1.4"/>`,
    `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="3.2" fill="none" ` +
    `stroke="#1B4E8C" stroke-width="1.4"/>`
  );

  // Labels on the two circles, placed where they do not cross anything.
  const armAt = armatureLimitQ(c, c.sRatedMVA * 0.55);
  if (armAt !== null) {
    svg.push(
      `<text x="${(x(armAt) - 4).toFixed(1)}" y="${(y(c.sRatedMVA * 0.55)).toFixed(1)}" ` +
      `text-anchor="end" font-size="8" fill="#14161A">armature heating</text>`
    );
  }
  const fieldAt = fieldLimitQ(c, c.sRatedMVA * 0.25);
  if (fieldAt !== null) {
    svg.push(
      `<text x="${(x(fieldAt) - 4).toFixed(1)}" y="${(y(c.sRatedMVA * 0.25)).toFixed(1)}" ` +
      `text-anchor="end" font-size="8" fill="#14161A">field heating</text>`
    );
  }

  svg.push('</svg>');
  return svg.join('');
}

/** One limit curve, sampled in P and drawn where it exists. */
function limitPath(
  q: (p: number) => number | null,
  c: CapabilityCurve,
  x: (q: number) => number,
  y: (p: number) => number,
  pSpan: number,
  stroke: string,
  width: string,
  dash: string
): string {
  const pts: string[] = [];
  const steps = 90;
  for (let i = 0; i <= steps; i++) {
    const p = (pSpan * i) / steps;
    const v = q(p);
    if (v === null) continue;
    pts.push(`${pts.length === 0 ? 'M' : 'L'}${x(v).toFixed(1)},${y(p).toFixed(1)}`);
  }
  void c;
  if (pts.length === 0) return '';
  return `<path d="${pts.join(' ')}" fill="none" stroke="${stroke}" ` +
    `stroke-width="${width}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
}

// ---------------------------------------------------------------------------
// The phasor diagram
// ---------------------------------------------------------------------------

const PW = 420;
const PH = 210;

/**
 * E = V + jX_d·I, drawn as the triangle it is.
 *
 * V points along the reference. jX_d·I is at right angles to the current, which
 * is what the j means. E closes the triangle, and the angle it makes with V is
 * δ. Change the load and the triangle changes shape in front of the reader,
 * which is the only way this equation ever becomes obvious.
 */
function phasorSVG(op: MachineOperatingPoint, c: CapabilityCurve): string {
  // Everything in per-unit on the machine base, then scaled to the box.
  const vRe = op.vPU, vIm = 0;
  const iRe = op.vPU > 0 ? op.pPU / op.vPU : 0;
  const iIm = op.vPU > 0 ? -op.qPU / op.vPU : 0;
  const jxiRe = -c.xd * iIm;
  const jxiIm = c.xd * iRe;
  const eRe = vRe + jxiRe;
  const eIm = vIm + jxiIm;

  const extent = Math.max(1.2, Math.abs(eRe), Math.abs(eIm), op.ePU) * 1.15;
  const ox = 70;
  const oy = PH - 34;
  const scale = Math.min((PW - ox - 90) / extent, (oy - 18) / extent);
  const X = (re: number) => ox + re * scale;
  const Y = (im: number) => oy - im * scale;

  const arrow = (
    x1: number, y1: number, x2: number, y2: number, stroke: string, width: number,
    dash?: string
  ): string => {
    const a = Math.atan2(y2 - y1, x2 - x1);
    const h = 6;
    return (
      `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" ` +
      `y2="${y2.toFixed(1)}" stroke="${stroke}" stroke-width="${width}"` +
      `${dash ? ` stroke-dasharray="${dash}"` : ''}/>` +
      `<path d="M${x2.toFixed(1)},${y2.toFixed(1)} ` +
      `L${(x2 - h * Math.cos(a - 0.4)).toFixed(1)},${(y2 - h * Math.sin(a - 0.4)).toFixed(1)} ` +
      `L${(x2 - h * Math.cos(a + 0.4)).toFixed(1)},${(y2 - h * Math.sin(a + 0.4)).toFixed(1)} Z" ` +
      `fill="${stroke}"/>`
    );
  };

  const svg: string[] = [];
  svg.push(`<svg viewBox="0 0 ${PW} ${PH}" width="100%" role="img" ` +
    `aria-label="Phasor diagram">`);
  // Reference axes, faint.
  svg.push(
    `<line x1="${ox}" y1="${oy}" x2="${PW - 14}" y2="${oy}" stroke="#C8C4BA" stroke-width="1"/>`,
    `<line x1="${ox}" y1="18" x2="${ox}" y2="${oy}" stroke="#C8C4BA" stroke-width="1"/>`
  );

  svg.push(arrow(X(0), Y(0), X(vRe), Y(vIm), '#14161A', 1.6));
  svg.push(arrow(X(vRe), Y(vIm), X(eRe), Y(eIm), '#8E8B84', 1.4, '4 2.5'));
  svg.push(arrow(X(0), Y(0), X(eRe), Y(eIm), '#1B4E8C', 1.8));

  svg.push(
    `<text x="${(X(vRe / 2)).toFixed(1)}" y="${(Y(0) + 13).toFixed(1)}" ` +
    `text-anchor="middle" font-size="9" fill="#14161A">V = ${op.vPU.toFixed(3)} pu</text>`,
    `<text x="${(X((vRe + eRe) / 2) + 8).toFixed(1)}" y="${(Y((vIm + eIm) / 2)).toFixed(1)}" ` +
    `font-size="9" fill="#5C5953">jX_d · I</text>`,
    `<text x="${(X(eRe) + 6).toFixed(1)}" y="${(Y(eIm) - 4).toFixed(1)}" ` +
    `font-size="9" fill="#1B4E8C">E = ${op.ePU.toFixed(3)} pu</text>`
  );

  // The angle between V and E, with its arc.
  if (Math.abs(op.deltaDeg) > 0.5) {
    const r = 34;
    const a1 = (op.deltaDeg * Math.PI) / 180;
    svg.push(
      `<path d="M${X(0) + r},${Y(0)} A${r},${r} 0 0 ${op.deltaDeg > 0 ? 0 : 1} ` +
      `${(X(0) + r * Math.cos(a1)).toFixed(1)},${(Y(0) - r * Math.sin(a1)).toFixed(1)}" ` +
      `fill="none" stroke="#1B4E8C" stroke-width="1.2"/>`,
      `<text x="${(X(0) + r + 6).toFixed(1)}" y="${(Y(0) - r * Math.sin(a1 / 2) - 4).toFixed(1)}" ` +
      `font-size="9" fill="#1B4E8C">δ = ${op.deltaDeg.toFixed(2)}°</text>`
    );
  }
  svg.push('</svg>');
  return svg.join('');
}

// ---------------------------------------------------------------------------
// The numbers underneath
// ---------------------------------------------------------------------------

function readouts(
  op: MachineOperatingPoint,
  c: CapabilityCurve,
  swing: ReturnType<typeof swingState>,
  loss: ReturnType<typeof rocof>,
  solved: SolvedCase
): string {
  const spinning = solved.net.generators
    .filter((x) => x.inService && x.pMW > 0 && hasRotor(x.kind))
    .reduce((a, x) => a + x.pMW, 0);
  const total = solved.system.pGenMW;

  const row = (label: string, value: string, note?: string) =>
    `<div class="machine__row"><span class="machine__label">${label}</span>` +
    `<span class="machine__value num">${value}</span></div>` +
    (note ? `<p class="note machine__note">${note}</p>` : '');

  return (
    `<section class="machine__section">` +
    `<h4 class="inspect__heading">Where it is running</h4>` +
    row(term('capability-curve', 'Output'),
      `${op.pMW.toFixed(0)} MW · ${op.qMVAr.toFixed(0)} MVAr`) +
    row(term('excitation', 'Internal EMF'), `E = ${op.ePU.toFixed(4)} pu`,
      op.ePU > op.vPU
        ? 'Above the terminal voltage, so the machine is over-excited and is ' +
          'producing reactive power. Raising the field raises E; nothing about ' +
          'the fuel has changed.'
        : 'Below the terminal voltage, so the machine is under-excited and is ' +
          'absorbing reactive power from the system.') +
    row('Load angle', `δ = ${op.deltaDeg.toFixed(2)}°`,
      'How far the rotor has been dragged ahead of the terminal voltage by the ' +
      'torque on its shaft. Open the fuel valve and this grows; it is what real ' +
      'power actually follows.') +
    row(term('power-factor', 'Power factor'),
      `${op.powerFactor.toFixed(3)} ${op.overExcited ? 'lagging' : 'leading'}`) +
    row('Against its nameplate', `${(op.loading * 100).toFixed(1)} % of ${c.sRatedMVA.toFixed(0)} MVA`) +
    `</section>` +

    `<section class="machine__section">` +
    `<h4 class="inspect__heading">${term('inertia', 'Inertia')}</h4>` +
    row('Inertia constant', `H = ${swing.h.toFixed(1)} s`,
      'A real time: H seconds is how long this rotor could supply the machine’s ' +
      'own rated output from its rotation alone, with no fuel at all.') +
    row('Stored kinetic energy', `${(swing.storedMJ / 1000).toFixed(2)} GJ`) +
    row('If this unit tripped now',
      `${loss.hzPerSecond.toFixed(3)} Hz/s`,
      'Rate of change of frequency from California’s own rotating mass alone. ' +
      'The real system is bolted synchronously to everything from British ' +
      'Columbia to New Mexico, whose rotors resist the change too, so the ' +
      'frequency would actually fall several times slower than this.') +
    row('Spinning now',
      `${(spinning / 1000).toFixed(1)} of ${(total / 1000).toFixed(1)} GW`,
      'Only machines with a rotor turning in synchronism contribute inertia. A ' +
      'solar inverter has none at all unless it has been deliberately ' +
      'programmed to imitate one, which is why the denominator above shrinks ' +
      'on a sunny afternoon.') +
    `</section>`
  );
}

void escapeHtml;

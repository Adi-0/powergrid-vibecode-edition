/**
 * How the answer was reached.
 *
 * Every other panel in this app shows a RESULT. This one shows the method, and
 * it exists because the brief asks for Newton–Raphson iterating visibly — which
 * is right, because the single most useful thing to understand about a power
 * flow is that nobody solves it, they converge to it.
 *
 * WHY IT CANNOT BE SOLVED DIRECTLY. The unknowns are voltages; the things that
 * are known are powers; and power is voltage times current, with the current
 * itself depending on every voltage in the network. So the equations are
 * quadratic in the unknowns and coupled to each other — there is no formula.
 * What there is instead is a guess, a way of measuring how wrong the guess is,
 * and a way of improving it.
 *
 * THE MEASURE OF WRONGNESS IS THE MISMATCH: at every bus, the power the
 * solution implies minus the power that is actually scheduled there. At the
 * answer it is zero everywhere. The convergence plot below is that number,
 * shrinking.
 *
 * AND IT SHRINKS QUADRATICALLY, which is the signature of Newton's method and
 * is visible in the plot as a curve that gets steeper rather than a straight
 * line: each step roughly SQUARES the error, so three correct digits become six
 * and six become twelve. That is why a power flow converges in four or five
 * iterations and not in four or five hundred.
 */

import { PowerFlowResult, IterationRecord, solvePowerFlow } from '../core/powerflow.js';
import { SolvedCase } from '../core/results.js';
import { yAt } from '../core/ybus.js';
import { term, escapeHtml } from './tooltip.js';

const W = 430;
const H = 200;
const PAD = { left: 48, right: 14, top: 26, bottom: 28 };

export interface SolverPanelHost {
  onClose: () => void;
}

export class SolverPanel {
  readonly element: HTMLElement;
  private readonly body: HTMLElement;
  private readonly sub: HTMLElement;
  private readonly host: SolverPanelHost;

  constructor(host: SolverPanelHost) {
    this.host = host;
    this.element = document.createElement('aside');
    this.element.className = 'panel panel--solver';
    this.element.style.display = 'none';
    this.element.innerHTML =
      `<div class="panel__head">` +
      `<span class="panel__title">How it was solved</span>` +
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

  toggle(): void {
    this.setVisible(!this.isOpen);
    if (!this.isOpen) this.host.onClose();
  }

  render(solved: SolvedCase): void {
    if (!this.isOpen) return;
    const pf = solved.pf;
    const cold = coldSolve(solved);
    this.sub.textContent =
      `${pf.iterations} iterations · ${pf.solveMs.toFixed(1)} ms` +
      (cold ? ` · ${cold.iterations} from scratch` : '');
    this.body.innerHTML =
      shape(solved) +
      convergenceSVG(pf, cold) +
      startingPoint(pf, cold) +
      iterationTable(pf) +
      sparsitySVG(solved) +
      limits(pf);
  }
}

// ---------------------------------------------------------------------------
// What the problem is
// ---------------------------------------------------------------------------

/**
 * The shape of the problem, counted.
 *
 * A bus has four quantities — P, Q, |V| and θ — and two of them are known. WHICH
 * two is the bus type, and that is the whole meaning of the classification:
 *
 *  - a PQ bus knows its P and Q (it is a load) and the solver finds |V| and θ;
 *  - a PV bus knows its P and |V| (a machine holding a voltage) and the solver
 *    finds Q and θ;
 *  - the slack bus knows |V| and θ by definition and takes whatever P and Q are
 *    left over, which is how the arithmetic closes when losses are not known
 *    until after it is solved.
 *
 * So the number of unknowns is 2·n_PQ + n_PV, and that is the size of the
 * Jacobian.
 */
function shape(solved: SolvedCase): string {
  const types = solved.pf.finalType;
  const nPQ = types.filter((t) => t === 'PQ').length;
  const nPV = types.filter((t) => t === 'PV').length;
  const n = 2 * nPQ + nPV;

  return (
    `<section class="solver__section">` +
    `<h4 class="inspect__heading">The shape of the problem</h4>` +
    `<p class="note">Every bus has four quantities — P, Q, |V| and θ — and two ` +
    `of them are known. Which two is what the ${term('bus', 'bus')} type means.</p>` +
    `<div class="solver__grid">` +
    cell(term('pq-bus', 'PQ buses'), String(nPQ), 'P and Q known; |V| and θ found') +
    cell(term('pv-bus', 'PV buses'), String(nPV), 'P and |V| known; Q and θ found') +
    cell(term('slack-bus', 'Slack'), '1', '|V| and θ fixed; takes what is left over') +
    cell('Unknowns', String(n), '2·n_PQ + n_PV — the size of the Jacobian') +
    `</div>` +
    `<p class="note">The ${term('jacobian', 'Jacobian')} is ${n} × ${n}, which is ` +
    `${(n * n).toLocaleString()} entries — of which ` +
    `${((nonZeroFraction(solved) * 100).toFixed(2))} % are not zero, because a ` +
    `bus is connected to three or four neighbours and to nothing else.</p>` +
    `</section>`
  );
}

const cell = (label: string, value: string, note: string): string =>
  `<div class="solver__cell"><span class="solver__label">${label}</span>` +
  `<span class="solver__value num">${value}</span>` +
  `<span class="solver__note">${note}</span></div>`;

function nonZeroFraction(solved: SolvedCase): number {
  const n = solved.net.buses.length;
  let nz = 0;
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < n; k++) {
      const y = yAt(solved.pf.ybus, i, k);
      if (Math.abs(y.re) > 1e-12 || Math.abs(y.im) > 1e-12) nz++;
    }
  }
  return nz / (n * n);
}

// ---------------------------------------------------------------------------
// Convergence
// ---------------------------------------------------------------------------

const T_MAX = 10;
const T_MIN = 1e-12;

/**
 * The same case, solved twice, from two different starting points.
 *
 * The solve that produced what is on screen was WARM STARTED: it began from the
 * voltages of the previous solve, a few iterations away, because that is what a
 * control room does — it re-solves every few seconds and the system has barely
 * moved. So its first mismatch is already tiny, and the curve is short.
 *
 * That is honest but it hides the method. The second curve is the identical
 * case solved COLD, from a DC-power-flow estimate of the angles and flat
 * magnitudes, which is what a planning study does when nothing has been solved
 * before. It is the one that shows Newton working: a step down, a much bigger
 * step down, then the error falling off the bottom of the plot.
 *
 * Both land on the same voltages. The difference between the two answers is
 * measured and printed below the plot, because "the answer does not depend on
 * where you started" is a claim, and a claim is worth less than a number.
 */
const coldCache = new WeakMap<SolvedCase, PowerFlowResult>();

function coldSolve(solved: SolvedCase): PowerFlowResult | null {
  const cached = coldCache.get(solved);
  if (cached) return cached;
  const cold = solvePowerFlow(solved.net, {
    tol: 1e-9, init: 'dc', enforceQLimits: true, maxIterations: 40,
  });
  if (!cold.converged) return null;
  coldCache.set(solved, cold);
  return cold;
}

function convergenceSVG(warm: PowerFlowResult, cold: PowerFlowResult | null): string {
  const trace = warm.trace;
  if (trace.length === 0) return '';
  const n = Math.max(trace.length, cold ? cold.trace.length : 0, 2);

  const x = (i: number) =>
    PAD.left + (i / (n - 1)) * (W - PAD.left - PAD.right);
  const y = (m: number) => {
    const clamped = Math.min(T_MAX, Math.max(T_MIN, m));
    return PAD.top +
      (Math.log10(T_MAX / clamped) / Math.log10(T_MAX / T_MIN)) *
      (H - PAD.top - PAD.bottom);
  };

  const svg: string[] = [];
  svg.push(`<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" ` +
    `aria-label="Convergence of the power flow">`);

  for (let e = 0; e >= -12; e -= 2) {
    const t = Math.pow(10, e);
    svg.push(
      `<line x1="${PAD.left}" y1="${y(t).toFixed(1)}" x2="${W - PAD.right}" ` +
      `y2="${y(t).toFixed(1)}" stroke="#E5E1D7" stroke-width="1"/>`,
      `<text x="${PAD.left - 5}" y="${(y(t) + 3).toFixed(1)}" text-anchor="end" ` +
      `font-size="8" fill="#5C5953" font-variant-numeric="tabular-nums">` +
      `10${sup(e)}</text>`
    );
  }
  // The tolerance the solve was asked to reach.
  const tol = warm.tol;
  svg.push(
    `<line x1="${PAD.left}" y1="${y(tol).toFixed(1)}" x2="${W - PAD.right}" ` +
    `y2="${y(tol).toFixed(1)}" stroke="#8E8B84" stroke-width="1" stroke-dasharray="4 3"/>`,
    `<rect x="${PAD.left}" y="${PAD.top}" width="${W - PAD.left - PAD.right}" ` +
    `height="${H - PAD.top - PAD.bottom}" fill="none" stroke="#14161A" stroke-width="1"/>`
  );

  // The cold solve goes down first, in a lighter stroke, because it is the
  // reference and not the thing that happened.
  if (cold) {
    for (const d of brokenRuns(cold.trace, x, y)) {
      svg.push(
        `<path d="${d}" fill="none" stroke="#8E8B84" stroke-width="1.1" ` +
        `stroke-dasharray="3 2.5"/>`
      );
    }
    for (const [i, r] of cold.trace.entries()) {
      svg.push(
        `<circle cx="${x(i).toFixed(1)}" cy="${y(r.maxMismatch).toFixed(1)}" r="2" ` +
        `fill="none" stroke="#8E8B84" stroke-width="1"><title>from scratch, ` +
        `iteration ${r.iteration}: ${r.maxMismatch.toExponential(2)}</title></circle>`
      );
    }
  }

  // The curve is BROKEN wherever the problem changed, because the two halves
  // are convergence on two different problems and joining them with a line
  // would claim a continuity that does not exist.
  for (const d of brokenRuns(trace, x, y)) {
    svg.push(`<path d="${d}" fill="none" stroke="#14161A" stroke-width="1.8"/>`);
  }
  // A rule where the problem changed, with what changed.
  for (const [i, r] of trace.entries()) {
    if (r.restarted === undefined) continue;
    svg.push(
      `<line x1="${x(i).toFixed(1)}" y1="${PAD.top}" x2="${x(i).toFixed(1)}" ` +
      `y2="${H - PAD.bottom}" stroke="#8E8B84" stroke-width="1" stroke-dasharray="2 3"/>`,
      `<text x="${(x(i) + 3).toFixed(1)}" y="${PAD.top + 9}" font-size="7.5" ` +
      `fill="#5C5953">problem changed</text>`
    );
  }
  for (const [i, r] of trace.entries()) {
    svg.push(
      `<circle cx="${x(i).toFixed(1)}" cy="${y(r.maxMismatch).toFixed(1)}" r="3" ` +
      `fill="#EFECE4" stroke="#14161A" stroke-width="1.4"><title>iteration ` +
      `${r.iteration}: ${r.maxMismatch.toExponential(2)} at ${escapeHtml(r.worstBus)}</title></circle>`,
      `<text x="${x(i).toFixed(1)}" y="${H - PAD.bottom + 12}" text-anchor="middle" ` +
      `font-size="8.5" fill="#5C5953" font-variant-numeric="tabular-nums">${r.iteration}</text>`
    );
  }
  svg.push(
    `<text x="${W - PAD.right}" y="${H - 4}" text-anchor="end" font-size="8.5" ` +
    `fill="#5C5953" letter-spacing="0.04em">iteration</text>`,
    `<text x="6" y="11" font-size="8.5" fill="#5C5953" ` +
    `letter-spacing="0.04em">max mismatch, pu</text>`,
    `<text x="${W - PAD.right}" y="11" text-anchor="end" font-size="8" ` +
    `fill="#5C5953">tolerance ${tol.toExponential(0)}</text>`
  );
  svg.push('</svg>');
  return svg.join('');
}

/**
 * One polyline per run of iterations on a single problem.
 *
 * The trace is broken wherever a bus changed type on a reactive limit, because
 * either side of that break is convergence on a DIFFERENT set of equations, and
 * joining them with a line would claim a continuity that does not exist.
 */
function brokenRuns(
  trace: IterationRecord[],
  x: (i: number) => number,
  y: (m: number) => number
): string[] {
  const runs: string[] = [];
  let current: string[] = [];
  for (const [i, r] of trace.entries()) {
    if (r.restarted !== undefined && current.length > 0) {
      runs.push(current.join(' '));
      current = [];
    }
    current.push(
      `${current.length === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(r.maxMismatch).toFixed(1)}`
    );
  }
  if (current.length > 0) runs.push(current.join(' '));
  return runs;
}

/**
 * Where the iteration began, and why it matters.
 */
function startingPoint(warm: PowerFlowResult, cold: PowerFlowResult | null): string {
  const keys =
    `<section class="solver__section solver__section--tight">` +
    `<p class="solver__keys">` +
    `<span class="solver__key solver__key--warm"></span>` +
    `<span>this solve — started from the previous one</span>` +
    (cold
      ? `<span class="solver__key solver__key--cold"></span>` +
        `<span>the same case from scratch</span>`
      : '') +
    `</p>`;
  if (!cold) return keys + `</section>`;

  let dV = 0;
  let dA = 0;
  for (let i = 0; i < warm.vm.length; i++) {
    dV = Math.max(dV, Math.abs(warm.vm[i] - cold.vm[i]));
    dA = Math.max(dA, Math.abs(warm.va[i] - cold.va[i]) * 180 / Math.PI);
  }
  return (
    keys +
    `<p class="note">The solve that produced what is on screen began from the ` +
    `previous solution, which is what a control room does: the system moves a ` +
    `little, and re-solving from where it was costs ` +
    `${warm.iterations} iteration${warm.iterations === 1 ? '' : 's'} instead of ` +
    `${cold.iterations}. The lighter curve is the identical case solved cold — ` +
    `angles from a ${term('dc-power-flow', 'DC power flow')}, magnitudes flat — ` +
    `and it is the one that shows the method working.</p>` +
    `<p class="note">The two answers differ by at most ` +
    `<span class="num">${dV.toExponential(1)}</span> pu in voltage magnitude and ` +
    `<span class="num">${dA.toExponential(1)}</span>° in angle, which is the ` +
    `tolerance and not the starting point. Where you begin decides how long it ` +
    `takes, never where you arrive.</p>` +
    `</section>`
  );
}

const SUPS = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const sup = (e: number): string =>
  (e < 0 ? '⁻' : '') + String(Math.abs(e)).split('').map((d) => SUPS[Number(d)]).join('');

function iterationTable(pf: PowerFlowResult): string {
  const rows = pf.trace.map((r: IterationRecord, i) => {
    const previous = i > 0 ? pf.trace[i - 1].maxMismatch : null;
    // The ratio of the logs is what shows the ORDER of convergence: near 2
    // means each step squares the error, which is Newton's method working.
    // The order is only meaningful WITHIN one run on one problem. After a
    // restart the previous mismatch belongs to a different set of equations,
    // and dividing one by the other would produce a number that means nothing.
    const order = previous !== null && r.restarted === undefined &&
      previous < 1 && r.maxMismatch > 0
      ? Math.log(r.maxMismatch) / Math.log(previous)
      : null;
    return (
      (r.restarted !== undefined
        ? `<div class="solver__restart">${escapeHtml(r.restarted)} — ` +
          `Newton starts again on a different problem</div>`
        : '') +
      `<div class="solver__row">` +
      `<span class="num">${r.iteration}</span>` +
      `<span class="num">${r.maxDP.toExponential(1)}</span>` +
      `<span class="num">${r.maxDQ.toExponential(1)}</span>` +
      `<span>${escapeHtml(r.worstBus)}</span>` +
      `<span class="num">${order !== null ? order.toFixed(2) : '—'}</span>` +
      `</div>`
    );
  }).join('');

  return (
    `<section class="solver__section">` +
    `<h4 class="inspect__heading">Each step</h4>` +
    `<div class="solver__row solver__row--head">` +
    `<span>#</span><span>max ΔP</span><span>max ΔQ</span><span>worst bus</span>` +
    `<span>order</span></div>` +
    rows +
    `<p class="note">The last column is how much better each step is than the ` +
    `one before, as a power. Near 2 means the error is being SQUARED at every ` +
    `step — three correct digits become six, six become twelve. That is the ` +
    `signature of ${term('newton-raphson', 'Newton–Raphson')}, and it is why a ` +
    `power flow converges in four or five iterations rather than four or five ` +
    `hundred.</p>` +
    (pf.trace.some((r) => r.restarted !== undefined)
      ? `<p class="note">Where the mismatch jumps back up, the PROBLEM changed: ` +
        `a machine ran out of reactive capability, its bus stopped being a ` +
        `voltage-controlled bus, and the set of unknowns is no longer the same ` +
        `one. That is a physical transition, not the method failing — and it ` +
        `is often what a voltage collapse is made of.</p>`
      : '') +
    `</section>`
  );
}

// ---------------------------------------------------------------------------
// The matrix
// ---------------------------------------------------------------------------

/**
 * The bus admittance matrix, as a picture.
 *
 * One dot for every non-zero entry. The diagonal is solid, because every bus
 * has a self-admittance; everything off it is a branch, and there are very few,
 * because a bus is connected to three or four neighbours and to nothing else.
 *
 * That sparsity is not an aesthetic observation. It is the reason a power flow
 * on a network of tens of thousands of buses is possible at all: a dense solve
 * would be cubic in the number of buses, and the whole apparatus of sparse
 * factorisation and ordering exists to exploit this picture.
 */
function sparsitySVG(solved: SolvedCase): string {
  const n = solved.net.buses.length;
  const size = 200;
  const dots: string[] = [];
  const r = Math.max(0.5, (size / n) * 0.45);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < n; k++) {
      const y = yAt(solved.pf.ybus, i, k);
      if (Math.abs(y.re) < 1e-12 && Math.abs(y.im) < 1e-12) continue;
      dots.push(
        `<circle cx="${((k + 0.5) * size / n).toFixed(2)}" ` +
        `cy="${((i + 0.5) * size / n).toFixed(2)}" r="${r.toFixed(2)}" fill="#14161A"/>`
      );
    }
  }
  return (
    `<section class="solver__section">` +
    `<h4 class="inspect__heading">${term('ybus', 'The admittance matrix')}</h4>` +
    `<svg viewBox="-1 -1 ${size + 2} ${size + 2}" width="200" height="200" ` +
    `role="img" aria-label="Sparsity of the bus admittance matrix">` +
    `<rect x="0" y="0" width="${size}" height="${size}" fill="none" ` +
    `stroke="#C8C4BA" stroke-width="1"/>${dots.join('')}</svg>` +
    `<p class="note">One dot for every non-zero entry, ${n} × ${n}. The diagonal ` +
    `is solid because every bus has a self-admittance; everything off it is a ` +
    `branch. The emptiness is the point: a bus is connected to three or four ` +
    `neighbours and to nothing else, and that sparsity is the only reason a ` +
    `power flow on a network of tens of thousands of buses is possible at all.</p>` +
    `</section>`
  );
}

function limits(pf: PowerFlowResult): string {
  if (pf.qLimited.length === 0) {
    return (
      `<p class="note">No machine hit a reactive limit, so every PV bus held ` +
      `the voltage it was asked to hold.</p>`
    );
  }
  return (
    `<section class="solver__section">` +
    `<h4 class="inspect__heading">${term('reactive-limit', 'Machines at a reactive limit')}</h4>` +
    pf.qLimited.map((q) =>
      `<div class="solver__row solver__row--limit">` +
      `<span>${escapeHtml(q.bus)}</span>` +
      `<span class="num">${q.qMVAr.toFixed(0)} MVAr</span>` +
      `<span>${q.limit === 'qMax' ? 'at its maximum' : 'at its minimum'}</span>` +
      `</div>`).join('') +
    `<p class="note">A machine that runs out of reactive capability stops ` +
    `holding its voltage. The solver notices, converts the bus from PV to PQ ` +
    `at the limit, and carries on — which changes the size of the problem ` +
    `part-way through solving it.</p>` +
    `</section>`
  );
}

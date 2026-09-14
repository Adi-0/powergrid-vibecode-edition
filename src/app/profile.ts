/**
 * The voltage profile: voltage against distance along the feeder.
 *
 * This is the first plot any distribution engineer draws, and it is worth
 * saying why. Voltage is not a property of the system; it is a property of a
 * PLACE in the system, and it falls as you walk away from the source because
 * the current flowing to everything beyond you has to pass through the
 * impedance between you and it. The plot makes that visible as a slope, and it
 * makes every piece of voltage-management equipment visible as a feature of
 * the shape:
 *
 *   - the slope itself is I·Z drop, steepest where the current is largest,
 *     which is at the substation end where it is carrying the whole feeder;
 *   - the vertical step a third of the way along is the REGULATOR, lifting the
 *     whole downstream profile by a fixed ratio;
 *   - the kink two thirds along is the CAPACITOR BANK, which does not inject
 *     real power at all — it reduces the reactive current in everything
 *     upstream of it, and the voltage rises because that current is no longer
 *     dropping volts along the way;
 *   - the horizontal band is ANSI C84.1 Range A, which is what the whole
 *     exercise is for: every customer must sit inside it.
 *
 * Every point is a solved bus voltage. The plot is a view of the solution, not
 * an illustration of one.
 */

import { SolvedCase } from '../core/results.js';
import {
  FEEDER_NODES, FEEDER_REGULATOR, MODELLED_SERVICE, feederBusId,
} from '../data/california/feeder.js';

const W = 560;
const H = 156;
const PAD = { left: 40, right: 12, top: 12, bottom: 24 };

export interface ProfilePoint {
  nodeId: string;
  name: string;
  km: number;
  vpu: number;
  /** Whether it is on the three-phase main or on a single-phase lateral. */
  main: boolean;
}

export interface ProfileHost {
  onSelect?: (nodeId: string) => void;
}

export class VoltageProfile {
  readonly element: HTMLElement;
  private readonly body: HTMLElement;
  private readonly host: ProfileHost;

  constructor(host: ProfileHost = {}) {
    this.host = host;
    this.element = document.createElement('section');
    this.element.className = 'panel panel--profile';
    this.element.style.display = 'none';
    this.element.innerHTML =
      `<div class="panel__head">` +
      `<span class="panel__title">Voltage profile</span>` +
      `<span class="panel__sub">Cherry Lane 1201 · per-unit against distance from the substation</span>` +
      `</div><div class="panel__body"></div>`;
    this.body = this.element.querySelector('.panel__body') as HTMLElement;
    this.body.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest('[data-node]') as HTMLElement | null;
      if (t?.dataset.node) this.host.onSelect?.(t.dataset.node);
    });
  }

  setVisible(on: boolean): void {
    this.element.style.display = on ? '' : 'none';
  }

  render(solved: SolvedCase, selectedId: string | null): void {
    if (this.element.style.display === 'none') return;

    const points: ProfilePoint[] = [];
    for (const n of FEEDER_NODES) {
      const bus = solved.busById.get(feederBusId(n.id));
      if (!bus) continue;
      points.push({
        nodeId: n.id, name: n.name, km: n.distanceKm ?? 0,
        vpu: bus.vpu, main: n.phases === 'ABC',
      });
    }
    // The regulator's output is a bus of its own at the same distance as its
    // input, which is what draws the step.
    const regBus = solved.busById.get(`FDR_${FEEDER_REGULATOR.node}_REG`);
    const regNode = FEEDER_NODES.find((n) => n.id === FEEDER_REGULATOR.node);
    if (regBus && regNode) {
      points.push({
        nodeId: `${FEEDER_REGULATOR.node}_REG`, name: 'Regulator output',
        km: regNode.distanceKm ?? 0, vpu: regBus.vpu, main: true,
      });
    }
    if (points.length === 0) return;

    const kmMax = Math.max(0.6, ...points.map((p) => p.km)) * 1.02;
    const vs = points.map((p) => p.vpu);
    const vLo = Math.min(0.948, ...vs) - 0.006;
    const vHi = Math.max(1.052, ...vs) + 0.006;

    const x = (km: number) =>
      PAD.left + (km / kmMax) * (W - PAD.left - PAD.right);
    const y = (v: number) =>
      PAD.top + (1 - (v - vLo) / (vHi - vLo)) * (H - PAD.top - PAD.bottom);

    // The trunk, in order, with the regulator output inserted at its step.
    const trunkOrder = [
      'F00', 'F01', 'F02', 'F03', 'F04', 'F05', 'F05_REG',
      'F06', 'F07', 'F08', 'F09', 'F10', 'F11',
    ];
    const byId = new Map(points.map((p) => [p.nodeId, p]));
    const trunk = trunkOrder.map((id) => byId.get(id)).filter((p): p is ProfilePoint => !!p);

    // Each lateral, drawn from where it taps off the main.
    const laterals: [string, string[]][] = [
      ['F02', ['L1A', 'L1B']],
      ['F06', ['L2A', 'L2B']],
      ['F07', ['L3A', 'L3B', 'SVC_LV']],
      ['F09', ['L4A']],
      ['F10', ['L5A']],
    ];

    const path = (ps: ProfilePoint[]): string =>
      ps.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.km).toFixed(1)},${y(p.vpu).toFixed(1)}`).join(' ');

    const gridV: number[] = [];
    for (let v = Math.ceil(vLo * 100) / 100; v <= vHi; v += 0.02) gridV.push(v);

    const svg: string[] = [];
    svg.push(`<svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Voltage profile along Cherry Lane 1201">`);

    // ANSI C84.1 Range A band, as a pair of rules rather than a fill: a filled
    // band would be the heaviest mark on the plot and it is the least
    // important one.
    for (const [v, label] of [[1.05, '1.05 pu'], [0.95, '0.95 pu']] as const) {
      svg.push(
        `<line x1="${PAD.left}" y1="${y(v).toFixed(1)}" x2="${W - PAD.right}" y2="${y(v).toFixed(1)}" ` +
        `stroke="#8E8B84" stroke-width="0.9" stroke-dasharray="5 3"/>`,
        `<text x="${W - PAD.right}" y="${(y(v) - 3).toFixed(1)}" text-anchor="end" ` +
        `font-size="8.5" fill="#8E8B84" letter-spacing="0.04em">ANSI C84.1 Range A · ${label}</text>`
      );
    }

    for (const v of gridV) {
      svg.push(
        `<line x1="${PAD.left - 3}" y1="${y(v).toFixed(1)}" x2="${PAD.left}" y2="${y(v).toFixed(1)}" stroke="#C8C4BA" stroke-width="1"/>`,
        `<text x="${PAD.left - 6}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end" font-size="8.5" ` +
        `fill="#5C5953" font-variant-numeric="tabular-nums">${v.toFixed(2)}</text>`
      );
    }

    // Axes.
    svg.push(
      `<line x1="${PAD.left}" y1="${PAD.top}" x2="${PAD.left}" y2="${H - PAD.bottom}" stroke="#14161A" stroke-width="1"/>`,
      `<line x1="${PAD.left}" y1="${H - PAD.bottom}" x2="${W - PAD.right}" y2="${H - PAD.bottom}" stroke="#14161A" stroke-width="1"/>`
    );
    for (let km = 0; km <= kmMax; km += 0.5) {
      svg.push(
        `<line x1="${x(km).toFixed(1)}" y1="${H - PAD.bottom}" x2="${x(km).toFixed(1)}" y2="${H - PAD.bottom + 3}" stroke="#C8C4BA" stroke-width="1"/>`,
        `<text x="${x(km).toFixed(1)}" y="${H - PAD.bottom + 13}" text-anchor="middle" font-size="8.5" ` +
        `fill="#5C5953" font-variant-numeric="tabular-nums">${km.toFixed(1)}</text>`
      );
    }
    svg.push(
      `<text x="${W - PAD.right}" y="${H - 3}" text-anchor="end" font-size="8.5" fill="#5C5953" letter-spacing="0.05em">km along the wire</text>`
    );

    // Laterals first, lighter, so the trunk reads as the trunk.
    for (const [tap, ids] of laterals) {
      const head = byId.get(tap);
      const chain = ids.map((id) => byId.get(id)).filter((p): p is ProfilePoint => !!p);
      if (!head || chain.length === 0) continue;
      svg.push(
        `<path d="${path([head, ...chain])}" fill="none" stroke="#8E8B84" stroke-width="1" ` +
        `stroke-dasharray="4 2.5"/>`
      );
    }

    svg.push(`<path d="${path(trunk)}" fill="none" stroke="#14161A" stroke-width="1.6"/>`);

    // Points, with the ones that mean something marked larger.
    const notable = new Set([
      'F00', FEEDER_REGULATOR.node, `${FEEDER_REGULATOR.node}_REG`,
      'F08', 'F11', MODELLED_SERVICE.toNode,
    ]);
    for (const p of points) {
      const big = notable.has(p.nodeId);
      const sel = selectedId === p.nodeId || selectedId === feederBusId(p.nodeId);
      const out = p.vpu < 0.95 || p.vpu > 1.05;
      const fill = out ? '#C4341B' : sel ? '#1B4E8C' : big ? '#14161A' : '#8E8B84';
      svg.push(
        `<circle data-node="${p.nodeId}" cx="${x(p.km).toFixed(1)}" cy="${y(p.vpu).toFixed(1)}" ` +
        `r="${big || sel ? 2.9 : 1.7}" fill="${fill}" style="cursor:pointer"><title>${escapeXML(p.name)} — ` +
        `${p.vpu.toFixed(4)} pu at ${p.km.toFixed(2)} km</title></circle>`
      );
    }

    // Name the three features that are the point of the plot.
    const annotate = (nodeId: string, text: string, dy: number) => {
      const p = byId.get(nodeId);
      if (!p) return;
      svg.push(
        `<text x="${(x(p.km) + 4).toFixed(1)}" y="${(y(p.vpu) + dy).toFixed(1)}" font-size="8.5" ` +
        `fill="#14161A" letter-spacing="0.03em">${escapeXML(text)}</text>`
      );
    };
    annotate('F00', 'substation', 14);
    annotate(`${FEEDER_REGULATOR.node}_REG`, 'regulator', -6);
    annotate('F08', 'capacitor', -6);
    annotate(MODELLED_SERVICE.toNode, '14 Cherry Lane', 13);

    svg.push('</svg>');
    this.body.innerHTML = svg.join('');
  }
}

const escapeXML = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

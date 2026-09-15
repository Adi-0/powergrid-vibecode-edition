/**
 * The inspector: what is selected, and what it is doing right now.
 *
 * Two rules govern everything printed here.
 *
 *  - EVERY QUANTITY CARRIES ITS SYMBOL, ITS UNIT, AND A SENSE OF SCALE. Not
 *    "500 MW" on its own, but P = 500 MW, next to what that serves and next to
 *    the notation a person will meet elsewhere.
 *  - PER-UNIT AND PHYSICAL UNITS ARE SHOWN TOGETHER, NEVER ALONE, with the
 *    base they are referred to. A per-unit number without its base is not a
 *    number, it is a rumour.
 *
 * Nothing here holds a value of its own: every figure is read out of the
 * `SolvedCase` on each render.
 */

import { SolvedCase, BranchFlow } from '../core/results.js';
import { Branch, Bus } from '../core/network.js';

import { lineParameters, surgeImpedance, loadabilityLimitMW, CONDUCTORS } from '../core/lines.js';
import { SITES } from '../data/california/sites.js';
import { SystemGeometry, SiteNode, formatMW } from '../render/scene-system.js';
import { elementById, protectionFor } from '../data/california/substation.js';
import { substationLive } from '../render/scene-substation.js';
import {
  FEEDER_NODES, FEEDER_LOADS, feederBusId, MODELLED_SERVICE,
} from '../data/california/feeder.js';
import {
  serviceNodeById, SERVICE_RUNS, C84_1, DropStep,
} from '../data/california/service.js';
import { plantItemById, energyChain } from '../data/california/plant.js';
import { Selection, AppSnapshot } from './state.js';
import { term, quantity, escapeHtml } from './tooltip.js';
import { voltageClass } from '../render/style.js';

export interface InspectorHost {
  onClose: () => void;
  onTrip: (branchId: string) => void;
  onSelect: (kind: Selection['kind'], id: string) => void;
  onShowMath: (kind: Selection['kind'], id: string) => void;
}

export class Inspector {
  readonly element: HTMLElement;
  private readonly body: HTMLElement;
  private readonly title: HTMLElement;
  private readonly sub: HTMLElement;
  private readonly host: InspectorHost;

  constructor(host: InspectorHost) {
    this.host = host;
    this.element = document.createElement('aside');
    this.element.className = 'panel panel--inspect';
    this.element.style.display = 'none';
    this.element.innerHTML =
      `<div class="panel__head">` +
      `<span class="panel__title"></span>` +
      `<span class="panel__sub"></span>` +
      `<button class="panel__close" title="Close">×</button>` +
      `</div><div class="panel__body"></div>`;
    this.title = this.element.querySelector('.panel__title') as HTMLElement;
    this.sub = this.element.querySelector('.panel__sub') as HTMLElement;
    this.body = this.element.querySelector('.panel__body') as HTMLElement;
    (this.element.querySelector('.panel__close') as HTMLElement)
      .addEventListener('click', () => this.host.onClose());

    this.element.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
      if (!t) return;
      const { action, id, kind } = t.dataset;
      if (action === 'trip' && id) this.host.onTrip(id);
      if (action === 'select' && id && kind) this.host.onSelect(kind as Selection['kind'], id);
      if (action === 'math' && id && kind) this.host.onShowMath(kind as Selection['kind'], id);
    });
  }

  render(snap: AppSnapshot, geometry: SystemGeometry): void {
    const { selection, solved } = snap;
    if (!selection.id || selection.kind === 'none') {
      this.element.style.display = 'none';
      return;
    }
    this.element.style.display = 'flex';

    if (selection.kind === 'circuit') {
      const br = solved.net.branches.find((b) => b.id === selection.id);
      const flow = solved.branchById.get(selection.id);
      if (br && flow) return this.renderCircuit(br, flow, solved, snap);
    }
    if (selection.kind === 'site') {
      const node = geometry.sites.get(selection.id);
      if (node) return this.renderSite(node, solved, snap);
      // Below the region level the selectable things are no longer sites on a
      // map. They are pieces of equipment, poles and sockets, each of which
      // knows a different set of things about itself.
      const element = elementById.get(selection.id);
      if (element) return this.renderSubstationElement(selection.id, solved);
      const pole = FEEDER_NODES.find((n) => n.id === selection.id);
      if (pole) return this.renderFeederNode(selection.id, solved, snap);
      const svc = serviceNodeById.get(selection.id);
      if (svc) return this.renderServiceNode(selection.id, snap);
      const plant = plantItemById.get(selection.id);
      if (plant) return this.renderPlantItem(selection.id, solved);
    }
    this.element.style.display = 'none';
  }

  // -----------------------------------------------------------------------
  // One piece of equipment in a substation
  // -----------------------------------------------------------------------

  private renderSubstationElement(id: string, solved: SolvedCase): void {
    const e = elementById.get(id)!;
    const live = substationLive(solved).get(id);
    this.title.textContent = 'Equipment';
    this.sub.textContent = e.kV > 0 ? `${e.kV} kV` : 'earthed';

    const rows: string[] = [`<h3 class="inspect__name">${escapeHtml(e.name)}</h3>`];
    rows.push(note(escapeHtml(e.note)));

    const facts: string[] = [];
    if (live) facts.push(kv('Right now', escapeHtml(live.text), live.alarm === true));
    if (e.ratio) facts.push(kv('Ratio', escapeHtml(e.ratio)));
    if (e.closed !== undefined) {
      facts.push(kv('Position', e.closed ? 'Closed' : 'Normally open'));
    }
    if (facts.length) rows.push(section('This device', facts));
    // A nameplate is a sentence, not a value: it belongs on its own line
    // rather than jammed into the right-hand column of a two-column list.
    if (e.rating) {
      rows.push(
        `<section class="inspect__section">` +
        `<h4 class="inspect__heading">Nameplate</h4>` +
        `<p class="nameplate num">${escapeHtml(e.rating)}</p></section>`
      );
    }

    const devices = protectionFor(id);
    if (devices.length > 0) {
      rows.push(
        `<section class="inspect__section">` +
        `<h4 class="inspect__heading">${term('device-number', 'Protection')}</h4>` +
        devices.map((d) =>
          `<div class="protect"><div class="protect__head">` +
          `<b class="num">${escapeHtml(d.device)}</b> ${escapeHtml(d.name)}</div>` +
          `<p class="note">${escapeHtml(d.how)}</p>` +
          `<p class="note protect__speed">${escapeHtml(d.speed)}</p></div>`).join('') +
        `</section>`
      );
    }
    rows.push(
      `<div class="inspect__actions">` +
      `<button class="btn" data-action="math" data-kind="site" ` +
      `data-id="${escapeHtml(id)}">Show the working</button></div>`
    );
    this.body.innerHTML = rows.join('');
  }

  // -----------------------------------------------------------------------
  // One thing in the power station
  // -----------------------------------------------------------------------

  private renderPlantItem(id: string, solved: SolvedCase): void {
    const item = plantItemById.get(id)!;
    const g = solved.net.generators.find(
      (x) => x.bus.startsWith('METCALF') && x.kind === 'gas-cc');
    const chain = g ? energyChain(g, g.pMW) : null;
    const stream = chain && item.stage
      ? chain.flows.find((f) => f.id === item.stage)
      : undefined;

    this.title.textContent = 'Plant';
    this.sub.textContent = item.kind.replace(/-/g, ' ');

    const rows: string[] = [`<h3 class="inspect__name">${escapeHtml(item.name)}</h3>`];
    rows.push(note(escapeHtml(item.note)));

    if (stream && chain) {
      rows.push(section('Energy through it now', [
        kv('Power in this stream', quantity(
          stream.mw.toFixed(0), { unit: stream.kind === 'electrical' ? 'MW' : 'MW thermal' })),
        kv('Fraction of the fuel', quantity(
          (stream.fraction * 100).toFixed(1), { unit: '%' })),
        kv(term('heat-rate', 'Station heat rate'), quantity(
          chain.heatRateBtuPerKWh.toFixed(0), { unit: 'BTU/kWh' })),
        kv('Station efficiency', quantity(
          (chain.efficiency * 100).toFixed(1), { unit: '%' })),
      ]));
      rows.push(note(escapeHtml(stream.note)));
    }

    if (item.rating) {
      rows.push(
        `<section class="inspect__section">` +
        `<h4 class="inspect__heading">Nameplate</h4>` +
        `<p class="nameplate num">${escapeHtml(item.rating)}</p></section>`
      );
    }

    rows.push(
      `<div class="inspect__actions">` +
      `<button class="btn" data-action="math" data-kind="site" ` +
      `data-id="${escapeHtml(id)}">Show the working</button></div>`
    );
    this.body.innerHTML = rows.join('');
  }

  // -----------------------------------------------------------------------
  // One pole on the feeder
  // -----------------------------------------------------------------------

  private renderFeederNode(id: string, solved: SolvedCase, snap: AppSnapshot): void {
    const n = FEEDER_NODES.find((x) => x.id === id)!;
    const bus = solved.busById.get(feederBusId(id));
    const spot = FEEDER_LOADS.find((l) => l.node === id);
    const isService = id === MODELLED_SERVICE.toNode;

    this.title.textContent = isService ? 'Service transformer' : 'Pole';
    this.sub.textContent = isService ? '240 V secondary'
      : n.phases === 'ABC' ? '12.47 kV, three-phase' : `12.47 kV, phase ${n.phases} only`;

    const rows: string[] = [`<h3 class="inspect__name">${escapeHtml(n.name)}</h3>`];
    if (n.note) rows.push(note(escapeHtml(n.note)));

    if (bus) {
      const baseV = isService ? 240 : 12470;
      rows.push(section('Voltage here', [
        kv(term('per-unit', 'Per-unit and volts'),
          bothUnits(bus.vpu, baseV, isService ? 'V' : 'V'),
          bus.voltageViolation !== null),
        kv(term('phase-angle', 'Angle'), quantity(
          bus.angleDeg.toFixed(3), { symbol: 'θ', unit: '°' })),
        kv('Distance from the substation', quantity(
          (n.distanceKm ?? 0).toFixed(2), { unit: 'km along the wire' })),
      ]));
    }

    if (spot) {
      rows.push(section('Load at this pole', [
        kv(term('real-power', 'Real power'), quantity(
          (spot.peakKW * snap.demandFraction).toFixed(0),
          { symbol: 'P', unit: 'kW now' })),
        kv('At the system peak', quantity(spot.peakKW.toFixed(0), { unit: 'kW' })),
        kv(term('power-factor', 'Power factor'), quantity(
          spot.powerFactor.toFixed(2), { symbol: 'cos φ' })),
        kv('Customers', quantity(String(spot.customers), { unit: 'metered' })),
      ]));
      rows.push(note(
        `That is ${(spot.peakKW / spot.customers).toFixed(1)} kW each at the ` +
        `moment they all peak together — far less than any one of them can ` +
        `draw on its own, which is what ${term('coincidence', 'coincident demand')} means.`
      ));
    }
    rows.push(
      `<div class="inspect__actions">` +
      `<button class="btn" data-action="math" data-kind="site" ` +
      `data-id="${escapeHtml(id)}">Show the working</button></div>`
    );
    this.body.innerHTML = rows.join('');
  }

  // -----------------------------------------------------------------------
  // One thing inside the house
  // -----------------------------------------------------------------------

  private renderServiceNode(id: string, snap: AppSnapshot): void {
    const n = serviceNodeById.get(id)!;
    const svc = snap.service;
    this.title.textContent = 'Service';
    this.sub.textContent = n.volts > 0 ? `${n.volts} V nominal` : 'earthed';

    const rows: string[] = [`<h3 class="inspect__name">${escapeHtml(n.name)}</h3>`];
    rows.push(note(escapeHtml(n.note)));
    if (n.rating) rows.push(section('Nameplate', [kv('Rating', escapeHtml(n.rating))]));

    // The chain of drops that arrives here, written out as an electrician
    // would: general form, substituted values, arithmetic, result.
    const chain: DropStep[] = [...svc.serviceSteps, ...svc.branchSteps];
    const upto = chainUpTo(id, chain);
    if (upto.length > 0) {
      rows.push(
        `<section class="inspect__section">` +
        `<h4 class="inspect__heading">${term('voltage-drop', 'How the voltage got here')}</h4>` +
        `<p class="note">ΔV = I · (R·cos φ + X·sin φ), with R and X for the whole ` +
        `loop — out on one conductor and back on another, which is why the ` +
        `length is counted twice.</p>` +
        `<dl class="kv">` +
        kv('At the transformer', `<span class="num">${svc.secondaryV.toFixed(2)}</span>` +
          `<span class="quantity__unit">V</span>`) +
        upto.map((st) =>
          kv(`− ${escapeHtml(st.name)}`,
            `<span class="num">${st.dropV.toFixed(3)}</span>` +
            `<span class="quantity__unit">V</span>` +
            `<span class="quantity__unit"> · ${st.currentA.toFixed(1)} A through ` +
            `${st.rOhm.toFixed(4)} Ω</span>`)).join('') +
        kv('Here', `<span class="num">${upto[upto.length - 1].toV.toFixed(2)}</span>` +
          `<span class="quantity__unit">V</span>`) +
        `</dl></section>`
      );
    }

    if (id === 'OUTLET') {
      rows.push(section('At the socket', [
        kv('Voltage', quantity(svc.outletV.toFixed(2), { symbol: 'V', unit: 'V' }),
          !svc.withinRangeA),
        kv(term('ansi-c84-1', 'Range A, utilisation'), quantity(
          `${C84_1.utilisationRangeA[0]}–${C84_1.utilisationRangeA[1]}`, { unit: 'V' })),
        kv('Total drop from the transformer', quantity(
          svc.totalDropPercent.toFixed(2), { unit: '% of 120 V' })),
        kv('Drawing now', quantity(svc.branchCurrentA.toFixed(2), { symbol: 'I', unit: 'A' })),
      ]));
    }
    rows.push(
      `<div class="inspect__actions">` +
      `<button class="btn" data-action="math" data-kind="site" ` +
      `data-id="${escapeHtml(id)}">Show the working</button></div>`
    );
    this.body.innerHTML = rows.join('');
  }

  // -----------------------------------------------------------------------
  // A circuit
  // -----------------------------------------------------------------------

  private renderCircuit(
    br: Branch, flow: BranchFlow, solved: SolvedCase, snap: AppSnapshot
  ): void {
    const from = solved.net.buses.find((b) => b.id === br.from)!;
    const to = solved.net.buses.find((b) => b.id === br.to)!;
    const baseMVA = solved.net.baseMVA;
    const kV = from.baseKV;
    const zBase = (kV * kV) / baseMVA;
    const cls = voltageClass(kV);
    const out = !br.inService;
    const over = flow.loading > 1;

    this.title.textContent = br.kind === 'transformer' ? 'Transformer' : 'Circuit';
    this.sub.textContent = cls.label;

    const rows: string[] = [];

    rows.push(`<h3 class="inspect__name">${escapeHtml(br.name)}</h3>`);

    // --- state --------------------------------------------------------------
    if (out) {
      rows.push(
        `<p class="inspect__alarm">Out of service. It carries nothing, and the ` +
        `power it was carrying has gone somewhere else — which is the point of ` +
        `a meshed network.</p>`
      );
    } else if (over) {
      rows.push(
        `<p class="inspect__alarm">Over its rating: ${(flow.loading * 100).toFixed(0)} % ` +
        `of ${br.ratingMVA.toFixed(0)} MVA. Left like this the conductor would ` +
        `heat, weaken and sag.</p>`
      );
    }

    // --- what is flowing ----------------------------------------------------
    rows.push(section('Flowing now', [
      kv(term('real-power', 'Real power'), quantity(
        flow.pFromMW.toFixed(1), { symbol: 'P', unit: 'MW' })),
      kv(term('reactive-power', 'Reactive power'), quantity(
        flow.qFromMVAr.toFixed(1), { symbol: 'Q', unit: 'MVAr' })),
      kv(term('apparent-power', 'Apparent power'), quantity(
        flow.sMaxMVA.toFixed(1), { symbol: '|S|', unit: 'MVA' })),
      kv('Current', quantity(flow.iFromAmps.toFixed(0), { symbol: 'I', unit: 'A' })),
      kv('Direction', out ? '—' :
        `${escapeHtml(siteName(br.from))} → ${escapeHtml(siteName(br.to))}`,
        flow.direction === 'reverse'),
      kv(term('phase-angle', 'Angle across'), quantity(
        flow.angleDiffDeg.toFixed(2), { symbol: 'θ₁−θ₂', unit: '°' })),
      kv('Loading', quantity((flow.loading * 100).toFixed(1), { unit: '% of rating' }), over),
      kv('Losses', quantity(flow.pLossMW.toFixed(2), { symbol: 'P_loss', unit: 'MW' })),
    ]));

    // --- how it is built ----------------------------------------------------
    if (br.kind === 'line' && br.conductor && br.lengthKm) {
      const cond = CONDUCTORS[br.conductor];
      const tower = kV >= 500 ? 'ehv-500-horizontal' : kV >= 230 ? 'hv-230-vertical'
        : kV >= 100 ? 'hv-115-vertical' : 'dist-12-crossarm';
      const p = lineParameters(br.conductor, tower);
      const { silMW } = surgeImpedance(p, kV);
      const load = loadabilityLimitMW(br.lengthKm, silMW);
      const thermalMVA = (Math.sqrt(3) * kV * p.ampacityA) / 1000;

      rows.push(section('How it is built', [
        kv('Length', quantity(br.lengthKm.toFixed(0), { unit: 'km' })),
        kv('Conductor', `${escapeHtml(cond.name)} ${cond.kcmil} kcmil, ` +
          `${p.tower.bundleN} per phase`),
        kv(term('thermal-limit', 'Thermal rating'), quantity(
          thermalMVA.toFixed(0), { unit: 'MVA' })),
        kv(term('loadability', 'Loadability limit'),
          load.limitMW === Infinity ? 'not binding — the line is short'
            : quantity(load.limitMW.toFixed(0), { unit: 'MW' })),
        kv(term('sil', 'Surge impedance loading'), quantity(
          silMW.toFixed(0), { symbol: 'SIL', unit: 'MW' })),
        kv('Rated at', quantity(br.ratingMVA.toFixed(0), { unit: 'MVA' })),
      ]));
      if (load.limitMW < thermalMVA) {
        rows.push(note(
          `The metal could carry ${thermalMVA.toFixed(0)} MVA, but this line is ` +
          `${br.lengthKm.toFixed(0)} km long, and past about ` +
          `${load.limitMW.toFixed(0)} MW the voltage at the far end falls out of ` +
          `range and the machines at each end get uncomfortably close to falling ` +
          `out of step. Length, not copper, is the limit here.`
        ));
      }
    } else if (br.kind === 'transformer') {
      rows.push(section('How it is built', [
        kv('Ratio', `${from.baseKV} / ${to.baseKV} kV`),
        kv('Rating', quantity(br.ratingMVA.toFixed(0), { unit: 'MVA' })),
        kv(term('vector-group', 'Vector group'), escapeHtml(br.vectorGroup ?? '—')),
        ...(br.tap && br.tap !== 1
          ? [kv(term('tap-changer', 'Tap'), quantity(br.tap.toFixed(4), { unit: 'ratio' }))]
          : []),
      ]));
    }

    // --- the impedance, in both ---------------------------------------------
    rows.push(section(`Impedance`, [
      kv(`${term('resistance', 'Resistance')} R`, bothUnits(br.r, zBase, 'Ω')),
      kv(`${term('reactance', 'Reactance')} X`, bothUnits(br.x, zBase, 'Ω')),
      ...(br.b !== 0 ? [kv('Charging B', bothUnits(br.b, 1 / zBase, 'S'))] : []),
      kv(term('x-over-r', 'X/R'), quantity((br.x / (br.r || 1e-9)).toFixed(1), {})),
    ]));
    rows.push(note(
      `Per-unit values are on a ${baseMVA} MVA, ${kV} kV base, so ` +
      `Z<sub>base</sub> = ${kV}² / ${baseMVA} = ${zBase.toFixed(1)} Ω.`
    ));

    // --- actions -------------------------------------------------------------
    rows.push(
      `<div class="inspect__actions">` +
      `<button class="btn" data-action="trip" data-id="${escapeHtml(br.id)}">` +
      `${snap.tripped.has(br.id) ? 'Put back in service' : 'Trip this circuit'}</button>` +
      `<button class="btn btn--quiet" data-action="math" data-kind="circuit" ` +
      `data-id="${escapeHtml(br.id)}">Show the working</button>` +
      `</div>`
    );

    this.body.innerHTML = rows.join('');
  }

  // -----------------------------------------------------------------------
  // A site
  // -----------------------------------------------------------------------

  private renderSite(node: SiteNode, solved: SolvedCase, snap: AppSnapshot): void {
    this.title.textContent = node.site.kind === 'plant' ? 'Power plant'
      : node.site.kind === 'intertie' ? 'Intertie'
      : node.site.kind === 'city' ? 'Load centre' : 'Substation';
    this.sub.textContent = node.site.region;

    const rows: string[] = [];
    rows.push(`<h3 class="inspect__name">${escapeHtml(node.site.name)}</h3>`);
    rows.push(`<p class="note">${escapeHtml(node.site.note)}</p>`);

    // --- the buses here ------------------------------------------------------
    const busRows = node.buses
      .slice()
      .sort((a, b) => b.kV - a.kV)
      .map(({ id }) => {
        const r = solved.busById.get(id);
        const bus = solved.net.buses.find((b) => b.id === id) as Bus;
        if (!r) return '';
        const alarm = r.voltageViolation != null;
        return kv(
          `${bus.baseKV} kV · ${term(busTypeTerm(r.type), r.type)}`,
          `${quantity(r.vpu.toFixed(4), { symbol: '|V|', unit: 'pu' })} ` +
          `<span class="quantity__unit">= ${(r.vkV).toFixed(1)} kV</span>`,
          alarm
        );
      });
    rows.push(section(`${term('bus', 'Buses')} here`, busRows));

    // --- generation ----------------------------------------------------------
    const gens = solved.net.generators.filter(
      (g) => node.buses.some((b) => b.id === g.bus) && g.inService
    );
    if (gens.length > 0) {
      let totalP = 0;
      let totalCap = 0;
      const gRows = gens.map((g) => {
        totalP += g.pMW;
        totalCap += g.pMaxMW;
        const pct = g.pMaxMW > 0 ? (g.pMW / g.pMaxMW) * 100 : 0;
        return kv(
          escapeHtml(g.name),
          `${quantity(formatMW(g.pMW), {})} <span class="quantity__unit">` +
          `of ${formatMW(g.pMaxMW)} · ${pct.toFixed(0)} %</span>`
        );
      });
      rows.push(section('Generating', gRows));
      rows.push(note(
        `${formatMW(totalP)} out of ${formatMW(totalCap)} installed. ` +
        (totalP < totalCap * 0.2
          ? 'Most of the capacity here is idle at this hour — either the resource ' +
            'is not there, or the ' + term('merit-order', 'merit order') +
            ' has not reached it.'
          : 'This site is working hard at this hour.')
      ));
    }

    // --- load ----------------------------------------------------------------
    const loadMW = node.buses.reduce(
      (s, b) => s + (solved.busById.get(b.id)?.pLoadMW ?? 0), 0);
    const loadMVAr = node.buses.reduce(
      (s, b) => s + (solved.busById.get(b.id)?.qLoadMVAr ?? 0), 0);
    if (loadMW > 0.5) {
      const pf = loadMW / Math.hypot(loadMW, loadMVAr);
      rows.push(section('Demand', [
        kv(term('real-power', 'Real power'), quantity(loadMW.toFixed(0), { symbol: 'P', unit: 'MW' })),
        kv(term('reactive-power', 'Reactive power'), quantity(loadMVAr.toFixed(0), { symbol: 'Q', unit: 'MVAr' })),
        kv(term('power-factor', 'Power factor'), quantity(pf.toFixed(3), { symbol: 'cos φ' })),
      ]));
      rows.push(note(
        `${formatMW(loadMW)} is roughly what ` +
        `${Math.round(loadMW * 750).toLocaleString()} homes draw on an average day.`
      ));
    }

    // --- circuits ------------------------------------------------------------
    const busIds = new Set(node.buses.map((b) => b.id));
    const connected = solved.net.branches
      .filter((b) => b.kind === 'line' && (busIds.has(b.from) || busIds.has(b.to)))
      .map((b) => ({ b, f: solved.branchById.get(b.id)! }))
      .sort((a, x) => Math.abs(x.f.pFromMW) - Math.abs(a.f.pFromMW))
      .slice(0, 10);
    if (connected.length > 0) {
      rows.push(section('Circuits from here', connected.map(({ b, f }) => {
        const outward = busIds.has(b.from);
        const mw = outward ? f.pFromMW : f.pToMW;
        const other = outward ? b.to : b.from;
        return (
          `<dt><span class="link" data-action="select" data-kind="circuit" ` +
          `data-id="${escapeHtml(b.id)}">${escapeHtml(siteName(other))}</span></dt>` +
          `<dd class="${f.loading > 1 ? 'is-alarm' : ''}">` +
          `${mw >= 0 ? '→' : '←'} ${Math.abs(mw).toFixed(0)} MW` +
          `<span class="quantity__unit"> ${(f.loading * 100).toFixed(0)} %</span></dd>`
        );
      })));
    }

    rows.push(
      `<div class="inspect__actions">` +
      `<button class="btn" data-action="math" data-kind="site" ` +
      `data-id="${escapeHtml(node.site.id)}">Show the working</button></div>`
    );

    void snap;
    this.body.innerHTML = rows.join('');
  }
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const busTypeTerm = (t: string): string =>
  t === 'slack' ? 'slack-bus' : t === 'PV' ? 'pv-bus' : 'pq-bus';

const siteName = (busId: string): string => {
  const s = SITES[busId.split('_')[0].toLowerCase()];
  return s ? s.name : busId;
};

function section(heading: string, rows: string[]): string {
  return (
    `<section class="inspect__section">` +
    `<h4 class="inspect__heading">${heading}</h4>` +
    `<dl class="kv">${rows.join('')}</dl></section>`
  );
}

function kv(label: string, value: string, alarm = false): string {
  return `<dt>${label}</dt><dd class="${alarm ? 'is-alarm' : ''}">${value}</dd>`;
}

function note(html: string): string {
  return `<p class="note">${html}</p>`;
}

/**
 * A quantity in per-unit AND in physical units, with the base stated.
 *
 * The brief requires these together and never alone, and it is right: the
 * per-unit number is the one the arithmetic uses, the physical one is the one
 * that means something, and neither is complete without the other.
 */
function bothUnits(pu: number, base: number, unit: string): string {
  const physical = pu * base;
  return (
    `<span class="quantity__value num">${pu.toFixed(5)}</span>` +
    `<span class="quantity__unit">pu</span>` +
    `<span class="quantity__unit">= ${physical.toPrecision(4)} ${unit}</span>`
  );
}

/**
 * Every voltage-drop step between the transformer and a given point.
 *
 * The runs are in order, so "up to here" is a prefix of the list — which is
 * also the order an electrician would work them in.
 */
function chainUpTo(nodeId: string, chain: DropStep[]): DropStep[] {
  const order = SERVICE_RUNS.map((r) => `${r.from}_${r.to}`);
  const out: DropStep[] = [];
  for (const runId of order) {
    const step = chain.find((s) => s.runId === runId);
    if (!step) continue;
    out.push(step);
    if (runId.endsWith(`_${nodeId}`)) return out;
  }
  return nodeId === 'PAD' ? [] : out;
}

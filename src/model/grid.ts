import { Complex } from '../physics/complex';
import { lineConstants, stClairMultiple, surge, type LineConstants } from '../physics/lineconstants';
import type { PFBranch, PFBus, PFCase, PFGen } from '../physics/pf/case';
import { CONSTRUCTIONS, type ConstructionId } from '../data/towers';
import { HVDC, LINES, LOADS, SITES, TRANSFORMERS, type HvdcRecord, type LoadRecord, type Site } from '../data/ca/network';
import { PLANTS, type PlantRecord } from '../data/ca/plants';
import { TECH, type Technology } from '../data/tech';
import { greatCircleKm, project } from './geo';

/**
 * The synthetic California grid, assembled from the data files into buses,
 * branches, generators, loads and shunts, and convertible to a per-unit PFCase.
 *
 * Per-unit bases: S_base = 100 MVA for the whole system; each bus's voltage base is
 * its nominal line-to-line kV; Z_base = kV² / S_base.
 */
export const S_BASE = 100;

/** Emergency rating as a multiple of normal (typical of utility practice; estimate). */
export const EMERGENCY_LINE = 1.2;
export const EMERGENCY_XFMR = 1.25;

export interface GridBus {
  id: string;
  index: number;
  site: Site;
  kv: number;
  /** Position in the system frame, km (east, south). */
  x: number;
  z: number;
  /** A generator terminal bus inside a plant (not a substation bus). */
  terminalOf?: string;
}

export interface LineParams {
  lengthKm: number;
  construction: ConstructionId;
  constants: LineConstants;
  /** Surge impedance Z_c (Ω) and surge impedance loading (MW). */
  zc: number;
  silMW: number;
  /** St. Clair practical loadability at this length, MW. */
  stClairMW: number;
  /** Series impedance and shunt admittance of the whole line (exact π), Ω and S. */
  zTotal: Complex;
  yTotal: Complex;
}

export interface TransformerParams {
  mva: number;
  xPct: number;
  xr: number;
  vectorGroup: string;
  hvKV: number;
  lvKV: number;
}

export interface GridBranch {
  id: string;
  index: number;
  kind: 'line' | 'transformer';
  name: string;
  from: GridBus;
  to: GridBus;
  kv: number;
  circuit: number;
  circuitsInCorridor: number;
  /** Continuous (normal) thermal rating, MVA. */
  rateMVA: number;
  /**
   * Emergency rating, MVA: what the branch may carry for a limited time (hours) after
   * a contingency, while operators redispatch. N-1 security is judged against it.
   */
  rateEmergencyMVA: number;
  /** Per unit on S_base: series r, x and total charging b. */
  r: number;
  x: number;
  b: number;
  line?: LineParams;
  xfmr?: TransformerParams;
  pathName?: string;
  note?: string;
}

export interface GridGen {
  id: string;
  index: number;
  plant: PlantRecord;
  tech: Technology;
  bus: GridBus;
  /** Share of the plant this generator is (1 unless the plant is modelled unit by unit). */
  share: number;
  unitName?: string;
  pmaxMW: number;
  pminMW: number;
  qmaxMVAr: number;
  qminMVAr: number;
  vset: number;
  regulates: boolean;
}

export interface GridLoad {
  rec: LoadRecord;
  bus: GridBus;
}

export interface GridShunt {
  bus: GridBus;
  /** Size of one step, MVAr at 1.0 pu (positive: capacitor, negative: reactor). */
  stepMVAr: number;
  steps: number;
  vLow: number;
  vHigh: number;
}

export interface GridHvdc {
  rec: HvdcRecord;
  from: GridBus;
  to: GridBus;
}

export class Grid {
  readonly buses: GridBus[] = [];
  readonly branches: GridBranch[] = [];
  readonly gens: GridGen[] = [];
  readonly loads: GridLoad[] = [];
  readonly shunts: GridShunt[] = [];
  readonly hvdc: GridHvdc[] = [];
  readonly busById = new Map<string, GridBus>();
  readonly branchById = new Map<string, GridBranch>();
  readonly genById = new Map<string, GridGen>();
  readonly sites = SITES;
  /** Angle reference bus id (the choice is arbitrary; angles are relative to it). */
  readonly refBus = 'TESLA-500';

  constructor() {
    const siteById = new Map(SITES.map((s) => [s.id, s]));
    // ---- buses
    for (const s of SITES) {
      const [x, z] = project(s.lat, s.lon);
      for (const kv of s.kv) this.addBus({ id: `${s.id}-${kv}`, index: 0, site: s, kv, x, z });
    }
    // ---- lines (one branch per circuit)
    const constCache = new Map<ConstructionId, LineConstants>();
    for (const rec of LINES) {
      const a = siteById.get(rec.from)!;
      const b = siteById.get(rec.to)!;
      const from = this.bus(`${rec.from}-${rec.kv}`);
      const to = this.bus(`${rec.to}-${rec.kv}`);
      const len = rec.lengthKm ?? greatCircleKm(a.lat, a.lon, b.lat, b.lon) * (rec.routeFactor ?? 1.15);
      let lc = constCache.get(rec.construction);
      if (!lc) constCache.set(rec.construction, (lc = lineConstants(CONSTRUCTIONS[rec.construction].wires)));
      const { zc, sil } = surge(lc.z1, lc.y1, rec.kv);
      const { zTotal, yTotal } = exactPi(lc.z1, lc.y1, len);
      const zb = (rec.kv * rec.kv) / S_BASE;
      const thermal = (Math.sqrt(3) * rec.kv * lc.ampacity) / 1000;
      for (let c = 1; c <= rec.circuits; c++) {
        const id = `${rec.from}–${rec.to} ${rec.kv} #${c}`;
        this.addBranch({
          id,
          index: 0,
          kind: 'line',
          name: `${a.name} – ${b.name} ${rec.kv} kV${rec.circuits > 1 ? ` #${c}` : ''}`,
          from,
          to,
          kv: rec.kv,
          circuit: c,
          circuitsInCorridor: rec.circuits,
          rateMVA: rec.rateMVA ?? thermal,
          rateEmergencyMVA: (rec.rateMVA ?? thermal) * EMERGENCY_LINE,
          r: zTotal.re / zb,
          x: zTotal.im / zb,
          b: yTotal.im * zb,
          line: {
            lengthKm: len,
            construction: rec.construction,
            constants: lc,
            zc,
            silMW: sil,
            stClairMW: stClairMultiple(len) * sil,
            zTotal,
            yTotal,
          },
          ...(rec.name ? { pathName: rec.name } : {}),
          ...(rec.note ? { note: rec.note } : {}),
        });
      }
    }
    // ---- transformer banks (one branch per bank)
    for (const t of TRANSFORMERS) {
      const hv = this.bus(`${t.site}-${t.hvKV}`);
      const lv = this.bus(`${t.site}-${t.lvKV}`);
      const x = (t.xPct / 100) * (S_BASE / t.mva);
      for (let k = 1; k <= t.banks; k++) {
        this.addBranch({
          id: `${t.site} ${t.hvKV}/${t.lvKV} #${k}`,
          index: 0,
          kind: 'transformer',
          name: `${hv.site.name} ${t.hvKV}/${t.lvKV} kV bank ${k}`,
          from: hv,
          to: lv,
          kv: t.hvKV,
          circuit: k,
          circuitsInCorridor: t.banks,
          rateMVA: t.mva,
          rateEmergencyMVA: t.mva * EMERGENCY_XFMR,
          r: x / t.xr,
          x,
          b: 0,
          xfmr: { mva: t.mva, xPct: t.xPct, xr: t.xr, vectorGroup: t.vectorGroup, hvKV: t.hvKV, lvKV: t.lvKV },
        });
      }
    }
    // ---- generators (and unit terminal buses with their step-up transformers)
    for (const p of PLANTS) {
      const tech = TECH[p.tech];
      const bus = this.bus(p.bus);
      const units = p.units ?? [{ id: '', name: '', share: 1, terminalKV: 0, gsuMVA: 0, gsuXPct: 0 }];
      for (const u of units) {
        let gbus = bus;
        if (u.id) {
          gbus = this.addBus({
            id: `${bus.site.id}-${p.id}-${u.id}`,
            index: 0,
            site: bus.site,
            kv: u.terminalKV,
            x: bus.x,
            z: bus.z,
            terminalOf: p.id,
          });
          const x = (u.gsuXPct / 100) * (S_BASE / u.gsuMVA);
          this.addBranch({
            id: `${p.id}-${u.id} GSU`,
            index: 0,
            kind: 'transformer',
            name: `${p.name} ${u.name} step-up ${u.terminalKV}/${bus.kv} kV`,
            from: bus,
            to: gbus,
            kv: bus.kv,
            circuit: 1,
            circuitsInCorridor: 1,
            rateMVA: u.gsuMVA,
            rateEmergencyMVA: u.gsuMVA * EMERGENCY_XFMR,
            r: x / 50,
            x,
            b: 0,
            xfmr: { mva: u.gsuMVA, xPct: u.gsuXPct, xr: 50, vectorGroup: 'YNd1', hvKV: bus.kv, lvKV: u.terminalKV },
          });
        }
        const pmax = p.mw * u.share;
        const pmin = p.pminMW !== undefined ? p.pminMW * u.share : Math.max(0, tech.pminFrac) * pmax;
        const syncon = p.tech === 'syncon';
        const qmax = syncon ? (p.mvar ?? 0) : pmax * Math.tan(Math.acos(tech.pfLag)) * (p.tech === 'import_ac' ? 1.5 : 1);
        const qmin = syncon ? -0.6 * (p.mvar ?? 0) : -pmax * Math.tan(Math.acos(tech.pfLead)) * (p.tech === 'import_ac' ? 1.5 : 1);
        const vset = gbus.terminalOf ? 1.02 : gbus.kv >= 345 ? 1.05 : gbus.kv >= 200 ? 1.03 : 1.02;
        const regulates = tech.synchronous;
        const g: GridGen = {
          id: u.id ? `${p.id}-${u.id}` : p.id,
          index: this.gens.length,
          plant: p,
          tech,
          bus: gbus,
          share: u.share,
          pmaxMW: pmax,
          pminMW: p.tech === 'battery' ? -pmax : pmin,
          qmaxMVAr: qmax,
          qminMVAr: qmin,
          vset,
          regulates,
          ...(u.name ? { unitName: u.name } : {}),
        };
        this.gens.push(g);
        this.genById.set(g.id, g);
      }
    }
    // ---- loads
    for (const l of LOADS) this.loads.push({ rec: l, bus: this.bus(l.bus) });
    // ---- HVDC
    for (const h of HVDC) this.hvdc.push({ rec: h, from: this.bus(h.from), to: this.bus(h.to) });
    // ---- switched shunts, sized by rule (see docs/model.md)
    this.sizeShunts();
  }

  private addBus(b: GridBus): GridBus {
    b.index = this.buses.length;
    this.buses.push(b);
    this.busById.set(b.id, b);
    return b;
  }

  private addBranch(b: GridBranch): GridBranch {
    b.index = this.branches.length;
    this.branches.push(b);
    this.branchById.set(b.id, b);
    return b;
  }

  bus(id: string): GridBus {
    const b = this.busById.get(id);
    if (!b) throw new Error(`unknown bus ${id}`);
    return b;
  }

  /**
   * Reactors at 500 kV buses absorb part of the charging of the long lines that
   * land there (so light-load voltages stay in range); capacitor banks at load
   * buses supply part of the load's reactive demand at peak. Both switch in steps
   * under a voltage-band controller.
   */
  private sizeShunts(): void {
    const charging = new Map<GridBus, number>();
    for (const br of this.branches) {
      if (br.kind !== 'line') continue;
      const q = (br.b * S_BASE) / 2; // MVAr at 1.0 pu at each end
      charging.set(br.from, (charging.get(br.from) ?? 0) + q);
      charging.set(br.to, (charging.get(br.to) ?? 0) + q);
    }
    for (const b of this.buses) {
      if (b.kv < 345) continue;
      const q = charging.get(b) ?? 0;
      const steps = Math.round((0.6 * q) / 100);
      if (steps > 0) this.shunts.push({ bus: b, stepMVAr: -100, steps, vLow: 1.02, vHigh: 1.08 });
    }
    for (const l of this.loads) {
      const qPeak = l.rec.peakMW * Math.tan(Math.acos(l.rec.pf));
      const steps = Math.round((1.1 * qPeak) / 50);
      if (steps > 0 && l.bus.kv >= 100) this.shunts.push({ bus: l.bus, stepMVAr: 50, steps, vLow: 0.99, vHigh: 1.045 });
    }
  }

  /**
   * The static per-unit case: topology and impedances, loads and dispatch zeroed.
   * Callers fill pd/qd/pg for an operating point.
   */
  baseCase(): PFCase {
    const buses: PFBus[] = this.buses.map((b) => ({
      type: b.id === this.refBus ? 'REF' : 'PQ',
      pd: 0,
      qd: 0,
      gs: 0,
      bs: 0,
      baseKV: b.kv,
      vmax: b.kv >= 345 ? 1.1 : 1.05,
      vmin: b.kv >= 345 ? 0.95 : 0.95,
    }));
    const branches: PFBranch[] = this.branches.map((br) => ({
      from: br.from.index,
      to: br.to.index,
      r: br.r,
      x: br.x,
      b: br.b,
      tap: 1,
      shift: 0,
      inService: true,
      rateMVA: br.rateMVA,
    }));
    const gens: PFGen[] = this.gens.map((g) => ({
      bus: g.bus.index,
      pg: 0,
      qg: 0,
      qmax: g.qmaxMVAr / S_BASE,
      qmin: g.qminMVAr / S_BASE,
      vg: g.vset,
      pmax: g.pmaxMW / S_BASE,
      pmin: g.pminMW / S_BASE,
      inService: true,
      participation: 0,
      regulates: g.regulates,
    }));
    return { baseMVA: S_BASE, buses, branches, gens };
  }
}

/**
 * Exact (long-line) π equivalent: with propagation constant γ = √(z·y) and surge
 * impedance Z_c = √(z/y), the series branch is Z′ = Z_c·sinh(γℓ) and each shunt
 * half is Y′/2 = tanh(γℓ/2)/Z_c. For short lines this reduces to Z′ = zℓ, Y′ = yℓ.
 */
export function exactPi(z: Complex, y: Complex, lengthKm: number): { zTotal: Complex; yTotal: Complex } {
  const gl = z.mul(y).sqrt().scale(lengthKm);
  const zc = z.div(y).sqrt();
  const sinh = (v: Complex) => v.exp().sub(v.neg().exp()).scale(0.5);
  const tanh = (v: Complex) => {
    const e2 = v.scale(2).exp();
    return e2.sub(Complex.ONE).div(e2.add(Complex.ONE));
  };
  const zTotal = zc.mul(sinh(gl));
  const yHalf = tanh(gl.scale(0.5)).div(zc);
  return { zTotal, yTotal: yHalf.scale(2) };
}


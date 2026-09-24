import type { Snapshot } from './snapshot';
import type { Feeder } from './feeder';
import { homePV, HOME_PV, nodeIndex } from './feeder';
import { COMPONENTS } from '../data/components';

/**
 * A home's rooftop solar inverter in a solved interval. The panels make direct current;
 * the inverter's four switches (an H-bridge) connect them to the line one way round,
 * then the other, in pulses whose widths follow a sine (pulse-width modulation), and an
 * inductor smooths the pulses into a sine current, pushed out in step with the line's
 * voltage (unity power factor) at 240 V leg to leg.
 *
 * The AC power is the solver's (the home's solar load, negative); the DC power comes
 * from the same array model before the inverter's losses; the rest follows:
 *
 *     I_dc = P_dc / V_dc        |I_ac| = P_ac / |V_12|        m = √2 |V_12| / V_dc
 *
 * A single-phase output's power pulses at twice the line frequency, from nothing to
 * twice its average; the panels' power is steady. The DC link's capacitors take in
 * the difference and give it back, a hundred and twenty times a second.
 */

export interface InvState {
  t: number;
  hour: number;
  homeId: string;
  /** The inverter's AC rating, kW. */
  ratingKW: number;
  /** Sun on the panels, W/m²; cell temperature, °C; clipped at the rating? */
  poa: number;
  tCell: number;
  clipped: boolean;
  /** DC power the panels could give now, W (more than is taken when the inverter clips at its rating). */
  pAvail: number;
  /** DC power taken from the panels, AC power out (the solver's), and the loss between, W. */
  pDC: number;
  pAC: number;
  loss: number;
  /** DC link voltage, V, and the panels' current, A. */
  vdc: number;
  idc: number;
  /** The line: leg-to-leg voltage (RMS), V, and its angle, degrees; the current out (RMS), A, in phase with it. */
  v12: number;
  deg12: number;
  iac: number;
  /** Modulation index: the sine's peak over the DC link's voltage. */
  m: number;
  /** Through the meter (positive: bought from the grid) and the home's own use, W. */
  meter: number;
  use: number;
  /** All of California's rooftop solar in this interval, MW. */
  btmMW: number;
  prov: { pAC: string; V: string; meter: string; btm: string };
}

export function invState(s: Snapshot, f: Feeder, homeId: string): InvState | null {
  const fd = s.feeder;
  const h = f.layout.homes.find((x) => x.id === homeId);
  if (!fd || !h || s.outcome === 'none') return null;
  const t = s.t;
  const pv = homePV(fd.hour);
  let pAC = 0;
  let meter = 0;
  fd.loadIds.forEach((lid, i) => {
    if (!lid.startsWith(`${homeId}:`)) return;
    meter += fd.loadP[i]!;
    if (lid === `${homeId}:PV`) pAC = -fd.loadP[i]!;
  });
  const i = nodeIndex(f).get(homeId)!;
  const re = fd.V[i * 6]! - fd.V[i * 6 + 2]!;
  const im = fd.V[i * 6 + 1]! - fd.V[i * 6 + 3]!;
  const v12 = Math.hypot(re, im);
  const vdc = COMPONENTS.inverter.vdc;
  // the inverter takes what it can pass: at its rating it holds the panels off their best point
  const pDC = pAC / HOME_PV.inverterEff;
  return {
    t,
    hour: fd.hour,
    homeId,
    ratingKW: h.pvKW,
    poa: pv.poa,
    tCell: pv.tCell,
    clipped: pv.clipped,
    pAvail: pAC > 0 ? h.pvKW * 1000 * pv.pdc : 0,
    pDC,
    pAC,
    loss: pDC - pAC,
    vdc,
    idc: pDC / vdc,
    v12,
    deg12: (Math.atan2(im, re) * 180) / Math.PI,
    iac: v12 > 0 ? pAC / v12 : 0,
    m: (Math.SQRT2 * v12) / vdc,
    meter,
    use: meter + pAC,
    btmMW: s.btmMW,
    prov: { pAC: `solver:t${t}.feeder.load.${homeId}.PV`, V: `solver:t${t}.feeder.V.${homeId}.12`, meter: `solver:t${t}.feeder.meter.${homeId}`, btm: `solver:t${t}.btmMW` },
  };
}

/** The inverter's efficiency as the array model has it. */
export const INVERTER_EFF = HOME_PV.inverterEff;

/**
 * The drawn switching at real time τ (s): the reference sine (per unit of V_dc), the
 * triangle carrier, which pair of switches conducts (+1: S1 and S4, −1: S2 and S3), the
 * line voltage and the output current (instantaneous, V and A), and the power out, W.
 */
export function invWave(st: InvState, tau: number): { ref: number; tri: number; leg: 1 | -1; v: number; i: number; p: number } {
  const w = 2 * Math.PI * COMPONENTS.fHz;
  const th = (st.deg12 * Math.PI) / 180;
  const ref = st.m * Math.cos(w * tau + th);
  // a triangle wave between −1 and 1, `drawnCarrier` periods a cycle
  const x = (tau * COMPONENTS.fHz * COMPONENTS.inverter.drawnCarrier) % 1;
  const tri = x < 0.5 ? 4 * x - 1 : 3 - 4 * x;
  const v = Math.SQRT2 * st.v12 * Math.cos(w * tau + th);
  const i = Math.SQRT2 * st.iac * Math.cos(w * tau + th);
  return { ref, tri, leg: ref >= tri ? 1 : -1, v, i, p: v * i };
}

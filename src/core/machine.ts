/**
 * The synchronous machine.
 *
 * Almost every watt on the system comes out of one of these, and the whole
 * behaviour of a power grid — why frequency means something, why reactive power
 * has a limit, why a fault a hundred kilometres away can pull a plant out of
 * step — follows from how one works.
 *
 * THE ONE EQUATION EVERYTHING HERE COMES FROM
 *
 * A round-rotor synchronous generator, in steady state, behaves as an internal
 * voltage behind a reactance:
 *
 *     E∠δ = V∠0 + j·X_d · I
 *
 * E is the voltage the field current produces, V is the terminal voltage, X_d
 * is the synchronous reactance, and δ — the LOAD ANGLE — is how far the rotor
 * has been dragged ahead of the terminal voltage phasor by the mechanical
 * torque on its shaft.
 *
 * Take V as the reference and work out the complex power S = V·I*:
 *
 *     P = (V·E / X_d) · sin δ
 *     Q = (V·E / X_d) · cos δ − V² / X_d
 *
 * Those two lines contain most of what an operator needs to know.
 *
 *  - REAL POWER FOLLOWS THE ANGLE. Open the fuel valve and the rotor advances;
 *    δ grows and P grows with it. Nothing about the field has changed.
 *  - REACTIVE POWER FOLLOWS THE FIELD. Raise E above V and the machine exports
 *    reactive power; drop it below and the machine absorbs it. Nothing about
 *    the fuel has changed.
 *  - The two are almost independent, which is why a plant has two separate
 *    controls and why the power flow treats them as separate knobs.
 *
 * And read as a locus: eliminate δ, and (P, Q) for a fixed E lies on a circle
 * centred at (0, −V²/X_d) with radius V·E/X_d. That circle is the field limit
 * of the capability curve below.
 */

import { Generator } from './network.js';

/** How the machine is being run right now, in the units an operator uses. */
export interface MachineOperatingPoint {
  /** Terminal voltage, per-unit on the machine's own base. */
  vPU: number;
  /** Real and reactive output, MW and MVAr. */
  pMW: number;
  qMVAr: number;
  /** The same in per-unit on the machine base. */
  pPU: number;
  qPU: number;
  /** Internal EMF behind the synchronous reactance, per-unit. */
  ePU: number;
  /** Load angle δ, degrees: how far the rotor leads the terminal voltage. */
  deltaDeg: number;
  /** Power factor at the terminals, and which way it is. */
  powerFactor: number;
  overExcited: boolean;
  /** Armature current, per-unit and in amperes at the machine's terminals. */
  iPU: number;
  /** Apparent power, MVA, against the machine's nameplate. */
  sMVA: number;
  loading: number;
}

/**
 * Where the machine is operating, from its terminal voltage and its output.
 *
 * Everything here is inverted out of the two equations above. Nothing is
 * assumed: given V, P and Q, the internal EMF and the load angle are
 * determined, and this computes them rather than looking them up.
 */
export function operatingPoint(
  g: Generator, vPU: number, pMW: number, qMVAr: number
): MachineOperatingPoint {
  const base = g.mBaseMVA;
  const xd = g.xd ?? 1.9;
  const pPU = pMW / base;
  const qPU = qMVAr / base;

  // I = S* / V*, with V taken as the reference so V* = V.
  const iRe = vPU > 0 ? pPU / vPU : 0;
  const iIm = vPU > 0 ? -qPU / vPU : 0;

  // E = V + jX_d·I, worked out in rectangular form.
  const eRe = vPU - xd * iIm;
  const eIm = xd * iRe;

  const sMVA = Math.hypot(pMW, qMVAr);
  return {
    vPU,
    pMW, qMVAr,
    pPU, qPU,
    ePU: Math.hypot(eRe, eIm),
    deltaDeg: (Math.atan2(eIm, eRe) * 180) / Math.PI,
    powerFactor: sMVA > 0 ? Math.abs(pMW) / sMVA : 1,
    overExcited: qMVAr >= 0,
    iPU: Math.hypot(iRe, iIm),
    sMVA,
    loading: sMVA / base,
  };
}

// ---------------------------------------------------------------------------
// The capability curve
// ---------------------------------------------------------------------------

/**
 * The limits on where a synchronous generator may be operated.
 *
 * Drawn as P against Q, it is the classic D-shaped figure, and its three
 * boundaries are three different things getting too hot:
 *
 *  - the ARMATURE limit, a circle about the origin, because the stator winding
 *    carries the current that produces S and the current is what heats it;
 *  - the FIELD limit, a circle about (0, −V²/X_d), because producing reactive
 *    power means raising E, which means more field current, which heats the
 *    rotor;
 *  - the UNDER-EXCITATION limit, because with a weak field the flux in the
 *    stator end region is no longer held down by the rotor and starts heating
 *    the structural steel at the ends of the core — and because as E falls the
 *    machine approaches the angle at which it cannot hold synchronism at all.
 *
 * The first two are drawn here from the machine's own parameters. The third is
 * taken from the reactive limit in the case, because where a real machine's
 * under-excitation limiter is set depends on its end-region design rather than
 * on anything derivable.
 */
export interface CapabilityCurve {
  /** Machine base, MVA — the radius of the armature circle. */
  sRatedMVA: number;
  /** Rated power factor, which fixes where the field limit is drawn. */
  ratedPowerFactor: number;
  /** Terminal voltage the curve is drawn for, per-unit. */
  vPU: number;
  /** Synchronous reactance, per-unit on the machine base. */
  xd: number;
  /** Centre of the field-limit circle, MVAr. Always negative. */
  fieldCentreMVAr: number;
  /** Radius of the field-limit circle, MVA. */
  fieldRadiusMVA: number;
  /** Maximum internal EMF, per-unit, that the field limit corresponds to. */
  eMaxPU: number;
  /** The practical reactive limits in force, MVAr. */
  qMaxMVAr: number;
  qMinMVAr: number;
  /** Real power limits, MW. */
  pMaxMW: number;
  pMinMW: number;
  /**
   * The steady-state stability limit: the reactive power at which δ reaches 90°
   * and the machine can no longer hold synchronism, MVAr. Always negative.
   */
  stabilityLimitMVAr: number;
}

export function capabilityCurve(
  g: Generator, vPU: number, ratedPowerFactorOverride?: number
): CapabilityCurve {
  const base = g.mBaseMVA;
  const xd = g.xd ?? 1.9;
  /**
   * The machine's rated power factor, read out of the case rather than assumed.
   *
   * A generator's MVA base and its MW rating are not the same number, and the
   * ratio between them IS its rated power factor: 1,000 MW on an 1,111 MVA
   * base is a machine rated at 0.9. Taking that from the case guarantees the
   * capability curve and the dispatch agree about what the machine is, which a
   * second hard-coded constant here would not.
   */
  const ratedPowerFactor = ratedPowerFactorOverride
    ?? Math.min(1, g.pMaxMW / base);

  // The field limit is drawn through the machine's RATED point: rated MVA at
  // rated power factor, at RATED TERMINAL VOLTAGE. That is the definition —
  // the field winding is sized to hold the rotor at exactly that condition
  // without cooking.
  //
  // What comes out of it is E_max, the maximum internal EMF the field can
  // produce, and E_max is a property of the WINDING. It does not change when
  // the terminal voltage sags. That matters more than it looks:
  //
  //     Q_max(V) = −V²/X_d + V·E_max/X_d
  //
  // so as V falls, the centre rises towards zero as V² while the radius
  // shrinks only as V — and the top of the circle comes DOWN. A generator
  // asked to hold up a sagging system can do less about it, not more, exactly
  // when more is needed. That is the mechanism of voltage collapse, and an
  // earlier version of this function had the sign of it backwards by rebuilding
  // the rated point at whatever voltage was asked for.
  const pRated = base * ratedPowerFactor;
  const qRated = base * Math.sqrt(1 - ratedPowerFactor * ratedPowerFactor);
  const ratedCentre = -(1 / xd) * base;
  const eMaxPU = (Math.hypot(pRated, qRated - ratedCentre) / base) * xd;

  const centre = -(vPU * vPU / xd) * base;
  const radius = ((vPU * eMaxPU) / xd) * base;

  return {
    sRatedMVA: base,
    ratedPowerFactor,
    vPU,
    xd,
    fieldCentreMVAr: centre,
    fieldRadiusMVA: radius,
    eMaxPU,
    qMaxMVAr: g.qMaxMVAr,
    qMinMVAr: g.qMinMVAr,
    pMaxMW: g.pMaxMW,
    pMinMW: g.pMinMW,
    // At δ = 90° the machine is on the vertical through the circle centre, and
    // any further advance loses synchronism. It is the absolute limit; a real
    // machine is held well inside it.
    stabilityLimitMVAr: centre,
  };
}

/**
 * The reactive power the field limit allows at a given real power, MVAr.
 *
 * The field circle, solved for Q. Returns null where the circle does not reach
 * this value of P at all, which means the field limit is not what is binding.
 */
export function fieldLimitQ(c: CapabilityCurve, pMW: number): number | null {
  const inside = c.fieldRadiusMVA * c.fieldRadiusMVA - pMW * pMW;
  if (inside < 0) return null;
  return c.fieldCentreMVAr + Math.sqrt(inside);
}

/** The reactive power the armature limit allows at a given real power, MVAr. */
export function armatureLimitQ(c: CapabilityCurve, pMW: number): number | null {
  const inside = c.sRatedMVA * c.sRatedMVA - pMW * pMW;
  if (inside < 0) return null;
  return Math.sqrt(inside);
}

/** Which limit is actually binding at a given real power, and at what Q. */
export function bindingLimit(
  c: CapabilityCurve, pMW: number
): { qMVAr: number; limit: 'field' | 'armature' | 'reactive-setting' } {
  let best: { qMVAr: number; limit: 'field' | 'armature' | 'reactive-setting' } = {
    qMVAr: c.qMaxMVAr, limit: 'reactive-setting',
  };
  const field = fieldLimitQ(c, pMW);
  if (field !== null && field < best.qMVAr) best = { qMVAr: field, limit: 'field' };
  const armature = armatureLimitQ(c, pMW);
  if (armature !== null && armature < best.qMVAr) {
    best = { qMVAr: armature, limit: 'armature' };
  }
  return best;
}

// ---------------------------------------------------------------------------
// Inertia and the swing equation
// ---------------------------------------------------------------------------

/**
 * The swing equation.
 *
 *     2H     d²δ
 *     ——  ·  ———  =  P_m − P_e        (per-unit on the machine base)
 *     ω_s    dt²
 *
 * A generator's rotor is a flywheel weighing a few hundred tonnes turning at
 * 3,000 or 3,600 revolutions a minute. H is how much kinetic energy it stores
 * per MVA of rating, in seconds — and it really is a time: H seconds is how
 * long the machine could supply its own rated output from its rotation alone.
 *
 * In steady state P_m equals P_e and nothing accelerates. The instant they stop
 * being equal — a fault, a tripped unit, a block of load switched on — the
 * difference goes into or out of the rotor, and the rotor's speed IS the
 * frequency. That is the whole reason frequency means anything: it is a
 * measurement of whether the system is generating more or less than it is
 * consuming, taken by reading the speed of some of the largest flywheels ever
 * built.
 */
export interface SwingState {
  /** Inertia constant H, MW·s per MVA. */
  h: number;
  /** Stored kinetic energy at synchronous speed, MJ. */
  storedMJ: number;
  /** Mechanical input and electrical output, MW. Equal in steady state. */
  pMechMW: number;
  pElecMW: number;
  /** Rotor acceleration for the present imbalance, electrical degrees per s². */
  accelDegPerS2: number;
  /** How long the rotor alone could carry its own rated output, seconds. */
  rideThroughS: number;
}

export function swingState(
  g: Generator, pMechMW: number, pElecMW: number, frequencyHz = 60
): SwingState {
  const h = g.inertiaH ?? 4;
  const base = g.mBaseMVA;
  const imbalancePU = (pMechMW - pElecMW) / base;
  return {
    h,
    storedMJ: h * base,
    pMechMW,
    pElecMW,
    // d²δ/dt² = (ω_s / 2H)(P_m − P_e), with ω_s in electrical degrees per
    // second: 360·f.
    accelDegPerS2: ((360 * frequencyHz) / (2 * h)) * imbalancePU,
    rideThroughS: h,
  };
}

/**
 * How fast the system frequency would fall if a given block of generation were
 * lost this instant, in hertz per second.
 *
 *     df        f₀ · ΔP
 *     ——  =  − —————————
 *     dt        2 · Σ(H·S)
 *
 * This is the swing equation applied to every machine on the system at once,
 * treating them as one rotor. It is the number that decides whether a system
 * survives losing its largest unit, and it is why an interconnection full of
 * inverters and short of spinning mass is a harder system to operate: the
 * denominator is smaller, so the same loss moves the frequency faster.
 */
export function rocof(
  machines: readonly Generator[],
  lossMW: number,
  frequencyHz = 60,
  /**
   * Inertia outside the modelled network, MJ.
   *
   * California is not an island: it is synchronously bolted to everything from
   * British Columbia to New Mexico, and every rotor in the Western
   * Interconnection resists a frequency change here. With this left at zero the
   * answer is what CALIFORNIA'S OWN rotating mass alone would give, which is
   * several times faster than what the real system sees — and saying so is more
   * useful than quietly inventing a number for the rest of the West.
   */
  externalInertiaMJ = 0
): { hzPerSecond: number; systemInertiaMJ: number; onlineMVA: number } {
  let systemInertiaMJ = 0;
  let onlineMVA = 0;
  for (const g of machines) {
    // Only machines that are actually spinning contribute. A solar farm has no
    // rotor at all; a gas turbine dispatched to zero is not synchronised.
    if (!g.inService || g.pMW <= 0) continue;
    if (!hasRotor(g.kind)) continue;
    systemInertiaMJ += (g.inertiaH ?? 4) * g.mBaseMVA;
    onlineMVA += g.mBaseMVA;
  }
  const total = systemInertiaMJ + externalInertiaMJ;
  return {
    hzPerSecond: total > 0 ? -(frequencyHz * lossMW) / (2 * total) : -Infinity,
    systemInertiaMJ: total,
    onlineMVA,
  };
}

/**
 * Whether a resource has a rotor turning in synchronism with the system.
 *
 * This distinction is the single most consequential thing about the energy
 * transition for anyone operating a grid. A steam or gas turbine is bolted to
 * the system's frequency by physics and contributes its stored energy to
 * resisting change without being asked. A solar inverter is not, and does not,
 * unless it has been deliberately programmed to imitate one.
 */
export function hasRotor(kind: Generator['kind']): boolean {
  return kind === 'gas-cc' || kind === 'gas-ct' || kind === 'nuclear' ||
    kind === 'hydro' || kind === 'geothermal';
}

/**
 * What a machine is actually producing, out of the solved case.
 *
 * REAL power is a setpoint: the dispatch decides it and the solver honours it,
 * so it is on the generator record. REACTIVE power is not. At a PV bus the
 * machine's job is to hold the voltage, and how many megavars that takes is
 * something the solver DISCOVERS — so it appears in the bus result and never
 * gets written back onto the generator. Reading `g.qMVAr` and displaying it
 * gives a stale setpoint, usually zero, which looks entirely plausible and is
 * wrong.
 *
 * Where several machines share a bus the solver produces one reactive total for
 * the bus, because from its point of view they are one injection. Splitting it
 * by machine base is the conventional apportionment and is what a plant's own
 * controls would do.
 */
export function solvedOutput(
  g: Generator,
  bus: { pGenMW: number; qGenMVAr: number } | undefined,
  allAtBus: readonly Generator[]
): { pMW: number; qMVAr: number } {
  if (!bus) return { pMW: g.pMW, qMVAr: g.qMVAr };
  const totalBase = allAtBus
    .filter((x) => x.inService)
    .reduce((a, x) => a + x.mBaseMVA, 0);
  const share = totalBase > 0 ? g.mBaseMVA / totalBase : 1;
  return { pMW: g.pMW, qMVAr: bus.qGenMVAr * share };
}

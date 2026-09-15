/**
 * No displayed number is a hardcoded constant.
 *
 * The brief asks for this test by name and says the integrity of the project
 * rests on it:
 *
 *   "Write a test that fails if any displayed quantity is a hardcoded constant
 *    rather than traceable to solver output."
 *
 * HOW IT IS ENFORCED. Every scene returns its labels as data before any of it
 * reaches a canvas, so a test can collect literally every string the drawing
 * puts on screen. Solve the network four times — four different states of the
 * system, hours apart and seasons apart — and collect the labels each time.
 *
 * Any displayed value containing a digit that is IDENTICAL across all four is
 * one of exactly two things: a genuine constant, or a number somebody typed in.
 * There is no third possibility. So this file carries a register of the genuine
 * constants, each with the reason it is allowed to be constant, and anything
 * that does not match the register fails the test.
 *
 * That register is the whole point. It is not a list of exceptions to get the
 * test green; it is the complete, reviewable statement of every fixed number
 * the interface shows. Adding to it is a deliberate act with a reason attached,
 * which is precisely the friction that keeps a hardcoded quantity from slipping
 * in.
 */

import { describe, it, expect } from 'vitest';
import { Vector3 } from 'three';
import { californiaCase, SLACK_BUS } from '../src/data/california/network.js';
import { operate } from '../src/sim/operate.js';
import { DAY_PROFILES, Season } from '../src/sim/profiles.js';
import { dispatchDay, applyDispatch } from '../src/sim/dispatch.js';
import { SolvedCase } from '../src/core/results.js';
import { IsoCamera } from '../src/render/iso.js';
import { LabelSpec } from '../src/render/labels.js';
import { buildSystemGeometry, drawSystem } from '../src/render/scene-system.js';
import { buildFeederGeometry, drawFeeder } from '../src/render/scene-feeder.js';
import { drawSubstation } from '../src/render/scene-substation.js';
import { drawService, SERVICE_ORIGIN } from '../src/render/scene-service.js';
import { drawPlant, plantBounds } from '../src/render/scene-plant.js';
import { drawMachine, machineBounds } from '../src/render/scene-machine.js';
import { solveService, ServiceSolution } from '../src/data/california/service.js';
import { derivationsFor } from '../src/math/for-selection.js';

// ---------------------------------------------------------------------------
// The register of genuine constants
// ---------------------------------------------------------------------------

/**
 * Every displayed value that is allowed not to change when the system does.
 *
 * Each entry says what the constant is and why it is constant. A nameplate is
 * stamped on a steel tank and does not move when the load does; a conductor
 * size is what was hung on the poles; a distance along a feeder is geography.
 * None of them is a quantity the solver could have produced, which is exactly
 * the distinction the brief is drawing.
 */
const GENUINE_CONSTANTS: { why: string; test: RegExp }[] = [
  {
    why: 'Transformer, breaker and bank nameplates — stamped on the equipment.',
    test: /^\d+(\.\d+)?\s*(MVA|kVA|kV|A|MVAr)\b/,
  },
  {
    why: 'Instrument transformer ratios, fixed by the turns wound onto them.',
    test: /^\d+:\d+$/,
  },
  {
    why: 'Surge arrester maximum continuous operating voltage.',
    test: /MCOV/,
  },
  {
    why: 'The capacitor bank’s installed size and step count.',
    test: /MVAr in \w+ [\d.]+ MVAr steps/,
  },
  {
    why: 'The dimensions of the substation yard, which are civil works.',
    test: /^\d+ × \d+ m$/,
  },
  {
    why: 'The ground grid’s conductor and mesh spacing.',
    test: /bare copper on a \d+ m mesh/,
  },
  {
    why: 'The regulator’s range and step count, set by its tap changer.',
    test: /±\d+ % in \d+ steps/,
  },
  {
    why: 'The reclosing device number, which is an ANSI/IEEE C37.2 identifier.',
    test: /device \d+ —/,
  },
  {
    why: 'The pole-mounted capacitor bank’s installed size.',
    test: /^\d+ kVAr, switched$/,
  },
  {
    why: 'Premises equipment ratings: socket, panel, meter, electrode.',
    test: /^(NEMA|Form|\d+ A main breaker|[\d.]+ m copper-clad rod)/,
  },
  {
    why: 'The service transformer’s nameplate.',
    test: /^\d+ kVA, [\d.]+ kV \/ \d+–\d+ V/,
  },
  {
    why:
      'A conductor size and the run it is on. The current through it changes ' +
      'and is checked separately; the wire itself does not.',
    test: /^(\d+\/\d+|\d+) AWG$/,
  },
  {
    why: 'A branch circuit with nothing plugged into it draws nothing.',
    test: /^nothing switched on$/,
  },
  {
    why: 'A normally-open device is in that position by design, not by solution.',
    test: /^normally open$/,
  },
  {
    why: 'Where the feeder starts, which is a fact about the map.',
    test: /^the feeder starts here$/,
  },
  {
    why: 'The name of the drawing the reader is looking at.',
    test: /^single-line diagram$/,
  },
  {
    why:
      'Where a stator winding sits around the machine. It is a fact about how ' +
      'the copper was wound, and the 120° between them is the reason the ' +
      'system is three-phase at all.',
    test: /^\d+° around the stator$/,
  },
  {
    why:
      'Synchronous speed, fixed by the number of poles and the system ' +
      'frequency. A two-pole machine on a 60 Hz system turns at 3,600 rev/min ' +
      'and cannot turn at anything else while it is synchronised.',
    test: /two poles at \d+ Hz/,
  },
  {
    why: 'Plant equipment nameplates and the physical arrangement of the site.',
    test: /^(F-class|Triple pressure|\d+ m$|~?\d+ (MW|mbar)|\d+ bar|Mechanical draught|Interstate pipeline|\d+ mbar)/,
  },
  {
    why: 'The reference the load angle is measured from, which is a definition.',
    test: /^the reference the angle is measured from$/,
  },
  {
    why:
      'ANSI/IEEE C37.2 device numbers. A "87T" is an identifier for a ' +
      'protection function, not a measurement of anything — that is the whole ' +
      'reason the numbering exists and is worth learning.',
    test: /^\d{2}[A-Z]?( \/ \d{2}[A-Z]?)?( · \d{2}[A-Z]?( \/ \d{2}[A-Z]?)?)*$/,
  },
];

const isGenuineConstant = (value: string): boolean =>
  GENUINE_CONSTANTS.some((c) => c.test.test(value));

// ---------------------------------------------------------------------------
// Four different states of the system
// ---------------------------------------------------------------------------

interface Snapshot { name: string; solved: SolvedCase; service: ServiceSolution }

function solveAt(season: Season, hour: number): Snapshot {
  const base = californiaCase();
  const profile = DAY_PROFILES[season];
  const day = dispatchDay(base, profile, SLACK_BUS);
  const net = applyDispatch(base, profile, hour, day[hour % 24]);
  const solved = operate(net).solved;
  const bus = solved.busById.get('SVC_LV');
  const service = solveService(
    (bus?.vpu ?? 1) * 240,
    (bus?.pLoadMW ?? 0) * 1e6,
    (bus?.qLoadMVAr ?? 0) * 1e6,
    null
  );
  return { name: `${season} ${String(hour).padStart(2, '0')}:00`, solved, service };
}

const BASE_STATES: Snapshot[] = [
  solveAt('summer', 4),
  solveAt('summer', 18),
  solveAt('winter', 12),
  solveAt('spring', 11),
];

/**
 * A fifth state, built to move the numbers the first four cannot.
 *
 * Baseload plant does not follow load. Diablo Canyon and The Geysers run flat
 * out at four in the morning and at six in the evening and in every season, so
 * their output is genuinely identical across the four states above — and a
 * differential test cannot tell "a solver output that happens to be constant"
 * apart from "a number somebody typed in". Both look the same from outside.
 *
 * So rather than exempting them, this state gives them a reason to move: every
 * unit whose output never varied is derated to sixty per cent, which is what a
 * stretched refuelling run or a partial outage looks like. The labels then have
 * to follow, and if one does not, it was never reading the dispatch at all.
 *
 * Which units get derated is worked out from the first four states rather than
 * named here, so this keeps working if the fleet changes.
 */
function outageState(): Snapshot {
  const base = californiaCase();
  const profile = DAY_PROFILES.summer;
  const day = dispatchDay(base, profile, SLACK_BUS);
  const net = applyDispatch(base, profile, 18, day[18]);

  for (const g of net.generators) {
    const outputs = BASE_STATES.map((s) => {
      const found = s.solved.net.generators.find((x) => x.id === g.id);
      return found ? found.pMW.toFixed(4) : 'missing';
    });
    if (new Set(outputs).size === 1 && g.pMW > 1) g.pMW *= 0.6;
  }

  const solved = operate(net).solved;
  const bus = solved.busById.get('SVC_LV');
  const service = solveService(
    (bus?.vpu ?? 1) * 240,
    (bus?.pLoadMW ?? 0) * 1e6,
    (bus?.qLoadMVAr ?? 0) * 1e6,
    null
  );
  return { name: 'summer 18:00, baseload derated', solved, service };
}

const STATES: Snapshot[] = [...BASE_STATES, outageState()];

/**
 * A camera framed on a given point at a given scale.
 *
 * The scenes need one to lay out symbols and to compute depth order, and it is
 * pure arithmetic — no canvas, no WebGL — so it works perfectly well here.
 */
function cameraAt(target: Vector3, metresPerPixel: number): IsoCamera {
  const c = new IsoCamera();
  c.setViewport(1600, 900);
  c.target.copy(target);
  c.setZoom(metresPerPixel);
  return c;
}

/** Every label every scene would draw, for one state of the system. */
function labelsFor(s: Snapshot): Map<string, LabelSpec> {
  const out = new Map<string, LabelSpec>();
  const add = (labels: LabelSpec[]) => {
    for (const l of labels) out.set(l.id, l);
  };

  const systemGeometry = buildSystemGeometry(s.solved);
  const b = systemGeometry.bounds;
  const systemCamera = cameraAt(
    new Vector3((b.min.x + b.max.x) / 2, 0, (b.min.z + b.max.z) / 2), 1150
  );
  add(drawSystem(systemGeometry, s.solved, systemCamera, {}).labels);

  const feederGeometry = buildFeederGeometry();
  const fb = feederGeometry.bounds;
  const feederCamera = cameraAt(
    new Vector3((fb.min.x + fb.max.x) / 2, 0, (fb.min.z + fb.max.z) / 2), 2.7
  );
  add(drawFeeder(feederGeometry, s.solved, feederCamera, {}).labels);

  // Both representations of the substation, because they label differently.
  for (const morph of [0, 1]) {
    const subCamera = cameraAt(new Vector3(0, 0, 0), 0.115);
    add(drawSubstation(s.solved, subCamera, {
      morph, showProtection: morph === 1,
    }).labels);
  }

  const serviceCamera = cameraAt(SERVICE_ORIGIN, 0.042);
  add(drawService(s.solved, s.service, serviceCamera, {}).labels);

  const pb = plantBounds();
  const plantCamera = cameraAt(
    new Vector3((pb.min.x + pb.max.x) / 2, 0, (pb.min.z + pb.max.z) / 2), 0.35);
  add(drawPlant(s.solved, plantCamera, {}).labels);

  const mb = machineBounds();
  const machineCamera = cameraAt(
    new Vector3((mb.min.x + mb.max.x) / 2, 0, (mb.min.z + mb.max.z) / 2), 0.05);
  add(drawMachine(s.solved, machineCamera, {}).labels);
  return out;
}

const LABELS = STATES.map(labelsFor);

// ---------------------------------------------------------------------------
// The test
// ---------------------------------------------------------------------------

const hasDigit = (s: string): boolean => /\d/.test(s);

describe('every displayed quantity comes from the solver', () => {
  it('collects enough labels to be worth checking', () => {
    // If the scenes ever stop returning labels as data, this check silently
    // becomes vacuous, which would be worse than it failing.
    //
    // The floor moved from 120 to 100 when the plant stopped printing a
    // standing caption on all eighteen of its items. Those captions still
    // exist — they appear on hover — and they are built from the same stream
    // and rating data the visible ones use, so no PATH to a displayed number
    // stopped being covered. What shrank is the count, not the coverage.
    expect(LABELS[0].size).toBeGreaterThan(100);
    for (const set of LABELS) expect(set.size).toBeGreaterThan(100);
    // Every branch of the zoom tree must actually be represented, or the
    // check below quietly stops covering half the app.
    for (const prefix of ['feeder:', 'sub:', 'svc:', 'plant:', 'machine:']) {
      expect(
        [...LABELS[0].keys()].some((k) => k.startsWith(prefix)),
        `no labels from ${prefix}`
      ).toBe(true);
    }
  });

  it('shows numbers that move when the system moves', () => {
    const ids = [...LABELS[0].keys()].filter((id) =>
      LABELS.every((set) => set.has(id)));
    const withNumbers = ids.filter((id) =>
      hasDigit(LABELS[0].get(id)!.value ?? ''));
    expect(withNumbers.length).toBeGreaterThan(40);

    const moved = withNumbers.filter((id) =>
      new Set(LABELS.map((set) => set.get(id)!.value)).size > 1);
    // The great majority of numbers on this drawing are live. If this ratio
    // ever collapses, something has been frozen.
    expect(moved.length / withNumbers.length).toBeGreaterThan(0.6);
  });

  it('accounts for every number that does NOT move', () => {
    const ids = [...LABELS[0].keys()].filter((id) =>
      LABELS.every((set) => set.has(id)));

    const unexplained: string[] = [];
    for (const id of ids) {
      const values = LABELS.map((set) => set.get(id)!.value ?? '');
      if (!hasDigit(values[0])) continue;
      const identical = new Set(values).size === 1;
      if (!identical) continue;
      if (isGenuineConstant(values[0])) continue;
      unexplained.push(`${id} = "${values[0]}"`);
    }

    // Anything listed here is either a hardcoded quantity that must be wired
    // to the solver, or a genuine constant that must be added to the register
    // above WITH ITS REASON. There is no third option and no quiet one.
    expect(unexplained).toEqual([]);
  });

  it('gives the register a reason for every entry', () => {
    for (const c of GENUINE_CONSTANTS) {
      expect(c.why.length, String(c.test)).toBeGreaterThan(25);
      expect(c.why.trim().endsWith('.'), String(c.test)).toBe(true);
    }
  });
});

describe('the drawing follows the solution rather than a script', () => {
  it('moves the flow of a heavily loaded circuit between states', () => {
    const id = STATES[0].solved.branches
      .filter((f) => f.inService)
      .sort((a, b) => Math.abs(b.pFromMW) - Math.abs(a.pFromMW))[0].branchId;
    const flows = STATES.map((s) => s.solved.branchById.get(id)!.pFromMW);
    expect(new Set(flows.map((f) => f.toFixed(1))).size).toBeGreaterThan(1);
  });

  it('moves the voltage at the wall socket between states', () => {
    const volts = STATES.map((s) => s.service.outletV.toFixed(3));
    expect(new Set(volts).size).toBe(STATES.length);
  });

  it('moves the substation transformer loading between states', () => {
    const loads = STATES.map((s) =>
      s.solved.branchById.get('T_EDENVALE_115_EDENVALE_12_1')!.loading.toFixed(4));
    expect(new Set(loads).size).toBe(STATES.length);
  });
});

describe('every derivation the math panel can show is live too', () => {
  /**
   * A derivation is a photograph of one solution. If its numbers do not move
   * when the system moves, it is a photograph of nothing.
   */
  const targets: { kind: 'site' | 'circuit'; id: string }[] = [
    { kind: 'circuit', id: 'T_EDENVALE_115_EDENVALE_12_1' },
    { kind: 'circuit', id: 'FDR_GETAWAY' },
    { kind: 'site', id: 'T1' },
    { kind: 'site', id: 'F08' },
    { kind: 'site', id: 'OUTLET' },
    { kind: 'site', id: 'edenvale' },
    { kind: 'site', id: 'GT1' },
    { kind: 'site', id: 'GEN_ST' },
  ];

  for (const t of targets) {
    it(`moves the working for ${t.kind} ${t.id}`, () => {
      const perState = STATES.map((s) =>
        derivationsFor(t.kind, t.id, s.solved, s.service));
      expect(perState[0].length, `${t.id} has no derivation at all`)
        .toBeGreaterThan(0);

      // At least one step in the first derivation must differ across states.
      const first = perState[0][0];
      const moved = first.steps.filter((_, i) =>
        new Set(perState.map((ds) => ds[0].steps[i]?.value.toPrecision(8))).size > 1);
      expect(
        moved.length,
        `${t.id}: no step in "${first.title}" changed across four states of the system`
      ).toBeGreaterThan(0);
    });
  }
});

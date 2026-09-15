/**
 * Starting a motor, checked two ways.
 *
 * The interesting claim this model makes is not that a motor draws a lot of
 * current — it is that the RULE OF THUMB and the FULL SOLVE agree. Starting kVA
 * over short-circuit kVA is the estimate every distribution engineer carries in
 * their head; the power flow knows nothing about it and solves the whole state
 * from Oregon to a kitchen socket. If those two ever drifted apart it would
 * mean one of them was wrong, and the panel prints both side by side, so this
 * file pins the agreement.
 *
 * It also pins the thing that makes the lesson work: the same motor on a weaker
 * bus produces a bigger dip, in proportion to how much weaker the bus is.
 */

import { describe, it, expect } from 'vitest';
import { californiaCase, SLACK_BUS } from '../src/data/california/network.js';
import { operate } from '../src/sim/operate.js';
import { DAY_PROFILES } from '../src/sim/profiles.js';
import { dispatchDay, applyDispatch } from '../src/sim/dispatch.js';
import {
  studyMotorStart, CHERRY_LANE_MOTOR, MOTOR_SITES, fullLoadAmps, lockedRotorAmps,
  LOAD_BREAKAWAY_TORQUE_PU,
} from '../src/sim/motor-start.js';
import {
  START_METHODS, NEMA_CODE_LETTERS, lockedRotorKVAperHP, running, starting,
  startingTorquePU, WATTS_PER_HP,
} from '../src/core/motor.js';
import { StartMethod } from '../src/core/motor.js';

const base = californiaCase();
const profile = DAY_PROFILES.summer;
const day = dispatchDay(base, profile, SLACK_BUS);
const net = applyDispatch(base, profile, 18, day[18]);
const before = operate(net);

const study = (method: StartMethod, site = MOTOR_SITES[0].id) =>
  studyMotorStart(net, before, 'starting', method, site);

describe('the motor itself', () => {
  it('draws about six times its running current at standstill', () => {
    const ratio = lockedRotorAmps(CHERRY_LANE_MOTOR) / fullLoadAmps(CHERRY_LANE_MOTOR);
    expect(ratio).toBeGreaterThan(5);
    expect(ratio).toBeLessThan(7.5);
  });

  it('takes its starting kVA from the nameplate code letter', () => {
    const band = NEMA_CODE_LETTERS[CHERRY_LANE_MOTOR.codeLetter];
    const perHp = lockedRotorKVAperHP(CHERRY_LANE_MOTOR);
    expect(perHp).toBeGreaterThanOrEqual(band.min);
    expect(perHp).toBeLessThanOrEqual(band.max);
  });

  it('converts horsepower to watts by the definition, not by 746', () => {
    const r = running(CHERRY_LANE_MOTOR);
    const expected = (CHERRY_LANE_MOTOR.hp * WATTS_PER_HP) /
      CHERRY_LANE_MOTOR.efficiency / 1000;
    expect(r.pKW).toBeCloseTo(expected, 9);
    // The motor draws MORE than its mechanical output, because of the losses.
    expect(r.pKW).toBeGreaterThan(CHERRY_LANE_MOTOR.hp * WATTS_PER_HP / 1000);
  });

  it('is almost pure reactance at standstill and almost not at speed', () => {
    const s = starting(CHERRY_LANE_MOTOR, START_METHODS[0], 1);
    const r = running(CHERRY_LANE_MOTOR);
    expect(s.qKVAr / s.pKW).toBeGreaterThan(4);
    expect(r.qKVAr / r.pKW).toBeLessThan(0.8);
    // And it draws far more reactive power starting than running.
    expect(s.qKVAr).toBeGreaterThan(r.qKVAr * 8);
  });
});

describe('the starters trade current against torque', () => {
  it('makes an autotransformer take the square of the tap from the line', () => {
    const auto = START_METHODS.find((m) => m.id === 'autotransformer')!;
    expect(auto.lineCurrentFactor).toBeCloseTo(auto.tap * auto.tap, 12);
  });

  it('makes a soft starter take the tap itself, which is worse', () => {
    const soft = START_METHODS.find((m) => m.id === 'soft-starter')!;
    expect(soft.lineCurrentFactor).toBeCloseTo(soft.tap, 12);
    const auto = START_METHODS.find((m) => m.id === 'autotransformer')!;
    // For the same terminal voltage the autotransformer is kinder to the line.
    expect(auto.lineCurrentFactor / auto.tap)
      .toBeLessThan(soft.lineCurrentFactor / soft.tap);
  });

  it('costs torque as the square of the voltage, every time', () => {
    for (const m of START_METHODS) {
      const t = startingTorquePU(CHERRY_LANE_MOTOR, m, 1);
      expect(t).toBeCloseTo(CHERRY_LANE_MOTOR.lockedRotorTorquePU * m.tap * m.tap, 12);
    }
  });
});

describe('the dip', () => {
  it('agrees with the rule of thumb, whichever starter is used', () => {
    for (const m of START_METHODS) {
      const s = study(m.id);
      // Within a tenth of a per cent of voltage. The rule is an approximation
      // and this is how good it is: worth printing both.
      expect(Math.abs(s.dipPercent - s.estimatedDipPercent), m.id)
        .toBeLessThan(0.1);
    }
  });

  it('is bigger at the far end of the feeder, where the bus is weaker', () => {
    const near = study('across-the-line', 'industrial');
    const far = study('across-the-line', 'far-end');
    expect(far.shortCircuitMVA).toBeLessThan(near.shortCircuitMVA);
    expect(far.dipPercent).toBeGreaterThan(near.dipPercent);
    // And roughly in proportion to how much weaker it is, because the dip is
    // the same divider in both cases.
    const ratio = (far.dipPercent / near.dipPercent) /
      (near.shortCircuitMVA / far.shortCircuitMVA);
    expect(ratio).toBeGreaterThan(0.7);
    expect(ratio).toBeLessThan(1.4);
  });

  it('is reduced by a reduced-voltage starter, in both places', () => {
    for (const site of MOTOR_SITES) {
      const direct = study('across-the-line', site.id);
      const auto = study('autotransformer', site.id);
      expect(auto.dipPercent, site.id).toBeLessThan(direct.dipPercent);
      expect(auto.torquePU, site.id).toBeLessThan(direct.torquePU);
    }
  });

  it('never moves the voltage the wrong way', () => {
    for (const site of MOTOR_SITES) {
      const s = study('across-the-line', site.id);
      expect(s.dipPercent).toBeGreaterThan(0);
      expect(s.duringPU).toBeLessThan(s.beforePU);
    }
  });

  it('leaves enough torque to accelerate, across the line', () => {
    const s = study('across-the-line');
    expect(s.torquePU).toBeGreaterThan(LOAD_BREAKAWAY_TORQUE_PU);
    expect(s.torqueAdequate).toBe(true);
  });
});

describe('running is not starting', () => {
  it('draws a small fraction of the starting demand once up to speed', () => {
    const start = study('across-the-line');
    const run = studyMotorStart(net, before, 'running', 'across-the-line');
    expect(run.demand.sKVA).toBeLessThan(start.demand.sKVA / 5);
    expect(run.demand.powerFactor).toBeGreaterThan(0.8);
  });
});

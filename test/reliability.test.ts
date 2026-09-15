/**
 * The reliability indices are arithmetic, and arithmetic can be checked.
 *
 * Two kinds of claim are tested here. The first is that the identities hold:
 * CAIDI really is SAIDI over SAIFI, ASAI really is the complement of SAIDI,
 * and the totals really are the sum of the parts. The second is the
 * interesting one — that the DIRECTIONS are right. A recloser must improve
 * SAIFI and worsen MAIFI. Fuse blowing must do the opposite. A tie must change
 * how long people wait without changing how often they are interrupted. If any
 * of those ever came out backwards the panel would be teaching the opposite of
 * the truth, which is worse than teaching nothing.
 */

import { describe, it, expect } from 'vitest';
import {
  reliability, zoneDevices, TOTAL_CUSTOMERS, RELIABILITY_DATA,
  DEFAULT_RELIABILITY_OPTIONS, ReliabilityOptions,
} from '../src/sim/reliability.js';
import { buildFeeder } from '../src/data/california/feeder.js';

const base = reliability();

const withOption = (o: Partial<ReliabilityOptions>) =>
  reliability({ ...DEFAULT_RELIABILITY_OPTIONS, ...o });

describe('the indices', () => {
  it('counts the same customers the feeder model does', () => {
    expect(TOTAL_CUSTOMERS).toBe(buildFeeder().totalCustomers);
  });

  it('lands in the range a real urban feeder lands in', () => {
    // Not a validation against any particular utility — a sanity band. A SAIFI
    // of 20 or of 0.001 would mean the model had come apart.
    expect(base.saifi).toBeGreaterThan(0.05);
    expect(base.saifi).toBeLessThan(3);
    expect(base.saidiMinutes).toBeGreaterThan(5);
    expect(base.saidiMinutes).toBeLessThan(400);
    expect(base.maifi).toBeGreaterThan(base.saifi);
  });

  it('is internally consistent: CAIDI is a ratio, ASAI a complement', () => {
    expect(base.caidiMinutes).toBeCloseTo(base.saidiMinutes / base.saifi, 9);
    expect(base.asai).toBeCloseTo(1 - base.saidiHours / 8760, 12);
    expect(base.saidiMinutes).toBeCloseTo(base.saidiHours * 60, 12);
  });

  it('totals what its parts add up to', () => {
    const ci = base.sections.reduce((a, s) => a + s.customerInterruptionsPerYear, 0);
    const ch = base.sections.reduce((a, s) => a + s.customerHoursPerYear, 0);
    expect(base.customerInterruptionsPerYear).toBeCloseTo(ci, 9);
    expect(base.customerHoursPerYear).toBeCloseTo(ch, 9);
    expect(base.saifi).toBeCloseTo(ci / base.totalCustomers, 12);
  });

  it('never interrupts more customers than there are', () => {
    for (const s of base.sections) {
      expect(s.customersInterrupted).toBeLessThanOrEqual(base.totalCustomers);
      const restored = s.restoration.reduce((a, r) => a + r.customers, 0);
      expect(restored).toBe(s.customersInterrupted);
    }
  });
});

describe('what each decision costs', () => {
  it('a recloser cuts interruptions and adds blinks', () => {
    const without = withOption({ recloserInService: false });
    expect(without.saifi).toBeGreaterThan(base.saifi);
    expect(without.saidiMinutes).toBeGreaterThan(base.saidiMinutes);
    // Everything that would have blinked only the far half of the feeder now
    // blinks all of it, so MAIFI goes UP when the recloser comes out.
    expect(without.maifi).toBeGreaterThan(base.maifi);
  });

  it('fuse blowing trades outages against blinks, in both directions', () => {
    const blowing = withOption({ fuseSaving: false });
    expect(blowing.saifi).toBeGreaterThan(base.saifi);
    expect(blowing.saidiMinutes).toBeGreaterThan(base.saidiMinutes);
    expect(blowing.maifi).toBeLessThan(base.maifi);
  });

  it('a tie changes how long, not how often', () => {
    const noTie = withOption({ tieAvailable: false });
    expect(noTie.saifi).toBeCloseTo(base.saifi, 12);
    expect(noTie.maifi).toBeCloseTo(base.maifi, 12);
    expect(noTie.saidiMinutes).toBeGreaterThan(base.saidiMinutes);
    expect(noTie.caidiMinutes).toBeGreaterThan(base.caidiMinutes);
  });
});

describe('selectivity is geometry', () => {
  it('puts a fuse at the head of every lateral, from the data and not a list', () => {
    const fuses = zoneDevices(DEFAULT_RELIABILITY_OPTIONS)
      .filter((d) => d.kind === 'lateral fuse');
    // Five streets branch off the main in the feeder data.
    expect(fuses.length).toBe(5);
    for (const f of fuses) expect(f.sectionalisable).toBe(false);
  });

  it('never clears a fault with a device the current does not flow through', () => {
    // A lateral fuse can only ever appear against sections on its own lateral.
    for (const s of base.sections) {
      if (s.clearedByKind !== 'lateral fuse') continue;
      expect(s.customersInterrupted).toBeLessThan(base.totalCustomers);
    }
    // And the breaker's own zone is the whole feeder.
    const atBreaker = base.sections.filter((s) => s.clearedByKind === 'breaker');
    for (const s of atBreaker) {
      expect(s.customersInterrupted).toBe(base.totalCustomers);
    }
  });

  it('takes the recloser out of the chain when it is out of service', () => {
    const without = withOption({ recloserInService: false });
    expect(without.sections.some((s) => s.clearedByKind === 'recloser')).toBe(false);
    expect(base.sections.some((s) => s.clearedByKind === 'recloser')).toBe(true);
  });
});

describe('the parameters are the ones the documentation claims', () => {
  it('makes temporary faults the majority, which is why reclosers exist', () => {
    expect(RELIABILITY_DATA.overheadTemporaryPerKmYear)
      .toBeGreaterThan(RELIABILITY_DATA.overheadPermanentPerKmYear * 2);
  });

  it('makes cable rarer to fail and slower to fix than overhead line', () => {
    expect(RELIABILITY_DATA.cablePermanentPerKmYear)
      .toBeLessThan(RELIABILITY_DATA.overheadPermanentPerKmYear);
    expect(RELIABILITY_DATA.repairHoursCable)
      .toBeGreaterThan(RELIABILITY_DATA.repairHoursOverhead);
  });

  it('makes switching faster than repairing, or none of this would help', () => {
    expect(RELIABILITY_DATA.switchingHours)
      .toBeLessThan(RELIABILITY_DATA.repairHoursOverhead);
    expect(RELIABILITY_DATA.tieHours)
      .toBeLessThan(RELIABILITY_DATA.repairHoursOverhead);
  });
});

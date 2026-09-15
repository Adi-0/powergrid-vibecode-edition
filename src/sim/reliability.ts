/**
 * How often the lights go out, and for how long — computed, not quoted.
 *
 * SAIFI, SAIDI and CAIDI are the three numbers a distribution utility is judged
 * on, and they are usually presented as though they were measurements of the
 * weather. They are not. They are the arithmetic consequence of three things a
 * company chooses: how much wire it hangs in the air, where it puts the devices
 * that can isolate a piece of it, and how fast a crew can get there. This
 * module computes them from the feeder's own topology and protection, so that
 * moving a recloser changes the answer.
 *
 * THE DEFINITIONS (IEEE Std 1366)
 *
 *   SAIFI = Σ (λᵢ · Nᵢ) / N_T        interruptions per customer per year
 *   SAIDI = Σ (λᵢ · rᵢ · Nᵢ) / N_T   interruption-hours per customer per year
 *   CAIDI = SAIDI / SAIFI            average length of one interruption
 *   MAIFI = Σ (λTᵢ · Nmᵢ) / N_T      MOMENTARY interruptions per customer
 *   ASAI  = 1 − SAIDI / 8760         the fraction of the year supply was on
 *
 * where λᵢ is the failure rate of section i per year, Nᵢ the customers left
 * without supply by a failure there, rᵢ how long each of them waits, and N_T
 * every customer on the feeder. CAIDI is a RATIO OF THE OTHER TWO and not an
 * independent measurement, which is why a utility can improve it by getting
 * worse: clear more short interruptions and the average length of what remains
 * goes up.
 *
 * THE DISTINCTION THAT MATTERS MOST is sustained against momentary. Four out of
 * five faults on an overhead line are TEMPORARY — a branch touches, a bird
 * bridges an insulator, the arc goes out the moment the circuit is de-energised.
 * A recloser exists to turn those into a blink instead of an outage, and IEEE
 * 1366 counts an interruption shorter than five minutes as momentary and keeps
 * it out of SAIFI entirely. So the same feeder can report a good SAIFI and an
 * awful MAIFI, and the customer with a desktop computer knows the difference
 * even if the regulator's table does not.
 *
 * WHAT IS MODELLED AND WHAT IS NOT is in the honesty register; the short
 * version is that every number below comes from section lengths, canonical
 * failure rates per kilometre-year, and which device clears which fault. There
 * is no historical outage data here and there could not be — this feeder is
 * synthetic.
 */

import {
  FEEDER_SECTIONS, FEEDER_LOADS, FEEDER_NODES, MODELLED_SERVICE,
  sectionLengthKm, FeederSection,
} from '../data/california/feeder.js';

// ---------------------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------------------

/**
 * Canonical component reliability data.
 *
 * These are the textbook values for an overhead distribution system in a mild
 * climate — the ones a planner uses before there is any history to work from.
 * Sources are recorded in docs/model.md. They are not measurements of any real
 * feeder, and the honesty panel says so.
 */
export const RELIABILITY_DATA = {
  /** Permanent (sustained) faults per kilometre of overhead line per year. */
  overheadPermanentPerKmYear: 0.10,
  /** Temporary faults per kilometre per year — four times as many. */
  overheadTemporaryPerKmYear: 0.30,
  /** Cable fails less often but takes far longer to fix, and never temporarily. */
  cablePermanentPerKmYear: 0.07,
  /** A distribution transformer, per year. */
  transformerPerYear: 0.006,

  /** Hours to repair, once a crew is there and the fault is found. */
  repairHoursOverhead: 2.0,
  repairHoursCable: 6.0,
  repairHoursTransformer: 4.0,
  /** Hours to drive out and operate a switch to isolate the damaged section. */
  switchingHours: 0.75,
  /** Hours to back-feed the far end through the normally-open tie. */
  tieHours: 1.0,
  /** Hours to patrol a lateral and replace a fuse that did not need to blow. */
  fuseReplaceHours: 1.5,

  /**
   * The source end. A feeder can also be interrupted by something inside the
   * substation, and leaving that out would flatter the answer.
   *
   * Eden Vale has TWO transformer banks and a bus tie, so losing a bank is a
   * switching operation rather than an outage: everybody comes back when the
   * tie closes. Losing the 12.47 kV bus section the feeder is connected to is
   * not recoverable that way and waits for a repair. And losing one of the two
   * 115 kV lines interrupts nobody at all, which is the entire reason there
   * are two — so it contributes zero here, and that zero is the point.
   */
  bankFailuresPerYear: 0.0062,
  bankSwitchingHours: 0.5,
  busFailuresPerYear: 0.0102,
  busRepairHours: 8.0,
} as const;

export interface ReliabilityOptions {
  /** The pole-top recloser at F03. Out of service, every fault is the breaker's. */
  recloserInService: boolean;
  /**
   * FUSE SAVING: the recloser trips on a fast curve before a lateral fuse can
   * melt, so a temporary fault on a lateral becomes a blink for everybody
   * rather than an outage for one street. Turned off ("fuse blowing"), the fuse
   * operates first: fewer customers blink, more customers sit in the dark.
   */
  fuseSaving: boolean;
  /** The normally-open tie at F11, for back-feeding the far end. */
  tieAvailable: boolean;
}

export const DEFAULT_RELIABILITY_OPTIONS: ReliabilityOptions = {
  recloserInService: true,
  fuseSaving: true,
  tieAvailable: true,
};

// ---------------------------------------------------------------------------
// The feeder as a tree
// ---------------------------------------------------------------------------

const ROOT = 'F00';

/** The service transformer, as one more section with its own failure rate. */
const SERVICE_SECTION: FeederSection = {
  from: MODELLED_SERVICE.fromNode,
  to: MODELLED_SERVICE.toNode,
  conductor: 'transformer',
  phases: 'A',
};

const ALL_SECTIONS: FeederSection[] = [...FEEDER_SECTIONS, SERVICE_SECTION];

const sectionId = (s: FeederSection): string => `${s.from}_${s.to}`;

const NODE_NAME = new Map(FEEDER_NODES.map((n) => [n.id, n.name]));
const NODE_PHASES = new Map(FEEDER_NODES.map((n) => [n.id, n.phases]));

/** Customers at each node: the spot loads, plus the twelve modelled houses. */
const CUSTOMERS_AT = ((): Map<string, number> => {
  const m = new Map<string, number>();
  for (const l of FEEDER_LOADS) m.set(l.node, (m.get(l.node) ?? 0) + l.customers);
  m.set(MODELLED_SERVICE.toNode, MODELLED_SERVICE.housesServed);
  // The twelve houses are served through the modelled transformer, so they are
  // not also part of the spot load at the end of Cherry Lane.
  return m;
})();

interface Tree {
  /** The section that feeds each node, by node id. The root has none. */
  feedingSection: Map<string, FeederSection>;
  /** Sections fed by each node. */
  below: Map<string, FeederSection[]>;
  /** Customers at this node and everything beyond it. */
  customersBeyond: Map<string, number>;
}

function buildTree(): Tree {
  const adjacency = new Map<string, FeederSection[]>();
  for (const s of ALL_SECTIONS) {
    for (const end of [s.from, s.to]) {
      const list = adjacency.get(end) ?? [];
      list.push(s);
      adjacency.set(end, list);
    }
  }

  const feedingSection = new Map<string, FeederSection>();
  const below = new Map<string, FeederSection[]>();
  const seen = new Set<string>([ROOT]);
  const order: string[] = [ROOT];
  const queue = [ROOT];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const s of adjacency.get(cur) ?? []) {
      const next = s.from === cur ? s.to : s.from;
      if (seen.has(next)) continue;
      seen.add(next);
      order.push(next);
      feedingSection.set(next, s);
      (below.get(cur) ?? below.set(cur, []).get(cur)!).push(s);
      queue.push(next);
    }
  }

  // Customers beyond a node, accumulated from the leaves back.
  const customersBeyond = new Map<string, number>();
  for (const node of [...order].reverse()) {
    let n = CUSTOMERS_AT.get(node) ?? 0;
    for (const s of below.get(node) ?? []) {
      const child = s.from === node ? s.to : s.from;
      n += customersBeyond.get(child) ?? 0;
    }
    customersBeyond.set(node, n);
  }
  return { feedingSection, below, customersBeyond };
}

const TREE = buildTree();

/** Which node a section feeds — the end further from the substation. */
function farEnd(s: FeederSection): string {
  return TREE.feedingSection.get(s.to) === s ? s.to : s.from;
}

/** Which node a section is fed from — the end nearer the substation. */
function nearEnd(s: FeederSection): string {
  return farEnd(s) === s.to ? s.from : s.to;
}

export const TOTAL_CUSTOMERS = TREE.customersBeyond.get(ROOT) ?? 0;

// ---------------------------------------------------------------------------
// Where the protective devices are
// ---------------------------------------------------------------------------

export type DeviceKind = 'breaker' | 'recloser' | 'lateral fuse' | 'transformer fuse';

export interface ZoneDevice {
  id: string;
  name: string;
  kind: DeviceKind;
  /** The section it sits at the head of. Everything beyond is its zone. */
  section: FeederSection;
  /** Whether a crew can isolate a piece of its zone without a second trip. */
  sectionalisable: boolean;
}

/**
 * The devices, derived from the feeder's own data rather than listed.
 *
 * A lateral fuse belongs wherever a single-phase circuit taps off the
 * three-phase main, so the set follows the feeder: add a street and it gets a
 * fuse without anybody editing a list.
 */
export function zoneDevices(options: ReliabilityOptions): ZoneDevice[] {
  const devices: ZoneDevice[] = [];
  const head = ALL_SECTIONS.find((s) => nearEnd(s) === ROOT);
  if (head) {
    devices.push({
      id: 'FDR1201_51', name: 'Feeder breaker 1201', kind: 'breaker',
      section: head, sectionalisable: true,
    });
  }
  if (options.recloserInService) {
    const s = ALL_SECTIONS.find((x) => nearEnd(x) === 'F03' && x.phases === 'ABC');
    if (s) {
      devices.push({
        id: 'REC_R1', name: 'Recloser R1', kind: 'recloser',
        section: s, sectionalisable: true,
      });
    }
  }
  for (const s of FEEDER_SECTIONS) {
    if (s.phases === 'ABC') continue;
    if (NODE_PHASES.get(nearEnd(s)) !== 'ABC') continue;
    devices.push({
      id: `FUSE_${farEnd(s)}`,
      name: `${NODE_NAME.get(farEnd(s)) ?? farEnd(s)} fuse`,
      kind: 'lateral fuse',
      section: s,
      // A lateral has no switches along it. Isolating any part of it means
      // isolating all of it, which is why a lateral fault is a whole-street
      // outage for the whole repair.
      sectionalisable: false,
    });
  }
  devices.push({
    id: 'FUSE_SVC', name: 'Pad-mount transformer fuse', kind: 'transformer fuse',
    section: SERVICE_SECTION, sectionalisable: false,
  });
  return devices;
}

// ---------------------------------------------------------------------------
// The computation
// ---------------------------------------------------------------------------

export interface SectionOutage {
  id: string;
  label: string;
  lengthKm: number;
  kind: 'overhead' | 'cable' | 'transformer' | 'substation';
  permanentPerYear: number;
  temporaryPerYear: number;
  /** The device that clears a fault here, and how many customers it drops. */
  clearedBy: string;
  clearedByKind: DeviceKind;
  customersInterrupted: number;
  /** Who waits how long, per permanent fault. */
  restoration: { customers: number; hours: number; how: string }[];
  /** Per-year contributions to the indices. */
  customerInterruptionsPerYear: number;
  customerHoursPerYear: number;
  momentaryCustomersPerYear: number;
  /** True where a temporary fault blows a fuse and becomes a real outage. */
  temporaryBecomesSustained: boolean;
}

export interface ReliabilityResult {
  options: ReliabilityOptions;
  totalCustomers: number;
  sections: SectionOutage[];
  /** Interruptions per customer per year. */
  saifi: number;
  /** Interruption-hours per customer per year, and the minutes everyone quotes. */
  saidiHours: number;
  saidiMinutes: number;
  /** Average interruption duration — SAIDI ÷ SAIFI, not a measurement. */
  caidiHours: number;
  caidiMinutes: number;
  /** Momentary interruptions per customer per year. */
  maifi: number;
  /** Fraction of the year supply was available. */
  asai: number;
  /** Totals, so the arithmetic can be checked by hand. */
  customerInterruptionsPerYear: number;
  customerHoursPerYear: number;
  momentaryCustomersPerYear: number;
}

export function reliability(
  options: ReliabilityOptions = DEFAULT_RELIABILITY_OPTIONS
): ReliabilityResult {
  const devices = zoneDevices(options);
  const deviceAtSection = new Map(devices.map((d) => [sectionId(d.section), d]));

  const sections: SectionOutage[] = [];

  for (const s of ALL_SECTIONS) {
    const isTransformer = s === SERVICE_SECTION;
    const kind: SectionOutage['kind'] =
      isTransformer ? 'transformer' : s.underground ? 'cable' : 'overhead';
    const lengthKm = isTransformer ? 0 : sectionLengthKm(s);

    const permanentPerYear =
      kind === 'transformer' ? RELIABILITY_DATA.transformerPerYear
      : kind === 'cable' ? lengthKm * RELIABILITY_DATA.cablePermanentPerKmYear
      : lengthKm * RELIABILITY_DATA.overheadPermanentPerKmYear;
    const temporaryPerYear =
      kind === 'overhead' ? lengthKm * RELIABILITY_DATA.overheadTemporaryPerKmYear : 0;
    const repairHours =
      kind === 'transformer' ? RELIABILITY_DATA.repairHoursTransformer
      : kind === 'cable' ? RELIABILITY_DATA.repairHoursCable
      : RELIABILITY_DATA.repairHoursOverhead;

    // Which device clears a fault here: the first one met walking back to the
    // substation. Selectivity is geometry before it is timing.
    const clearing = clearingDevice(s, deviceAtSection);
    const zoneRoot = farEnd(clearing.section);
    const zoneCustomers = TREE.customersBeyond.get(zoneRoot) ?? 0;

    // --- a permanent fault -------------------------------------------------
    const beyondFault = TREE.customersBeyond.get(farEnd(s)) ?? 0;
    const restoration: SectionOutage['restoration'] = [];
    if (!clearing.sectionalisable) {
      // No switches inside the zone: everybody waits for the repair.
      restoration.push({
        customers: zoneCustomers, hours: repairHours,
        how: 'no switch inside the zone — everybody waits for the repair',
      });
    } else {
      const upstream = zoneCustomers - beyondFault;
      if (upstream > 0) {
        restoration.push({
          customers: upstream, hours: RELIABILITY_DATA.switchingHours,
          how: 'isolated from the damage and picked up again from the substation',
        });
      }
      if (beyondFault > 0) {
        restoration.push(options.tieAvailable
          ? {
            customers: beyondFault, hours: RELIABILITY_DATA.tieHours,
            how: 'back-fed through the normally-open tie to the next feeder',
          }
          : {
            customers: beyondFault, hours: repairHours,
            how: 'stranded beyond the damage with no tie — waits for the repair',
          });
      }
    }
    const customerHoursPerFault =
      restoration.reduce((a, r) => a + r.customers * r.hours, 0);

    // --- a temporary fault -------------------------------------------------
    // A fuse cannot tell a temporary fault from a permanent one. Whether it
    // gets the chance to find out is the fuse-saving question.
    const isFuse =
      clearing.kind === 'lateral fuse' || clearing.kind === 'transformer fuse';
    const fuseWouldBlow = isFuse && !options.fuseSaving;
    // A fuse cannot reclose: it either melts or it does not. So when a
    // temporary fault on a lateral is NOT allowed to blow the fuse, the device
    // that clears it is whatever recloses upstream — and its whole zone blinks,
    // which is precisely the price fuse saving asks everyone else to pay.
    const blinkZone = isFuse ? upstreamClearer(clearing, devices) : clearing;

    let customerInterruptionsPerYear = permanentPerYear * zoneCustomers;
    let customerHoursPerYear = permanentPerYear * customerHoursPerFault;
    let momentaryCustomersPerYear = 0;

    if (fuseWouldBlow) {
      // The fuse operates on a fault that would have cleared itself. Nobody
      // blinks; one street sits in the dark until a crew patrols it.
      customerInterruptionsPerYear += temporaryPerYear * zoneCustomers;
      customerHoursPerYear +=
        temporaryPerYear * zoneCustomers * RELIABILITY_DATA.fuseReplaceHours;
    } else {
      // Everybody in the reclosing device's zone blinks, and that is a
      // momentary interruption — counted in MAIFI, never in SAIFI.
      momentaryCustomersPerYear = blinkZone === null ? 0 : temporaryPerYear *
        (TREE.customersBeyond.get(farEnd(blinkZone.section)) ?? 0);
    }

    sections.push({
      id: sectionId(s),
      label: isTransformer
        ? 'Pad-mount service transformer'
        : `${NODE_NAME.get(s.from) ?? s.from} – ${NODE_NAME.get(s.to) ?? s.to}`,
      lengthKm, kind, permanentPerYear, temporaryPerYear,
      clearedBy: clearing.name,
      clearedByKind: clearing.kind,
      customersInterrupted: zoneCustomers,
      restoration,
      customerInterruptionsPerYear,
      customerHoursPerYear,
      momentaryCustomersPerYear,
      temporaryBecomesSustained: fuseWouldBlow && temporaryPerYear > 0,
    });
  }

  // --- the source end ------------------------------------------------------
  const allCustomers = TREE.customersBeyond.get(ROOT) ?? 0;
  const sourceEvent = (
    id: string, label: string, perYear: number, hours: number, how: string
  ): SectionOutage => ({
    id, label, lengthKm: 0, kind: 'substation',
    permanentPerYear: perYear, temporaryPerYear: 0,
    clearedBy: 'Substation protection', clearedByKind: 'breaker',
    customersInterrupted: allCustomers,
    restoration: [{ customers: allCustomers, hours, how }],
    customerInterruptionsPerYear: perYear * allCustomers,
    customerHoursPerYear: perYear * allCustomers * hours,
    momentaryCustomersPerYear: 0,
    temporaryBecomesSustained: false,
  });
  sections.push(
    sourceEvent('SUB_BANK', 'Eden Vale — transformer bank',
      RELIABILITY_DATA.bankFailuresPerYear, RELIABILITY_DATA.bankSwitchingHours,
      'the second bank picks the feeder up when the bus tie closes'),
    sourceEvent('SUB_BUS12', 'Eden Vale — 12.47 kV bus section',
      RELIABILITY_DATA.busFailuresPerYear, RELIABILITY_DATA.busRepairHours,
      'nothing else can feed this bus section — it waits for the repair'),
  );

  const ci = sections.reduce((a, s) => a + s.customerInterruptionsPerYear, 0);
  const ch = sections.reduce((a, s) => a + s.customerHoursPerYear, 0);
  const cm = sections.reduce((a, s) => a + s.momentaryCustomersPerYear, 0);
  const n = TOTAL_CUSTOMERS;

  const saifi = ci / n;
  const saidiHours = ch / n;
  return {
    options,
    totalCustomers: n,
    sections: sections.sort((a, b) => b.customerHoursPerYear - a.customerHoursPerYear),
    saifi,
    saidiHours,
    saidiMinutes: saidiHours * 60,
    caidiHours: saifi > 0 ? saidiHours / saifi : 0,
    caidiMinutes: saifi > 0 ? (saidiHours / saifi) * 60 : 0,
    maifi: cm / n,
    asai: 1 - saidiHours / 8760,
    customerInterruptionsPerYear: ci,
    customerHoursPerYear: ch,
    momentaryCustomersPerYear: cm,
  };
}

/** The first device met walking from a section back towards the substation. */
function clearingDevice(
  s: FeederSection, deviceAtSection: Map<string, ZoneDevice>
): ZoneDevice {
  let cur: FeederSection | undefined = s;
  while (cur) {
    const d = deviceAtSection.get(sectionId(cur));
    if (d) return d;
    cur = TREE.feedingSection.get(nearEnd(cur));
  }
  // The head section always carries the feeder breaker, so this is unreachable
  // for a connected feeder; throwing is better than returning a wrong device.
  throw new Error(`no protective device upstream of section ${sectionId(s)}`);
}

/** The next device upstream of a given one — the one that backs it up. */
function upstreamClearer(
  d: ZoneDevice, devices: readonly ZoneDevice[]
): ZoneDevice | null {
  const byId = new Map(devices.map((x) => [sectionId(x.section), x]));
  let cur = TREE.feedingSection.get(nearEnd(d.section));
  while (cur) {
    const up = byId.get(sectionId(cur));
    if (up) return up;
    cur = TREE.feedingSection.get(nearEnd(cur));
  }
  return null;
}

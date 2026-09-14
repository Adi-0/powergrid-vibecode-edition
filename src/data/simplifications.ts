/**
 * Everything this model does not represent.
 *
 * THIS FILE IS THE SOURCE OF TRUTH. `docs/simplifications.md` is generated from
 * it by `tools/gen-simplifications.mjs`, and `test/simplifications.test.ts`
 * fails if the two drift apart. The in-app model-honesty panel reads this same
 * array, so the panel, the documentation and the code cannot disagree.
 *
 * A teaching model that hides its own edges teaches confident wrongness. One
 * that shows them teaches how models work — which is most of what a person
 * needs in order to read anybody else's model later.
 */

/** Where in the zoom tree a simplification bites. */
export type ScopeId =
  | 'system' | 'region' | 'substation' | 'feeder' | 'service'
  | 'plant' | 'machine' | 'math' | 'protection' | 'global';

export interface Simplification {
  id: string;
  /** Which views this applies to. The honesty panel filters on it. */
  scope: ScopeId[];
  /** One line, in plain language, naming what is simplified. */
  title: string;
  /** What the model actually does. */
  whatWeDo: string;
  /** What the full treatment would involve. */
  fullTreatment: string;
  /** Why the simplification is acceptable here, or where it would mislead. */
  consequence: string;
  /** How badly it would change an answer: 'cosmetic' | 'modest' | 'material'. */
  severity: 'cosmetic' | 'modest' | 'material';
}

export const SIMPLIFICATIONS: Simplification[] = [
  {
    id: 'balanced-positive-sequence',
    scope: ['system', 'region', 'substation', 'feeder', 'math'],
    title: 'Everything is balanced across the three phases',
    whatWeDo:
      'The power flow solves a single-phase equivalent and assumes the three ' +
      'phases carry equal current, 120° apart. One number per bus, not three.',
    fullTreatment:
      'A three-phase power flow solves each phase separately, or works in ' +
      'symmetrical components with positive, negative and zero sequence ' +
      'networks solved together. Distribution feeders in particular are ' +
      'genuinely unbalanced, because single-phase laterals are attached wherever ' +
      'the houses happen to be.',
    consequence:
      'Accurate on the transmission system, which is transposed and served by ' +
      'balanced three-phase load. On the distribution feeder it hides neutral ' +
      'current and phase-to-phase voltage differences that a real engineer ' +
      'would care about. The fault views drop this assumption and use the full ' +
      'sequence treatment, because a fault is unbalanced by definition.',
    severity: 'modest',
  },
  {
    id: 'synthetic-network',
    scope: ['system', 'region'],
    title: 'The network is a reconstruction, not a copy',
    whatWeDo:
      'Real place names at real coordinates, connected by circuits whose count, ' +
      'impedance and rating are plausible for equipment of that class.',
    fullTreatment:
      'A real model of this system runs to thousands of buses and its data is ' +
      'not public, for good reasons.',
    consequence:
      'The structure is right — the corridors, the bottlenecks, where ' +
      'generation and load sit, why the network is meshed. Any specific ' +
      'number is representative rather than actual. Do not quote a flow on ' +
      'Path 15 from this model as a fact about Path 15.',
    severity: 'material',
  },
  {
    id: 'slack-absorbs-imbalance',
    scope: ['system', 'math'],
    title: 'One intertie absorbs the whole imbalance',
    whatWeDo:
      'The Pacific Northwest intertie at Malin is the slack bus: whatever ' +
      'generation and demand fail to match, it supplies or absorbs.',
    fullTreatment:
      'Automatic generation control shares the imbalance across many units in ' +
      'proportion to their droop settings and regulating reserve, continuously.',
    consequence:
      'The total is right and the physical story is right — California really ' +
      'does lean on its neighbours. Which specific machine moves is not. The ' +
      'system view shows the correction explicitly rather than hiding it.',
    severity: 'modest',
  },
  {
    id: 'dc-intertie-as-injection',
    scope: ['system'],
    title: 'The Pacific DC Intertie is modelled as an injection, not a DC line',
    whatWeDo:
      'The 3,100 MW arriving at Sylmar appears as a scheduled generator there.',
    fullTreatment:
      'A high-voltage direct-current link has converter stations at each end ' +
      'with their own losses, reactive consumption, control modes and failure ' +
      'behaviour, and it is solved jointly with the AC network.',
    consequence:
      'The real power arriving is right. The reactive behaviour of the ' +
      'converters, and the fact that the link can be commanded independently ' +
      'of the AC system around it, are both missing.',
    severity: 'modest',
  },
  {
    id: 'one-feeder-modelled',
    scope: ['substation', 'feeder'],
    title: 'One distribution feeder is modelled; the rest are lumped',
    whatWeDo:
      'Eden Vale substation has four feeders. One is modelled pole by pole. ' +
      'The other three appear as a single load at the 12.47 kV bus.',
    fullTreatment:
      'A utility models every feeder, and there are tens of thousands of them.',
    consequence:
      'The modelled feeder is complete and its numbers are right. The ' +
      'substation transformer loading includes the other three, so the ' +
      'substation-level picture is right too.',
    severity: 'cosmetic',
  },
  {
    id: 'constant-power-load',
    scope: ['feeder', 'service', 'math'],
    title: 'Load draws constant power regardless of voltage',
    whatWeDo:
      'A 5 MW load draws 5 MW whether the voltage is 1.00 or 0.95 per-unit.',
    fullTreatment:
      'Real load is a mixture: resistive heating draws power as V², motors ' +
      'closer to constant power, electronics genuinely constant power. The ' +
      'standard treatment is a ZIP model splitting load into constant-impedance, ' +
      'constant-current and constant-power fractions.',
    consequence:
      'Constant-power load is the pessimistic assumption and the one used for ' +
      'planning, because it makes voltage collapse easier rather than harder. ' +
      'It overstates how much voltage sags at the end of a heavily loaded ' +
      'feeder, by a few tenths of a per cent.',
    severity: 'modest',
  },
  {
    id: 'no-dynamics',
    scope: ['system', 'machine', 'protection'],
    title: 'Time moves in steps; nothing swings',
    whatWeDo:
      'Each moment is solved as a steady state. Change the time of day or trip ' +
      'a line and the model jumps to the new steady state.',
    fullTreatment:
      'A transient stability study integrates the swing equation for every ' +
      'machine through the seconds after a disturbance, showing rotor angles ' +
      'oscillating, frequency dipping and governors responding.',
    consequence:
      'Steady-state answers — flows, voltages, losses, who is marginal — are ' +
      'right. What happens in the first few seconds after a trip is not shown ' +
      'here, and that is exactly when a system either recovers or does not. ' +
      'The machine view demonstrates the swing equation on its own.',
    severity: 'material',
  },
  {
    id: 'reactive-switching-rule',
    scope: ['system', 'region', 'substation'],
    title: 'Capacitor and reactor switching follows a simple rule',
    whatWeDo:
      'Banks switch on local bus voltage where there is no generator, and on ' +
      'the machine’s reactive utilisation where there is, with a deadband ' +
      'and a limit on how often a breaker may operate.',
    fullTreatment:
      'Real schemes use time delays, temperature and time-of-day schedules, ' +
      'coordination between neighbouring substations, and operator judgement.',
    consequence:
      'The behaviour is right in kind and roughly right in degree. Exactly ' +
      'which bank closes at exactly which minute is not.',
    severity: 'cosmetic',
  },
  {
    id: 'loss-factor-in-dispatch',
    scope: ['system', 'math'],
    title: 'Dispatch assumes a loss factor before the losses are known',
    whatWeDo:
      'Generation is sized to serve demand plus an assumed 2.5 % for losses. ' +
      'The power flow then computes what the losses actually are.',
    fullTreatment:
      'A security-constrained economic dispatch solves the dispatch and the ' +
      'power flow together, with loss penalty factors per bus.',
    consequence:
      'The difference between assumption and truth shows up at the slack bus. ' +
      'The system view displays that difference rather than hiding it, because ' +
      'it is the same correction a real operator watches.',
    severity: 'cosmetic',
  },
  {
    id: 'no-unit-commitment-across-time',
    scope: ['system'],
    title: 'Plants can start and stop instantly between hours',
    whatWeDo:
      'Each hour is dispatched on its own merits. A plant that was off at ' +
      '15:00 can be at full output at 16:00 if the merit order calls for it.',
    fullTreatment:
      'Unit commitment respects minimum up and down times, start-up costs and ' +
      'start-up trajectories, solved across the whole day at once.',
    consequence:
      'The merit order and the marginal unit are right. The model understates ' +
      'how expensive and slow the evening ramp really is — which is the ' +
      'central operational problem the duck curve is about.',
    severity: 'modest',
  },
  {
    id: 'distribution-untransposed',
    scope: ['feeder'],
    title: 'Distribution line parameters ignore that the phases are not transposed',
    whatWeDo:
      'The feeder uses a geometric-mean-distance impedance, as if the phases ' +
      'swapped positions along the route.',
    fullTreatment:
      'Carson’s equations with the actual conductor positions, giving a full ' +
      '3×3 impedance matrix with unequal diagonal and mutual terms.',
    consequence:
      'On a feeder a few kilometres long the error is small, but it is the ' +
      'mechanism behind some real phase-unbalance effects.',
    severity: 'modest',
  },
  {
    id: 'no-weather-correlation',
    scope: ['system'],
    title: 'Every wind farm sees the same wind, every solar farm the same sun',
    whatWeDo:
      'One wind shape and one solar shape scale all sites of that type.',
    fullTreatment:
      'Site-specific time series, correlated in space and time, from ' +
      'meteorological reanalysis.',
    consequence:
      'The daily pattern is right. The smoothing that geographic spread ' +
      'actually provides is missing, so the model makes renewable output look ' +
      'more synchronised than it is.',
    severity: 'modest',
  },
  {
    id: 'equipment-parameters-canonical',
    scope: ['global'],
    title: 'Equipment parameters are canonical for the class, not measured',
    whatWeDo:
      'A 1,120 MVA autotransformer gets 12 % impedance and an X/R of 45 ' +
      'because that is what transformers of that size have.',
    fullTreatment:
      'Every unit has a test report with its own measured values, which vary ' +
      'by several per cent from the class average.',
    consequence:
      'Every quantity is dimensionally correct and in a realistic range for its ' +
      'class, which is what the model claims. No individual value is a fact ' +
      'about any individual piece of equipment.',
    severity: 'modest',
  },
];

export const simplificationsFor = (scope: ScopeId): Simplification[] =>
  SIMPLIFICATIONS.filter((s) => s.scope.includes(scope) || s.scope.includes('global'));

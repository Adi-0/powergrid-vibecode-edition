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
  {
    id: 'service-drop-by-hand',
    scope: ['service', 'math'],
    title: 'Past the last transformer, the voltage drop is calculated rather than solved',
    whatWeDo:
      'The power flow solves down to the secondary terminals of the ' +
      'pad-mounted transformer, and stops there. From that solved voltage to ' +
      'the socket the drop is worked out with the standard formula, ' +
      'ΔV = I·(R·cos φ + X·sin φ) over the loop, and the whole calculation is ' +
      'shown on the page.',
    fullTreatment:
      'A three-wire 240/120 V service is genuinely single-phase with a ' +
      'mid-point earthed neutral, and the two 120 V legs carry different ' +
      'loads. Solving it properly means a separate single-phase model with ' +
      'the neutral as a conductor of its own, carrying the imbalance.',
    consequence:
      'The magnitudes are right to within a few hundredths of a volt at these ' +
      'currents and lengths. What is missing is the imbalance between the two ' +
      'legs and therefore the neutral current, which is the thing the ' +
      'three-wire arrangement exists to manage. The arithmetic shown is ' +
      'exactly what an electrician would do, so it can be checked by hand.',
    severity: 'modest',
  },
  {
    id: 'one-house-of-twelve',
    scope: ['service'],
    title: 'The modelled house is an equal share of twelve',
    whatWeDo:
      'Twelve houses share the pad-mounted transformer, and the solved load at ' +
      'its secondary is divided equally between them. An appliance the reader ' +
      'switches on is added to this house alone, not shared.',
    fullTreatment:
      'Twelve real houses differ by a factor of three or more, and their peaks ' +
      'fall at different times. A study would use metered interval data per ' +
      'service, or a stochastic load model.',
    consequence:
      'The current in this service is right in size and moves correctly when ' +
      'something is switched on. It is not a claim about any particular house, ' +
      'and it understates how unequal a real group of twelve is.',
    severity: 'modest',
  },
  {
    id: 'substation-yard-layout',
    scope: ['substation'],
    title: 'The yard layout is plausible, not surveyed',
    whatWeDo:
      'Equipment sits at coordinates and heights typical of a two-bank 115/12.47 kV ' +
      'distribution substation: bus at 7.6 m, breakers on plinths, a ground grid ' +
      'on a 6 m mesh. The single-line topology is exact; the metres are typical.',
    fullTreatment:
      'A real yard is laid out to electrical clearance tables, access for a ' +
      'crane, and the shape of the parcel that was available. No two are alike.',
    consequence:
      'Nothing electrical depends on it: the solver never sees a yard ' +
      'coordinate. It matters only for the claim the drawing makes about what ' +
      'a station looks like, which is "like this sort of thing" rather than ' +
      '"like this".',
    severity: 'cosmetic',
  },
  {
    id: 'three-feeders-lumped',
    scope: ['substation', 'feeder'],
    title: 'Three of the four feeders are one lumped load',
    whatWeDo:
      'Cherry Lane 1201 is modelled pole by pole. Feeders 1202, 1203 and 1204 ' +
      'appear in the drawing with their breakers, and in the solve as a single ' +
      'load on the 12.47 kV bus.',
    fullTreatment:
      'Four feeders modelled in full, each with its own laterals, regulators ' +
      'and capacitors.',
    consequence:
      'The station\u2019s total load and its transformer loading are right. ' +
      'Switching the bus tie or losing a bank behaves correctly. What is not ' +
      'available is any statement about voltage or reliability on those three ' +
      'feeders, and their breakers cannot be operated.',
    severity: 'modest',
  },
  {
    id: 'no-secondary-network',
    scope: ['service', 'feeder'],
    title: 'The secondary between the transformer and the houses is not modelled as a network',
    whatWeDo:
      'One service is followed in full. The other eleven houses on the same ' +
      'transformer are represented by their share of the load at its ' +
      'secondary terminals, with no secondary conductors of their own.',
    fullTreatment:
      'A secondary network model has every service drop as a branch, so the ' +
      'houses interact: one neighbour\u2019s car charger depresses the voltage at ' +
      'another\u2019s socket through the shared secondary.',
    consequence:
      'This service\u2019s own drop is right. The interaction between neighbours ' +
      'is missing, and it is real — it is why a cluster of car chargers on one ' +
      'transformer is a different problem from the same load spread out.',
    severity: 'modest',
  },
  {
    id: 'plant-as-one-machine',
    scope: ['plant', 'machine', 'system'],
    title: 'A power station is one generator in the network model',
    whatWeDo:
      'Metcalf appears in the power flow as a single machine with the whole ' +
      'station\u2019s rating, inertia and reactance. The plant view shows its ' +
      'three real machines and splits the energy between them; the machine ' +
      'view draws the station\u2019s equivalent machine in cross-section.',
    fullTreatment:
      'A study of the plant itself models each gas turbine generator and the ' +
      'steam turbine generator separately, behind the station\u2019s own ' +
      'switchyard, each with its own step-up transformer and its own excitation ' +
      'and governor controls.',
    consequence:
      'Nothing on the transmission system can tell the difference: the station ' +
      'is one injection at one bus either way. What is lost is the ability to ' +
      'lose one machine and keep the others, and the fact that the three do not ' +
      'share reactive output equally.',
    severity: 'modest',
  },
  {
    id: 'plant-energy-split',
    scope: ['plant'],
    title: 'The split of fuel energy between the streams uses typical fractions',
    whatWeDo:
      'The plant\u2019s efficiency comes from its heat rate, which is in the ' +
      'network model because it sets the marginal cost. How the rest of the ' +
      'fuel divides between the stack, the condenser, the generators and the ' +
      'plant\u2019s own auxiliaries uses fractions typical of a large combined ' +
      'cycle, and the condenser is computed as the remainder so that the chain ' +
      'closes exactly.',
    fullTreatment:
      'A heat balance for a real station is computed from measured gas ' +
      'temperatures, steam conditions and cooling water flows at a stated ' +
      'ambient condition, and changes with the weather.',
    consequence:
      'The net output and the fuel burn are right, because they come from the ' +
      'heat rate. The individual streams are right in proportion and in order ' +
      'of magnitude. Do not quote the stack loss of this plant as a measurement.',
    severity: 'modest',
  },
  {
    id: 'inertia-stops-at-the-state-line',
    scope: ['machine', 'system'],
    title: 'Rate of change of frequency counts only California’s own rotors',
    whatWeDo:
      'The frequency figure shown with the machine is what the modelled ' +
      'network\u2019s own spinning mass would give if that unit tripped.',
    fullTreatment:
      'California is synchronously connected to the whole Western ' +
      'Interconnection, and every rotor from British Columbia to New Mexico ' +
      'resists a frequency change here. The real denominator is several times ' +
      'larger than this one.',
    consequence:
      'The number shown is several times faster than what the real system ' +
      'would see, and the panel says so where it is shown. What it gets right ' +
      'is the COMPARISON: an hour with less synchronous plant online has less ' +
      'inertia, and that is the whole point of the readout.',
    severity: 'material',
  },
  {
    id: 'stator-winding-drawing',
    scope: ['machine'],
    title: 'The stator windings are drawn as three bands, not as they are wound',
    whatWeDo:
      'Three phase bands 120° apart, each shown as a few coil sides either ' +
      'side of its axis, at a radius chosen so the arrangement can be seen.',
    fullTreatment:
      'A real two-pole machine distributes each phase over many slots, with ' +
      'short-pitched coils and a fractional slot-per-pole-per-phase count, all ' +
      'chosen to suppress particular harmonics in the generated waveform.',
    consequence:
      'The thing the drawing is for — three windings in space, a field ' +
      'rotating past them, and the load angle between the rotor and the ' +
      'terminal voltage — is exactly right. The winding detail is not, and ' +
      'nothing in the app depends on it. The machine is also drawn far larger ' +
      'than its true 3 to 4 metres, because at true scale the air gap would be ' +
      'a hairline.',
    severity: 'cosmetic',
  },
  {
    id: 'must-run-not-security-constrained',
    scope: ['system', 'plant'],
    title: 'Local reliability is one flag, not a security-constrained dispatch',
    whatWeDo:
      'The plant inside the Bay Area is marked must-run, so it is committed at ' +
      'its minimum whatever the merit order says, and the economic stack fills ' +
      'in around it.',
    fullTreatment:
      'A real dispatch is security-constrained: it solves the economics and ' +
      'the network together, subject to every credible single outage, and ' +
      'decides for itself which units must run and how hard.',
    consequence:
      'The result is right for this network at these hours — the plant runs, ' +
      'and the region is not left depending entirely on imports. What is ' +
      'missing is the mechanism: the model cannot discover that a unit is ' +
      'needed, it has to be told.',
    severity: 'modest',
  },
  {
    id: 'fault-is-a-snapshot',
    scope: ['protection', 'feeder', 'substation'],
    title: 'A fault is calculated, not simulated',
    whatWeDo:
      'A linear circuit problem solved about the pre-fault operating point, ' +
      'with every machine represented as a voltage behind its subtransient ' +
      'reactance. It gives the current in the first cycles and which device ' +
      'would respond to it.',
    fullTreatment:
      'What happens next needs a time-domain simulation: the protection ' +
      'operating, the breakers clearing, the arc extinguishing at a current ' +
      'zero, the voltage recovering, the machines swinging against one another ' +
      'and either pulling back into step or not.',
    consequence:
      'The number is right, and it is the number every one of those later ' +
      'questions starts from. What is missing is the decay of the fault ' +
      'current as the machines move from X″ to X′ to X_d, the direct-current ' +
      'offset in the first cycle, and everything about stability.',
    severity: 'material',
  },
  {
    id: 'zero-sequence-ratio',
    scope: ['protection'],
    title: 'A line’s zero-sequence impedance is a multiple of its positive-sequence one',
    whatWeDo:
      'Z₀ = 3·Z₁ for an overhead line and 2·Z₁ for a cable, with the ' +
      'zero-sequence charging at 60 % of the positive-sequence value.',
    fullTreatment:
      'The real value depends on the earth resistivity along the route, on ' +
      'whether there is a shield wire and what it is made of, and on how the ' +
      'shield wire is bonded — and it is computed with Carson\u2019s equations, ' +
      'which model the earth as a conductor of finite conductivity.',
    consequence:
      'Ratios between 2 and 3.5 cover nearly all overhead construction, so ' +
      'ground fault currents are right to within perhaps twenty per cent. ' +
      'What is exactly right is the part that matters most for teaching: which ' +
      'transformers pass zero-sequence current and which block it, because ' +
      'that follows from the winding connections rather than from the soil.',
    severity: 'modest',
  },
  {
    id: 'one-protection-chain',
    scope: ['protection'],
    title: 'Only Cherry Lane’s protection is modelled',
    whatWeDo:
      'Four devices in series — a lateral fuse, a recloser, the feeder breaker ' +
      'and the transformer\u2019s backup relay — with settings derived from the ' +
      'feeder\u2019s own load and fault levels.',
    fullTreatment:
      'A real system has a protective device on every circuit at every ' +
      'voltage, with distance relays and differential schemes on the ' +
      'transmission network and communications between them.',
    consequence:
      'A fault anywhere on the network gives a correct current, because the ' +
      'sequence networks cover the whole case. But only on this feeder is ' +
      'there a chain of devices to say which one would clear it; elsewhere the ' +
      'app says so rather than showing a chain that would not operate.',
    severity: 'modest',
  },
  {
    id: 'phase-elements-only',
    scope: ['protection'],
    title: 'The coordination shown is of the phase elements',
    whatWeDo:
      'Each device responds to the largest phase current. Ground elements — ' +
      'devices 50N and 51N, which watch the residual — are named in the ' +
      'substation\u2019s protection scheme but are not plotted.',
    fullTreatment:
      'A real study plots the phase and ground elements as two separate ' +
      'coordination problems, because the ground elements are set far more ' +
      'sensitively and coordinate with each other rather than with the phase ' +
      'curves.',
    consequence:
      'For a three-phase or phase-to-phase fault the answer is complete. For a ' +
      'fault to earth the real clearing would usually be faster than shown, ' +
      'because a sensitive ground element sees it long before a phase element ' +
      'does.',
    severity: 'modest',
  },
  {
    id: 'reliability-from-rates',
    scope: ['feeder', 'protection'],
    title: 'The reliability indices are computed from failure rates, not from history',
    whatWeDo:
      'SAIFI, SAIDI, CAIDI, MAIFI and ASAI are worked out from section lengths, ' +
      'canonical failure rates per kilometre-year, canonical repair and ' +
      'switching times, and which device clears which fault. Every number is ' +
      'traceable to those inputs.',
    fullTreatment:
      'A utility computes these from its own outage management system: every ' +
      'interruption that actually happened, with the customers actually ' +
      'affected and the minutes actually taken, classified by cause. The ' +
      'failure rates used here are planning values of the kind used before ' +
      'there is any history to work from.',
    consequence:
      'The directions are right and the sensitivities are right \u2014 a recloser ' +
      'improves SAIFI, a tie improves SAIDI, fuse blowing trades one against ' +
      'the other. The absolute values belong to the assumed rates, not to any ' +
      'real feeder, and this feeder does not exist.',
    severity: 'modest',
  },
  {
    id: 'no-major-event-days',
    scope: ['feeder'],
    title: 'Storms are not in the reliability figures',
    whatWeDo:
      'Faults arrive at a steady rate proportional to how much wire there is. ' +
      'There is no weather: no wind event that brings down twenty spans at ' +
      'once, no heat wave that fails cable joints in a week.',
    fullTreatment:
      'IEEE Std 1366 defines a major event day by a statistical threshold \u2014 ' +
      'the 2.5-beta method \u2014 and utilities report indices both with and ' +
      'without those days, because the two numbers describe different things: ' +
      'how the system runs, and how badly it can go wrong.',
    consequence:
      'The indices here correspond to the reported figures that EXCLUDE major ' +
      'events, which is the flattering half of the pair. A bad storm year can ' +
      'double a utility\u2019s SAIDI on its own.',
    severity: 'modest',
  },
  {
    id: 'restoration-is-deterministic',
    scope: ['feeder'],
    title: 'Every crew takes exactly the same time',
    whatWeDo:
      'Repair, switching and back-feeding each take one fixed number of hours. ' +
      'A fault at three in the morning in the rain is restored as quickly as ' +
      'one at noon.',
    fullTreatment:
      'Restoration times are distributions, not constants, and they depend on ' +
      'crew availability, access, weather, and how many other faults are being ' +
      'worked at the same moment \u2014 which is exactly why a storm is not just ' +
      'more faults at the same rate.',
    consequence:
      'The averages are reasonable and the comparisons between options are ' +
      'sound. The model cannot say anything about the tail: the worst hour of ' +
      'the worst day is the thing customers remember, and it is not here.',
    severity: 'modest',
  },
  {
    id: 'tie-always-has-room',
    scope: ['feeder'],
    title: 'The next feeder can always pick up this one\u2019s far end',
    whatWeDo:
      'When the tie is available, every customer beyond the damage is back-fed ' +
      'through it in an hour, whatever the load is at the time.',
    fullTreatment:
      'The adjacent feeder has its own load and its own conductor rating. ' +
      'Back-feeding is a load-flow question: at the evening peak the tie may ' +
      'only be able to take part of the far end, or none of it, and a real ' +
      'switching plan is built around what the neighbour can carry.',
    consequence:
      'Overstates what the tie is worth at peak and understates it at night. ' +
      'The mechanism \u2014 and why a second path is worth building \u2014 is right.',
    severity: 'modest',
  },
  {
    id: 'invented-neighbourhood',
    scope: ['feeder', 'service'],
    title: 'The streets and houses around the feeder are invented',
    whatWeDo:
      'A street grid and building footprints are drawn around Cherry Lane 1201 ' +
      'so the feeder runs through somewhere rather than across blank paper. ' +
      'They carry no load, no address and no electrical meaning: the load is ' +
      'the spot loads in the model, and it is attached to the poles.',
    fullTreatment:
      'A utility works from a parcel map: every service, every meter, every ' +
      'address, tied to the transformer that feeds it. That is what makes a ' +
      'real outage management system able to say which houses are dark.',
    consequence:
      'The SCALE is right \u2014 block sizes, lot widths and setbacks are the ' +
      'ordinary dimensions of American suburban development, so the sense of ' +
      'how much street a megawatt covers is honest. Which house is which is ' +
      'not, and no house drawn here is the one whose service is modelled, ' +
      'apart from the one that is labelled.',
    severity: 'cosmetic',
  },
];

export const simplificationsFor = (scope: ScopeId): Simplification[] =>
  SIMPLIFICATIONS.filter((s) => s.scope.includes(scope) || s.scope.includes('global'));

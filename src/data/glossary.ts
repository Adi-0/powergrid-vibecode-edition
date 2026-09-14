/**
 * The glossary.
 *
 * The brief's rule: NO UNGLOSSED JARGON, EVER. The first time a term appears
 * anywhere in the interface it carries a one-line plain-language definition,
 * available on hover and in a persistent searchable list.
 *
 * Two things every entry must do:
 *
 *  - USE THE STANDARD TERM AND THE STANDARD SYMBOL. "Bus", not "junction".
 *    "Reactive power", not "wasted power". Anyone who learns friendly renames
 *    here has to unlearn them the moment they open a real one-line diagram or
 *    a textbook, which makes the tool worse than useless at exactly the point
 *    it should start paying off.
 *  - EXPLAIN IT IN A SENTENCE SOMEONE WITH NO BACKGROUND CAN READ. Plain
 *    language ALONGSIDE the standard notation, never instead of it.
 *
 * `test/glossary.test.ts` checks that every term used in the interface has an
 * entry here, that no entry is missing its symbol or unit where one exists, and
 * that no definition leans on another undefined term.
 */

export interface GlossaryEntry {
  id: string;
  /** The standard term, spelled as the field spells it. */
  term: string;
  /** Other spellings that should resolve to this entry. */
  aliases?: string[];
  /** The standard symbol, if the quantity has one. e.g. "S", "V∠θ", "Z". */
  symbol?: string;
  /** The SI or conventional unit. e.g. "MVA", "kV", "Ω". */
  unit?: string;
  /** One line, no jargon, readable by someone who knows nothing. */
  short: string;
  /** A longer explanation, for the panel. Optional. */
  long?: string;
  /** A sense of scale: what a typical value means in the real world. */
  scale?: string;
  /** The standard that defines it, where one does. */
  standard?: string;
  /** Related entries. */
  see?: string[];
  category:
    | 'quantity' | 'equipment' | 'network' | 'analysis' | 'protection'
    | 'operation' | 'economics';
}

export const GLOSSARY: GlossaryEntry[] = [
  // --- quantities ----------------------------------------------------------
  {
    id: 'real-power', term: 'Real power', aliases: ['active power', 'P'],
    symbol: 'P', unit: 'W, kW, MW', category: 'quantity',
    short: 'The part of electrical power that actually does work — turns motors, makes heat, makes light.',
    long:
      'It is the average of voltage times current over a cycle. When a bill ' +
      'says kilowatt-hours, this is what is being metered.',
    scale: '1 MW runs roughly 750 average American homes. A large power plant is 500–1,200 MW.',
    see: ['reactive-power', 'apparent-power'],
  },
  {
    id: 'reactive-power', term: 'Reactive power', aliases: ['Q', 'VAr'],
    symbol: 'Q', unit: 'VAr, kVAr, MVAr', category: 'quantity',
    short: 'Power that sloshes back and forth without doing any work — but the wires still have to carry it.',
    long:
      'Every motor and every transformer needs a magnetic field, and building ' +
      'that field takes energy that is given back half a cycle later. Averaged ' +
      'over a cycle it does no work, which is why it is not measured in watts. ' +
      'But it is real current in real wires, and carrying it consumes capacity ' +
      'and drops voltage exactly as real power does. That is why it is made ' +
      'close to where it is used, by capacitors, rather than shipped.',
    scale: 'A typical load needs about 0.2 MVAr for every 1 MW. A 500 kV line PRODUCES over 1 MVAr per kilometre, whether anyone wants it or not.',
    see: ['real-power', 'power-factor', 'capacitor-bank', 'shunt-reactor'],
  },
  {
    id: 'apparent-power', term: 'Apparent power', aliases: ['S', 'MVA'],
    symbol: 'S = P + jQ', unit: 'VA, kVA, MVA', category: 'quantity',
    short: 'Real power and reactive power taken together — the total the equipment actually has to be sized for.',
    long:
      'Written S = P + jQ, where j is the square root of minus one. Its ' +
      'magnitude is |S| = √(P² + Q²). Equipment is rated in MVA rather than MW ' +
      'because a transformer does not care whether the current it carries is ' +
      'doing work.',
    see: ['real-power', 'reactive-power', 'power-triangle'],
  },
  {
    id: 'power-factor', term: 'Power factor', aliases: ['pf', 'cos φ'],
    symbol: 'cos φ', unit: 'dimensionless, 0 to 1', category: 'quantity',
    short: 'What fraction of the power being carried is actually doing work.',
    long:
      'The cosine of the angle φ between voltage and current. A power factor ' +
      'of 1.0 means every amp is doing work; 0.8 means a quarter more current ' +
      'is flowing than the work requires, and every wire and transformer in the ' +
      'path has to be bigger for it.',
    scale: 'Urban load sits near 0.98. Irrigation pumping, which is almost all induction motors, is nearer 0.92.',
    see: ['reactive-power', 'power-triangle'],
  },
  {
    id: 'power-triangle', term: 'Power triangle', category: 'quantity',
    symbol: 'S² = P² + Q²',
    short: 'A right-angled triangle whose sides are real power, reactive power, and the two together.',
    long:
      'P along the bottom, Q up the side, S the hypotenuse, and the angle ' +
      'between P and S is φ, whose cosine is the power factor. It is the whole ' +
      'of AC power arithmetic in one picture.',
    see: ['real-power', 'reactive-power', 'apparent-power', 'power-factor'],
  },
  {
    id: 'voltage', term: 'Voltage', aliases: ['V', 'potential difference'],
    symbol: 'V∠θ', unit: 'V, kV', category: 'quantity',
    short: 'The electrical pressure pushing current through a wire.',
    long:
      'On an AC system a voltage has both a size and a timing, written V∠θ: ' +
      'the magnitude |V| and the phase angle θ, which says how far through its ' +
      'cycle it is compared with somewhere else. Both matter — the magnitude ' +
      'decides whether equipment works, and the angle differences decide where ' +
      'the power goes.',
    scale: 'A wall outlet is 120 V. Transmission runs at 115,000 to 500,000 V, because higher voltage means less current for the same power, and less current means far less loss.',
    standard: 'ANSI C84.1 defines the standard nominal voltages and the ranges equipment must tolerate.',
    see: ['phase-angle', 'per-unit'],
  },
  {
    id: 'phase-angle', term: 'Phase angle', aliases: ['voltage angle', 'θ'],
    symbol: 'θ', unit: 'degrees or radians', category: 'quantity',
    short: 'How far ahead or behind one alternating voltage is compared with another.',
    long:
      'Every voltage on the system is going up and down sixty times a second. ' +
      'The angle says WHEN each one peaks relative to a chosen reference. ' +
      'Real power flows from a larger angle to a smaller one, which is the ' +
      'single most useful fact in the subject: P ≈ (V₁V₂/X)·sin(θ₁ − θ₂).',
    scale: 'Across a heavily loaded long line, 20–40°. Past about 90° no steady solution exists at all, and the machines at each end fall out of step.',
    see: ['voltage', 'power-flow'],
  },
  {
    id: 'impedance', term: 'Impedance', aliases: ['Z'],
    symbol: 'Z = R + jX', unit: 'Ω (ohms)', category: 'quantity',
    short: 'How much a wire resists the flow of alternating current — partly by heating up, partly by storing energy in a magnetic field.',
    long:
      'Written Z = R + jX. The resistance R turns power into heat and is a ' +
      'real loss. The reactance X stores energy in the magnetic field around ' +
      'the conductor and gives it back, losing nothing — but it still drops ' +
      'voltage and still limits how much power the line can carry.',
    see: ['resistance', 'reactance', 'admittance'],
  },
  {
    id: 'resistance', term: 'Resistance', symbol: 'R', unit: 'Ω', category: 'quantity',
    short: 'The part of a wire’s opposition to current that turns power into heat.',
    scale: 'A 500 kV line has about 0.018 Ω per kilometre per phase. A distribution lateral has fifty times more.',
    see: ['impedance', 'reactance'],
  },
  {
    id: 'reactance', term: 'Reactance', symbol: 'X', unit: 'Ω', category: 'quantity',
    short: 'The part of a wire’s opposition to current that comes from its magnetic field, and loses nothing.',
    long:
      'X = 2πfL for an inductance L at frequency f. On a transmission line it ' +
      'is five to twenty times larger than the resistance, which is why the ' +
      'DC approximation — ignore R entirely — gets real power flows roughly ' +
      'right.',
    see: ['impedance', 'resistance', 'x-over-r'],
  },
  {
    id: 'x-over-r', term: 'X/R ratio', symbol: 'X/R', unit: 'dimensionless', category: 'quantity',
    short: 'How much more reactive than resistive a piece of equipment is.',
    scale: 'A 1,120 MVA transformer is about 45. A 50 kVA pole transformer is about 1.5 — small equipment is relatively far more resistive.',
    see: ['impedance'],
  },
  {
    id: 'admittance', term: 'Admittance', symbol: 'Y = G + jB', unit: 'S (siemens)', category: 'quantity',
    short: 'The reciprocal of impedance: how easily current flows rather than how hard it is resisted.',
    long:
      'Y = 1/Z = G + jB, where G is conductance and B is susceptance. The ' +
      'network is written in admittance rather than impedance because ' +
      'admittances in parallel simply add, and a bus is a parallel connection.',
    see: ['impedance', 'ybus'],
  },
  {
    id: 'per-unit', term: 'Per-unit', aliases: ['pu', 'p.u.'],
    symbol: 'pu', unit: 'dimensionless', category: 'analysis',
    short: 'Every quantity divided by a chosen base value of the same kind, so the numbers come out near 1.0.',
    long:
      'Pick a base power (100 MVA is universal) and a base voltage for each ' +
      'part of the system, then express everything as a fraction of its base. ' +
      'Two things make it worth the trouble. Transformers disappear from the ' +
      'arithmetic: a per-unit impedance is the same seen from either side, so ' +
      'no one has to keep referring quantities across turns ratios. And every ' +
      'voltage on a healthy system sits near 1.0 whatever its class, so a ' +
      'wrong number is obvious at a glance.',
    scale: 'On a 100 MVA base at 230 kV, the base impedance is 230²/100 = 529 Ω and the base current is 251 A.',
    see: ['base-quantities', 'voltage'],
  },
  {
    id: 'base-quantities', term: 'Base quantities', category: 'analysis',
    symbol: 'S_base, V_base, Z_base, I_base',
    short: 'The reference values everything per-unit is measured against.',
    long:
      'Choose S_base (power) and V_base (voltage); the rest follow. ' +
      'Z_base = V_base²/S_base and I_base = S_base/(√3·V_base). A per-unit ' +
      'number without its base is meaningless, which is why this app never ' +
      'shows one without the other.',
    see: ['per-unit'],
  },

  // --- network -------------------------------------------------------------
  {
    id: 'bus', term: 'Bus', aliases: ['busbar'], category: 'network',
    short: 'The metal bar inside a substation that everything at one voltage connects to — the junction where circuits meet.',
    long:
      'In a study, a "bus" is any point where the voltage is the same ' +
      'everywhere, so lines, transformers, generators and loads at that point ' +
      'all share one voltage and one angle. The whole power flow is the ' +
      'question "what is the voltage at every bus?".',
    see: ['slack-bus', 'pv-bus', 'pq-bus'],
  },
  {
    id: 'slack-bus', term: 'Slack bus', aliases: ['swing bus', 'reference bus'], category: 'analysis',
    short: 'The one bus where the solver lets power be whatever is needed to make everything balance.',
    long:
      'Generation must equal load plus losses exactly, but the losses are not ' +
      'known until the problem is solved. So one bus is nominated to absorb ' +
      'whatever is left over, and its voltage angle becomes the reference ' +
      'every other angle is measured against. In this model the slack is the ' +
      'intertie to the Pacific Northwest — which is the honest choice, because ' +
      'that is genuinely where California’s imbalance goes.',
    see: ['bus', 'pv-bus', 'pq-bus', 'power-flow'],
  },
  {
    id: 'pv-bus', term: 'PV bus', aliases: ['voltage-controlled bus', 'generator bus'], category: 'analysis',
    short: 'A bus where real power and voltage magnitude are set, and the reactive power is whatever holds that voltage.',
    long:
      'Physically: a generator. The operator sets how many megawatts it makes ' +
      'and what voltage it holds; the machine’s excitation then supplies ' +
      'whatever reactive power that takes — up to its limit, after which it can ' +
      'no longer hold the voltage and the bus becomes a PQ bus.',
    see: ['bus', 'pq-bus', 'slack-bus', 'reactive-limit'],
  },
  {
    id: 'pq-bus', term: 'PQ bus', aliases: ['load bus'], category: 'analysis',
    short: 'A bus where real and reactive power are set, and the voltage is whatever results.',
    long: 'Physically: a load, or a junction with nothing controlling its voltage.',
    see: ['bus', 'pv-bus'],
  },
  {
    id: 'ybus', term: 'Ybus', aliases: ['bus admittance matrix', 'Y-bus'], category: 'analysis',
    symbol: 'Y',
    short: 'The whole network written as a matrix, so that current equals that matrix times voltage.',
    long:
      'Entry Y[i][k] for i ≠ k is minus the admittance directly connecting bus ' +
      'i to bus k; the diagonal Y[i][i] is the sum of everything touching bus ' +
      'i. It is Kirchhoff’s current law in matrix form: I = Y·V.',
    see: ['admittance', 'power-flow'],
  },
  {
    id: 'power-flow', term: 'Power flow', aliases: ['load flow'], category: 'analysis',
    short: 'The calculation that works out the voltage at every bus, and therefore the power on every line.',
    long:
      'Every bus has four quantities — |V|, θ, P and Q. Two are known and two ' +
      'must be found, and which two depends on the bus type. The equations are ' +
      'nonlinear, so they are solved by repeated linear approximation, usually ' +
      'by the Newton–Raphson method.',
    see: ['newton-raphson', 'bus', 'dc-power-flow'],
  },
  {
    id: 'newton-raphson', term: 'Newton–Raphson', category: 'analysis',
    short: 'A method for solving equations by repeatedly guessing, measuring how wrong the guess is, and correcting.',
    long:
      'At each step it builds the Jacobian — a matrix of how every mismatch ' +
      'responds to every unknown — solves one linear system for the correction, ' +
      'applies it, and measures again. Near the answer the error squares on ' +
      'every iteration, which is why it typically converges in four or five ' +
      'steps from a sensible start.',
    see: ['power-flow', 'jacobian', 'mismatch'],
  },
  {
    id: 'jacobian', term: 'Jacobian', symbol: 'J', category: 'analysis',
    short: 'A table of how much each unknown affects each equation — the slope of the whole problem at once.',
    see: ['newton-raphson'],
  },
  {
    id: 'mismatch', term: 'Mismatch', symbol: 'ΔP, ΔQ', unit: 'pu or MW', category: 'analysis',
    short: 'The difference between the power a bus is supposed to have and the power the present guess gives it.',
    long: 'The solution is reached when every mismatch is smaller than the tolerance.',
    see: ['newton-raphson', 'power-flow'],
  },
  {
    id: 'dc-power-flow', term: 'DC power flow', category: 'analysis',
    short: 'A simplified calculation that ignores voltage and reactive power to get real power flows roughly right.',
    long:
      'Assume every voltage magnitude is exactly 1.0, ignore resistance beside ' +
      'reactance, and take sin θ ≈ θ. What remains is linear and always has a ' +
      'solution: P = (θᵢ − θₖ)/X on every branch.',
    see: ['power-flow', 'phase-angle'],
  },

  // --- equipment -----------------------------------------------------------
  {
    id: 'transformer', term: 'Transformer', category: 'equipment',
    short: 'Changes voltage from one level to another, using two coils that share a magnetic field.',
    long:
      'The ratio of turns sets the ratio of voltages, and inversely the ratio ' +
      'of currents, so the power in and out is almost the same. Stepping up to ' +
      'a high voltage is what makes long-distance transmission possible at all: ' +
      'the same power at ten times the voltage is a tenth of the current, and ' +
      'the heating loss goes as the square of current, so a hundredth of the loss.',
    see: ['tap-changer', 'vector-group', 'percent-impedance'],
  },
  {
    id: 'percent-impedance', term: 'Percentage impedance', aliases: ['%Z'],
    symbol: '%Z', unit: '%', category: 'equipment',
    short: 'A transformer’s impedance expressed as a percentage of its own rating.',
    long:
      'It is the voltage, as a percentage of rated, needed on one side to push ' +
      'full rated current through when the other side is short-circuited. It ' +
      'sets both the voltage drop under load and the fault current the ' +
      'transformer will let through.',
    scale: 'A large transmission transformer is 10–14 %. A small pole transformer is 2 %.',
    see: ['transformer', 'impedance'],
  },
  {
    id: 'vector-group', term: 'Vector group', category: 'equipment',
    symbol: 'e.g. Dyn1, YNa0',
    short: 'A shorthand for how a transformer’s windings are connected and how much the voltage shifts across it.',
    long:
      'Capital letter is the high-voltage winding, lower case the low: D for ' +
      'delta, Y for wye, N or n for a grounded neutral, and a clock number for ' +
      'the phase shift in units of 30°. Dyn1 is delta on the high side, ' +
      'grounded wye on the low, low side lagging by 30°.',
    standard: 'IEC 60076-1 / IEEE C57.12.00.',
    see: ['transformer', 'wye', 'delta'],
  },
  {
    id: 'tap-changer', term: 'Tap changer', aliases: ['LTC', 'OLTC'], category: 'equipment',
    short: 'A switch inside a transformer that adds or removes turns to nudge the output voltage up or down.',
    long:
      'An on-load tap changer does it without interrupting supply, typically ' +
      'in steps of 0.625 %, over a range of about ±10 %. It is the main way ' +
      'voltage is regulated on a distribution system.',
    see: ['transformer', 'voltage-regulation'],
  },
  {
    id: 'capacitor-bank', term: 'Capacitor bank', category: 'equipment',
    unit: 'MVAr',
    short: 'A set of capacitors that supplies reactive power locally, so it does not have to be carried over the network.',
    long:
      'Switched in as load rises and out as it falls, because the same bank ' +
      'that holds voltage up at the evening peak would push it too high at four ' +
      'in the morning.',
    see: ['reactive-power', 'shunt-reactor'],
  },
  {
    id: 'shunt-reactor', term: 'Shunt reactor', category: 'equipment',
    unit: 'MVAr',
    short: 'A coil that absorbs reactive power, used to stop long high-voltage lines pushing the voltage too high.',
    long:
      'A long extra-high-voltage line is an enormous capacitor — the ' +
      'conductors and the ground form a capacitance that produces over a ' +
      'megavar per kilometre at 500 kV whether anyone wants it or not. At ' +
      'light load there is nothing to consume it, and the voltage rises. ' +
      'Reactors absorb it; they are switched out again when the system is ' +
      'heavily loaded and needs all the reactive power it can get.',
    see: ['reactive-power', 'ferranti-effect', 'capacitor-bank'],
  },
  {
    id: 'circuit-breaker', term: 'Circuit breaker', category: 'protection',
    short: 'A switch built to interrupt fault current — it is what actually disconnects a faulted circuit.',
    long:
      'Interrupting tens of thousands of amps means the arc must be ' +
      'extinguished, usually by blasting it with compressed gas or by pulling ' +
      'the contacts apart in a vacuum. It opens on command from a protective ' +
      'relay, typically within two to three cycles — about 40 milliseconds.',
    see: ['disconnect-switch', 'relay', 'device-number'],
  },
  {
    id: 'disconnect-switch', term: 'Disconnect switch', aliases: ['isolator'], category: 'protection',
    short: 'A visible break in a circuit that has already been de-energised, so a crew can see it is safe to work.',
    long:
      'It cannot interrupt load current and must never be opened under load. ' +
      'Its job is to be visibly, unmistakably open.',
    see: ['circuit-breaker'],
  },
  {
    id: 'ct', term: 'Current transformer', aliases: ['CT'], category: 'protection',
    symbol: 'e.g. 1200:5',
    short: 'A transformer that scales down a large current so an instrument or relay can measure it safely.',
    scale: 'A 1200:5 CT turns 1,200 A in the primary into 5 A at the relay.',
    see: ['pt', 'relay'],
  },
  {
    id: 'pt', term: 'Potential transformer', aliases: ['PT', 'VT', 'voltage transformer'], category: 'protection',
    symbol: 'e.g. 2400:120',
    short: 'A transformer that scales down a high voltage so an instrument or relay can measure it safely.',
    see: ['ct', 'relay'],
  },
  {
    id: 'relay', term: 'Protective relay', category: 'protection',
    short: 'A device that watches current and voltage and decides when to trip a breaker.',
    long:
      'Relays are identified by standard device numbers so that any engineer ' +
      'can read any drawing: 50 is instantaneous overcurrent, 51 is ' +
      'time-overcurrent, 87 is differential, 21 is distance, 27 is undervoltage, ' +
      '59 is overvoltage, 81 is frequency.',
    standard: 'ANSI/IEEE C37.2 defines the device numbers.',
    see: ['device-number', 'circuit-breaker'],
  },
  {
    id: 'device-number', term: 'Device number', category: 'protection',
    short: 'A standard number that says what a protective device does, so any drawing can be read by anyone.',
    long:
      '50 instantaneous overcurrent · 51 time-overcurrent · 87 differential · ' +
      '21 distance · 27 undervoltage · 59 overvoltage · 81 frequency · ' +
      '86 lockout · 79 reclosing. A suffix says what it watches: 51N is ' +
      'time-overcurrent on the neutral.',
    standard: 'ANSI/IEEE C37.2.',
    see: ['relay'],
  },

  // --- three-phase ---------------------------------------------------------
  {
    id: 'three-phase', term: 'Three-phase', category: 'network',
    short: 'Three separate alternating voltages, each a third of a cycle apart, carried on three wires.',
    long:
      'The total power delivered by three phases together is CONSTANT, not ' +
      'pulsing, which is why motors run smoothly on it. It also takes less ' +
      'conductor to deliver the same power than single-phase would.',
    see: ['wye', 'delta', 'phase-angle'],
  },
  {
    id: 'wye', term: 'Wye connection', aliases: ['star', 'Y'], category: 'network',
    short: 'Three windings joined at a common point, which becomes the neutral.',
    long:
      'In a wye, the line-to-line voltage is √3 times the line-to-neutral ' +
      'voltage, and the line current equals the phase current. The common ' +
      'point can be grounded, which is what gives a distribution system its ' +
      'neutral and lets single-phase loads be connected.',
    see: ['delta', 'three-phase', 'root-three'],
  },
  {
    id: 'delta', term: 'Delta connection', aliases: ['Δ', 'D'], category: 'network',
    short: 'Three windings joined end to end in a triangle, with no neutral.',
    long:
      'In a delta, the line-to-line voltage equals the phase voltage, and the ' +
      'line current is √3 times the phase current — the mirror image of a wye. ' +
      'A delta winding traps zero-sequence current, which is why it is used on ' +
      'the high side of a distribution transformer.',
    see: ['wye', 'three-phase', 'root-three'],
  },
  {
    id: 'root-three', term: 'The √3 factor', symbol: '√3 ≈ 1.732', category: 'network',
    short: 'The number that keeps appearing in three-phase arithmetic, because the three phases are 120° apart.',
    long:
      'It is the ratio between line-to-line and line-to-neutral voltage in a ' +
      'wye, and between line and phase current in a delta. Three-phase power ' +
      'is S = √3 · V_LL · I.',
    see: ['wye', 'delta', 'three-phase'],
  },

  // --- operation -----------------------------------------------------------
  {
    id: 'thermal-limit', term: 'Thermal limit', unit: 'MVA or A', category: 'operation',
    short: 'The most current a conductor can carry continuously before it overheats, weakens, or sags too low.',
    long:
      'Aluminium loses strength permanently above about 100 °C, and a hot ' +
      'conductor sags — which is how a line ends up in a tree. On a long line ' +
      'this is usually NOT the binding limit; voltage drop and stability bind ' +
      'first.',
    see: ['loadability', 'sil'],
  },
  {
    id: 'loadability', term: 'Loadability', category: 'operation',
    short: 'How much power a line can actually carry in practice, which on a long line is far less than the metal allows.',
    long:
      'Past some loading the voltage at the far end falls out of range, or the ' +
      'angle across the line gets close enough to 90° that a disturbance would ' +
      'push the machines out of step. The standard empirical result, from ' +
      'St. Clair, is that the limit falls roughly as 43/L^0.6 multiples of the ' +
      'surge impedance loading, with L in miles.',
    see: ['thermal-limit', 'sil', 'phase-angle'],
  },
  {
    id: 'sil', term: 'Surge impedance loading', aliases: ['SIL'], unit: 'MW', category: 'operation',
    symbol: 'SIL = V²/Z_s',
    short: 'The loading at which a line’s own charging exactly cancels its own reactive consumption.',
    long:
      'Below it the line produces net reactive power; above it the line ' +
      'consumes net reactive power. It is the natural yardstick for how heavily ' +
      'a line is loaded, independent of its length.',
    scale: 'About 1,000 MW for a 500 kV line with a three-conductor bundle; about 130 MW at 230 kV.',
    see: ['loadability', 'ferranti-effect'],
  },
  {
    id: 'ferranti-effect', term: 'Ferranti effect', category: 'operation',
    short: 'The far end of a lightly loaded long line sits at a HIGHER voltage than the end it is fed from.',
    long:
      'The line’s own capacitance draws a current that leads the voltage, and ' +
      'that current flowing through the line’s series reactance raises the ' +
      'voltage rather than dropping it. On a long extra-high-voltage line it is ' +
      'large enough to damage equipment, which is why such lines carry shunt ' +
      'reactors.',
    see: ['shunt-reactor', 'sil', 'reactive-power'],
  },
  {
    id: 'reactive-limit', term: 'Reactive limit', category: 'operation',
    short: 'The most reactive power a generator can produce or absorb while still making its real power.',
    long:
      'A machine at its reactive limit has lost the ability to hold its ' +
      'voltage. Several machines reaching that point together is what a ' +
      'voltage collapse is made of, which is why keeping reactive reserve on ' +
      'the machines — by making the reactive power somewhere cheaper — is a ' +
      'first-order operating objective.',
    see: ['pv-bus', 'reactive-power', 'capability-curve'],
  },
  {
    id: 'capability-curve', term: 'Capability curve', category: 'operation',
    short: 'The map of every combination of real and reactive power a generator can actually produce.',
    long:
      'Bounded by three different physical limits: the current the stator can ' +
      'carry, the current the field winding can carry, and, when absorbing ' +
      'reactive power, the point at which the machine would lose synchronism.',
    see: ['reactive-limit', 'excitation'],
  },
  {
    id: 'excitation', term: 'Excitation', aliases: ['field current'], category: 'operation',
    short: 'The direct current fed into a generator’s rotor to make its magnetic field.',
    long:
      'Turning it up makes the machine produce reactive power and push its ' +
      'terminal voltage up; turning it down makes it absorb reactive power. It ' +
      'barely affects the real power, which is set by the turbine.',
    see: ['capability-curve', 'reactive-power'],
  },
  {
    id: 'inertia', term: 'Inertia constant', symbol: 'H', unit: 'MW·s/MVA', category: 'operation',
    short: 'How many seconds a machine could supply its own rating from the energy stored in its spinning mass alone.',
    long:
      'It is what stops the frequency falling instantly when a plant trips: ' +
      'every spinning machine on the system briefly gives up some of its ' +
      'rotational energy. Solar, wind and batteries have NONE, because nothing ' +
      'in them spins in step with the grid. That is the single most important ' +
      'thing that changes as a grid decarbonises.',
    scale: 'A large steam turbine is 4–6 seconds. Hydro is 2–4. Inverter-based generation is 0.',
    see: ['swing-equation', 'frequency'],
  },
  {
    id: 'swing-equation', term: 'Swing equation', category: 'operation',
    symbol: '2H/ω₀ · d²δ/dt² = P_m − P_e',
    short: 'The equation that says how a generator’s rotor speeds up or slows down when supply and demand do not match.',
    long:
      'Mechanical power in minus electrical power out equals the rate of ' +
      'change of stored rotational energy. If more power is being drawn than ' +
      'the turbine is supplying, the rotor slows and the angle falls behind — ' +
      'and if it falls far enough behind, the machine loses synchronism.',
    see: ['inertia', 'frequency', 'phase-angle'],
  },
  {
    id: 'frequency', term: 'Frequency', symbol: 'f', unit: 'Hz', category: 'operation',
    short: 'How many times a second the alternating voltage completes a cycle — 60 in North America.',
    long:
      'Every synchronous machine on the interconnection turns in lockstep at a ' +
      'speed tied to it. Frequency is the system’s pulse: it falls when demand ' +
      'exceeds generation and rises when generation exceeds demand, everywhere ' +
      'at once.',
    see: ['inertia', 'swing-equation'],
  },
  {
    id: 'voltage-regulation', term: 'Voltage regulation', unit: '%', category: 'operation',
    short: 'How much the voltage at the far end of something sags between no load and full load.',
    long: 'Expressed as (V_noload − V_fullload)/V_fullload, as a percentage.',
    see: ['tap-changer', 'voltage'],
  },

  // --- economics -----------------------------------------------------------
  {
    id: 'merit-order', term: 'Merit order', category: 'economics',
    short: 'The rule that the cheapest available generators run first, and more expensive ones are added until demand is met.',
    see: ['marginal-unit', 'marginal-cost'],
  },
  {
    id: 'marginal-unit', term: 'Marginal unit', category: 'economics',
    short: 'The last generator that had to be turned up to meet demand — the one that would move if demand moved.',
    see: ['merit-order', 'marginal-cost'],
  },
  {
    id: 'marginal-cost', term: 'Marginal cost', unit: '$/MWh', category: 'economics',
    short: 'What it costs to produce one more megawatt-hour right now — set by whichever generator is marginal.',
    long:
      'In a market this becomes the price everybody is paid, including the ' +
      'generators that are much cheaper to run. That is not a loophole: paying ' +
      'everyone the marginal price is what makes it rational for the cheap ' +
      'plants to offer at their true cost.',
    see: ['marginal-unit', 'merit-order'],
  },
  {
    id: 'capacity-factor', term: 'Capacity factor', unit: '%', category: 'economics',
    short: 'How much a plant actually produced over a period, as a fraction of what it would have produced running flat out.',
    scale: 'Nuclear runs above 90 %. Solar in California is around 25–30 %. A peaking gas turbine may be under 5 %.',
    see: ['load-factor'],
  },
  {
    id: 'load-factor', term: 'Load factor', unit: '%', category: 'economics',
    short: 'Average demand divided by peak demand over a period — how flat or peaky the demand is.',
    long:
      'A low load factor means a great deal of equipment sits idle most of the ' +
      'time waiting for a few hours a year, which is expensive.',
    see: ['capacity-factor', 'coincidence-factor'],
  },
  {
    id: 'coincidence-factor', term: 'Coincidence factor', category: 'economics',
    short: 'The fact that not everyone’s peak happens at the same moment, so a feeder needs less capacity than the sum of its customers.',
    scale: 'A hundred homes each peaking at 5 kW might only ever draw 200 kW together, not 500.',
    see: ['load-factor', 'demand-factor'],
  },
  {
    id: 'demand-factor', term: 'Demand factor', category: 'economics',
    short: 'The peak a customer actually draws, as a fraction of everything they have connected.',
    see: ['coincidence-factor'],
  },
  {
    id: 'duck-curve', term: 'Duck curve', category: 'economics',
    short: 'The shape of demand-minus-solar over a day: a deep dip at midday and a steep climb into the evening.',
    long:
      'It is not a picture someone drew. It is what is left when a large amount ' +
      'of solar output is subtracted from an ordinary demand curve, and the ' +
      'problem it names is the RAMP: the dispatchable plant has to climb ' +
      'thousands of megawatts in about three hours as the sun goes down and ' +
      'people come home.',
    see: ['net-load', 'merit-order'],
  },
  {
    id: 'net-load', term: 'Net load', unit: 'MW', category: 'economics',
    short: 'Total demand minus whatever the wind and sun happen to be producing — what everything else has to cover.',
    see: ['duck-curve'],
  },
  {
    id: 'curtailment', term: 'Curtailment', unit: 'MW', category: 'operation',
    short: 'Turning down a wind or solar plant that could have produced more, because nothing can absorb it.',
    long:
      'It happens when the must-run minimum output of the rest of the fleet, ' +
      'plus the renewables, exceeds demand — or when the transmission out of a ' +
      'region is full.',
    see: ['net-load', 'merit-order'],
  },

  // --- reliability ---------------------------------------------------------
  {
    id: 'saifi', term: 'SAIFI', category: 'operation',
    symbol: 'SAIFI', unit: 'interruptions per customer per year',
    short: 'How often the average customer loses power in a year.',
    long: 'Total customer interruptions divided by total customers served.',
    standard: 'IEEE Std 1366.',
    see: ['saidi', 'caidi'],
  },
  {
    id: 'saidi', term: 'SAIDI', category: 'operation',
    symbol: 'SAIDI', unit: 'minutes per customer per year',
    short: 'How long the average customer is without power in a year, in total.',
    standard: 'IEEE Std 1366.',
    see: ['saifi', 'caidi'],
  },
  {
    id: 'caidi', term: 'CAIDI', category: 'operation',
    symbol: 'CAIDI = SAIDI/SAIFI', unit: 'minutes per interruption',
    short: 'How long an outage lasts on average, once you have had one.',
    standard: 'IEEE Std 1366.',
    see: ['saifi', 'saidi'],
  },
  // --- distribution, the substation, and the service ------------------------
  {
    id: 'single-line-diagram', term: 'Single-line diagram', aliases: ['one-line diagram', 'one-line'],
    category: 'network',
    short: 'A drawing of a power system that throws away everything except what is connected to what.',
    long:
      'Three phases are drawn as one line — hence the name — and the physical ' +
      'arrangement is abandoned entirely. What remains is the electrical ' +
      'topology, which is all the mathematics needs. It is the drawing every ' +
      'engineer works from, and learning to see a real yard in one is most of ' +
      'what it means to read a substation.',
    standard: 'Symbols per IEEE 315 / ANSI Y32.2',
    see: ['bus', 'device-number'],
  },
  {
    id: 'feeder', term: 'Feeder', aliases: ['distribution feeder', 'primary feeder'],
    category: 'network',
    short: 'A circuit leaving a distribution substation to supply a few thousand customers along a street.',
    long:
      'Typically 12.47 kV in the United States, running three-phase along a ' +
      'main road with single-phase laterals branching into the side streets. A ' +
      'substation usually has four to eight of them.',
    scale: 'A feeder carries 4–10 MW and serves 1,000–2,000 customers over a few kilometres.',
    see: ['lateral', 'service-transformer', 'voltage-regulator'],
  },
  {
    id: 'lateral', term: 'Lateral', aliases: ['tap', 'branch line'],
    category: 'network',
    short: 'A branch off the main feeder, usually one phase and a neutral, serving one street.',
    long:
      'Each lateral is protected by its own fuse where it taps off the main, so ' +
      'a tree falling on one street does not take the whole feeder down. That ' +
      'is the entire reason a distribution system is built as a tree of fused ' +
      'branches rather than one big circuit.',
    see: ['feeder', 'multigrounded-neutral'],
  },
  {
    id: 'multigrounded-neutral', term: 'Four-wire multigrounded neutral',
    aliases: ['multigrounded wye', 'four-wire wye'], category: 'network',
    short: 'Three phase wires plus a neutral that is connected to earth at every single pole.',
    long:
      'Earthing the neutral repeatedly holds it close to the potential of the ' +
      'ground underfoot, and it is what makes a single-phase lateral possible: ' +
      'one phase wire and the shared neutral are a complete circuit. It is the ' +
      'standard North American distribution arrangement and it is why a fallen ' +
      'wire usually trips a fuse instead of lying there live.',
    see: ['lateral', 'grounding-electrode', 'wye'],
  },
  {
    id: 'voltage-regulator', term: 'Step voltage regulator', aliases: ['line regulator', 'feeder regulator'],
    category: 'equipment',
    short: 'An autotransformer with a motor-driven tap changer, sitting on a pole part-way along a feeder.',
    long:
      'It watches the voltage downstream of itself and moves one tap at a time ' +
      'to hold it at a setpoint. Thirty-two steps of 0.625 % give a range of ' +
      '±10 %. It is the same idea as a transformer tap changer, applied out in ' +
      'the street rather than in the substation.',
    standard: 'ANSI/IEEE C57.15',
    scale: 'One step is 0.625 %, which at 12.47 kV is 78 volts.',
    see: ['tap-changer', 'voltage-regulation', 'feeder'],
  },
  {
    id: 'recloser', term: 'Recloser', category: 'protection',
    symbol: '79',
    short: 'A breaker that tries again, because most faults on an overhead line clear themselves.',
    long:
      'A branch blown across the wires, a bird, a flashover in the rain — ' +
      'de-energising the line for half a second lets the arc go out, and ' +
      'closing again restores supply with nobody noticing more than a flicker. ' +
      'If the fault is still there it trips again, and after two or three ' +
      'attempts it gives up and stays open.',
    standard: 'ANSI/IEEE C37.2 device 79',
    see: ['device-number', 'circuit-breaker', 'saifi'],
  },
  {
    id: 'service-transformer', term: 'Service transformer', aliases: ['distribution transformer', 'pad-mount'],
    category: 'equipment',
    short: 'The last transformer in the chain: 12.47 kV in, 240/120 V out, shared by a handful of houses.',
    long:
      'On a pole, or in a green steel box on a concrete plinth. Its secondary ' +
      'is one winding with a tap brought out from the middle, which is why a ' +
      'house gets both 240 V and 120 V from it.',
    scale: 'Typically 25–100 kVA, serving 4–20 homes.',
    see: ['service-entrance', 'transformer'],
  },
  {
    id: 'service-entrance', term: 'Service entrance', aliases: ['service drop', 'service lateral'],
    category: 'network',
    short: 'The conductors from the last transformer to a building’s meter and main panel.',
    long:
      'Overhead it is called a drop; underground it is called a lateral. It ' +
      'carries two hot legs and a neutral. The meter marks the boundary of ' +
      'ownership between the utility and the householder.',
    see: ['service-transformer', 'branch-circuit', 'ansi-c84-1'],
  },
  {
    id: 'branch-circuit', term: 'Branch circuit', category: 'network',
    short: 'One circuit inside a building, from a breaker in the panel to the sockets it feeds.',
    long:
      'A 120 V branch circuit runs from one of the two hot bus bars to the ' +
      'neutral. A 240 V one spans both bars. The breaker protecting it sets the ' +
      'conductor size: 15 A on 14 AWG, 20 A on 12 AWG, and so on.',
    standard: 'NFPA 70 (National Electrical Code), Article 210',
    see: ['service-entrance', 'ampacity', 'voltage-drop'],
  },
  {
    id: 'ampacity', term: 'Ampacity', symbol: 'I', unit: 'A', category: 'quantity',
    short: 'The current a conductor can carry continuously without its insulation getting too hot.',
    long:
      'It is a thermal limit, not an electrical one: the conductor is perfectly ' +
      'happy, but at some current the heat it produces cooks whatever is ' +
      'wrapped around it. That is why ampacity depends on the insulation ' +
      'rating, on how many conductors share a conduit, and on the ambient ' +
      'temperature.',
    standard: 'NFPA 70 Table 310.16',
    scale: '12 AWG copper is good for 20 A; 4/0 aluminium service conductors for about 180 A.',
    see: ['thermal-limit', 'branch-circuit'],
  },
  {
    id: 'voltage-drop', term: 'Voltage drop', symbol: 'ΔV', unit: 'V', category: 'quantity',
    short: 'The voltage lost along a wire, because current flowing through impedance drops voltage.',
    long:
      'Worked in the field as ΔV = I·(R·cos φ + X·sin φ)·2ℓ — the 2 because ' +
      'current goes out on one conductor and comes back on another, and both ' +
      'of them drop voltage. It is the reason the far end of a feeder is lower ' +
      'than the near end, and the reason regulators and capacitors exist.',
    scale: 'Codes of practice keep it under about 3 % on a branch circuit and 5 % overall.',
    see: ['impedance', 'voltage-regulation', 'ansi-c84-1'],
  },
  {
    id: 'ansi-c84-1', term: 'ANSI C84.1 voltage range', aliases: ['Range A', 'voltage limits'],
    category: 'operation',
    short: 'The standard that says how far the voltage at your socket is allowed to stray from 120 V.',
    long:
      'Range A is where the system is supposed to sit: 114–126 V at the meter ' +
      'and 110–126 V at the appliance. Range B is where it may sit briefly and ' +
      'occasionally. The utilisation limits are wider at the bottom than the ' +
      'service limits, deliberately, to leave room for the drop along the ' +
      'building’s own wiring.',
    standard: 'ANSI C84.1-2020, Table 1',
    see: ['voltage-drop', 'voltage-regulation'],
  },
  {
    id: 'grounding-electrode', term: 'Grounding electrode', aliases: ['ground rod', 'earth electrode'],
    category: 'equipment',
    short: 'A rod driven into the earth, bonded to the system neutral, holding everything near the potential of the ground you stand on.',
    long:
      'It does not carry load current and it does not clear faults — the ' +
      'neutral and the equipment grounding conductor do that. What it does is ' +
      'give lightning and a fallen primary conductor somewhere to go, and keep ' +
      'the whole system referenced to the earth rather than floating at ' +
      'whatever potential it likes.',
    standard: 'NFPA 70 Article 250; IEEE 80 for substation grids',
    see: ['ground-grid', 'multigrounded-neutral'],
  },
  {
    id: 'ground-grid', term: 'Ground grid', aliases: ['earth mat', 'step and touch potential'],
    category: 'equipment',
    short: 'A mesh of bare copper buried under a substation, so that fault current flowing into the earth cannot kill anyone standing on it.',
    long:
      'When thousands of amperes flow into the soil at one point, the ground ' +
      'surface develops a voltage gradient — a person’s two feet can be at ' +
      'different potentials (STEP potential), or their hand on a steel structure ' +
      'at a different potential from their feet (TOUCH potential). The grid ties ' +
      'the whole yard to one potential, and the gravel on top raises the ' +
      'resistance between shoe and soil.',
    standard: 'IEEE Std 80',
    see: ['grounding-electrode'],
  },
  {
    id: 'differential-protection', term: 'Differential protection', symbol: '87',
    category: 'protection',
    short: 'Compares what goes into a piece of equipment with what comes out; any difference means the fault is inside it.',
    long:
      'It is the most selective protection there is, because it defines a ' +
      'ZONE with current transformers at every boundary and needs no ' +
      'coordination delay at all: current that entered the zone and did not ' +
      'leave it can only be going somewhere it should not, so there is nothing ' +
      'to wait for.',
    standard: 'ANSI/IEEE C37.2 device 87 (87T transformer, 87B bus)',
    see: ['device-number', 'ct', 'coordination'],
  },
  {
    id: 'coordination', term: 'Protection coordination', aliases: ['selectivity', 'TCC curve'],
    category: 'protection',
    short: 'Setting protective devices in series so that the one nearest the fault operates first and the others wait.',
    long:
      'Every overcurrent device has a curve of operating time against current, ' +
      'and coordination means arranging those curves so they never cross: the ' +
      'fuse on the lateral clears before the recloser on the feeder, which ' +
      'clears before the breaker in the substation. Get it wrong and a fault on ' +
      'one street takes out the whole substation.',
    standard: 'IEEE Std 242 (the Buff Book)',
    see: ['device-number', 'recloser', 'differential-protection'],
  },
  {
    id: 'coincidence', term: 'Coincident demand', aliases: ['diversity', 'non-coincident peak'],
    category: 'operation',
    short: 'The fact that everyone’s peak does not happen at the same moment, so the total is far less than the sum.',
    long:
      'A house can draw 20 kW with the oven, the dryer and the car charger all ' +
      'running. A hundred houses do not draw 2 MW, because they do not all do ' +
      'it at once — they draw perhaps 400 kW. Every conductor and every ' +
      'transformer between here and the generator is sized on the coincident ' +
      'figure, which is why the system is affordable at all.',
    see: ['coincidence-factor', 'demand-factor', 'load-factor'],
  },
];

const INDEX = new Map<string, GlossaryEntry>();
for (const e of GLOSSARY) {
  INDEX.set(e.id, e);
  INDEX.set(e.term.toLowerCase(), e);
  for (const a of e.aliases ?? []) INDEX.set(a.toLowerCase(), e);
}

/** Look up a term by id, name or alias. Case-insensitive. */
export const lookup = (key: string): GlossaryEntry | undefined =>
  INDEX.get(key) ?? INDEX.get(key.toLowerCase().trim());

/** Free-text search over term, aliases and definitions. */
export function searchGlossary(query: string): GlossaryEntry[] {
  const q = query.toLowerCase().trim();
  if (!q) return GLOSSARY;
  const score = (e: GlossaryEntry): number => {
    const term = e.term.toLowerCase();
    if (term === q) return 100;
    if (term.startsWith(q)) return 80;
    if ((e.aliases ?? []).some((a) => a.toLowerCase().startsWith(q))) return 70;
    if (term.includes(q)) return 50;
    if (e.short.toLowerCase().includes(q)) return 20;
    if ((e.long ?? '').toLowerCase().includes(q)) return 10;
    return 0;
  };
  return GLOSSARY
    .map((e) => ({ e, s: score(e) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.e.term.localeCompare(b.e.term))
    .map((x) => x.e);
}

export const GLOSSARY_CATEGORIES: { id: GlossaryEntry['category']; name: string }[] = [
  { id: 'quantity', name: 'Quantities' },
  { id: 'network', name: 'The network' },
  { id: 'equipment', name: 'Equipment' },
  { id: 'analysis', name: 'Analysis' },
  { id: 'protection', name: 'Protection' },
  { id: 'operation', name: 'Operating the system' },
  { id: 'economics', name: 'Economics' },
];

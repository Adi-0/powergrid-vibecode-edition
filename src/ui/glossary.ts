/**
 * Every term of art the app uses, with a one-line plain-language definition. The
 * first time a term appears anywhere in the UI it is marked and carries this line on
 * hover or focus; all of them are in the searchable glossary. No term appears
 * without an entry: rich text references terms as [[id]] or [[id|shown words]],
 * and an unknown id throws.
 */
export interface Term {
  id: string;
  term: string;
  /** Standard notation, where there is one. */
  notation?: string;
  plain: string;
  /** A second sentence for readers who want more. */
  more?: string;
}

const T = (id: string, term: string, plain: string, notation?: string, more?: string): Term => ({
  id,
  term,
  plain,
  ...(notation ? { notation } : {}),
  ...(more ? { more } : {}),
});

export const TERMS: Term[] = [
  // ---- basics
  T('voltage', 'Voltage', 'The push that drives electric current; measured in volts.', 'V (volts)'),
  T('current', 'Current', 'The flow of electric charge; measured in amperes.', 'I (amperes, A)'),
  T('ac', 'Alternating current (AC)', 'Current that reverses direction many times a second — 60 times here.', '', 'Voltage and current rise and fall as sine waves.'),
  T('frequency', 'Frequency', 'How many times per second AC reverses; 60 hertz across North America.', 'f (hertz, Hz)'),
  T('rms', 'RMS', 'Root-mean-square: the steady value that would deliver the same power as the wave. All magnitudes here are RMS unless marked peak.', 'V_rms = V_peak/√2'),
  T('phasor', 'Phasor', 'An AC quantity written as a size and an angle — how far ahead or behind a reference wave it is.', 'V∠θ'),
  T('angle', 'Voltage angle', 'How far a bus’s voltage wave is shifted in time from the reference bus’s; power flows from leading angles to lagging ones.', 'θ (degrees)'),
  T('three-phase', 'Three-phase', 'Three AC waves 120° apart on three wires; together they deliver steady power and let motors turn smoothly.', '3φ'),
  T('per-phase', 'Per phase', 'One of the three phases on its own; three-phase totals are three times a balanced per-phase value.', '1φ'),
  T('line-to-line', 'Line-to-line voltage', 'Voltage measured between two phase wires; √3 times the line-to-neutral voltage in a balanced system.', 'V_LL'),
  T('line-to-neutral', 'Line-to-neutral voltage', 'Voltage measured from one phase wire to the neutral (or ground).', 'V_LN'),
  T('wye', 'Wye (Y) connection', 'Three windings or loads joined at a common neutral point; each sees line-to-neutral voltage.', 'Y'),
  T('delta', 'Delta (Δ) connection', 'Three windings or loads joined end to end in a triangle; each sees line-to-line voltage.', 'Δ'),
  T('real-power', 'Real power', 'Power that does work — heats, lights, turns motors; measured in watts.', 'P (W, MW)'),
  T('reactive-power', 'Reactive power', 'Power that sloshes back and forth each cycle to build magnetic and electric fields; it does no net work but loads the wires.', 'Q (var, MVAr)', 'Motors and lines absorb it; capacitors and generators supply it. Voltage is held up by supplying it where it is used.'),
  T('apparent-power', 'Apparent power', 'Voltage times current: what the equipment has to carry, combining real and reactive power.', 'S = P + jQ, |S| (VA, MVA)'),
  T('complex-power', 'Complex power', 'Real and reactive power written as one complex number, computed from voltage and conjugated current.', 'S = V·I*'),
  T('power-factor', 'Power factor', 'The share of apparent power that is real power; 1 means no reactive power.', 'pf = cos φ = P/|S|'),
  T('pf-angle', 'Power-factor angle', 'The angle between voltage and current; its cosine is the power factor.', 'φ'),
  T('impedance', 'Impedance', 'Opposition to AC: resistance plus reactance.', 'Z = R + jX (Ω)'),
  T('resistance', 'Resistance', 'The part of impedance that turns current into heat.', 'R (Ω)'),
  T('reactance', 'Reactance', 'The part of impedance from magnetic and electric fields; it stores energy instead of losing it.', 'X (Ω)'),
  T('admittance', 'Admittance', 'The reciprocal of impedance: how easily current flows.', 'Y = G + jB (siemens, S)'),
  T('susceptance', 'Susceptance', 'The reactive part of admittance; a line’s charging and a capacitor’s effect.', 'B (S)'),
  T('per-unit', 'Per-unit', 'A quantity divided by a chosen base value, so 1.0 means “nominal”; it lets transformers’ ratios drop out of the arithmetic.', 'pu', 'A power system picks one power base (100 MVA here) and one voltage base per voltage level.'),
  T('base', 'Base value', 'The reference a per-unit number is measured against.', 'S_base, V_base, Z_base = V_base²/S_base'),
  // ---- network
  T('bus', 'Bus', 'A node in the network: a set of conductors at one voltage where lines, transformers, generators and loads connect.', '', 'In a substation it is a physical busbar.'),
  T('busbar', 'Busbar', 'A heavy conductor in a substation that equipment connects to.'),
  T('substation', 'Substation', 'A fenced yard where lines meet, voltages are transformed, and equipment is switched and protected.'),
  T('transmission', 'Transmission', 'High-voltage lines (115–500 kV here) that move bulk power long distances.'),
  T('subtransmission', 'Subtransmission', 'Medium-high voltage lines (60–70 kV in California) between bulk transmission and distribution substations.'),
  T('distribution', 'Distribution', 'The local network (4–35 kV primary, then 120/240 V) that delivers power to customers.'),
  T('line', 'Transmission line', 'Conductors on towers carrying power between substations.'),
  T('circuit', 'Circuit', 'One complete set of three phase conductors; a corridor may carry several circuits.'),
  T('transformer', 'Transformer', 'Two windings on an iron core that change voltage up or down by their turns ratio.', 'a = N₁/N₂'),
  T('gsu', 'Generator step-up transformer', 'The transformer that raises a generator’s voltage to transmission voltage.', 'GSU'),
  T('autotransformer', 'Autotransformer', 'A transformer whose windings share turns; used between 500 and 230 kV because it is smaller and cheaper for close ratios.'),
  T('vector-group', 'Vector group', 'The standard code for how a transformer’s windings are connected and how far the low side is shifted in angle.', 'e.g. Dyn1, YNa0'),
  T('pi-model', 'π model', 'A line drawn as one series impedance with half its charging admittance at each end — the shape of the letter π.'),
  T('sil', 'Surge impedance loading', 'The power at which a line’s reactive power produced and consumed balance exactly; a natural “size” for a line.', 'SIL = V_LL²/Z_c'),
  T('thermal-limit', 'Thermal limit', 'The most current a conductor can carry before it heats and sags too far.'),
  T('stability-limit', 'Stability limit', 'On long lines, the power transfer beyond which generators at the two ends could fall out of step; below the thermal limit.'),
  T('st-clair', 'St. Clair curve', 'A rule-of-thumb curve of how much a line can carry, as a multiple of its SIL, versus its length.'),
  T('ferranti', 'Ferranti effect', 'A lightly loaded long line’s far-end voltage rises above its sending-end voltage because its charging current flows through its inductance.'),
  T('rating', 'Rating', 'The most apparent power equipment may carry continuously.', 'MVA'),
  T('emergency-rating', 'Emergency rating', 'A higher rating allowed for a few hours after a failure elsewhere, while operators re-arrange things.'),
  T('loading', 'Loading', 'The flow on a branch as a percentage of its rating.'),
  T('region', 'Region', 'Part of the grid drawn on its own: its substations, every circuit among them at every voltage, and the circuits that cross its edge.'),
  T('losses', 'Losses', 'Power turned into heat in lines and transformers on the way; about 1–3 % of demand on a transmission system.', 'I²R'),
  T('intertie', 'Intertie', 'A line connecting one grid to a neighbouring one.'),
  T('hvdc', 'HVDC', 'High-voltage direct current: a link whose flow is set by power-electronic converters rather than by the network.'),
  T('meshed', 'Meshed network', 'A network with loops, so power has more than one path; losing one line does not cut anyone off.'),
  T('radial', 'Radial network', 'A tree-shaped network with one path from the source to each point; distribution feeders are radial.'),
  T('island', 'Island', 'Part of the grid cut off from the rest; it must balance its own generation and load or go dark.'),
  // ---- power flow
  T('power-flow', 'Power flow', 'The calculation of every bus voltage and every line flow for a given set of loads and generation.', '', 'Also called load flow.'),
  T('ybus', 'Bus admittance matrix', 'A table of how every bus is connected to every other; it turns bus voltages into injected currents.', 'I = Y_bus·V'),
  T('newton-raphson', 'Newton–Raphson', 'An iterative method: guess, measure how wrong the guess is (the mismatch), correct using slopes, repeat.'),
  T('mismatch', 'Mismatch', 'The difference between the power a guess of voltages would send into a bus and the power actually scheduled there.', 'ΔP, ΔQ'),
  T('jacobian', 'Jacobian', 'The table of slopes: how each bus’s power changes as each voltage angle and magnitude changes.', 'J'),
  T('pq-bus', 'PQ bus', 'A bus where real and reactive power are known (a load); the solver finds its voltage.'),
  T('pv-bus', 'PV bus', 'A bus with a generator holding its voltage; real power and voltage magnitude are known.'),
  T('slack-bus', 'Slack bus', 'In textbook power flow, the one bus whose generator absorbs whatever imbalance is left, and which sets the angle reference.', '', 'Real grids share the imbalance among many generators; this model does too (distributed slack).'),
  T('distributed-slack', 'Distributed slack', 'Sharing a power imbalance among many generators in proportion to how strongly each responds, as governors do.', 'λ, k_g'),
  T('reference-bus', 'Reference bus', 'The bus whose voltage angle is defined as zero; every other angle is measured from it.'),
  T('dc-power-flow', 'DC power flow', 'A linear shortcut: assume voltages are 1 pu, angles are small and lines have no resistance; flows are then angle differences over reactances.'),
  T('ptdf', 'Power transfer distribution factor', 'The share of a megawatt moved between two buses that flows on a given line.', 'PTDF'),
  T('voltage-collapse', 'Voltage collapse', 'When a network is asked to deliver more power than it can at any voltage it can hold, voltages fall away and no steady operating point exists.'),
  T('nose-curve', 'P–V (nose) curve', 'Voltage plotted against power delivered; it bends back at a “nose” — the most the network can deliver.'),
  // ---- operation
  T('dispatch', 'Dispatch', 'Deciding how much each generator produces.'),
  T('merit-order', 'Merit order', 'Generators ranked from cheapest to dearest to run; demand is met by going up the list.'),
  T('marginal-unit', 'Marginal unit', 'The generator that would supply the next megawatt; its cost sets the price.'),
  T('marginal-cost', 'Marginal cost', 'The cost of producing one more megawatt-hour.', '$/MWh'),
  T('lmp', 'Locational marginal price', 'The cost of serving one more megawatt at a particular bus; it differs by place when lines are congested.', 'LMP ($/MWh)'),
  T('congestion', 'Congestion', 'A line at its limit, so cheaper power cannot reach where it is needed and dearer local power runs instead.'),
  T('unit-commitment', 'Unit commitment', 'Deciding which generators are started and running ahead of time.'),
  T('ramp-rate', 'Ramp rate', 'How fast a generator can change its output.', 'MW/min'),
  T('heat-rate', 'Heat rate', 'Fuel energy needed per unit of electricity; lower is more efficient.', 'Btu/kWh'),
  T('capacity-factor', 'Capacity factor', 'Energy actually produced over a period divided by what the plant would produce at full output all the time.'),
  T('load-factor', 'Load factor', 'Average demand divided by peak demand over a period.'),
  T('curtailment', 'Curtailment', 'Deliberately producing less wind or solar power than available because the grid cannot use it.'),
  T('duck-curve', 'Duck curve', 'Demand minus wind and solar over a day: a deep midday belly and a steep evening neck — it looks like a duck.'),
  T('net-load', 'Net load', 'Demand minus wind and solar output: what the rest of the fleet must supply.'),
  T('btm-solar', 'Rooftop (behind-the-meter) solar', 'Panels on customers’ roofs; the grid sees them only as lower demand.'),
  T('reserve', 'Operating reserve', 'Spare generating capacity kept running to cover a sudden loss.'),
  T('must-run', 'Reliability must-run', 'A plant kept online regardless of cost because the local network needs it to hold voltage or cover a failure.'),
  T('n-1', 'N-1 security', 'Being able to lose any one element and still keep everything within emergency ratings.'),
  T('contingency', 'Contingency', 'The loss of one element — a line, a transformer, a generator.'),
  T('agc', 'Automatic generation control', 'The control that, over minutes, moves generators to bring frequency and interchange back to schedule.', 'AGC'),
  T('governor', 'Governor', 'A generator’s speed controller: when frequency falls it opens the throttle, in proportion to its droop.'),
  T('droop', 'Droop', 'How much frequency must fall for a governor to go from no load to full load, as a percentage.', 'R (e.g. 5 %)'),
  T('inertia', 'Inertia', 'The kinetic energy stored in spinning generators; it slows how fast frequency can change after a loss.', 'H (s)'),
  T('nadir', 'Frequency nadir', 'The lowest point frequency reaches after a sudden loss of generation.'),
  T('switched-shunt', 'Switched shunt', 'A capacitor or reactor bank switched in or out in steps to hold voltage.'),
  T('capacitor-bank', 'Capacitor bank', 'Capacitors connected to a bus to supply reactive power and raise voltage.'),
  T('reactor', 'Shunt reactor', 'A coil connected to a bus to absorb reactive power and lower voltage.'),
  T('syncon', 'Synchronous condenser', 'A generator with no engine, spinning in step with the grid to supply or absorb reactive power and add inertia.'),
  T('load-damping', 'Load damping', 'Motors and other load draw a little less power when frequency falls, which helps hold it up.', 'D (% load per % frequency)'),
  T('rocof', 'Rate of change of frequency', 'How fast frequency falls in the first instant after a loss; set by inertia alone.', 'df/dt (Hz/s)'),
  // ---- plants and machines
  T('combined-cycle', 'Combined cycle', 'A gas turbine whose hot exhaust makes steam for a second, steam turbine: two cycles from one fuel, about half of it turned to electricity.', 'CCGT'),
  T('hrsg', 'Heat-recovery steam generator', 'A boiler heated by a gas turbine’s exhaust instead of a flame.', 'HRSG'),
  T('hhv', 'Higher heating value', 'All the heat a fuel gives when burned, including the heat recovered by condensing the water vapour it makes.', 'HHV'),
  T('lhv', 'Lower heating value', 'The heat a fuel gives when burned, leaving its water vapour as vapour: what an engine can actually use.', 'LHV'),
  T('synchronous-generator', 'Synchronous generator', 'A generator whose rotor turns in exact step with the grid’s frequency; nearly all large power-plant generators are this kind.'),
  T('excitation', 'Excitation', 'The direct current in a generator’s rotor that makes its magnetic field; more excitation, more internal voltage and more reactive power out.', 'I_fd, E_f'),
  T('load-angle', 'Load angle', 'How far a generator’s internal voltage leads its terminal voltage; it grows with the real power the machine delivers.', 'δ'),
  T('capability-curve', 'Capability curve', 'The region of real and reactive power a generator may make without overheating its stator or rotor or losing stability.', 'P–Q chart'),
  T('sequence-networks', 'Sequence networks', 'Any unbalanced set of three-phase quantities splits into balanced positive-, negative- and zero-sequence sets; each has its own impedances.', 'Z₁, Z₂, Z₀'),
  // ---- distribution
  T('feeder', 'Feeder', 'A distribution circuit leaving a substation to serve a neighbourhood.'),
  T('lateral', 'Lateral', 'A branch off a feeder, often a single phase, serving a street or two.'),
  T('multigrounded-wye', 'Four-wire multigrounded wye', 'Three phase wires plus a neutral grounded at every pole: the standard North American feeder.'),
  T('service-transformer', 'Service transformer', 'The pole-top or pad-mounted transformer that steps primary voltage down to 120/240 V for a few homes.'),
  T('center-tap', 'Center-tapped transformer', 'A transformer whose low-voltage winding is tapped in the middle, giving two 120 V legs and 240 V across both.'),
  T('split-phase', 'Split-phase (120/240 V)', 'The North American home supply: two 120 V legs in opposite polarity, 240 V between them.'),
  T('triplex', 'Triplex', 'The twisted cable of two insulated legs and a bare neutral that runs from the transformer to homes.'),
  T('service-drop', 'Service drop', 'The cable from the pole to a home.'),
  T('meter', 'Meter', 'Measures the energy a customer uses.'),
  T('regulator', 'Voltage regulator', 'An autotransformer with taps that raises or lowers feeder voltage in 0.625 % steps.'),
  T('ltc', 'Load tap changer', 'A mechanism that changes a transformer’s ratio while it carries load, to hold voltage.', 'LTC'),
  T('ldc', 'Line-drop compensation', 'Making a regulator hold voltage at a point down the feeder by modelling the line’s drop inside its control.'),
  T('c84', 'ANSI C84.1', 'The standard for service voltage: Range A is 114–126 V on a 120 V base.'),
  T('recloser', 'Recloser', 'A breaker on a feeder that opens on a fault and closes again automatically, clearing temporary faults.'),
  T('fuse', 'Fuse', 'A link that melts on overcurrent, isolating a lateral.'),
  T('breaker', 'Circuit breaker', 'A switch that can interrupt fault current, opened by protective relays.'),
  T('outlet', 'Outlet', 'The wall socket: 120 V between the hot and neutral slots.'),
  // ---- models
  T('quasi-static', 'Quasi-static', 'A sequence of independent steady states, one per time interval; nothing between them is simulated.'),
  T('positive-sequence', 'Positive-sequence model', 'Representing a balanced three-phase system by one phase; standard for transmission.'),
  T('unbalanced', 'Unbalanced three-phase', 'Modelling each phase separately because loads differ phase to phase; standard for distribution.'),
  T('sweep', 'Backward/forward sweep', 'For a radial feeder: add up currents from the ends toward the source, then compute voltages from the source out; repeat.'),
  T('carson', 'Carson’s equations', 'Formulas for a conductor’s impedance with the earth as return path.'),
  T('kron', 'Kron reduction', 'Folding grounded neutrals into the phase conductors’ impedances.'),
];

export const TERM_BY_ID = new Map(TERMS.map((t) => [t.id, t]));

/** A term's name as it reads mid-sentence: "Transmission" → "transmission", "AC" stays. */
function inline(term: string): string {
  const first = term.split(/[\s(]/)[0]!;
  if (first.length > 1 && first === first.toUpperCase()) return term;
  if (/^[A-Z][a-z]/.test(term) && !/^(Newton|Kron|Carson|Surge|St\.|Ferranti|ANSI)/.test(term)) return term[0]!.toLowerCase() + term.slice(1);
  return term;
}

/** Terms already shown with their definition marker (first appearance). */
const introduced = new Set<string>();

export function termSpan(id: string, shown?: string): HTMLSpanElement {
  const t = TERM_BY_ID.get(id);
  if (!t) throw new Error(`unknown glossary term "${id}"`);
  const s = document.createElement('span');
  s.className = 'term';
  s.tabIndex = 0;
  s.dataset.term = id;
  // a term's name can carry figures ("ANSI C84.1"): its source is the glossary
  s.dataset.prov = `data:glossary.${id}`;
  s.textContent = shown ?? inline(t.term);
  s.setAttribute('aria-description', t.plain);
  if (!introduced.has(id)) {
    s.classList.add('first');
    introduced.add(id);
  }
  return s;
}

/**
 * Rich text: "[[bus]]", "[[bus|buses]]" become glossary terms, and "$P_f + P_t$" is
 * set as a formula (see `math`). Returns a fragment. Numbers from the model never
 * appear in rich text; quantities are separate display-layer spans.
 */
export function rich(text: string): DocumentFragment {
  const frag = document.createDocumentFragment();
  const re = /\[\[([a-z0-9-]+)(?:\|([^\]]+))?\]\]|\$([^$]+)\$/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
    frag.appendChild(m[3] !== undefined ? math(m[3]) : termSpan(m[1]!, m[2]));
    last = m.index + m[0].length;
  }
  if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
  return frag;
}

/**
 * A formula in standard notation (ISO 80000-2): a single letter is a quantity
 * symbol, set italic; words, subscripts that label rather than count ("f" for from,
 * "loss"), the imaginary unit j and numerals are upright. `_x` / `_{xy}` is a
 * subscript, `^x` / `^{xy}` a superscript, "-" a minus sign. Digits in a formula are
 * notation (an exponent, a coefficient), not model data, and are marked as such for
 * the provenance check.
 */
export function math(src: string): HTMLSpanElement {
  const root = document.createElement('span');
  root.className = 'math';
  root.dataset.prov = 'notation:formula';
  let i = 0;
  const group = (): string => {
    if (src[i] === '{') {
      const j = src.indexOf('}', i);
      const g = src.slice(i + 1, j < 0 ? undefined : j);
      i = j < 0 ? src.length : j + 1;
      return g;
    }
    return src[i++] ?? '';
  };
  const upright = (t: string) => document.createTextNode(t.replace(/-/g, '−'));
  while (i < src.length) {
    const c = src[i]!;
    if (c === '_' || c === '^') {
      i++;
      const e = document.createElement(c === '_' ? 'sub' : 'sup');
      e.appendChild(upright(group()));
      root.appendChild(e);
      continue;
    }
    const word = /^[A-Za-zΑ-Ωα-ω]+/.exec(src.slice(i))?.[0];
    if (word) {
      i += word.length;
      // "jX": the imaginary unit, then a symbol
      const parts = word.length > 1 && word[0] === 'j' && /[A-Z]/.test(word[1]!) ? ['j', word.slice(1)] : [word];
      for (const w of parts) {
        if (w.length === 1 && w !== 'j') {
          const v = document.createElement('i');
          v.textContent = w;
          root.appendChild(v);
        } else root.appendChild(upright(w));
      }
      continue;
    }
    const run = /^[^A-Za-zΑ-Ωα-ω_^]+/.exec(src.slice(i))![0];
    i += run.length;
    root.appendChild(upright(run));
  }
  return root;
}

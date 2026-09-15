# What this model does not represent

<!-- GENERATED FILE — do not edit by hand.
     Source of truth: src/data/simplifications.ts
     Regenerate:      node tools/gen-simplifications.mjs
     The in-app model-honesty panel reads the same array, so this document and
     the panel cannot disagree. -->

Every view in the app carries a quiet control that opens this list, filtered to
what applies there. A teaching model that hides its own edges teaches confident
wrongness; one that shows them teaches how models work.

Severity is how badly a simplification would change an answer:

| Severity | Meaning |
|---|---|
| `cosmetic` | Would not change any answer a user reads. |
| `modest` | Shifts numbers by a few per cent, or hides a secondary effect. |
| `material` | Changes the kind of answer you get. Read this one. |

---

## Material

### The network is a reconstruction, not a copy

*Applies to: system, region* · `synthetic-network`

**What the model does.** Real place names at real coordinates, connected by circuits whose count, impedance and rating are plausible for equipment of that class.

**What the full treatment would involve.** A real model of this system runs to thousands of buses and its data is not public, for good reasons.

**What that means for you.** The structure is right — the corridors, the bottlenecks, where generation and load sit, why the network is meshed. Any specific number is representative rather than actual. Do not quote a flow on Path 15 from this model as a fact about Path 15.

### Time moves in steps; nothing swings

*Applies to: system, machine, protection* · `no-dynamics`

**What the model does.** Each moment is solved as a steady state. Change the time of day or trip a line and the model jumps to the new steady state.

**What the full treatment would involve.** A transient stability study integrates the swing equation for every machine through the seconds after a disturbance, showing rotor angles oscillating, frequency dipping and governors responding.

**What that means for you.** Steady-state answers — flows, voltages, losses, who is marginal — are right. What happens in the first few seconds after a trip is not shown here, and that is exactly when a system either recovers or does not. The machine view demonstrates the swing equation on its own.

### Rate of change of frequency counts only California’s own rotors

*Applies to: machine, system* · `inertia-stops-at-the-state-line`

**What the model does.** The frequency figure shown with the machine is what the modelled network’s own spinning mass would give if that unit tripped.

**What the full treatment would involve.** California is synchronously connected to the whole Western Interconnection, and every rotor from British Columbia to New Mexico resists a frequency change here. The real denominator is several times larger than this one.

**What that means for you.** The number shown is several times faster than what the real system would see, and the panel says so where it is shown. What it gets right is the COMPARISON: an hour with less synchronous plant online has less inertia, and that is the whole point of the readout.

### A fault is calculated, not simulated

*Applies to: protection, feeder, substation* · `fault-is-a-snapshot`

**What the model does.** A linear circuit problem solved about the pre-fault operating point, with every machine represented as a voltage behind its subtransient reactance. It gives the current in the first cycles and which device would respond to it.

**What the full treatment would involve.** What happens next needs a time-domain simulation: the protection operating, the breakers clearing, the arc extinguishing at a current zero, the voltage recovering, the machines swinging against one another and either pulling back into step or not.

**What that means for you.** The number is right, and it is the number every one of those later questions starts from. What is missing is the decay of the fault current as the machines move from X″ to X′ to X_d, the direct-current offset in the first cycle, and everything about stability.

## Modest

### Everything is balanced across the three phases

*Applies to: system, region, substation, feeder, math* · `balanced-positive-sequence`

**What the model does.** The power flow solves a single-phase equivalent and assumes the three phases carry equal current, 120° apart. One number per bus, not three.

**What the full treatment would involve.** A three-phase power flow solves each phase separately, or works in symmetrical components with positive, negative and zero sequence networks solved together. Distribution feeders in particular are genuinely unbalanced, because single-phase laterals are attached wherever the houses happen to be.

**What that means for you.** Accurate on the transmission system, which is transposed and served by balanced three-phase load. On the distribution feeder it hides neutral current and phase-to-phase voltage differences that a real engineer would care about. The fault views drop this assumption and use the full sequence treatment, because a fault is unbalanced by definition.

### One intertie absorbs the whole imbalance

*Applies to: system, math* · `slack-absorbs-imbalance`

**What the model does.** The Pacific Northwest intertie at Malin is the slack bus: whatever generation and demand fail to match, it supplies or absorbs.

**What the full treatment would involve.** Automatic generation control shares the imbalance across many units in proportion to their droop settings and regulating reserve, continuously.

**What that means for you.** The total is right and the physical story is right — California really does lean on its neighbours. Which specific machine moves is not. The system view shows the correction explicitly rather than hiding it.

### The Pacific DC Intertie is modelled as an injection, not a DC line

*Applies to: system* · `dc-intertie-as-injection`

**What the model does.** The 3,100 MW arriving at Sylmar appears as a scheduled generator there.

**What the full treatment would involve.** A high-voltage direct-current link has converter stations at each end with their own losses, reactive consumption, control modes and failure behaviour, and it is solved jointly with the AC network.

**What that means for you.** The real power arriving is right. The reactive behaviour of the converters, and the fact that the link can be commanded independently of the AC system around it, are both missing.

### Load draws constant power regardless of voltage

*Applies to: feeder, service, math* · `constant-power-load`

**What the model does.** A 5 MW load draws 5 MW whether the voltage is 1.00 or 0.95 per-unit.

**What the full treatment would involve.** Real load is a mixture: resistive heating draws power as V², motors closer to constant power, electronics genuinely constant power. The standard treatment is a ZIP model splitting load into constant-impedance, constant-current and constant-power fractions.

**What that means for you.** Constant-power load is the pessimistic assumption and the one used for planning, because it makes voltage collapse easier rather than harder. It overstates how much voltage sags at the end of a heavily loaded feeder, by a few tenths of a per cent.

### Plants can start and stop instantly between hours

*Applies to: system* · `no-unit-commitment-across-time`

**What the model does.** Each hour is dispatched on its own merits. A plant that was off at 15:00 can be at full output at 16:00 if the merit order calls for it.

**What the full treatment would involve.** Unit commitment respects minimum up and down times, start-up costs and start-up trajectories, solved across the whole day at once.

**What that means for you.** The merit order and the marginal unit are right. The model understates how expensive and slow the evening ramp really is — which is the central operational problem the duck curve is about.

### Distribution line parameters ignore that the phases are not transposed

*Applies to: feeder* · `distribution-untransposed`

**What the model does.** The feeder uses a geometric-mean-distance impedance, as if the phases swapped positions along the route.

**What the full treatment would involve.** Carson’s equations with the actual conductor positions, giving a full 3×3 impedance matrix with unequal diagonal and mutual terms.

**What that means for you.** On a feeder a few kilometres long the error is small, but it is the mechanism behind some real phase-unbalance effects.

### Every wind farm sees the same wind, every solar farm the same sun

*Applies to: system* · `no-weather-correlation`

**What the model does.** One wind shape and one solar shape scale all sites of that type.

**What the full treatment would involve.** Site-specific time series, correlated in space and time, from meteorological reanalysis.

**What that means for you.** The daily pattern is right. The smoothing that geographic spread actually provides is missing, so the model makes renewable output look more synchronised than it is.

### Equipment parameters are canonical for the class, not measured

*Applies to: global* · `equipment-parameters-canonical`

**What the model does.** A 1,120 MVA autotransformer gets 12 % impedance and an X/R of 45 because that is what transformers of that size have.

**What the full treatment would involve.** Every unit has a test report with its own measured values, which vary by several per cent from the class average.

**What that means for you.** Every quantity is dimensionally correct and in a realistic range for its class, which is what the model claims. No individual value is a fact about any individual piece of equipment.

### Past the last transformer, the voltage drop is calculated rather than solved

*Applies to: service, math* · `service-drop-by-hand`

**What the model does.** The power flow solves down to the secondary terminals of the pad-mounted transformer, and stops there. From that solved voltage to the socket the drop is worked out with the standard formula, ΔV = I·(R·cos φ + X·sin φ) over the loop, and the whole calculation is shown on the page.

**What the full treatment would involve.** A three-wire 240/120 V service is genuinely single-phase with a mid-point earthed neutral, and the two 120 V legs carry different loads. Solving it properly means a separate single-phase model with the neutral as a conductor of its own, carrying the imbalance.

**What that means for you.** The magnitudes are right to within a few hundredths of a volt at these currents and lengths. What is missing is the imbalance between the two legs and therefore the neutral current, which is the thing the three-wire arrangement exists to manage. The arithmetic shown is exactly what an electrician would do, so it can be checked by hand.

### The modelled house is an equal share of twelve

*Applies to: service* · `one-house-of-twelve`

**What the model does.** Twelve houses share the pad-mounted transformer, and the solved load at its secondary is divided equally between them. An appliance the reader switches on is added to this house alone, not shared.

**What the full treatment would involve.** Twelve real houses differ by a factor of three or more, and their peaks fall at different times. A study would use metered interval data per service, or a stochastic load model.

**What that means for you.** The current in this service is right in size and moves correctly when something is switched on. It is not a claim about any particular house, and it understates how unequal a real group of twelve is.

### Three of the four feeders are one lumped load

*Applies to: substation, feeder* · `three-feeders-lumped`

**What the model does.** Cherry Lane 1201 is modelled pole by pole. Feeders 1202, 1203 and 1204 appear in the drawing with their breakers, and in the solve as a single load on the 12.47 kV bus.

**What the full treatment would involve.** Four feeders modelled in full, each with its own laterals, regulators and capacitors.

**What that means for you.** The station’s total load and its transformer loading are right. Switching the bus tie or losing a bank behaves correctly. What is not available is any statement about voltage or reliability on those three feeders, and their breakers cannot be operated.

### The secondary between the transformer and the houses is not modelled as a network

*Applies to: service, feeder* · `no-secondary-network`

**What the model does.** One service is followed in full. The other eleven houses on the same transformer are represented by their share of the load at its secondary terminals, with no secondary conductors of their own.

**What the full treatment would involve.** A secondary network model has every service drop as a branch, so the houses interact: one neighbour’s car charger depresses the voltage at another’s socket through the shared secondary.

**What that means for you.** This service’s own drop is right. The interaction between neighbours is missing, and it is real — it is why a cluster of car chargers on one transformer is a different problem from the same load spread out.

### A power station is one generator in the network model

*Applies to: plant, machine, system* · `plant-as-one-machine`

**What the model does.** Metcalf appears in the power flow as a single machine with the whole station’s rating, inertia and reactance. The plant view shows its three real machines and splits the energy between them; the machine view draws the station’s equivalent machine in cross-section.

**What the full treatment would involve.** A study of the plant itself models each gas turbine generator and the steam turbine generator separately, behind the station’s own switchyard, each with its own step-up transformer and its own excitation and governor controls.

**What that means for you.** Nothing on the transmission system can tell the difference: the station is one injection at one bus either way. What is lost is the ability to lose one machine and keep the others, and the fact that the three do not share reactive output equally.

### The split of fuel energy between the streams uses typical fractions

*Applies to: plant* · `plant-energy-split`

**What the model does.** The plant’s efficiency comes from its heat rate, which is in the network model because it sets the marginal cost. How the rest of the fuel divides between the stack, the condenser, the generators and the plant’s own auxiliaries uses fractions typical of a large combined cycle, and the condenser is computed as the remainder so that the chain closes exactly.

**What the full treatment would involve.** A heat balance for a real station is computed from measured gas temperatures, steam conditions and cooling water flows at a stated ambient condition, and changes with the weather.

**What that means for you.** The net output and the fuel burn are right, because they come from the heat rate. The individual streams are right in proportion and in order of magnitude. Do not quote the stack loss of this plant as a measurement.

### Local reliability is one flag, not a security-constrained dispatch

*Applies to: system, plant* · `must-run-not-security-constrained`

**What the model does.** The plant inside the Bay Area is marked must-run, so it is committed at its minimum whatever the merit order says, and the economic stack fills in around it.

**What the full treatment would involve.** A real dispatch is security-constrained: it solves the economics and the network together, subject to every credible single outage, and decides for itself which units must run and how hard.

**What that means for you.** The result is right for this network at these hours — the plant runs, and the region is not left depending entirely on imports. What is missing is the mechanism: the model cannot discover that a unit is needed, it has to be told.

### A line’s zero-sequence impedance is a multiple of its positive-sequence one

*Applies to: protection* · `zero-sequence-ratio`

**What the model does.** Z₀ = 3·Z₁ for an overhead line and 2·Z₁ for a cable, with the zero-sequence charging at 60 % of the positive-sequence value.

**What the full treatment would involve.** The real value depends on the earth resistivity along the route, on whether there is a shield wire and what it is made of, and on how the shield wire is bonded — and it is computed with Carson’s equations, which model the earth as a conductor of finite conductivity.

**What that means for you.** Ratios between 2 and 3.5 cover nearly all overhead construction, so ground fault currents are right to within perhaps twenty per cent. What is exactly right is the part that matters most for teaching: which transformers pass zero-sequence current and which block it, because that follows from the winding connections rather than from the soil.

### Only Cherry Lane’s protection is modelled

*Applies to: protection* · `one-protection-chain`

**What the model does.** Four devices in series — a lateral fuse, a recloser, the feeder breaker and the transformer’s backup relay — with settings derived from the feeder’s own load and fault levels.

**What the full treatment would involve.** A real system has a protective device on every circuit at every voltage, with distance relays and differential schemes on the transmission network and communications between them.

**What that means for you.** A fault anywhere on the network gives a correct current, because the sequence networks cover the whole case. But only on this feeder is there a chain of devices to say which one would clear it; elsewhere the app says so rather than showing a chain that would not operate.

### The coordination shown is of the phase elements

*Applies to: protection* · `phase-elements-only`

**What the model does.** Each device responds to the largest phase current. Ground elements — devices 50N and 51N, which watch the residual — are named in the substation’s protection scheme but are not plotted.

**What the full treatment would involve.** A real study plots the phase and ground elements as two separate coordination problems, because the ground elements are set far more sensitively and coordinate with each other rather than with the phase curves.

**What that means for you.** For a three-phase or phase-to-phase fault the answer is complete. For a fault to earth the real clearing would usually be faster than shown, because a sensitive ground element sees it long before a phase element does.

### The reliability indices are computed from failure rates, not from history

*Applies to: feeder, protection* · `reliability-from-rates`

**What the model does.** SAIFI, SAIDI, CAIDI, MAIFI and ASAI are worked out from section lengths, canonical failure rates per kilometre-year, canonical repair and switching times, and which device clears which fault. Every number is traceable to those inputs.

**What the full treatment would involve.** A utility computes these from its own outage management system: every interruption that actually happened, with the customers actually affected and the minutes actually taken, classified by cause. The failure rates used here are planning values of the kind used before there is any history to work from.

**What that means for you.** The directions are right and the sensitivities are right — a recloser improves SAIFI, a tie improves SAIDI, fuse blowing trades one against the other. The absolute values belong to the assumed rates, not to any real feeder, and this feeder does not exist.

### Storms are not in the reliability figures

*Applies to: feeder* · `no-major-event-days`

**What the model does.** Faults arrive at a steady rate proportional to how much wire there is. There is no weather: no wind event that brings down twenty spans at once, no heat wave that fails cable joints in a week.

**What the full treatment would involve.** IEEE Std 1366 defines a major event day by a statistical threshold — the 2.5-beta method — and utilities report indices both with and without those days, because the two numbers describe different things: how the system runs, and how badly it can go wrong.

**What that means for you.** The indices here correspond to the reported figures that EXCLUDE major events, which is the flattering half of the pair. A bad storm year can double a utility’s SAIDI on its own.

### Every crew takes exactly the same time

*Applies to: feeder* · `restoration-is-deterministic`

**What the model does.** Repair, switching and back-feeding each take one fixed number of hours. A fault at three in the morning in the rain is restored as quickly as one at noon.

**What the full treatment would involve.** Restoration times are distributions, not constants, and they depend on crew availability, access, weather, and how many other faults are being worked at the same moment — which is exactly why a storm is not just more faults at the same rate.

**What that means for you.** The averages are reasonable and the comparisons between options are sound. The model cannot say anything about the tail: the worst hour of the worst day is the thing customers remember, and it is not here.

### The next feeder can always pick up this one’s far end

*Applies to: feeder* · `tie-always-has-room`

**What the model does.** When the tie is available, every customer beyond the damage is back-fed through it in an hour, whatever the load is at the time.

**What the full treatment would involve.** The adjacent feeder has its own load and its own conductor rating. Back-feeding is a load-flow question: at the evening peak the tie may only be able to take part of the far end, or none of it, and a real switching plan is built around what the neighbour can carry.

**What that means for you.** Overstates what the tie is worth at peak and understates it at night. The mechanism — and why a second path is worth building — is right.

## Cosmetic

### One distribution feeder is modelled; the rest are lumped

*Applies to: substation, feeder* · `one-feeder-modelled`

**What the model does.** Eden Vale substation has four feeders. One is modelled pole by pole. The other three appear as a single load at the 12.47 kV bus.

**What the full treatment would involve.** A utility models every feeder, and there are tens of thousands of them.

**What that means for you.** The modelled feeder is complete and its numbers are right. The substation transformer loading includes the other three, so the substation-level picture is right too.

### Capacitor and reactor switching follows a simple rule

*Applies to: system, region, substation* · `reactive-switching-rule`

**What the model does.** Banks switch on local bus voltage where there is no generator, and on the machine’s reactive utilisation where there is, with a deadband and a limit on how often a breaker may operate.

**What the full treatment would involve.** Real schemes use time delays, temperature and time-of-day schedules, coordination between neighbouring substations, and operator judgement.

**What that means for you.** The behaviour is right in kind and roughly right in degree. Exactly which bank closes at exactly which minute is not.

### Dispatch assumes a loss factor before the losses are known

*Applies to: system, math* · `loss-factor-in-dispatch`

**What the model does.** Generation is sized to serve demand plus an assumed 2.5 % for losses. The power flow then computes what the losses actually are.

**What the full treatment would involve.** A security-constrained economic dispatch solves the dispatch and the power flow together, with loss penalty factors per bus.

**What that means for you.** The difference between assumption and truth shows up at the slack bus. The system view displays that difference rather than hiding it, because it is the same correction a real operator watches.

### The yard layout is plausible, not surveyed

*Applies to: substation* · `substation-yard-layout`

**What the model does.** Equipment sits at coordinates and heights typical of a two-bank 115/12.47 kV distribution substation: bus at 7.6 m, breakers on plinths, a ground grid on a 6 m mesh. The single-line topology is exact; the metres are typical.

**What the full treatment would involve.** A real yard is laid out to electrical clearance tables, access for a crane, and the shape of the parcel that was available. No two are alike.

**What that means for you.** Nothing electrical depends on it: the solver never sees a yard coordinate. It matters only for the claim the drawing makes about what a station looks like, which is "like this sort of thing" rather than "like this".

### The stator windings are drawn as three bands, not as they are wound

*Applies to: machine* · `stator-winding-drawing`

**What the model does.** Three phase bands 120° apart, each shown as a few coil sides either side of its axis, at a radius chosen so the arrangement can be seen.

**What the full treatment would involve.** A real two-pole machine distributes each phase over many slots, with short-pitched coils and a fractional slot-per-pole-per-phase count, all chosen to suppress particular harmonics in the generated waveform.

**What that means for you.** The thing the drawing is for — three windings in space, a field rotating past them, and the load angle between the rotor and the terminal voltage — is exactly right. The winding detail is not, and nothing in the app depends on it. The machine is also drawn far larger than its true 3 to 4 metres, because at true scale the air gap would be a hairline.

### The streets and houses around the feeder are invented

*Applies to: feeder, service* · `invented-neighbourhood`

**What the model does.** A street grid and building footprints are drawn around Cherry Lane 1201 so the feeder runs through somewhere rather than across blank paper. They carry no load, no address and no electrical meaning: the load is the spot loads in the model, and it is attached to the poles.

**What the full treatment would involve.** A utility works from a parcel map: every service, every meter, every address, tied to the transformer that feeds it. That is what makes a real outage management system able to say which houses are dark.

**What that means for you.** The SCALE is right — block sizes, lot widths and setbacks are the ordinary dimensions of American suburban development, so the sense of how much street a megawatt covers is honest. Which house is which is not, and no house drawn here is the one whose service is modelled, apart from the one that is labelled.

### The scatter of dots is where the LOAD is, not where the cities are

*Applies to: system, region* · `demand-dots`

**What the model does.** Each dot is a fixed quantity of peak demand, scattered at random within a radius of the substation that carries it. The COUNT is real — it comes from the model’s own load data and counting the dots gives the megawatts back. The positions are not.

**What the full treatment would involve.** A real map of demand comes from census and land-use data, or from the utility’s own meter density, and has boundaries: this block is residential, that one is a data centre.

**What that means for you.** The shape is right at the scale of a region — the network visibly goes where the people are, which is the point. Do not read the outline of a scatter as the outline of a city, and do not read a gap in it as empty country. It means no modelled substation is near.

---

*33 entries.*

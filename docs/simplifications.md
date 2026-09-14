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

---

*13 entries.*

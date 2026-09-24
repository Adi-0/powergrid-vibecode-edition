# What this model simplifies

This file is the source of the in-app **model honesty** panel ("What's simplified
here"). The app imports it at build time and shows the sections that apply to the
current view. Keep it in sync with the code: a test checks every view id used in the
app has a section here.

Format: one `## view-id — Title` section per view or topic. Each item is a bullet
`- **Simplified:** … **Full treatment:** …`.

## global — Everywhere

- **Simplified:** The network is synthetic: roughly the shape of California's grid, with real place names, but not a replica of any real asset, rating or flow. **Full treatment:** A utility or ISO model (tens of thousands of buses) from the WECC base cases, which are confidential critical-energy infrastructure information.
- **Simplified:** Time is quasi-static: each moment is an independent steady-state solution (economic dispatch, then power flow). Nothing between intervals is simulated. **Full treatment:** Unit commitment with start-up costs and minimum run times, and time-domain simulation between operating points.
- **Simplified:** One modelled day: a hot, clear late-summer weekday. **Full treatment:** Many days across seasons and weather, with forecast error and cloud.

## system — The state sheet

- **Simplified:** Each circuit is drawn as a straight line between its two substations. **Full treatment:** Real corridors follow terrain, rights of way and river crossings; line lengths in the model are the great-circle distance times a routing factor (1.15 unless a line gives its own length), not surveyed routes.
- **Simplified:** Geography is projected equirectangularly about the middle of the state, accurate to a few percent. **Full treatment:** A conformal projection (e.g. California Albers or UTM zones) for surveyed distances.
- **Simplified:** The state is drawn as a slab 30 km thick so its coast reads as a cut section; the thickness means nothing. Neighbouring states are drawn only in a band around California. **Full treatment:** Not applicable — this is drawing convention, stated so it is not mistaken for data.

## trip — Tripping a circuit

- **Simplified:** A trip is shown as the moment after: the dispatch stays as planned with the circuit in service, and generators' governors cover the change in losses. **Full treatment:** Within minutes, operators re-dispatch generation (security-constrained economic dispatch with the circuit out) to bring any overloaded circuit back under its rating, and protection may already have acted.
- **Simplified:** A circuit is either in service or open at both ends; nothing between. **Full treatment:** Breaker failure, one end open (the line charging from the other), and automatic reclosing.
- **Simplified:** When the power flow finds no operating point, the sheet says so and draws nothing as solved. Failing to find one is strong evidence that none exists, not proof. **Full treatment:** Continuation power flow traces the P–V curve to its nose and proves where the operating point disappears.

## region — A region's layers

- **Simplified:** Layer heights mean nothing but order (lowest voltage lowest); the spacing is chosen for legibility. **Full treatment:** Not applicable — drawing convention.
- **Simplified:** Each substation's buses of one voltage are one bus; its transformers of one kind are drawn as banks side by side. **Full treatment:** Breaker-and-a-half or double-bus arrangements with bus sections, drawn at the Substation level.
- **Simplified:** A region's losses are computed by difference (generated + arriving − taken). **Full treatment:** The same number summed branch by branch; they agree because the power flow conserves power, which the tests check.

## site — Inside a substation or switchyard

- **Simplified:** Every station is drawn from the network data by one rule: one straight bus per voltage, each circuit on its own bay (breaker, disconnect, gantry), banks between the buses. It is not the station as built. **Full treatment:** Each station's one-line diagram and plan: breaker-and-a-half, double-bus or ring arrangements, bus sections and bus-tie breakers, from the utility's drawings.
- **Simplified:** Breakers, disconnects and buses carry no impedance and are always closed; only whole circuits and banks can be switched. **Full treatment:** A node-breaker model, where opening one breaker can split a bus and change what connects to what.
- **Simplified:** A plant is a block sized by its capacity beside the yard, with one step-up transformer; a solar or wind plant is really spread over square kilometres and collected at medium voltage. **Full treatment:** Each unit behind its own step-up, and collector systems for inverter-based plants.
- **Simplified:** The demand served from a station leaves as three lines "to the distribution substations"; it is one lumped load in the model. **Full treatment:** The subtransmission network and every distribution substation it feeds (drawn for one station only: Evergreen).
- **Simplified:** Each circuit leaves on the straight bearing to the station at its far end, as the state sheet draws it. **Full treatment:** Surveyed routes.
- **Simplified:** Shunt reactors at the 500 kV buses are drawn as three single-phase oil-filled units per step, switched in steps like the capacitor banks; their inside is not drawn. **Full treatment:** Each reactor's rating and design, often a fixed reactor on a long line's end rather than switched on the bus.

## transformer — Inside a transformer

- **Simplified:** The model's transformer is its series impedance only (winding resistance and leakage reactance): no magnetizing current and no core loss, so the heat the oil carries is the windings' I²R loss alone and the currents on the two sides are exactly in the turns ratio. **Full treatment:** A shunt branch for the core (core-loss conductance and magnetizing susceptance, from the open-circuit test), whose loss runs whenever the transformer is energised, loaded or not.
- **Simplified:** The drawing is a typical three-limb core-form design, not this unit's: turns are drawn in the ratio of the windings' voltages, rounded to whole turns and far fewer than a real winding has (hundreds to thousands); every main winding has the same radial build; the tapped winding is drawn one block per step, larger than its share. **Full treatment:** The manufacturer's design: a stepped core section, disc, layer or helical windings, interleaving and shields, the tapped winding's real place in the stack.
- **Simplified:** A 500/230 kV bank is drawn as one three-phase tank; such banks are usually three single-phase units, one tank per phase, often with a spare. **Full treatment:** Three single-phase autotransformers connected as a bank.
- **Simplified:** An autotransformer's or a wye–wye bank's delta tertiary carries no load; its voltage (13.8 kV) is a typical value used only to draw its turns. The transmission banks hold their nominal ratio (no tap changers in the model). **Full treatment:** Tertiary loads (reactors, station service) and each bank's tap changer, with its control, in the power flow.
- **Simplified:** The flux is shown 120 times slower than it alternates, its size following the high-side voltage (flux ∝ V/f); the core never saturates. **Full treatment:** The core's nonlinear magnetization curve: saturation, hysteresis, inrush current when energised, harmonics.
- **Simplified:** The oil carries the loss along one idealised loop (up the ducts, over the top, down the radiators, back along the bottom); no temperature is computed. **Full treatment:** A thermal model of top-oil and hot-spot temperatures (the IEEE C57.91 loading guide), fans and pumps staging in, and the insulation's loss of life.
- **Simplified:** At Evergreen the three phases are close to balanced but not exactly (the feeder model is unbalanced); the currents shown come from the three-phase power, the balanced equivalent. **Full treatment:** Each phase's current from the unbalanced solution.

## breaker — Inside a circuit breaker

- **Simplified:** The timings (contacts moving, parting, fully open; the shortest arc that can be put out; closing) are typical of a three-cycle high-voltage SF₆ breaker, not this breaker's test record; the drawing's proportions and its contact stroke are schematic. **Full treatment:** The manufacturer's travel curve and timing, and the design's real dimensions.
- **Simplified:** Each phase is drawn clearing at its own current zero, as if the other two were unaffected; the arc's own voltage and the recovery voltage across the gap after each zero are not modelled. **Full treatment:** An electromagnetic transient study: the arc as a nonlinear resistance, the first pole to clear, the recovery voltage and its rate of rise, and whether the gap withstands it.
- **Simplified:** Opening this breaker takes the whole circuit out of service: the model has no state in which a line is open at one end and energized from the other. **Full treatment:** A node–breaker model, in which one end can open while the line stays charged from the far end.
- **Simplified:** The chart's trip is drawn arriving as the reference voltage crosses zero, rising; a real trip can arrive at any point on the wave, which moves every clearing time by up to half a cycle. **Full treatment:** The instant the relay's decision arrives, from the protection's own timing.

## poletop — Inside a pole-top transformer

- **Simplified:** Turns are drawn in their real ratio, sixty primary turns to one in each half of the secondary; a real one has many more of both. The core and coil are a typical shell-form design, not this unit's. **Full treatment:** The manufacturer's design, with the secondary's halves often interleaved either side of the primary to lower the leakage between them.
- **Simplified:** No magnetizing current or core loss, so the primary's current is exactly the legs' current over the turns ratio; the transformer's impedance is split between the primary and the two halves by a standard rule of thumb. **Full treatment:** The core's shunt branch, and the impedances from the unit's own short-circuit tests.

## span — A span of a line

- **Simplified:** The conductor's temperature is IEEE 738's steady state for the interval: the hour's air temperature and clear-sky sun at the station, a wind the reader chooses (the light wind line ratings assume, by default), at sea level. A real conductor lags a change of current by ten minutes or more. **Full treatment:** IEEE 738's transient calculation, with measured weather along the line (dynamic line rating).
- **Simplified:** The sag comes from an everyday reference (15 °C, a fifth of breaking strength) by a linear-elastic change of state on a level span: no creep over the years, no ice or wind load, no bundled-conductor spacers. The conductors' mechanical constants are typical of their designation. **Full treatment:** A ruling-span sag-tension program with the conductor's stress-strain and creep curves, from the utility's design criteria.
- **Simplified:** The towers are drawn to a schematic height and the ground is flat, so the clearance shown is illustrative. **Full treatment:** The line's surveyed profile and the clearance required over each crossing.
- **Simplified:** The power flow uses each circuit's fixed rating; the temperature, sag and limit here are worked out from its flow and do not feed back into it. **Full treatment:** Dynamic ratings in operations, and conductor resistance that rises with temperature in the power flow.

## capacitor — A capacitor bank

- **Simplified:** Each step is a fixed susceptance in the power flow, so its reactive power goes exactly as the voltage squared, with no losses and no harmonics. **Full treatment:** The cans' small losses, harmonic currents, and the bank's resonance with the network's inductance.
- **Simplified:** Steps switch between solves, under a voltage-band controller or as the reader holds them, and switching is instantaneous. **Full treatment:** The switching transient: the inrush current and the bus voltage's dip and overshoot as a step is energised, which is why banks use pre-insertion resistors or switch at a chosen point on the wave.
- **Simplified:** The construction (series groups of cans in parallel, on insulated tiers) is a plausible design for the voltage class, not this bank's; each can's rating follows from the step's. Fuses and the unbalance protection that finds a failed can are not drawn. **Full treatment:** The bank's own design (externally fused, internally fused or fuseless cans) and its unbalance relay's settings.
- **Simplified:** The chevrons and the chart show each phase's instantaneous power from the solved phasors as pure sine waves, slowed 120 times; the steps nearest the viewer are drawn switching in first. **Full treatment:** Measured waveforms, with the network's harmonics; the operator's rotation of which steps are used.

## capunit — Inside a capacitor can

- **Simplified:** The inside is schematic: a dozen elements drawn where a real can has more, one drawn pulled out with the end of its winding unrolled, and the plastic film between the foils (a few hundredths of a millimetre) drawn thousands of times thicker. The field is drawn uniform between flat plates. **Full treatment:** The manufacturer's design: the number and connection of elements, internal fuses, film and foil thickness, the impregnating fluid, and the field's fringing at the foils' edges.
- **Simplified:** The discharge resistor is the largest that meets the IEEE 18 requirement (the peak of rated voltage down to 50 V within 5 minutes); the charge left when a step is switched off is not shown draining. **Full treatment:** The unit's actual resistor, and the trapped charge's decay, which is why a step must wait before it is switched back in.

## regulator — Inside a voltage regulator

- **Simplified:** The regulator is ideal: its output voltage is its input times the tap's ratio, 1 + 0.00625 × tap, and its current goes the other way in the same ratio; it has no impedance, losses or magnetizing current. A real Type B regulator's ratio is 1 / (1 − 0.00625 × tap) (raise), within about one percent of this at the end of its range. **Full treatment:** Kersting's models of the Type A and Type B step-voltage regulator, with the series impedance and the exact ratio.
- **Simplified:** The control acts at once on each interval's solution, stepping taps until each phase's compensated voltage is inside the band; there is no time delay, and it never hunts. **Full treatment:** The control's time delay (typically tens of seconds), each tap change's own duration, and how the regulator, the substation's tap changer and the capacitor bank take turns.
- **Simplified:** The construction is schematic: a shell-form core, the series winding drawn with a tenth of the shunt winding's turns in eight tapped sections, the tap changer's contacts laid out face-on behind the cut. **Full treatment:** The manufacturer's design, in which the tap changer usually sits in its own compartment under the cover, driven by a motor.

## substation — The Evergreen substation

- **Simplified:** The transmission model carries everything on the Evergreen 60 kV bus as one load; the substation drawn here is one part of it, and the rest goes on at 60 kV to substations not drawn. **Full treatment:** Every 60 kV line and distribution substation in the area modelled.
- **Simplified:** Three of the four feeders are one balanced load on the 12 kV bus. **Full treatment:** All four feeders modelled pole by pole.
- **Simplified:** Breakers, disconnects and the bus arrangement are drawn but carry no impedance; the yard's layout is plausible, not surveyed. **Full treatment:** Substation arrangement from the utility's one-line and plan drawings.

## feeder — Feeder 1105

- **Simplified:** One synthetic feeder, laid out on a grid of streets. **Full treatment:** The utility's GIS model of a real feeder.
- **Simplified:** Homes are constant-power loads that follow an average profile, scaled per home; air conditioners are a 240 V load. **Full treatment:** Measured load shapes per customer class, voltage-dependent loads, motor stalling.
- **Simplified:** Rooftop solar follows clear-sky irradiance at unity power factor. **Full treatment:** Inverters with volt-var and volt-watt settings (IEEE 1547), weather.

## service — A service, down to the outlet

- **Simplified:** The branch circuit is one 12 AWG run of fixed length, hot and neutral in series; the appliance at the outlet is a constant-impedance 1500 W hair dryer. **Full treatment:** The house's wiring as built, every outlet and load on it.
- **Simplified:** The house is drawn as a block to scale; walls, panel and meter positions are schematic. **Full treatment:** Not applicable — drawing convention.

## transmission — The transmission network

- **Simplified:** Balanced, positive-sequence model: the three phases are assumed identical, so one phase stands for all three. **Full treatment:** A three-phase model where unbalance matters (it rarely does at transmission voltages, which is why the field uses positive sequence).
- **Simplified:** Load is constant power (P and Q do not change with voltage). **Full treatment:** Voltage-dependent (ZIP) and dynamic load models, including air-conditioner motors that stall at low voltage.
- **Simplified:** Most plants connect straight to a transmission bus; the step-up transformer and generator terminal are modelled only for Moss Landing Unit 1. **Full treatment:** Every unit on its own terminal bus behind its step-up transformer.
- **Simplified:** DC links (Pacific DC Intertie, Trans Bay Cable) are fixed transfers with a flat converter loss. **Full treatment:** Converter models with firing-angle or modulation control, reactive consumption and DC-line resistance.
- **Simplified:** Inverter-based plants run at unity power factor. **Full treatment:** Modern plants regulate voltage within a reactive capability curve.
- **Simplified:** Neighbouring systems are represented by a generator at each intertie with an equivalent governor response. **Full treatment:** The whole Western Interconnection (thousands of buses).

## slack — Who covers the imbalance

- **Simplified:** Textbook power flow names one "slack" bus whose generator absorbs every mismatch. This model spreads the mismatch over many generators instead (distributed slack). **Full treatment:** Governor droop acts in seconds, automatic generation control over minutes, and re-dispatch after that; each is a separate time scale with its own dynamics.

## dispatch — Deciding who runs

- **Simplified:** Units are committed by a priority list and dispatched in merit order, then re-dispatched with a DC network model to respect branch ratings. **Full treatment:** A security-constrained unit commitment (mixed-integer optimisation) with AC network constraints and every contingency.
- **Simplified:** Hydro and storage follow simple peak-shaving rules on a known day. **Full treatment:** Co-optimisation over days, with forecast uncertainty, water rights, reservoir constraints and market bids.
- **Simplified:** Costs are fuel plus carbon plus a small variable cost; interties sell in fixed price blocks. **Full treatment:** Bids, start-up costs, no-load costs, and neighbours' actual markets.

## distribution — Feeders and services

- **Simplified:** One feeder (Evergreen 1105) is modelled phase by phase down to each meter; the other feeders on its substation bank are one balanced load. **Full treatment:** Every feeder, every customer, from a utility's GIS.
- **Simplified:** Neutrals are treated as perfectly grounded (Kron reduction), so neutral-to-earth voltage is zero everywhere. **Full treatment:** Keep the neutral as a conductor with finite grounding resistance at each pole; stray voltage and neutral currents then show up.
- **Simplified:** Home loads are smooth average profiles with a fixed split between the two 120 V legs and the 240 V air conditioner; appliances are constant power. **Full treatment:** Measured smart-meter data, appliance-level models, motor behaviour at low voltage.
- **Simplified:** The feeder's unbalance reaches the transmission model only as its total three-phase power. **Full treatment:** A three-phase transmission model near the substation, which would show the negative-sequence current the unbalance causes.
- **Simplified:** Distribution transformers split their impedance between primary and the two half windings by a fixed rule (0.5R + j0.8X, R + j0.4X). **Full treatment:** Measured impedances for each winding pair.

## math — The working behind a number

- **Simplified:** Inputs are rounded to the digits shown, so the working reaches the solver's value only to within two units of the result's last place; the solver's own value is quoted beside each result. **Full treatment:** Exact arithmetic throughout, rounded once at the end.
- **Simplified:** The bus check shows real power (ΔP) only, and plugs in the converged state rather than showing the iterations. **Full treatment:** The Newton–Raphson iterations themselves (Jacobian, mismatch vector, update), with the reactive mismatch ΔQ at every bus.
- **Simplified:** The outlet's voltage drop leaves out the branch circuit's small reactance, and the step says so. **Full treatment:** The cable's full series impedance Z = R + jX, and the drop as a phasor.

## plant — Moss Landing Unit 1

- **Simplified:** The plant's energy is a heat balance: a straight-line fuel curve for each gas turbine, a fixed share of exhaust heat recovered by the HRSGs, and a fixed generator efficiency, calibrated so full load reproduces the data file's heat rate. **Full treatment:** Gas-turbine performance maps (ambient temperature, inlet guide vanes, firing temperature); HRSG pinch-point and approach design across three pressure levels; steam-turbine expansion lines; condenser back-pressure set by seawater temperature.
- **Simplified:** Station service (pumps, fans, auxiliary load, about 2 % of output) is not modelled, so gross equals net at the generator terminals. **Full treatment:** Auxiliary load on a unit auxiliary transformer, taken from the generator bus.
- **Simplified:** In the power flow the steam turbine holds its scheduled output while the gas turbines cover any imbalance, so for a moment the steam turbine may make slightly more or less than the exhaust heat allows; the inspector reports the steam cycle's implied efficiency. **Full treatment:** Steam-turbine output following the HRSGs' steam through their thermal time constants (minutes).
- **Simplified:** Unit 1 is the only plant modelled unit by unit and drawn; every other plant is one generator at its bus. **Full treatment:** Every plant with its units, step-up transformers and auxiliary systems.

## machine — The generator

- **Simplified:** Round-rotor model with X_q = X_d and no saturation: E_f is proportional to field current. **Full treatment:** Two-axis (d–q) model with X_q ≠ X_d and the open-circuit saturation curve; the field current from the Potier construction.
- **Simplified:** The capability curve's under-excited limit is the theoretical steady-state stability limit against a stiff 230 kV bus through the step-up transformer. **Full treatment:** The manufacturer's under-excitation limiter setting and the stator core-end heating limit, which usually bind first.
- **Simplified:** Changing excitation moves the unit's voltage set-point and re-solves the power flow; the power flow holds the unit within a rectangle of reactive limits (drawn dotted on the chart), not the curved capability. **Full treatment:** An automatic voltage regulator model, with over- and under-excitation limiters acting on the true capability curve.

## frequency — After a plant trips

- **Simplified:** One frequency for the whole interconnection (the centre of inertia). Every machine swings together. **Full treatment:** Multi-machine time-domain simulation: machines swing against each other, frequency differs from place to place for the first seconds, and the network's flows change with the angles.
- **Simplified:** The rest of the West is three equivalents behind the AC ties, carrying its governor capacity and inertia. Their headroom is the tie's rating. **Full treatment:** The full western interconnection (thousands of machines), with each unit's own governor, deadband and withheld response.
- **Simplified:** Governors have no deadband, and limits clamp their output without windup. Load damping D is a single constant. **Full treatment:** ±36 mHz deadbands (WECC practice), governor limit logic, and frequency-dependent load models by load class.
- **Simplified:** After the trip, the power flow gives the governors the whole loss (frequency held at nominal in the network solution); the frequency model also lets load draw a little less. **Full treatment:** A power flow with frequency as a variable (load and governors both frequency-dependent).

## smib — Transient stability (tested, not yet drawn)

- **Simplified:** A single machine against an infinite bus, classical model (constant voltage behind transient reactance, no damping). **Full treatment:** Multi-machine transient stability with detailed machine, exciter and governor models.

## fault — Faults and protection

- **Simplified:** The feeder's reliability indices come from a simulated record: faults at a class-typical rate per kilometre, most of them temporary, fixed repair and re-fusing times, and one interval's fault currents; no weather and no major events. **Full treatment:** The utility's outage records, with weather-driven failure rates, crew dispatch and switching restoration, and major event days removed by the 2.5β method.
- **Simplified:** Transmission faults use symmetrical components with pre-fault voltages from the power flow. Loads are neglected. Machines sit behind their subtransient reactance (the first cycles only). **Full treatment:** Time-varying fault current (subtransient, transient and synchronous stages, with DC offset); IEC 60909 or IEEE C37.010 rating calculations for breakers.
- **Simplified:** Inverter-based plants (solar, wind, batteries) contribute no fault current. **Full treatment:** Each inverter's current-limited, control-dependent response (typically 1.1–1.5 times rated), which grid codes now specify.
- **Simplified:** Parallel lines' zero-sequence mutual coupling is ignored. Banks with a delta tertiary use an estimated split of their impedance into the T equivalent. **Full treatment:** Mutual coupling between circuits on shared towers; nameplate H–L, H–T and L–T impedances.
- **Simplified:** On the feeder the step regulator is taken at neutral tap for the fault impedance. The fault is bolted (no arc or ground resistance). **Full treatment:** The regulator's actual ratio; fault resistance, which dominates high-impedance ground faults.
- **Simplified:** Fuses use a curve fitted to the shape of a T-link, not a manufacturer's table. Fuses do not cool between recloser shots. **Full treatment:** Published minimum-melt and total-clearing curves, and preloading and cooling.
- **Simplified:** The feeder breaker trips and stays open (no reclosing of its own). **Full treatment:** The breaker's own reclosing relay (79) and sequence coordination with the recloser.

# The model

Every parameter in the synthetic California network, where it came from, and how
to check it.

> **This is not a replica.** Place names and coordinates are real, so the
> geography is recognisable. The circuits between them are a plausible
> reconstruction of the real structure, not a copy of any utility's system.
> Circuit counts, impedances, ratings and dispatch are canonical values for
> equipment of that class.

---

## 1. Base quantities

| Quantity | Value | Note |
|---|---|---|
| System power base, `S_base` | 100 MVA | Universal convention in power-system studies. |
| Frequency, `f` | 60 Hz | North American interconnections. |
| Voltage bases | 500, 230, 115, 12.47, 0.24 kV | ANSI C84.1 nominal system voltages. |

Per-unit conversion, used everywhere:

```
Z_base = V_base² / S_base        (V_base in kV line-to-line, S_base in MVA → ohms)
I_base = S_base / (√3 · V_base)  (→ amperes)
Z_pu   = Z_ohms / Z_base
```

At 500 kV: `Z_base = 500²/100 = 2500 Ω`. At 230 kV: `529 Ω`. At 12.47 kV: `1.555 Ω`.

---

## 2. Conductors

From standard ACSR tables (Aluminum Association / Southwire), as reproduced in
Glover & Sarma, *Power System Analysis and Design*, Table A.4. Resistance is at
60 Hz and 75 °C conductor temperature, the usual assumption for a loaded line.

| Name | kcmil | Stranding | Diameter (in) | GMR (ft) | R at 75 °C (Ω/mile) | Ampacity (A) |
|---|---|---|---|---|---|---|
| Bluebird | 2156 | 84/19 | 1.762 | 0.0588 | 0.0536 | 1700 |
| Finch | 1113 | 54/19 | 1.293 | 0.0435 | 0.0994 | 1110 |
| Drake | 795 | 26/7 | 1.108 | 0.0375 | 0.1385 | 907 |
| Ibis | 397.5 | 26/7 | 0.783 | 0.0265 | 0.2590 | 587 |
| Linnet | 336.4 | 26/7 | 0.720 | 0.0243 | 0.3060 | 530 |
| Raven | 105.5 | 6/1 | 0.398 | 0.00446 | 1.120 | 230 |
| Sparrow | 66.4 | 6/1 | 0.316 | 0.00418 | 1.690 | 180 |

## 3. Tower geometry

| Id | Phase spacing A–B, B–C, C–A (m) | Conductors/phase | Bundle spacing (m) |
|---|---|---|---|
| `ehv-500-horizontal` | 10.7, 10.7, 21.4 | 3 | 0.457 |
| `hv-230-vertical` | 7.0, 7.0, 14.0 | 2 | 0.457 |
| `hv-115-vertical` | 4.3, 4.3, 8.6 | 1 | — |
| `dist-12-crossarm` | 0.91, 0.91, 1.83 | 1 | — |

Bundle spacing of 0.457 m is 18 inches, the standard subconductor spacing.

## 4. Line parameters are computed, not typed

`src/core/lines.ts` computes each line's impedance from the two tables above:

```
D_eq  = ∛(D_ab · D_bc · D_ca)                geometric mean distance between phases
D_s^b = ∛(D_s · d²)                          bundle-adjusted GMR, 3 conductors
X_L   = 2π f · 2×10⁻⁷ · ln(D_eq / D_s^b)     Ω/m per phase
C     = 2π ε₀ / ln(D_eq / r^b)               F/m per phase
B     = 2π f C                               S/m per phase
R     = R_conductor / n                      bundle conductors are in parallel
```

Worked example — a 500 kV line on `ehv-500-horizontal` with Bluebird:

```
D_eq   = ∛(10.7 × 10.7 × 21.4)                 = 13.48 m
D_s    = 0.0588 ft                             = 0.01792 m
D_s^b  = ∛(0.01792 × 0.457²)                   = 0.1553 m
X_L    = 377 × 2×10⁻⁷ × ln(13.48/0.1553) × 1000 = 0.3366 Ω/km
```

which is 0.54 Ω/mile — the standard figure for a three-conductor 500 kV bundle.
Surge impedance `Z_s = √(X_L/B)` comes out near 250 Ω and surge impedance loading
`SIL = V²/Z_s` near 1000 MW, both of which are the textbook values, and
`test/lines.test.ts` asserts they stay there.

### Route lengths

Great-circle distance between the two sites' real coordinates, multiplied by a
**circuity factor of 1.15**. Transmission lines follow ridgelines, right-of-way
and land ownership rather than straight lines; 1.15 is the usual planning
approximation.

### Ratings

The **lower** of two limits:

- **Thermal**: `S = √3 · V_LL · I_ampacity`, what the metal can carry.
- **Loadability**, after St. Clair (1953) and Dunlop, Gutman & Marchenko (1979):
  `P_limit / SIL ≈ 43 / L^0.6` with L in miles, valid beyond about 50 miles.

The second binds on every long line, which is why a 500 kV circuit with 4,400 MVA
of copper is scheduled at roughly a third of that.

Emergency ratings are 1.25× normal for lines and 1.33× for transformers.

## 5. Transformers

Per-unit impedance on the system base, from percentage impedance and X/R:

```
|Z| = %Z / 100
X   = |Z| · (X/R) / √(1 + (X/R)²)
R   = X / (X/R)
Z_pu(system) = Z_pu(own base) × S_base(system) / S_rating
```

| Class | MVA/bank | %Z | X/R | Vector group |
|---|---|---|---|---|
| 500/230 kV autotransformer | 1120 | 12.0 | 45 | YNa0 |
| 230/115 kV autotransformer | 280 | 10.0 | 30 | YNa0 |
| 115/12.47 kV distribution | 28 | 8.5 | 15 | Dyn1 |
| Generator step-up | (per machine) | 13.0 | 40 | Dyn1 |
| 12.47 kV/240 V service | (per unit) | 2.0 | 1.5 | Dyn0 |

All within the standard ranges for their size. Note that X/R **falls** sharply
with size: a 1,120 MVA autotransformer is almost purely reactive, while a 50 kVA
service transformer's losses are dominated by winding resistance.

The Eden Vale 115/12.47 kV banks sit on a **1.0125 tap** so that the far end of
the feeder stays inside ANSI C84.1 Range A.

## 6. Generation fleet

Total nameplate ≈ **53,900 MW** against a modelled peak demand of **33,900 MW**.

| Technology | MW | Marginal cost ($/MWh) | Inertia H (MW·s/MVA) |
|---|---|---|---|
| Imports (NW intertie, Southwest, Pacific DC) | 11,400 | 22–31 | 5.0–5.5 (AC ties) |
| Nuclear (Diablo Canyon) | 2,256 | 9 | 5.5 |
| Geothermal (Geysers, Imperial) | 1,300 | 12–14 | 4.0 |
| Hydro (Table Mountain, Big Creek) | 1,800 | 4 | 3.0–3.2 |
| Pumped storage (Helms) | ±1,200 | 46 | 3.5 |
| Wind (Tehachapi, San Gorgonio, Altamont) | 5,500 | 0 | **none** |
| Solar (Gates, Panoche, Kern, Midway, Imperial) | 12,700 | 0 | **none** |
| Battery storage | ±3,300 | 48–52 | **none** |
| Gas combined cycle | 12,000 | 42–47 | 4.9–5.2 |
| Gas simple cycle | 2,400 | 88–96 | 6.0 |

Inertia constants are standard textbook values by machine type. That wind, solar
and batteries have **none at all** is the single most important fact about what
changes as a grid decarbonises, and the model carries it explicitly rather than
as a footnote.

Reactive capability is ±33 % of MW rating for inverter-based resources, ±40–50 %
for synchronous machines — equivalent to the 0.90–0.95 power-factor rating that
is conventional for generators.

## 7. Demand

Peak **33,921 MW**, distributed to match the real shape of California demand:

| Region | MW | Share |
|---|---|---|
| Los Angeles basin | 14,200 | 42 % |
| Bay Area | 6,100 | 18 % |
| San Diego & Imperial | 5,400 | 16 % |
| Central Valley & Sierra | 4,200 | 12 % |
| North | 4,000 | 12 % |

Power factor by class: urban and commercial 0.98, industrial 0.96, agricultural
0.92–0.95. Agricultural load is dominated by induction motors driving irrigation
pumps, which is why it is worse; that difference is visible in the model as a
larger capacitor bank at those buses.

## 8. Reactive compensation

| Device | Sizing rule |
|---|---|
| Load-bus capacitors | 85 % of that bus's own peak reactive demand, in 25 MVAr steps |
| EHV shunt reactors | 70 % of the 500 kV line charging landing at that bus |
| Corridor support banks | Sized from the power-flow study; see decision 0004 |

Capacitor banks are built in **three stages** — 40 % fixed, 30 % switched, 30 %
switched — because a bank sized for the evening peak would push voltages above
equipment ratings at four in the morning.

Switching control differs by bus type, and this matters:

- **No generator on the bus** → control on bus voltage. Capacitors close at
  ≤ 1.000 pu, open at ≥ 1.035 pu.
- **Generator on the bus** → control on the machine's reactive utilisation.
  Capacitors close above 60 % of reactive capability, open below 25 %.

The second exists because a generator *holds* its bus voltage, so voltage tells
you nothing while the machine runs itself to its reactive limit.

## 9. Daily profiles

Three shapes drive the whole time dimension (`src/sim/profiles.ts`); everything
else — the duck curve, the evening ramp, the marginal price, congestion — is
computed, never drawn.

| Shape | Peak | Character |
|---|---|---|
| Demand, summer | 18:00 | Trough-to-peak 0.56; single sharp evening peak |
| Demand, winter | 18:00 | Morning and evening peaks, shallower |
| Solar, summer | 12:00–13:00 | 0.88 capacity factor, not 1.0: panels are rated at 25 °C and run hotter |
| Wind | 18:00 | Late-afternoon peak, driven by inland heating pulling air through the passes |
| Hydro availability | 18:00 | Not weather — an operator spending a fixed amount of water where it is worth most |

Interpolated between hours with a **monotone** cubic (Fritsch–Carlson). An
ordinary spline overshoots below zero just after sunset, which would display a
solar farm producing negative power.

## 10. The substation, the feeder and the service

Below the transmission network the model carries on into one substation, one
feeder and one house. All of it is in the **same** `NetworkCase`: a single power
flow solves from the Oregon border to a kitchen socket, so conservation closes
across the whole chain rather than being asserted level by level.

### Eden Vale substation — `src/data/california/substation.ts`

A two-bank 115/12.47 kV distribution substation, 80 × 52 m.

| Item | Value | Source |
|---|---|---|
| Banks | 2 × 28 MVA, 115/12.47 kV, Dyn1, 8.5 % Z | `TRANSFORMER_CLASSES.dist115_12` |
| On-load tap changer | ±16 steps of 0.625 %, setpoint 1.025 pu, bandwidth ±0.010 | ANSI/IEEE C57.12 typical |
| 115 kV bus height | 7.6 m | typical rigid-bus construction |
| Station capacitor | 3.6 MVAr in three 1.2 MVAr steps | sized to the station's reactive demand |
| Bus tie | normally **open**, so a fault on one half of the 12.47 kV bus does not take the other | standard practice |
| Ground grid | 4/0 bare copper on a 6 m mesh, rods at the corners | IEEE Std 80 |
| Protection | 87T, 87B, 51, 50, 50N/51N, 79, 21, 67, 49, 63, 27/59 | ANSI/IEEE C37.2 |

Every element carries **both** a yard coordinate (metres east, north and above
grade) and a single-line-diagram coordinate, and the view interpolates between
them. Decision 0010 explains how, and why the schematic frame is built from the
camera's ground basis rather than laid flat on the ground plane.

Yard coordinates are plausible rather than surveyed and the solver never reads
one; that is in the honesty register as `substation-yard-layout`.

### Cherry Lane 1201 — `src/data/california/feeder.ts`

| Item | Value |
|---|---|
| Nominal | 12.47 kV between phases, 7.2 kV to neutral (four-wire multigrounded wye) |
| Length, main | 2.95 km, twelve poles |
| Main conductor | 336.4 kcmil ACSR (linnet) — about 530 A, ≈ 11 MVA at 12.47 kV |
| Lateral conductor | 1/0 ACSR (raven), single-phase |
| Laterals | five, each fused where it taps off the main |
| Spot loads | 16, totalling 6.3 MW at peak across ≈ 1,450 customers |
| Regulator, at pole 5 | ±10 % in 32 steps of 0.625 %, ANSI/IEEE C57.15 |
| Capacitor, at pole 8 | 1,200 kVAr in three 400 kVAr cans, switched on local conditions |
| Tie point | normally open, to the next feeder |

The regulator is a transformer branch with an inserted node, so "before the
regulator" and "after it" are different buses — which is what puts the vertical
step on the voltage profile. Line parameters are computed from conductor
geometry by the same `lineParameters` used for the 500 kV backbone.

At 18:00 in summer the profile runs 1.0152 pu at the substation, down to 1.0004
at the regulator input, up to 1.0302 at its output, and 1.0264 at the tie point
2.94 km out — the shape every distribution engineer draws first.

### 14 Cherry Lane — `src/data/california/service.ts`

| Item | Value | Source |
|---|---|---|
| Service transformer | 50 kVA, 12.47 kV / 240–120 V, 12 houses | `TRANSFORMER_CLASSES.service` |
| Service lateral | 4/0 AWG aluminium, 18.8 m, buried | NEC Ch. 9 Table 9 |
| Main panel | 200 A, 240/120 V | — |
| Branch circuit | 12 AWG copper, 20 A breaker, 14.9 m to the socket | NEC Ch. 9 Table 9; Art. 210 |
| Receptacle | NEMA 5-15R, 125 V, 15 A | — |
| Voltage limits | Range A: 114–126 V at the meter, 110–126 V at the appliance | ANSI C84.1-2020 Table 1 |

The power flow stops at the transformer's secondary terminals; the last twenty
metres are worked with ΔV = I·(R·cos φ + X·sin φ) over the loop and shown in
full. Decision 0011 gives the reasoning and the numbers.

## 11. What the model produces

Across 24 hours of both a summer and a winter day, with generator reactive limits
enforced:

- Convergence: **48 of 48 hours**, 4–7 Newton iterations, about 10 ms each
- Transmission losses: **2.4 – 3.6 %** of generation
- Bus voltages: **0.96 – 1.05 per-unit**, no violations
- Branch loadings: no overloads
- Power balance: closes to better than 10⁻⁵ MW at every hour

`test/california.test.ts` asserts all of the above.

# 0021 — Faults and protection

**Chosen.**
- *Symmetrical components on the transmission network.*
  - Y₁, Y₂ and Y₀ are built from the network's own data:
    - lines' zero sequence from their conductor geometry (Carson with earth return);
    - transformers by vector group: YNd1 step-ups, and banks with delta tertiaries as a three-winding T whose tertiary grounds the star point;
    - machines behind X″_d and their step-ups;
    - the neighbours as tie equivalents.
  - Each sequence is factored once per solution with a typed-array complex LU, so a fault is a column solve. The whole study builds in about 20 ms.
  - Inverter-based plants are left out, as they limit their fault current. Loads are neglected. Both are stated in the panel and the honesty notes.
- *Phase by phase on the feeder.*
  - The 12 kV source is the transmission Thevenin at Evergreen 60 kV through the Δ–Yg bank: zero sequence sees only the bank.
  - Down the feeder, each line's own phase matrix, as Kersting does. Untransposed lines and single-phase laterals come out right with no symmetrical-component assumption.
- *Validated against OpenDSS, twice.*
  - A textbook-class four-bus system with Δ–Y banks, solved by OpenDSS in the phase domain: the sequence method matches the fault currents, the line and transformer currents, and every bus voltage to 2×10⁻⁴ pu, across all four fault types.
  - IEEE 13's fault-study short-circuit matrices: the feeder method matches OpenDSS at every primary bus. Configuration 603 is compared on its swap-invariant terms, because OpenDSS's file connects that line c-then-b.
- *Protection simulated, not scripted.* Each device integrates its own characteristic while current flows through it:
  - the breaker's 50/51/50N/51N relay on IEEE C37.112 very-inverse curves;
  - a two-fast-two-slow recloser;
  - 100T lateral fuses on a fitted T-link curve.

  Current flows only while every device on the path is closed. A temporary fault goes out when the current stops, and the recloser recloses on its schedule. The sequence plays on the sheet in real time: chevrons carry the fault current while it flows, and devices mark open as they operate.
- *Settings chosen from this feeder's fault currents, and tested.*
  - The lateral fuse clears every permanent lateral fault.
  - The recloser locks out on permanent trunk faults.
  - The breaker opens only for faults between it and the recloser.
  - The breaker waits at least a 0.3 s CTI behind the recloser everywhere.
  - The recloser saves the fuse where the fault current is low enough (the far laterals); nearer the substation the fuse blows first. This is a real urban trade-off, not a defect to hide.
- *After the sequence, a real re-solve.* The devices left open are sent to the worker. The coupled solution then has the section beyond them without supply: those homes read zero, meters plus losses still equal the head, and the transmission bus carries less.

**Found on the way (and kept as lessons, fixed in the settings).**
- An instantaneous ground element set below the largest lateral fault over-reaches, and trips the breaker alongside the fuse. The fix: its pickup is above the largest lateral fault.
- C37.112's electromechanical reset lets a relay's travel ratchet up over a recloser's shots and trip the breaker on the last one. The feeder relay is a numerical one set to reset instantly, which is the common modern setting. The reset characteristic remains in the model.

**Rejected.**
- *IEC 60909 (c-factors, correction factors).* It is a standard for rating equipment. This app teaches the fault calculation the textbooks teach: flat source behind subtransient reactances, and pre-fault voltages from the power flow.
- *Scripted "relay trips at 0.4 s" animations.* The brief forbids them, and the event list would drift from the curves.

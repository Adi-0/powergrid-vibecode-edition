# Screenshot critique — phase 8, faults and protection

New views:
- `feeder-fault-mid`: a permanent trunk fault, held during the recloser's second fast shot;
- `feeder-fault-lateral`: a permanent fault at lateral L10's far end, after the fuse has cleared it;
- `feeder-fault-math`: a fault on L7 with the working shown.

Existing `system-site` and `math-site` views now carry fault levels, with their panels.

## Found and fixed

| # | What the screenshot showed | Cause | Fix |
|---|---|---|---|
| 1 | Digits without provenance: "50N, 51N", "C37.112", "I_a = 3I_0" in prose. | Standard designations written as plain words. | Device numbers and standards are glossary terms (IEEE C37.2 device numbers, IEEE C37.112), which carry their source and a hover definition; formulas are notation. |
| 2 | At the feeder's full extent the fault and the device that acts on it were a few pixels. | No camera move on a fault. | On a fault the camera flies to fit the fault and the nearest device on its path. |
| 3 | The key's last rows, the fault's own, were cut off at the bottom. | The feeder key is long. | Shorter wording and tighter rows; the key fits, and scrolls if it must. |
| 4 | The timeline's unit "s" sat on the last tick label. | Ticks up to the end. | Ticks stop short of the end. |
| 5 | Math at Malin 500 kV was off in the last place. | A stiff bus's small \|Z₁\| amplified the rounding of its printed digits. | Fault-panel digits sized by significant figures. |

## Still wrong or weak

- The timeline's marks are small glyphs. They are readable, but the row labels are dense.
- The fault mark on a single-phase lateral sits at the pole top. It does not say which phase, though the inspector does.
- Transmission faults have numbers and working but no drawing yet: no voltage-sag picture across the system.
